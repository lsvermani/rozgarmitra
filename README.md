# Rozgarmitra 🤝
**Kaam bhi, Rozgar bhi.** — Local Jobs & Daily-Wage Worker Platform

A working MVP connecting daily-wage workers/job seekers with local job creators. Built for extreme simplicity: large buttons, minimal typing, multilingual (English / Hindi / Punjabi).

---

## 1. What's included

| Part | Tech | Status |
|---|---|---|
| **Backend API** | Node.js + Express + MongoDB (Mongoose) | ✅ Complete, verified to boot cleanly |
| **Admin Dashboard** | React + Vite + react-router + recharts | ✅ Complete, verified to build cleanly |
| **Mobile App** | Flutter (Provider + go_router) | ✅ Builds + runs (verified on an Android 16 emulator) and on Chrome (Flutter web) |
| **Android release** | Signed AAB/APK for Google Play | ✅ Upload key + release signing configured — see `docs/RUN_AND_RELEASE.md` |
| **Tooling** | `scripts\*.ps1` | ✅ One-command dev stack, MongoDB connection script, Play Store build script |
| **Demo data** | Seed script | ✅ 1 admin, 10 workers, 5 job creators, 20 jobs, ~30 applications, ratings, notifications |

> 🚀 **Just want to run it?** `powershell -File scripts\dev-up.ps1 -WithFlutterWeb -WithAndroid`
> then open http://localhost:5173 — full instructions in [`docs/RUN_AND_RELEASE.md`](docs/RUN_AND_RELEASE.md).

---

## 2. Project structure

```
rozgarmitra/
├── backend/                  # Node.js + Express + MongoDB REST API
│   ├── src/
│   │   ├── config/db.js
│   │   ├── controllers/      # auth, user, job, application, rating, notification, report, category, admin
│   │   ├── models/           # User, Job, Application, Rating, Notification, Report, Category
│   │   ├── routes/
│   │   ├── middleware/       # auth (JWT), error handler, validation
│   │   ├── services/         # otpService (mock/demo + pluggable real providers), notificationService
│   │   └── seed/seed.js      # demo data generator
│   ├── .env.example
│   └── package.json
│
├── admin/                    # React + Vite admin dashboard
│   ├── src/
│   │   ├── api/client.js
│   │   ├── context/AuthContext.jsx
│   │   ├── components/Layout.jsx
│   │   └── pages/            # Login, Dashboard, Users, Jobs, Reports
│   ├── .env.example
│   └── package.json
│
├── mobile/                   # Flutter app (Android-first)
│   ├── lib/
│   │   ├── screens/
│   │   │   ├── auth/         # splash, role select, OTP login, profile setup
│   │   │   ├── worker/       # home, job list+filters, job detail+apply, applications
│   │   │   ├── creator/      # dashboard, post job, applications management
│   │   │   └── shared/       # profile, notifications
│   │   ├── widgets/          # job_card, bottom_nav_shell
│   │   ├── models/           # user, job, application
│   │   ├── services/         # api_service.dart (HTTP client)
│   │   ├── providers/        # auth_provider, job_provider (Provider state mgmt)
│   │   ├── utils/            # app_theme (design system), app_router (go_router)
│   │   └── l10n/             # app_strings.dart (en/hi/pa string map)
│   └── pubspec.yaml
│
└── README.md                 # you are here
```

---

## 3. Quick start

> 📖 The complete, verified walkthrough (browser + app + MongoDB + Play Store) lives in
> **[`docs/RUN_AND_RELEASE.md`](docs/RUN_AND_RELEASE.md)**. The short version:

### Prerequisites
- Node.js 18+
- MongoDB running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string
- Flutter SDK 3.3+ (for the mobile app) — https://docs.flutter.dev/get-started/install
- Android Studio / an emulator or physical device (for the mobile app)

### 3.0 One command for the whole stack (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -WithFlutterWeb -WithAndroid
```

Starts MongoDB (if needed), verifies the database + indexes, starts the API and the
admin dashboard and opens it, then launches the app in Chrome and on the Android
device/emulator. Stop it with `scripts\stop-all.ps1`.

### 3.1 Backend

```bash
cd backend
cp .env.example .env      # edit if needed — defaults work for local dev
npm install
npm run db:check          # NEW: verify MONGO_URI + list collections/doc counts
npm run seed              # populates demo data (10 workers, 5 creators, 20 jobs, etc.)
npm run dev               # starts on http://localhost:5000 (nodemon, auto-reload)
# or: npm start
```

Health check: `GET http://localhost:5000/api/health`

