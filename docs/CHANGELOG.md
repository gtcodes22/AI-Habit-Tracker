# Changelog

All notable changes to this project are recorded here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
