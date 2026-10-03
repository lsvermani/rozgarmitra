# How the Android App Talks to the MongoDB Backend

The app **never** connects to MongoDB. It only speaks HTTP to the existing
Express backend, and the backend is the only process that touches the database.
This document explains that chain end-to-end.

---

## 1. The data path

```
Android app (Flutter)  --HTTPS-->  Express API (backend/)  --mongodb://-->  MongoDB
ApiService, no credentials             MONGO_URI from .env            127.0.0.1:27017
```

**The APK contains none of the database material.** It contains an HTTP base URL
that an administrator can change at runtime, and nothing else.

---

## 2. What is (and is not) in the APK

| Item | In the APK? | Where it actually lives |
|---|---|---|
| API base URL | Yes, as a *fallback* default | `AppConstants.defaultApiBaseUrl` (`--dart-define=API_BASE_URL`) |
| Runtime server URL | No | Device storage, `flutter_secure_storage` |
| `MONGO_URI` / connection string | **No** | `backend/.env` (gitignored) |
| MongoDB username & password | **No** | `backend/.env` |
| `JWT_SECRET` | **No** | `backend/.env` |
| `DEMO_OTP` / SMS provider keys | **No** | `backend/.env` |
| Firebase service-account JSON | **No** | `backend/.env` |

Verify it yourself at any time:

```powershell
cd mobile
Select-String -Path lib\*.dart,lib\**\*.dart -Pattern 'MONGO_URI','mongodb://','JWT_SECRET'
```

That command must print **nothing**. The `mongodb` strings that *do* appear in
the source are only the **redaction patterns** used to scrub audit logs — never
a real credential (see `ServerConfig.redact()` and `configAuditController.js`).

---

## 3. How the app builds a request URL

`mobile/lib/services/api_service.dart`:

```dart
static String get baseUrl => ConfigManager.currentApiBaseUrl;
//  -> ConfigManager.config.effectiveApiBaseUrl
//  -> admin-entered (forwarded | base URL | IP+port) + API base path
//  -> AppConstants.defaultApiBaseUrl only when nothing is configured
```

`ApiService` reads that value on **every** request, so a configuration change is
picked up by the next call with no restart and no rebuild. Auth travels as
`Authorization: Bearer <JWT>` — a token issued by the backend, not a database
credential.

---

## 4. The backend's MongoDB connection

`backend/src/config/db.js`:

```js
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rozgarmitra';
await mongoose.connect(uri);
```

* The URI comes from the **environment**, so it is absent from the repository.
* The fallback only applies to a local, unauthenticated development database.
* `backend/.env` is gitignored; `backend/.env.example` documents the keys.
* Existing routes, auth middleware and collections are untouched — the app uses
  the same API the website and admin dashboard already use.

### Pointing at MongoDB Atlas

1. Atlas -> **Connect** -> copy the connection string.
2. `backend/.env`:
   `MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/rozgarmitra?retryWrites=true&w=majority`
3. Atlas -> **Network Access** -> allow the server's IP.
4. `npm run db:check`, then `npm run seed`.

### Verify the database independently

```powershell
cd backend
npm run db:check     # connects, reports collections + document counts, redacts passwords
npm run db:setup     # also creates/repairs every Mongoose index
---

## 5. Health endpoints used by "Test Connection"

| Endpoint | Returns | Used by |
|---|---|---|
| `GET /api/health` | status, `mode`, `version`, `environment`, `uptimeSeconds`, `database.connected` | The app's **Test Connection** button |
| `GET /api/health/db` | MongoDB ping + latency, `503` when down | Manual / deployment verification |

Both expose **no** database host, URI or credential — only a boolean and a
human-readable state.

---

## 6. CORS, so the website and the app can share one backend

```js
// backend/src/app.js
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
```

The Android app does not need CORS (it is not a browser), but the React admin
dashboard and the Flutter web build do. Set `CORS_ORIGIN` in `backend/.env` to
your deployed origins. The JWT is sent in an `Authorization` header (not a
cookie), so `credentials: true` is not required.

---

## 7. Reverse proxy / forwarded addresses

Two independent, deliberately separate concerns:

| Concern | Controlled by | Notes |
|---|---|---|
| The **server's** view of the client's address | `TRUST_PROXY=false` in `backend/.env` | Set to `true` **only** behind a real reverse proxy. Leave it `false` otherwise, so an arbitrary client cannot spoof its address via `X-Forwarded-For`. |
| The **app's** address for the backend | *Forwarded address* field on the Admin Settings page | Opt-in per device, typed by an unlocked administrator. The app never reads `X-Forwarded-*` from a response and never trusts a forwarded value implicitly. |

---

## 8. Failure modes the app handles

| Situation | Behaviour |
|---|---|
| Wrong URL / bad format | Rejected by the validator before anything is saved |
| DNS failure, no route, connection refused | *"Cannot reach the server..."* — no crash, session preserved |
| Timeout | *"The server took too long to respond..."* (10 s probe, per-request timeout) |
| TLS / certificate problem | Explicit certificate-handshake message |
| Plain HTTP in a release build | Blocked by `network_security_config.xml`, with a message telling the admin to use `https://` |
| Server up but database down | `/api/health` reports `database.connected: false`; requests fail normally instead of hanging |
| Airplane mode / offline | Same as unreachable; the last saved address is preserved |

Because every failure is reported as a message rather than an exception that
escapes, a dead server never wipes the saved configuration — the administrator
can always reach **Server & Admin Settings** and repair it.

---

## 9. Data safety notes for the Play release

* The app requests only `INTERNET`, `ACCESS_FINE_LOCATION`,
  `ACCESS_COARSE_LOCATION`. Location powers "jobs near me"; it is optional and
  the app falls back to a manually entered area.
* Declare these in the Play **Data safety** form: location (for app
  functionality) and personal info (name/phone/email entered by the user).
* The app does not collect or transmit MongoDB credentials, and no server
  infrastructure details are exposed to the client.

---

## 10. Related files

| File | Role |
|---|---|
| `backend/src/config/db.js` | The one place that connects to MongoDB |
| `backend/src/app.js` | Health endpoints, CORS, route mounting |
| `backend/.env.example` | Documented environment variables |
| `mobile/lib/services/api_service.dart` | Builds every request from the runtime config |
| `mobile/lib/config/config_manager.dart` | Where the backend address comes from |
| `mobile/lib/config/server_config.dart` | URL resolution + validation |
| `mobile/android/app/src/main/res/xml/network_security_config.xml` | Blocks cleartext HTTP in release |
```

Or over HTTP — `GET /api/health/db` pings MongoDB and returns `503` if it is
unreachable. This is what proves the backend (and therefore the app) can reach
the database.