`npm run db:check` is also the fastest way to test an Atlas connection string:

```bash
node scripts/mongo-connect.js --uri "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/rozgarmitra"
```

The backend runs in **demo mode** by default (`APP_MODE=demo` in `.env`). In demo mode:
- OTP is always `123456` (also returned in the `/api/auth/send-otp` response as `demoOtp` so the frontend can auto-fill it)
- No real SMS provider is required

### 3.2 Admin Dashboard

```bash
cd admin
cp .env.example .env       # points to http://localhost:5000/api by default
npm install
npm run dev                 # starts on http://localhost:5173
```

Login with the demo admin: **mobile `9999999999`**, OTP `123456` (auto-filled in demo mode).

### 3.3 Mobile App (Flutter)

```bash
cd mobile
flutter pub get
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:5000/api   # Android emulator → host machine
```

Notes on `API_BASE_URL`:
- **Android emulator**: `http://10.0.2.2:5000/api` (default already baked in)
- **Physical device on same Wi-Fi**: `http://<your-computer-LAN-IP>:5000/api`
- **iOS simulator**: `http://localhost:5000/api`

Demo logins (OTP always `123456` in demo mode):
- **Worker**: `9000000010` (Ramesh)
- **Job Creator**: `8000000010` (ABC Construction)
- New numbers can also self-register through the role-selection → OTP flow.

How OTP login resolves in the app:
- If Firebase is configured (`android/app/google-services.json` with the Phone provider enabled), the app uses **Firebase Phone Auth** and exchanges the Firebase ID token via `POST /auth/firebase`.
- If Firebase is **not** configured (the default state of this repo), the app automatically falls back to the backend's own OTP endpoints — `POST /auth/send-otp` returns `demoOtp` and the login screen auto-fills it, so demo mode works with no Firebase project.
- Debug builds include a cleartext-HTTP `network_security_config.xml` (`android/app/src/debug/`) so calls to `http://10.0.2.2:5000/api` are allowed on API 28+. Release builds keep Android's default (cleartext HTTP blocked).

> ⚠️ The Flutter source was written carefully and checked for structural/syntax consistency, but it has **not been compiled** in this environment (no Flutter SDK available in the sandbox used to build this project). Run `flutter analyze` and `flutter run` locally as your first step — treat this as a strong first-pass implementation to build on, not a pre-tested release.

---

## 4. Demo login credentials (after running `npm run seed`)

| Role | Mobile | OTP |
|---|---|---|
| Admin | `9999999999` | `123456` |
| Worker (Ramesh) | `9000000010` | `123456` |
| Job Creator (ABC Construction) | `8000000010` | `123456` |

(9 more workers at `9000000011`–`9000000019`, 4 more job creators at `8000000011`–`8000000014` — see seed console output for full list.)

---

## 5. API documentation (summary)

Base URL: `http://localhost:5000/api`

### Auth
| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/auth/send-otp` | — | body: `{ mobile, role? }`. `role` required for new numbers |
| POST | `/auth/verify-otp` | — | body: `{ mobile, otp }` → returns `{ token, user }` |

### Users
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/users/profile` | ✅ |
| PUT | `/users/profile` | ✅ |
| GET | `/users/:id` | ✅ (public profile fields) |

### Jobs
| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| GET | `/jobs` | — | query: `category, skill, lat, lng, maxDistanceKm, minPayment, maxPayment, date, search, status, page, limit` |
| GET | `/jobs/:id` | optional | includes `myApplication` if logged in as worker |
| POST | `/jobs` | ✅ job_creator | create job |
| PUT | `/jobs/:id` | ✅ job_creator (own) | update job |
| DELETE | `/jobs/:id` | ✅ job_creator (own) | delete job |
| POST | `/jobs/:id/apply` | ✅ worker | apply to job |
| POST | `/jobs/:id/complete` | ✅ job_creator (own) | mark job completed |

