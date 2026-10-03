# MSG91 OTP Widget integration

WhatsApp OTP delivered through **MSG91**, using its client-side widget with
`exposeMethods`.

---

## ⚠️ Rotate the token you pasted

A live `tokenAuth` was pasted into chat while setting this up. Treat it as
compromised and regenerate it in the MSG91 panel. Nothing here was written to the
repository — verified: the value appears in **no** tracked file and **not** in the
built JavaScript bundle.

---

## How it works

MSG91's widget runs in the client and checks the code. On success it hands the
client a JWT **access-token**. That token is treated here as a *claim*, never as
proof:

```
1. GET  /api/auth/msg91/widget-config   → widgetId + tokenAuth (needed to boot the widget)
2. client: window.sendOtp(identifier)   → MSG91 generates + sends the code
3. client: window.verifyOtp(otp, ...)   → MSG91 checks it, returns an access-token
4. POST /api/auth/msg91/complete        → backend re-validates the token with MSG91
5. backend issues its own JWT session
```

Step 4 is the security boundary. MSG91 documents it as **POST Verify Access
Token**, in their example flow:

> *Send OTP → Get reqId → Retry OTP → Verify OTP → **Get JWT access-token** →
> **Verify access-token → Get verified user information***

An attacker who skips the widget and POSTs an invented token gets `401`.

---

## The security trade-off, stated plainly

The widget requires `widgetId` + `tokenAuth` **in the client**. `tokenAuth` is
therefore visible to anyone who can read the page or unpack the APK. That is
inherent to MSG91's widget design — not something this code can fix.

What this implementation does guarantee:

- the token is **not** hard-coded; it is fetched at runtime and held in memory only
  (never in source, `localStorage`, or a cookie);
- it is never logged and never persisted;
- it grants **no privileged access** on its own — a session is issued only by
  `/complete`, after MSG91 confirms the token;
- the verified identity comes from **MSG91's response**, not from anything the
  client sends;
- while `MSG91_ENABLED=false`, the config endpoint emits **no credentials at all**.

If you later want zero client-side exposure, switch to MSG91's server-side
Send/Resend/Verify APIs instead of the widget. The provider layer makes that a
contained change.

---

## Configuration

```env
MSG91_ENABLED=true
MSG91_WIDGET_ID=<from MSG91 panel>
MSG91_TOKEN_AUTH=<from MSG91 panel — rotate the pasted one>
MSG91_OTP_LENGTH=6
```

The widget must have **Mobile Integration** enabled in the MSG91 panel, and you
must subscribe to a plan (the free plan exists but has quota limits).

---

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/msg91/status` | Is it usable? |
| GET | `/api/auth/msg91/widget-config` | Widget credentials for the client |
| POST | `/api/auth/msg91/complete` | Exchange access-token for a session (rate limited) |
| GET | `/api/auth/msg91/admin/config` | Masked config (admin only) |

Retry channels, per MSG91's docs: SMS `11`, Voice `4`, Email `3`, WhatsApp `12`.

---

## ⚙️ One value you must confirm

MSG91 has moved widget API paths between versions. Rather than guess a URL and
bury a config mistake inside a security check, the path is configurable:

```env
MSG91_VERIFY_TOKEN_PATH=/api/v5/otp/{widgetId}/verify/token
MSG91_API_BASE_URL=https://control.msg91.com
```

Confirm this against your panel's API reference. If it differs, change the env var
— no code change needed.

---

## Clients

- **Web** — `admin/src/components/Msg91OtpWidget.jsx`, route `/msg91-login`.
- **Flutter** — `lib/services/msg91_service.dart`. Add the widget package with
  `flutter pub add sendotp_flutter_sdk`, then call
  `OTPWidget.initializeWidget(widgetId, tokenAuth)` using the values fetched at
  runtime, and post the resulting token to `/auth/msg91/complete`.

Both sit on their own route, so the existing SMS/Firebase login is untouched.

---

## Testing

```bash
MSG91_ENABLED=true node scripts/msg91-otp-test.js
```

29 checks covering validation, four classes of forged token, absence of any
account creation on failure, error-message hygiene, and RBAC.

Note that end-to-end success requires a real MSG91 account — the suite verifies
that **invalid** input is refused, which is the part that must never regress.