# Changing the Backend Server Address (no rebuild required)

The RozgarMitra Android app does **not** hardcode its backend address. The
compiled-in `--dart-define=API_BASE_URL` is only a *fallback* for the very first
launch. An authorised administrator can repoint the app at any other backend
from inside the app, and every subsequent request uses the new address — no new
APK, no reinstall, no Play Store update.

---

## 1. Where the page lives

| | |
|---|---|
| Route | `/admin/server-settings` |
| Screen | `mobile/lib/screens/admin/admin_settings_screen.dart` |
| Entry point | **Profile → “Server & Admin Settings”** (visible only when `user.role == 'admin'`) |
| Recovery entry point | The route is reachable **without** a session on purpose — see §3 |

---

## 2. How to change it (the normal case)

1. Sign in as an **administrator** (mobile `8699142699`; OTP arrives by SMS - see docs/ADMIN_OTP.md).
2. Open **Profile → Server & Admin Settings**.
3. Unlock the page (see §3).
4. Fill in the fields:

   | Field | Example | Notes |
   |---|---|---|
   | Server base URL | `https://api.example.com` | Full origin, `http://` or `https://` |
   | Server IP address | `192.168.1.100` | Host only — no scheme, no path |
   | Server port | `8080` | 1–65535, used together with the IP |
   | Forwarded address / reverse proxy URL | `https://example.com/api` | Only used when its switch is ON |
   | API base path | `/api` | Appended unless the base already has a path |
   | Environment | Development / Testing / Production | Production **requires** `https://` |

5. Tap **Test Connection**. The app calls `GET <candidate>/health` and shows the
   status, latency and the server's reported version/mode.
6. Tap **Save Configuration**, then confirm in the dialog. The old and new
   addresses are shown side by side so you cannot save the wrong one.
7. If the server actually changed, the app offers to sign you out, because the
   session token from the old server is not valid on the new one.

**Done.** The new address is written to encrypted storage and survives app
restarts, reboots and reinstall-free updates.

### How the final URL is computed

```
1. Forwarded address      (only if its switch is ON and the field is not blank)
2. Server base URL        (e.g. https://api.example.com)
3. Server IP + port       (e.g. 192.168.1.100:8080)
4. Compiled-in default    (only when nothing is configured yet)
        |
   + API base path        (appended unless the base already contains a path)
```
## 3. Unlocking the page (two independent ways)

Implemented in `mobile/lib/screens/admin/admin_gate.dart`.

### A. Administrator login (preferred)

Phone number + OTP against the **current** backend, then the server verifies the
JWT carries `role: admin` by calling an admin-only route. No extra credentials
are stored anywhere, and this path also stamps the audit trail with
`admin-otp:<mobile>` and pushes a copy of the change to
`POST /api/admin/server-config-log`.

### B. Device recovery passcode (the “server is unreachable” case)

If the saved server address is wrong, **no login is possible** — so there is a
second, purely local path:

* On first use the page asks you to **create a passcode** (min. 6 characters).
* It is stored as a salted **PBKDF2-HMAC-SHA256** hash in encrypted storage —
  the passcode itself is never stored.
* Repeated wrong attempts trigger a short cool-down.
* It only unlocks *local configuration editing* on that one device; it grants no
  access to data and no server privileges.

Both paths write an `unlock` entry to the local audit trail.

---

## 4. Test Connection — what it actually checks

`mobile/lib/services/connection_tester.dart` calls `GET <base>/health` on the
**candidate** URL using a separate HTTP client, so testing can never disturb the
running app’s session. Outcomes are classified into actionable messages:

| Outcome | Shown as |
|---|---|
| `success` | Connected — HTTP status, latency, server version & mode |
| `httpError` | “The server answered with HTTP `<code>`” + the server’s own message |
| `timeout` | “Timed out after 10s…” (server down, firewall, or unreachable from this network) |
| `unreachable` | DNS failure / connection refused / no route to host / airplane mode |
| `invalidUrl` | The address could not be parsed |
| `blockedCleartext` | Plain HTTP is blocked in this build — use `https://` |
| `tlsError` | Certificate / handshake problem |
## 6. Where the value is stored, and why it is safe

| | |
|---|---|
| Storage | `flutter_secure_storage` → Android **EncryptedSharedPreferences**, backed by the Android Keystore |
| Fallback | `shared_preferences` on platforms without an encrypted store (web/desktop) — the UI shows a warning when that happens |
| Survives | app restarts, device reboots, and OS-level app updates |
| Lost on | uninstall / “clear storage” (then the compiled default applies) |

The configuration is **per device**. Changing it on one phone does not change
other phones, and there is no remote kill-switch that could silently redirect
users.

