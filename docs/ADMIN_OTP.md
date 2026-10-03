# Admin Panel OTP login

Signs the administrator in with a one-time code sent as a real SMS, using an
Android phone and its SIM as the sender.

```
Browser /login
     │  phone number
     ▼
Backend ── generate 6-digit OTP (crypto.randomInt), store HMAC only
     │
     ▼
Android SMS Gateway  (capcom6/android-sms-gateway, runs on the handset)
     │
     ▼
SIM ──SMS──► 8699142699
```

Nothing is sent from the browser. The gateway credentials live only in the
server's environment.

---

## 1. The one authorised number

```env
# backend/.env
ADMIN_PHONE_NUMBER=8699142699
```

`8699142699` is the **only** number that can complete an OTP admin sign-in. Any
other number is refused with `Unauthorized phone number.` *before* a code is
generated, so the gateway is never called for it.

Accepted input formats (all resolve to the same number): `8699142699`,
`+918699142699`, `91-86991-42699`.

The admin **account** must also carry this number. After changing it on an
existing database:

```bash
npm run migrate:admin-mobile
```

This moves the `admin` / `super_admin` documents and refuses to run if
`ADMIN_PHONE_NUMBER` is unset, so it can never guess a wrong number.

---

## 2. Environment

```env
# --- Who may sign in ---
ADMIN_PHONE_NUMBER=8699142699
ADMIN_OTP_ENABLED=true

# --- OTP policy ---
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=5
OTP_RESEND_SECONDS=60

# --- Abuse protection ---
ADMIN_OTP_PER_PHONE_HOURLY_LIMIT=5
ADMIN_OTP_PER_IP_HOURLY_LIMIT=20
ADMIN_OTP_VERIFY_MAX_ATTEMPTS=20

# --- HMAC pepper [generate: openssl rand -hex 32] ---
ADMIN_OTP_PEPPER=

# --- Android SMS Gateway ---
CAPCOM6_ENABLED=true
SMS_GATEWAY_URL=http://<phone-lan-ip>:8080
SMS_GATEWAY_USERNAME=
SMS_GATEWAY_PASSWORD=
SMS_GATEWAY_DEVICE_ID=
SMS_GATEWAY_SIM_NUMBER=1
SMS_GATEWAY_TIMEOUT_MS=10000

# --- Development only; ignored when NODE_ENV=production ---
ADMIN_OTP_TEST_MODE=false
```

`ADMIN_OTP_PEPPER` is not optional in practice. Six digits is only 900,000
values, so a bare SHA-256 of the code could be brute-forced from a stolen
database dump in well under a second. The pepper lives in the environment, so an
attacker needs the database **and** the server's configuration.

`SMS_GATEWAY_USERNAME` / `SMS_GATEWAY_PASSWORD` are the Basic-auth credentials
set inside the SMS Gateway app. The older `CAPCOM6_USERNAME` /
`CAPCOM6_PASSWORD` / `CAPCOM6_BASE_URL` names still work as aliases.

---

## 3. Set up the Android phone

