# RozgarMitra — Run & Release Guide

Everything needed to (a) run the stack in a browser, (b) run the mobile app on an
Android device/emulator, (c) point the backend at any MongoDB (local or Atlas),
and (d) produce the signed `.aab` Google Play requires.

Project root = the folder that contains `backend/`, `admin/`, `mobile/`, `scripts/`.

---

## 0. One-time prerequisites

| Tool | Why | Verified with |
|---|---|---|
| Node.js 18+ | backend + admin | v24.15.0 |
| MongoDB | database (local install or Atlas) | MongoDB 8.3 on `127.0.0.1:27017` |
| Flutter 3.3+ | mobile app + web build | 3.47.4 (Dart 3.13.3) |
| Android SDK + JDK 17+ | APK/AAB builds | SDK 36, JDK 25 (Android Studio JBR) |
| An emulator or USB device | running the app | `rozgarmitra_api36` (Android 16) |

Flutter finds the JDK automatically from Android Studio. If a build complains
about Java, run `flutter config --jdk-dir "C:\Program Files\Android\Android Studio\jbr"`.

---

## 1. Run everything with one command

```powershell
cd <project root>
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1
```

That script:

1. makes sure MongoDB is listening (`scripts\start-mongodb.ps1`);
2. validates `MONGO_URI` and creates/repairs all Mongo indexes (`npm run db:setup`);
3. seeds demo data if the database is empty;
4. starts the API on **http://localhost:5000** (logs → `logs\backend.out.log`);
5. starts the admin dashboard on **http://localhost:5173** and opens it (logs → `logs\admin.out.log`).

Add the mobile app:

```powershell
# app in Chrome (browser)
powershell -File scripts\dev-up.ps1 -WithFlutterWeb

# app on the connected device / emulator
powershell -File scripts\dev-up.ps1 -WithAndroid

# both
powershell -File scripts\dev-up.ps1 -WithFlutterWeb -WithAndroid
```

Stop everything: `powershell -File scripts\stop-all.ps1`
(MongoDB is left running on purpose — it is a Windows service.)

### Demo logins (OTP is always `123456` while `APP_MODE=demo`)

| Role | Mobile |
|---|---|
| Admin (dashboard) | `9999999999` |
| Worker (job seeker) | `9000000010` |
| Job Creator | `8000000010` |

---

## 2. Browser

### 2.1 Admin dashboard (React + Vite)

```powershell
cd admin
copy .env.example .env      # VITE_API_BASE_URL=http://localhost:5000/api
npm install
npm run dev                 # http://localhost:5173
npm run build               # static bundle in admin\dist
```

### 2.2 Mobile app in the browser (Flutter web)

The Flutter project has web support enabled, so the same code base runs in
Chrome. Restart the command after changing anything under `mobile\web`.

```powershell
cd mobile
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:5000/api
```

* The API URL for web runs **must not** be `10.0.2.2` (that address only exists
  inside the Android emulator). Use `http://localhost:5000/api`.
* Prefer opening the link yourself? Serve it on a plain HTTP port:
  `flutter run -d web-server --web-port 8080 --dart-define=API_BASE_URL=http://localhost:5000/api`
* Production build: `flutter build web --release --dart-define=API_BASE_URL=https://your-api/api`
  → output in `mobile\build\web` (deployable to any static host / GitHub Pages).
* Firebase Phone Auth is skipped automatically on web (no `FirebaseOptions`), so
  login falls back to the backend demo-OTP flow — expected, not an error.

---

## 3. Android app (device or emulator)

```powershell
# 1. start an emulator (or plug in a device with USB debugging enabled)
flutter emulators --launch rozgarmitra_api36

# 2. confirm Flutter sees it
flutter devices

# 3. run it
cd mobile
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:5000/api
```

`API_BASE_URL` cheatsheet:

| Target | Value |
|---|---|
| Android emulator (maps to host machine) | `http://10.0.2.2:5000/api` (built-in default) |
| Physical device on the same Wi-Fi | `http://<your-PC-LAN-IP>:5000/api` |
| Web / desktop / production | `http://localhost:5000/api` / `https://your-api/api` |