### Applications
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/applications` | ✅ (own, filtered by role) |
| PUT | `/applications/:id/status` | ✅ job_creator | body: `{ status: SHORTLISTED\|SELECTED\|REJECTED }` |

### Ratings / Notifications / Reports / Categories
| Method | Endpoint | Auth |
|---|---|---|
| POST | `/ratings` | ✅ |
| GET | `/ratings/:userId` | — |
| GET | `/notifications` | ✅ |
| PUT | `/notifications/:id/read` | ✅ |
| PUT | `/notifications/read-all` | ✅ |
| POST | `/reports` | ✅ |
| POST | `/reports/block/:userId` | ✅ |
| GET | `/categories` | — |

### Admin (all require `role: admin`)
| Method | Endpoint |
|---|---|
| GET | `/admin/stats` |
| GET | `/admin/users` |
| PUT | `/admin/users/:id/block` |
| PUT | `/admin/users/:id/verify` |
| GET | `/admin/jobs` |
| DELETE | `/admin/jobs/:id` |
| GET | `/admin/reports` |
| PUT | `/admin/reports/:id` |

All responses are JSON, shaped as `{ success: boolean, message?, ...data }`.

---

## 6. Database (MongoDB collections)

`User`, `Job`, `Application`, `Rating`, `Notification`, `Report`, `Category` — fields match the spec in the product brief (see `backend/src/models/*.js`). Geo fields (`latitude`/`longitude`) are present on both `User` and `Job` for distance-based discovery (Haversine formula, see `backend/src/utils/geo.js`).

---

## 7. Security implemented

- JWT-based auth with role-based middleware (`protect`, `authorize`)
- `express-validator` input validation on all write endpoints
- `express-mongo-sanitize` against NoSQL injection
- `helmet` HTTP headers, `cors` configured via env
- Rate limiting (`express-rate-limit`, configurable window/max)
- Centralized error handler (no stack traces leaked to clients)
- No secrets committed — `.env.example` provided, `.env` is gitignored
- Blocked users are rejected at the auth middleware layer

---

## 8. Known limitations (MVP scope)

- **OTP is mocked/demo-only.** `backend/src/services/otpService.js` is structured so a real provider (MSG91 / Twilio / Firebase) can be dropped in by implementing the `sendSms` switch cases — no other code changes needed.
- **No payment gateway.** Payment is just a recorded number (`job.payment`), per the spec. The service layer is structured so a future escrow/UPI flow slots in around job status transitions.
- **Distance filtering is computed in-memory** (Haversine) rather than a MongoDB geospatial (`2dsphere`) index — fine at MVP scale (hundreds–low thousands of jobs), but should move to `$geoNear` before scaling up.
- **Flutter app has not been compiled/run** in the environment that produced this code (no Flutter SDK available in the sandbox). It's been checked for structural consistency (imports, brace-balance, referenced routes/files all present) but you should run `flutter analyze` as your first step locally.
- **Admin dashboard has no category-management UI yet** (the API endpoint exists — `POST/PUT /api/categories` — but no admin page calls it yet).
- **No push notifications** (FCM) — in-app notification list only (`/api/notifications`), which is enough for demoing.
- **No automated tests** — recommended next step (Jest/Supertest for the API, `flutter test` for widget tests).
- **"My Jobs" tab in the creator app** currently reuses the dashboard view rather than being a fully separate paginated screen — small polish item.

---

## 9. Recommended next steps

1. Wire up a real SMS provider (MSG91 recommended for India) via `otpService.js`.
2. Add MongoDB `2dsphere` geo index + `$geoNear` for production-scale distance search.
3. Add automated tests (backend: Jest + Supertest; mobile: `flutter test`).
4. Build out the **AI Job Matching**, **Voice Job Posting**, and **Voice Job Search** features described in the original brief — the codebase is deliberately structured (clean service layer, REST API) to make these additive rather than requiring rewrites.
5. Add image upload for profile photos / job photos (e.g. via S3 or Cloudinary) — `profilePhoto` fields already exist on the models.
6. Add a UPI/payment-gateway integration around the `job.status` lifecycle (`COMPLETED` → payment release).
7. Deploy: backend to Render/Railway/EC2 + MongoDB Atlas; admin dashboard to Vercel/Netlify; mobile app to Play Store (internal testing track first).

---

## 10. Deployment notes

- **Backend**: set real `.env` values (`JWT_SECRET`, `MONGO_URI` to Atlas, `APP_MODE=production` once an SMS provider is wired up, `CORS_ORIGIN` to your actual frontend domain).
- **Admin**: `npm run build` in `admin/` produces a static `dist/` — deploy to any static host, set `VITE_API_BASE_URL` to your production API URL at build time.
- **Mobile**: `flutter build apk` (or `appbundle` for Play Store), passing `--dart-define=API_BASE_URL=https://your-api-domain.com/api`.