---

## 7. Security rules enforced on every save

* **Only administrators** — ordinary users never see the entry point, and the
  page itself is behind `AdminGate`.
* **Only `http` / `https` schemes** — `file://`, `content://`, `intent://`,
  `javascript:` and friends are rejected.
* **No credentials in URLs** — `https://user:pass@host` is rejected with an
  explicit message.
* **No query strings or fragments** in the address field.
* **Production requires `https://`** — enforced by the validator, not by a
  runtime check that could be bypassed.
* **Forwarded addresses are opt-in only** — the app never reads `X-Forwarded-*`
  from a network response and never trusts one implicitly. It is used only if an
  unlocked administrator typed it *and* switched it on.
* **No MongoDB credentials anywhere** — the app only ever knows an HTTP URL.
  The connection string, JWT secret and OTP keys stay in `backend/.env`.
* **Redacted audit trail** — entries are scrubbed of `user:pass@` and
  `mongodb://…` patterns before being written locally *and* on the backend, so a
  client bug cannot leak a credential into the audit collection.
* **Cleartext HTTP is blocked in release builds** — see
  `mobile/android/app/src/main/res/xml/network_security_config.xml`. To test a
  plain-HTTP LAN server in a release build, add its host there and rebuild.

---

## 8. Inspecting / scripting configuration changes

```powershell
# Read the health endpoint the Test Connection button calls
curl.exe https://api.example.com/api/health

# Confirm the backend answers and can reach MongoDB
curl.exe https://api.example.com/api/health/db
```

There is **no remote configuration API** by design: `POST
/api/admin/server-config-log` only records an audit line; it never changes the
address for other devices.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Test Connection says *blockedCleartext* | The build blocks plain HTTP. Use `https://`, or add the host to `network_security_config.xml` and rebuild. |
| *Connection refused* | Nothing is listening on that port — wrong port, or the backend is down. |
| *Host name could not be resolved* | Typo in the domain, or DNS/VPN problem on the device. |
| Saved a new address, everything fails | Tap **Restore previous working**, or reopen the page (it works without a session) and fix the address. |
| Forgot the recovery passcode | Clear the app’s storage / reinstall, then create a new one. The saved address resets to the compiled default at the same time. |
| Config reverted after reinstall | Expected — configuration lives on-device, never in the APK. Set it again on the new install. |
| Ordinary user cannot see the page | By design: the entry point only renders for `role == 'admin'`, and `AdminGate` rejects anyone without a valid admin session or passcode. |

---

## 10. Related code

| File | Role |
|---|---|
| `mobile/lib/config/server_config.dart` | Immutable config value + all validation rules |
| `mobile/lib/config/app_environment.dart` | Development / Testing / Production, HTTPS policy |
| `mobile/lib/config/config_store.dart` | Encrypted read/write, audit trail persistence |
| `mobile/lib/config/config_manager.dart` | Single source of truth; live status, last good config |
| `mobile/lib/config/secure_store.dart` | `flutter_secure_storage` wrapper |
| `mobile/lib/services/connection_tester.dart` | `GET /health` probe + error classification |
| `mobile/lib/screens/admin/admin_gate.dart` | Administrator authentication (OTP or passcode) |
| `mobile/lib/screens/admin/admin_settings_screen.dart` | The settings UI |
| `mobile/lib/security/admin_passcode.dart` | PBKDF2 passcode hashing |
| `mobile/lib/services/api_service.dart` | Builds every request from `ConfigManager.currentApiBaseUrl` |

**A configuration is only saved after a successful test** — the *Save
Configuration* button stays disabled until then — and the administrator must
confirm the change in a dialog. The only escape hatch, “Save without a
successful test”, is honoured **only** in the *Development* environment.

### If the new address turns out to be wrong

Tap **Restore previous working** — the app keeps the last configuration that was
saved *and* verified, and rolls back to it in one tap.

---

## 5. Reset to Default

**Reset to Default** deletes the stored configuration so the app falls back to
the address compiled into the APK (`AppConstants.defaultApiBaseUrl`, i.e.
whatever `--dart-define=API_BASE_URL` was passed at build time — `10.0.2.2` for
development builds). The previous address is retained as the rollback target.

---

| Inputs | Result |
|---|---|
| base `https://api.example.com`, path `/api` | `https://api.example.com/api` |
| base `https://api.example.com`, path blank | `https://api.example.com` |
| forwarded `https://example.com/proxy/api` (switch ON) | used verbatim — it already points at the API root |
| IP `192.168.1.100`, port `8080`, path `/api` | `http://192.168.1.100:8080/api` (scheme from the environment) |

---