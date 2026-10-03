# Android SMS gateway

Delivers OTP by using an Android phone and its SIM as the sender.

```
Web / App ──► Backend ──► Queue ──► (phone polls) ──► SmsManager ──► SIM ──► User
                     ▲                                          │
                     └────────── sent / delivered report ───────┘
```

Cost is SIM airtime only — no per-message provider fee. The trade-off is that the
phone is now uptime-critical: if it stops, no OTP can be sent at all.

---

## 1. Turn it on

```env
# backend/.env
OTP_PROVIDER=gateway
SMS_GATEWAY_ENC_KEY=<openssl rand -hex 32>
```

`SMS_GATEWAY_ENC_KEY` seals queued message bodies. The service **refuses to start
in production without it**, because storing an OTP in clear text would undo the
hashing used everywhere else.

---

## 2. Build and install the gateway app

```bash
cd gateway_app
flutter pub get
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

Install it on the phone that holds the SIM, open it, and:

1. Enter the backend URL. Emulator uses `http://10.0.2.2:5000/api`; a real phone
   on the same Wi-Fi uses your machine's LAN IP.
2. Tap **Grant SMS permission** and accept. Android will not let the app ask
   silently. Until this is granted the app refuses to start.
3. Tap **Start gateway**.

The screen shows `RUNNING` and the SIM's number. If it cannot send, it says so.

---

## 3. How the pieces fit

**Backend** (`/api/sms-gateway/*`)

| Method | Path | Auth |
|---|---|---|
| POST | `/register` | none (rate limited) — issues the device token once |
| POST | `/poll` | device bearer token |
| POST | `/report` | device bearer token |
| GET | `/health` | none — reports queue depth only |
| GET | `/admin/stats` | admin — queue + device health |
| POST | `/admin/sweep` | admin — release stuck leases |

**Gateway app** (`gateway_app/`)

- `lib/gateway_client.dart` — API client; token in `flutter_secure_storage`
- `lib/sms_sender.dart` — MethodChannel commands + EventChannel receipts
- `lib/gateway_runner.dart` — poll → send → report loop
- `MainActivity.kt` — `SmsManager` with sent/delivered `PendingIntent`s

---

## 4. Two design decisions worth knowing

**Leases, not retries.** A claimed job takes a 120-second lease. If the phone
crashes mid-send and never reports, the job becomes `unknown` — **never**
`queued` again. Requeueing would send the user a second OTP after a crash that
happened *after* the first SMS already went out. A duplicate code is worse than a
user pressing resend. Operators can force a sweep with `POST /admin/sweep`.

**Bodies are encrypted.** The OTP is sealed with AES-256-GCM before it reaches
MongoDB, so a database dump does not reveal live codes. It is decrypted only at
the moment it is handed to the authenticated gateway.

The code still crosses the network to your phone in plaintext — unavoidable, since
the phone must read it to compose the SMS. It travels over HTTPS to a device you
own, and is never logged or written to disk.

---

## 5. Honest limitations

- **One sender number**, from the SIM in the phone.
- **The phone must stay online.** Android may kill the app; run it in the
  foreground or disable battery optimisation for it.
- **Not for Play Store.** Google restricts apps that send SMS. Sideload this.
- **Slow polling** (5 s) means an OTP can take a few seconds to appear. The
  countdown in the client accounts for this.
- **IP-based delivery receipts** are best-effort; some carriers never report.

---

## 6. Tests

```bash
cd backend
node scripts/sms-gateway-test.js     # 31 checks
```

Covers token auth, that the body is not stored in clear, that a job is never
handed out twice, that a failed report never causes a resend, and encryption
tamper-detection.
---

## 7. API reference

Public liveness:

```
GET  /api/sms-gateway/health
```

Gateway-facing (all require `X-Device-Id` + `Authorization: Bearer <token|secret>`):

```
POST /api/sms-gateway/register                    issues a device token (once)
GET  /api/sms-gateway/jobs                       claim queued work
POST /api/sms-gateway/poll                       same thing, POST spelling
POST /api/sms-gateway/jobs/:jobId/result         report SENT / DELIVERED / FAILED
POST /api/sms-gateway/report                     same thing, flat spelling
POST /api/sms-gateway/heartbeat                  liveness + SIM/network status
```

Admin (require an admin token; the secret is never returned):

```
GET  /api/sms-gateway/admin/config               masked config
GET  /api/sms-gateway/admin/devices              ONLINE/OFFLINE, SIM, network, counters
GET  /api/sms-gateway/admin/stats                queue depth
POST /api/sms-gateway/admin/test-sms             queue a test message
POST /api/sms-gateway/admin/sweep                release expired leases
```

### Heartbeat

Sent every `SMS_GATEWAY_HEARTBEAT_INTERVAL` ms:

```jsonc
// request
{ "simStatus": "available", "networkStatus": "connected",
  "appVersion": "1.0.0", "deviceModel": "Pixel 7" }

// response — the server dictates the cadence
{ "success": true, "ok": true, "simStatus": "available", "networkStatus": "connected",
  "nextHeartbeatSeconds": 30, "pollIntervalSeconds": 5, "jobTimeoutSeconds": 60000 }
```

A gateway reporting `simStatus: "unavailable"` or `networkStatus: "disconnected"`
is marked **inactive immediately**, so an OTP is never queued to a phone that
physically cannot send it. That is the difference between "user waits 60s for a
message that was never going to leave" and an instant, honest error.

---

## 8. Environment

```env
OTP_PROVIDER=gateway
SMS_GATEWAY_ENABLED=true

# Credentials — leave SECRET blank to use per-device tokens instead
SMS_GATEWAY_ID=gateway-001
SMS_GATEWAY_SECRET=<openssl rand -hex 32>

SMS_GATEWAY_PHONE_NUMBER=+918699142699
SMS_GATEWAY_POLL_INTERVAL=5000
SMS_GATEWAY_HEARTBEAT_INTERVAL=30000
SMS_GATEWAY_JOB_TIMEOUT=60000

OTP_ENABLED=true
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=5
OTP_RESEND_SECONDS=60
OTP_MESSAGE_TEMPLATE=Your verification code is {{OTP}}. It is valid for 5 minutes. Do not share this code with anyone.
```

Per-device tokens remain the recommended option: rotating a shared secret takes
every gateway offline at once.

---

## 9. Build and install

```bash
cd gateway_app
flutter pub get
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

On the phone holding the SIM:

1. Open **SMS Gateway**, allow the permission when Android asks.
2. Set the backend URL — emulator `http://10.0.2.2:5000/api`, real phone
   `http://<your-lan-ip>:5000/api`.
3. **Grant SMS permission**.
4. **Start gateway**. The panel must show `RUNNING` and `SIM: AVAILABLE`.

Then confirm from the admin panel that the gateway reads `ONLINE`.

> The APK build was verified to compile in Dart terms (`flutter analyze` clean,
> `flutter test` passing) but **could not be produced on this machine** — a
> pristine `flutter create` project fails identically there, so it is an
> Android/Gradle toolchain problem (AGP 9.1 + Gradle 9.3), not this code.