If a physical device cannot reach the PC, allow Node through the Windows
firewall for private networks (port 5000).

---

## 4. MongoDB connection script

`backend/scripts/mongo-connect.js` is the single source of truth for "is the
database reachable, and what is in it?". It reads the same `MONGO_URI` the API
uses, so a green result here means the API will boot.

```powershell
cd backend

npm run db:check     # connect + report server, latency, collections, doc counts
npm run db:setup     # the above + create/repair every Mongoose index
npm run db:json      # machine-readable output (CI; scripts\dev-up.ps1 uses it)

# one-off URI without editing .env
node scripts/mongo-connect.js --uri "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/rozgarmitra"
npm run db:atlas -- "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/rozgarmitra"
```

Example output:

```
MongoDB connection OK
------------------------------------------------------------------
   URI          : mongodb://127.0.0.1:27017/rozgarmitra
   Target       : Standalone (mongodb) @ 127.0.0.1:27017
   Database     : rozgarmitra
   Server       : MongoDB 8.3.2 - standalone
   Latency      : 25 ms
------------------------------------------------------------------
   Collections  : 9
     - applications          38 docs   indexes: _id_, jobId_1_workerId_1
     - jobs                  47 docs   indexes: _id_, category_1_status_1, ...
     ...
```

Exit code `0` = connected, `1` = not connected (with a cause-specific fix hint:
service down, bad credentials, DNS/SRV failure). Passwords are redacted in output.

### Pointing at MongoDB Atlas

1. Create a cluster → **Connect → Drivers** → copy the connection string.
2. In `backend/.env`:
   `MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/rozgarmitra?retryWrites=true&w=majority`
3. Atlas → **Network Access** → add your IP (or `0.0.0.0/0` for a quick test).
4. `npm run db:check`, then `npm run seed` to load demo data.

### Local MongoDB: service or on demand

```powershell
powershell -File scripts\start-mongodb.ps1
```

Resolution order: is `127.0.0.1:27017` already open → start the **MongoDB**
Windows service (needs an elevated shell) → launch the installed `mongod.exe`
against a repo-local `\.mongo-data` folder.


---

## 5. Google Play release (APK / AAB)

### 5.1 What Play actually accepts

Google Play **rejects plain APKs** for new apps and updates: you upload an
**Android App Bundle (`.aab`)**. The APK is only used for sideloading/testing.
This repo produces both, signed with the same upload key.

### 5.2 Upload key (already created in this repo)

```
mobile\android\keystore\rozgarmitra-upload.jks   <-- upload keystore (gitignored)
mobile\android\key.properties                   <-- credentials (gitignored)
alias: upload      storeType: JKS
SHA-1  : 0C:F2:43:9F:70:20:A9:C6:57:7B:9E:18:BD:09:C5:DE:EE:59:4F:FF
SHA-256: 33:6D:4C:D9:EF:B3:00:5E:DF:DA:C0:78:CE:9E:3D:CC:FF:1B:E8:6E:93:FD:9A:AA:64:B0:40:44:AF:3C:BD:FF
```

> **Back up `rozgarmitra-upload.jks` + `key.properties` now** (password manager /
> private storage). If both are lost you cannot publish updates to an app that is
> already live — Play App Signing cannot recover an upload key for you.

To create a fresh key on another machine:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\make-upload-keystore.ps1
```

The SHA-1/SHA-256 also go into Firebase (Project settings → Your apps → Android)
if you enable Firebase Phone Auth.

### 5.3 Build

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1 `
  -ApiBaseUrl https://api.rozgarmitra.com/api