The gateway app is
[capcom6/android-sms-gateway](https://github.com/capcom6/android-sms-gateway).
It runs an HTTP **server** on the handset, so the backend connects *to* the
phone. Backend and phone must be on the same network (LAN or VPN). No public IP
and no port forwarding are needed.

1. **Install** the app from the project's releases onto the handset that holds
   the SIM. No build step is required.
2. **Enable the local server** — Settings → Server. Note the username and
   password it generates; these are `SMS_GATEWAY_USERNAME` /
   `SMS_GATEWAY_PASSWORD`.
3. **Find the phone's LAN address** (Settings → Server shows it, or use the
   router's client list). Put it in `SMS_GATEWAY_URL`, e.g.
   `http://192.168.1.50:8080`.
4. **Grant SMS permission.** Android will not let the app send silently; until
   this is granted the send request fails.
5. **Set the SIM slot** in `SMS_GATEWAY_SIM_NUMBER` if the handset has more than
   one SIM. Leave `SMS_GATEWAY_DEVICE_ID` blank for a single device.
6. **Keep the app running.** Android may kill it — run it in the foreground or
   disable battery optimisation for it.

### Verify the wiring

```bash
# From the machine running the backend, using the same LAN address:
curl -u "<username>:<password>" http://<phone-lan-ip>:8080/
```

A JSON reply means the phone is reachable and the credentials are right.

---

## 4. API

### `POST /api/auth/request-otp`

```json
{ "phone": "8699142699" }
```

`200` on success:

```json
{
  "success": true,
  "message": "OTP sent successfully to your registered mobile number.",
  "resendAfterSeconds": 60,
  "expiresInSeconds": 300,
  "otpLength": 6
}
```

The OTP itself is **never** in this response. Failures:

| Status | `message` | Cause |
|---|---|---|
| 400 | `Enter a valid 10-digit Indian mobile number.` | malformed number |
| 403 | `Unauthorized phone number.` | not `ADMIN_PHONE_NUMBER` |
| 429 | `Please wait N seconds before requesting another OTP.` | resend cooldown |
| 429 | `Too many OTP requests. Please try again later.` | hourly cap |
| 502 | `Unable to send OTP. Please try again.` | gateway misconfigured or down |
| 503 | `Unable to send OTP. Please try again.` | `ADMIN_OTP_ENABLED=false` |

### `POST /api/auth/verify-otp`

```json
{ "phone": "8699142699", "otp": "123456" }
```

`200` returns the **normal admin session** — the same JWT the password login
issues, so every existing admin route keeps working unchanged.```json
{
  "success": true,
  "message": "OTP verified successfully",
  "token": "<jwt>",
  "user": { "id": "...", "name": "Super Admin", "mobile": "8699142699", "role": "admin" }
}
```

Failures:

| Status | `message` | `errorCode` |
|---|---|---|
| 400 | `Invalid OTP. Please try again.` | `invalid_otp` |
| 400 | `OTP has expired. Please request a new OTP.` | `otp_expired` |
| 400 | `This OTP has already been used. Please request a new OTP.` | `otp_used` |
| 400 | `No OTP was requested. Please request a new OTP.` | `no_otp` |
| 403 | `Unauthorized phone number.` | - |
| 403 | `This account does not have administrator access.` | - |
| 429 | `Too many attempts. Please request a new OTP.` | `too_many_attempts` |

### Worker / job-creator login is untouched

`/api/auth/verify-otp` is shared. The allow-listed number is handled by the
hardened admin path; **every other number falls through** to the pre-existing
handler in `authRoutes.js`. Worker and job-creator logins behave exactly as
before. The legacy endpoints now reject `role: "admin"`, so the old demo path
cannot be used to bypass the allow-list.

---

## 5. How the OTP is protected

- **Generated server-side** with `crypto.randomInt` (CSPRNG). `Math.random()`
  is never used - its output is predictable, and six digits drawn from it is
  guessable.
- **Stored only as HMAC-SHA256** of `phone:otp`, keyed with `ADMIN_OTP_PEPPER`.
  The plaintext exists only in memory, for the moment it is sent.
- **Compared in constant time** (`crypto.timingSafeEqual`), so a wrong code
  cannot be recovered byte by byte from response timings.
- **Expires after 5 minutes.** `expiresAt` carries a MongoDB TTL index
  (`expireAfterSeconds: 600`), so expired rows are removed with no cron.
- **Maximum 5 attempts**, counted per issued code. The budget is checked before
  the digest, so a spent code cannot be probed further.
- **Invalidated after use** - `used` is set and `otpHash` dropped in the same
  save, so it cannot be replayed from a database snapshot.
- **A new code replaces the old one** atomically, so two codes are never valid
  at once.

### Rate limiting

| Layer | Scope | Default |
|---|---|---|
| Per-IP requests | `express-rate-limit`, 1 h | 20 |
| Per-IP verifications | `express-rate-limit`, 15 min | 20 |
| Resend cooldown | database, per number | 60 s |
| Hourly requests | database, per number | 5 |

The per-IP limits use the project's existing `express-rate-limit`. The
per-number limits are counted from database rows, so a server restart cannot
reset them.

---

## 6. Logging

Server-side events, with the phone masked:

```
[AdminOTP] sent - phone=+918699****2699 ip=::ffff:127.0.0.1
[AdminOTP] verify_ok - phone=+918699****2699 ip=::ffff:127.0.0.1
[AdminOTP] verify_failed - reason=invalid_otp ip=...
[AdminOTP] request_refused - reason=unauthorized ip=...
[AdminOTP] send_failed - phone=+918699****2699 error=gateway_unreachable ip=...
```

The OTP, the gateway password, the pepper and the JWT are **never** logged. The
browser never receives a stack trace, a gateway error body, or any credential.

---

## 7. Testing

```bash
# Terminal 1 - a stand-in for the handset (no Android needed):
node scripts/mock-sms-gateway.js

# Terminal 2 - the API:
npm start

# Terminal 3:
npm run test:admin-otp
```

The suite covers all seven scenarios from the brief: authorised send, successful
login, unauthorised number, wrong OTP, expired OTP, attempt exhaustion, and rate
limiting - plus secret hygiene.

To watch a real handset instead, point `SMS_GATEWAY_URL` at it and stop the
mock. Set `ADMIN_OTP_TEST_MODE=true` to let the suite read the generated code;
the server refuses that flag when `NODE_ENV=production`.

`ADMIN_OTP_TEST_MODE` is the only thing that ever echoes the code, and only
outside production. With it off - the default - the OTP reaches the handset and
nothing else.

---

## 8. Deployment notes

- Set `NODE_ENV=production`. This disables `ADMIN_OTP_TEST_MODE` outright.
- Generate a fresh `ADMIN_OTP_PEPPER`, `JWT_SECRET` and `SMS_GATEWAY_PASSWORD`.
- `backend/.env` is git-ignored; only `.env.example` is tracked.
- If the backend and handset are on different networks, reach the phone over a
  VPN rather than exposing port 8080 to the internet.