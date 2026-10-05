# Changelog

All notable changes to this project are recorded here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### 2026-10-05 (5)

#### Changed
- **Frontend cutover** (Phase 7): `src/api/axios.js` replaced with a real axios client (base URL from `VITE_API_URL`, JWT request interceptor, 401 response interceptor); `src/utils/mockData.js` deleted. The frontend now talks to the real backend end to end.

#### Verified
- Drove the real, running app with Playwright (not just read through the code): registered a fresh account, confirmed an empty dashboard (not stale mock data), created a habit, checked it off (confetti fired, stats/streak/weekly-grid updated), visited Habits/Weekly/Insights/Stats (all rendered correctly, zero console or page errors), logged out and back in, and confirmed the habit persisted through the real backend. 11/11 scripted checks passed, with screenshots reviewed at each step. The disposable test account (and one leftover from an earlier failed test run) were both found and removed from the database afterward.
- Noted one pre-existing, unrelated UI quirk: the dashboard's "This week %" stat can show briefly stale immediately after a check-off, correcting itself on the next render. Not caused by this cutover.

### 2026-10-05 (4)

#### Added
- **Seed script** (Phase 6): `scripts/seed.js` — a demo user (`demo@habittracker.local` / `Demo1234!`, overridable via `SEED_EMAIL`/`SEED_PASSWORD`) with 7 habits and ~441 logs over the last 90 days, reusing the frontend's existing `mockData.js` habit definitions and deterministic pseudo-random log generator (not the tutorial's spoken "8 habits" — matching the project's own established mock data was the priority). Safe to re-run: wipes and rebuilds the same account by email rather than creating duplicates.
- [Setup Guide](setup-guide.md): a "Demo account" section with the seeded login.