```

* `-ApiBaseUrl` is **mandatory** — a release build must not default to the
  emulator address `10.0.2.2`.
* Outputs:
  * `mobile\build\app\outputs\bundle\release\app-release.aab` ← **upload this to Play**
  * `mobile\build\app\outputs\flutter-apk\app-release.apk` ← sideload/testing
  * copies land in `release-artifacts\rozgarmitra-<version>-<code>.aab|apk`
* Flags: `-ApkOnly`, `-AabOnly`, `-BuildName 1.1.0`, `-BuildNumber 2`.

Manual equivalent:

```powershell
cd mobile
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.rozgarmitra.com/api
flutter build apk   --release --dart-define=API_BASE_URL=https://api.rozgarmitra.com/api
```

Verify a build is signed with the upload key (not the debug key):

```powershell
& "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe" -printcert -jarfile `
  mobile\build\app\outputs\flutter-apk\app-release.apk | Select-String "SHA1|Owner"
```

### 5.4 Versioning (every upload needs a higher versionCode)

`mobile\pubspec.yaml`:

```yaml
version: 1.0.0+1     # name+code  ->  versionName 1.0.0, versionCode 1
```

Bump the number after `+` for every Play upload (Play rejects duplicates), e.g.
`1.0.1+2`, or pass `-BuildNumber 2` to `build-release.ps1`.

### 5.5 Branding assets

`scripts\make-android-icons.ps1` regenerates everything from
`mobile\assets\images\logo.png`:

* Android launcher icons (all densities) + adaptive icon (API 26+) — the
  magnifier glyph is auto-cropped from the wordmark, no manual pixel work.
* Web/PWA icons + favicon.
* `mobile\play-store\icon-512.png` (Play app icon, opaque 512×512).
* `mobile\play-store\feature-graphic-1024x500.png` (Play feature graphic).

### 5.6 Play Console checklist

| Step | Detail |
|---|---|
| Developer account | one-time $25 registration |
| Create app | name **RozgarMitra**, language, app/game = App, free |
| Upload | Production → Create release → upload the `.aab` |
| Store listing | short description, full description, `play-store\icon-512.png`, `play-store\feature-graphic-1024x500.png`, ≥2 phone screenshots |
| App content | privacy policy URL, Data safety form, content rating questionnaire, target audience |
| Signing | keep **Play App Signing** enabled (default) — Google re-signs with the app signing key |
| Testing | Internal testing track first (instant), then Closed/Open, then Production |
| Permissions in this app | `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` → declare the location use in Data safety |

Account/OTP note for review: while `APP_MODE=demo` the OTP is fixed at `123456`.
For a public release either wire a real SMS provider (`backend/src/services/otpService.js`
has the switch-ready hook) or give Play reviewers a test account whose number is
already seeded — reviewers must be able to log in.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `[DB] MongoDB connection error` / `db:check` exits 1 | `powershell -File scripts\start-mongodb.ps1`, or fix `MONGO_URI` for Atlas (`backend\.env`) |
| Admin page loads but every request fails | `admin\.env` → `VITE_API_BASE_URL` must match the running API; restart `npm run dev` after editing `.env` |
| App shows "Something went wrong" on emulator | use `10.0.2.2`, not `localhost`, for `API_BASE_URL`; check `curl http://localhost:5000/api/health` on the PC |
| App on a phone can't reach the PC | same Wi-Fi + Windows firewall allows Node on port 5000; use the PC's LAN IP |
| Flutter web login shows a Firebase assertion in the console | harmless: `Firebase.initializeApp()` is intentionally best-effort, the app falls back to the demo OTP flow |
| `AAPT: error: resource mipmap/ic_launcher_round not found` | run `scripts\make-android-icons.ps1` (it creates the round + adaptive icons) |
| `Gradle task assembleDebug failed` | `cd mobile\android; .\gradlew.bat clean` then re-run; check the JDK with `flutter doctor -v` |
| `flutter run -d chrome` shows "Waiting for connection from debug service" | Chrome is starting; first web build takes ~1 min. If Chrome never opens, use `-d web-server --web-port 8080` |
| Emulator stuck `offline` in `adb devices` | `adb kill-server; adb start-server`; if it persists, cold-boot the AVD from Android Studio Device Manager |
| Play Console rejects the upload | versionCode not higher than the last upload, or the AAB is debug-signed (check `key.properties` exists) |

