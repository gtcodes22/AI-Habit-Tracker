# Changelog

All notable changes to this project are recorded here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### 2026-09-20

#### Added
- `docs/` folder with project documentation: overview, architecture, API reference, data models, AI features, setup guide, frontend integration, development roadmap and this changelog.
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