#### Verified
- Ran `npm run seed` twice: confirmed the same user `_id`, the same habit count (7, not 14) and the same log count (441, not doubled) both times.
- Logged in as the seeded demo user through the real `/api/auth/login` endpoint (not a direct DB check) and confirmed `/api/habits`, `/api/logs/stats` and `/api/logs/heatmap` all return realistic, varied data matching each habit's intended pattern — e.g. a 13-day current streak on the high-probability water habit, a short streak on the drop-off journal habit, and a confirmed 5-day gap with zero logs around the forced broken-streak habit.
- This demo data was intentionally **not** cleaned up afterward (unlike every other phase's throwaway test data) — it's meant to persist as a standing demo account.

### 2026-10-05 (3)

#### Added
- **AI integration** (Phase 5):
  - `models/AIInsight.js`: persists every AI response (type, content, meta, generatedAt).
  - `utils/aiService.js`: lazy Gemini client (`@google/genai`), the five tuned system prompts, `parseJSON()` (strips markdown fences), `chatCompletion()` with retry/backoff, `sanitizeSuggestion()` and `DEFAULT_SUGGESTIONS`.
  - `controllers/aiController.js` + `routes/ai.js`, mounted at `/api/ai`: `POST /weekly-report`, `POST /suggest-habits`, `POST /recovery-plan`, `POST /chat`, `GET /morning` — each builds its context from real `Habit`/`HabitLog` data (last 7 days for the weekly report, last 30 days plus a per-weekday breakdown for chat, full streak history for the recovery plan and morning message).

#### Fixed
- **`gemini-2.5-flash` no longer works for new API keys.** Discovered via a live 404 from Google's API; updated both the `.env` `GEMINI_MODEL` value and the code's fallback default to `gemini-3.8-flash`.
- `chatCompletion()` now retries once on a transient error (429/503), honoring the server's suggested `retryDelay` when the API provides one, instead of a blind fixed backoff.
- **`suggest-habits`' fallback only covered malformed JSON, not an outright API failure.** Found by reproducing a real Gemini 503 outage live: the endpoint returned a 500-ish error instead of the intended `DEFAULT_SUGGESTIONS` fallback. Widened the `try/catch` in `getSuggestions` to cover both failure modes; re-verified live that an outage now correctly returns `200` with the fallback suggestions.

#### Verified
- 11 validation/unit checks, free of any Gemini call: `parseJSON` fence-stripping, `sanitizeSuggestion` coercing invalid category/frequency to valid defaults, `DEFAULT_SUGGESTIONS` shape, and auth/input-validation 400s and 401s/404s on all five routes.
- Live Gemini calls (kept deliberately minimal, given free-tier rate limits hit during testing): `weekly-report` and `chat` both succeeded, producing on-topic, well-grounded output matching their prompts (real habit names, specific numbers/days, no markdown headers). `suggest-habits` was exercised against a real outage and correctly fell back to `DEFAULT_SUGGESTIONS`. `recovery-plan` and `morning` share identical code paths to the endpoints that succeeded but were not individually confirmed with a live call.
- All test users, habits, logs and AI insights were removed afterward; the pre-existing real account was left untouched (confirmed via a final DB count).

### 2026-10-05 (2)

#### Added
- **Logs & stats** (Phase 4):
  - `utils/dateHelpers.js`: `toDateKey`, `todayKey`, `lastNDays`, `last90Days`, `currentWeekKeys` (Monday-start week), and `calcStreak` — a port of the frontend mock's `mockStreak` logic, so streak numbers match what the UI already expects.
  - `controllers/logController.js` and `routes/logs.js`, mounted at `/api/logs`: `POST /` (mark, idempotent upsert), `DELETE /` (unmark, idempotent), `GET /today`, `GET /range`, `GET /heatmap` (last 90 days), `GET /stats` (`{ perHabit, days }`, 30-day window), `GET /stats/:habitId` (full history, with `completionRate` and a monthly breakdown).
  - Input hardening consistent with earlier phases: `habitId`/dates must be well-formed strings; a malformed or unknown habit id returns 404, never a 500; a concurrent duplicate-mark race is caught and resolved rather than erroring.

#### Verified
- 23 endpoint checks against a live server and the Atlas database: auth requirement; mark (success, duplicate-is-idempotent, bad habitId, missing habitId, bad date); today; range (success, missing params → 400); heatmap (90 entries, correct counts at seeded offsets); stats and per-habit stats, with streak numbers hand-calculated in advance and matched exactly; not-found and malformed-id handling for per-habit stats; unmark (success, idempotent re-unmark).
- Test habits, logs and the throwaway test user were removed afterward; the pre-existing real account was left untouched.

### 2026-10-05

#### Added
- **Habits** (Phase 3):
  - `models/Habit.js`: schema with the capitalized category enum (`CATEGORIES`, matching the frontend exactly) and frequency enum (`FREQUENCIES`).
  - `models/HabitLog.js`: built early (originally scoped to Phase 4) because habit deletion needs it for the cascade; unique compound index on `(userId, habitId, completedDate)`.
  - `controllers/habitController.js` and `routes/habits.js`: `GET /api/habits` (with `includeArchived`), `POST /api/habits`, `PUT /api/habits/:id`, `PUT /api/habits/:id/archive`, `DELETE /api/habits/:id` (cascades to that habit's logs), `PUT /api/habits/reorder`.
  - Validation on category, frequency, `targetDays` (1–7) and `color` (hex); malformed or unknown `:id` returns 404 instead of a 500 crash.
  - Mounted at `/api/habits` in `server.js`.

#### Verified
- 18 endpoint checks against a live server and the Atlas database: auth requirement, empty list, create validation (missing name, bad category, bad `targetDays`, bad color), successful creates with correct `order`, list ordering, update (success and validation failure), not-found and malformed-id handling, archive toggle, `includeArchived` filtering, reorder (success and bad body), and the cascade delete (a log was created on a habit, the habit was deleted, and the log was confirmed gone afterward).
- Test habits, logs and the throwaway test user were removed afterward; the pre-existing real account was left untouched.

### 2026-09-21

#### Added
- **Backend server foundation** (Phase 1): `server.js` (Express, CORS allow-list, JSON parsing, `GET /api/health`, connect-then-listen), `config/db.js`, `middleware/errorHandler.js`. Confirmed running against MongoDB Atlas.
- **Authentication** (Phase 2):
  - `models/User.js`: bcrypt pre-save hook (only when the password changes), `matchPassword()`, password stripped from JSON.
  - `middleware/auth.js`: `protect` verifies the Bearer JWT and attaches `req.user`.
  - `controllers/authController.js` and `routes/auth.js`: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/profile`.
  - Token lifetime read from `JWT_EXPIRES_IN` (default `30d`).
  - Input hardening beyond the tutorial: string-type checks to block NoSQL operator injection, email-format validation, case-insensitive duplicate detection.

#### Fixed
- `server.js` imported `./middleware/errorMiddleware.js`, but the file is `errorHandler.js`, causing `ERR_MODULE_NOT_FOUND`. Import corrected.
- `.env` was in `backend/utils/` where `dotenv` never loads it. Moved to `backend/.env` (git-ignored).
- `models/User.js`: a stray `next()` call inside the `async` pre-save hook (which declares no `next` parameter) threw `ReferenceError: next is not defined` after hashing, which would have made register fail with a 500. Removed; register, login and password hashing re-verified.
- `middleware/errorHandler.js` ignored the status carried by the error, so malformed request bodies (invalid JSON) returned `500` instead of `400`. It now uses `err.status` / `err.statusCode` first. Unknown routes still return 404 and validation errors 400.
- Not code bugs, but recorded in the setup guide's troubleshooting table: testing with an `https://` URL against the plain-HTTP dev server (`EPROTO WRONG_VERSION_NUMBER`), and invalid JSON in the API client body (missing commas between properties) surfacing as `Unexpected token '"' … is not valid JSON`.

#### Changed
- Docs now use `MONGO_URI` (as implemented) instead of `MONGODB_URI`, and document `JWT_EXPIRES_IN`.

#### Verified
- 20 endpoint checks against a live server and the Atlas database, all as expected: health; register validation (missing fields, short password, bad email, operator injection); successful register (201, no password in response, avatar set); duplicate email; login success, wrong password and unknown email (same 401 message), operator injection; `me` with no token, garbage token and valid token; profile update (avatar recomputed) and its validation; login still works after a profile update (password not re-hashed); unknown route returns 404.
- The throwaway test user was deleted afterward; the `users` collection is empty.

### 2026-09-20

#### Added
- `docs/` folder with project documentation: overview, architecture, API reference, data models, AI features, setup guide, frontend integration, development roadmap and this changelog.
- `docs/ideas.md`: a backlog for future ideas outside the current scope, with a template and status values. Seeded with support for multiple AI providers (Claude, Ollama) and the tutorial's suggested extensions (push notifications, social sharing, custom icons, mobile app).
- `backend/package.json` configured for the project:
  - `"type": "module"`, `main: server.js`.
  - Scripts: `start`, `dev` (nodemon), `seed`.
  - Dependencies: `@google/genai`, `bcryptjs`, `cors`, `date-fns`, `dotenv`, `express`, `jsonwebtoken`, `mongoose`; dev dependency `nodemon`.
- `backend/.gitignore` (`node_modules`, `.env`).
- Backend dependencies installed: 180 packages, 0 vulnerabilities.

#### Changed
- Frontend `.gitignore` now ignores `.env` and `.env.*`, keeping `.env.example` tracked.
- Frontend `.env.example` port changed from 5000 to 8000 to match `.env` and the planned backend.
- Frontend `package-lock.json` updated by `npm audit fix` (added 4 packages, removed 2, changed 39).
- `backend/package.json` replaced the `npm init -y` defaults (name `backend`, `commonjs`, no scripts) with the project configuration above.

#### Removed
- Frontend `.env` is no longer tracked. The old boilerplate history contained it (only `VITE_API_URL=http://localhost:8000/api`), but that history is gone from this project (see next item), and the root `.gitignore` excludes `.env` from now on. The file remains on disk.
- **Nested git repository removed from `frontend/ai-habit-tracker-ui-boilerplate-code/.git`.** It held a single commit ("Initial commit: AI habit tracker boilerplate") and pointed at the tutorial author's repo (`time-to-program/ai-habit-tracker-ui-boilerplate-code`), which is not this project's repo. Left in place, a root commit would have recorded the frontend as an empty pointer with none of its files. That upstream commit still exists on the author's GitHub.

#### Version control
- The project root is now the single git repository, containing `backend/`, `frontend/` and `docs/`. First commit made locally on `main`; **no remote is configured and nothing has been pushed.**
- Added a root `.gitignore` (`node_modules/`, `dist/`, `.env`, `.env.*` except `.env.example`, logs, editor files).

#### Security
- Frontend `npm audit`: 12 vulnerabilities (1 low, 4 moderate, 7 high) reduced to 2 moderate after `npm audit fix`.
- **Remaining, accepted:** two moderate advisories in `react-router` / `react-router-dom` (6.0.0–7.17.0):
  - Open redirect via backslash in `<Link>` and `useNavigate`. Not exploitable here: the only dynamic navigation is `navigate(loc.state?.from || "/dashboard")`, where `from` is an internal path set by `ProtectedRoute`.
  - Arbitrary constructor injection in `deserializeErrors()` during SSR hydration. Not applicable: the app is a client-only SPA.
  - `npm audit fix --force` would move to `react-router-dom@7` (a breaking major upgrade). Deferred as optional.

#### Verified
- Frontend `npm run build`: passes (2,596 modules; JS bundle 874 kB, 248 kB gzipped, with Vite's >500 kB chunk warning).
- Frontend `npm run dev`: starts on `http://localhost:5173/`.
- Frontend `npm run lint`: **14 errors, 0 warnings**, none caused by dependency updates:
  - `react-hooks/set-state-in-effect` ×6: `Dashboard.jsx` (78, 133), `Habits.jsx` (64), `MorningMotivation.jsx` (18), `AuthContext.jsx` (18). Typical fetch-on-mount pattern flagged by the stricter `eslint-plugin-react-hooks` v7 rule.
  - `react-hooks/static-components` ×1: `Insights.jsx` (319); `DeltaPill` is defined inside the component body.
  - `no-unused-vars` ×5: `Brain` and `PieCell` in `Insights.jsx`, `e` in `AIWeeklyReport.jsx`, `_` and `i` in `OrbitingHabits.jsx`.
  - `no-empty` ×1: `Insights.jsx` (96).
  - `react-refresh/only-export-components` ×2: `AuthContext.jsx`, `ThemeContext.jsx`.
  - These are not fixed yet.

#### Findings recorded in the docs
- The frontend's category values are capitalized; the backend enum must match.
- `GET /logs/stats` must return `{ perHabit, days }`.
- The frontend never calls `PUT /habits/reorder`.
- Habit deletion must cascade to logs.

---

## Project history before this changelog

- **Frontend boilerplate cloned** and dependencies installed (React 19, Vite 8, Tailwind 4, React Router 6, Recharts, and others). Runs on an in-memory mock API in `src/api/axios.js`.
- **Backend initialized** with `npm init -y` in `backend/`.
