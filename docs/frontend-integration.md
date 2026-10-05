# Frontend Integration

## Current state

**Status: Done (Phase 7, 2026-10-05).** The frontend talks to the real backend. The in-memory mock described below is history, kept here for context on what changed and why.

- `src/api/axios.js` is now a real axios client: `axios.create({ baseURL: import.meta.env.VITE_API_URL })`, with a request interceptor attaching `Authorization: Bearer <token>` from `localStorage`, and a response interceptor that clears the session and redirects to `/login` on a `401` (except on `/`, `/login`, `/register`, to avoid a redirect loop).
- `src/utils/mockData.js` is deleted.

Before this cutover, `src/api/axios.js` was a hand-written router faking every endpoint from in-memory mock data (250 ms delay, state reset on refresh). Every page imports `api` from `src/api/axios.js` and calls `api.get/post/put/delete`, so the entire swap was contained to that one file plus the deletion.

**Verified end-to-end**, not just read through: using Playwright against the real running app (backend on :8000, frontend on :5173), scripted and screenshotted a full user journey — register (fresh account) → landed on an empty dashboard (not stale mock habits) → created a habit through the real UI → checked it off (confetti fired, streak/consistency/weekly-grid widgets updated) → visited Habits, Weekly, Insights and Stats (all rendered real data, zero console or page errors) → logged out and back in → confirmed the habit persisted through the real backend rather than resetting (which the old mock would have done on a refresh). 11/11 scripted checks passed; the disposable test account was removed afterward.

One pre-existing UI quirk observed, not caused by the cutover: the "This week %" stat on the dashboard can show briefly stale right after a check-off, then self-corrects on the next render/reload (confirmed in the screenshots — 0% immediately after checking off, correctly 14% after a subsequent login). Worth a look if it bothers you, but out of scope for the cutover itself.

## The cutover (two changes made)

1. **`.env`** in the frontend: `VITE_API_URL=http://localhost:8000/api` (already set; no change needed). Vite was restarted to pick up the swap.
2. **Replaced `src/api/axios.js`** with the real client (as described above).
3. **Deleted `src/utils/mockData.js`.**

## API contract the frontend actually uses

Verified by searching every `api.*` call in `src/` and reading the mock.

| Call | Where used | Notes |
|---|---|---|
| `POST /auth/login` `{email,password}` | AuthContext | Needs `{ user, token }` |
| `POST /auth/register` `{name,email,password}` | AuthContext | Needs `{ user, token }` |
| `GET /auth/me` | AuthContext (on load if a token exists) | Needs `{ user }`. Failure clears the session. |
| `PUT /auth/profile` `{name, morningMotivation}` | Sidebar settings | Needs `{ user }` |
| `GET /habits` (`?includeArchived=true` on Habits page) | Dashboard, Habits, Insights, Stats, Weekly | Array |
| `POST /habits` | Dashboard, Habits (also when accepting an AI suggestion) | Returns the habit |
| `PUT /habits/:id` | Dashboard, Habits | Returns the habit |
| `PUT /habits/:id/archive` | Dashboard, Habits | Returns habit; UI reads `isArchived` |
| `DELETE /habits/:id` | Dashboard, Habits | |
| `POST /logs` `{habitId, date}` | Dashboard | |
| `DELETE /logs` (body `{habitId, date}`) | Dashboard | Body on DELETE: with real axios, pass `{ data: {...} }` |
| `GET /logs/today` | Dashboard | Array |
| `GET /logs/range?start&end` | Dashboard, Habits, Weekly, Insights, Stats | Array |
| `GET /logs/heatmap` | Dashboard | 90 × `{date, count}` |
| `GET /logs/stats` | Stats | **Object `{ perHabit, days }`** |
| `POST /ai/weekly-report` | AIWeeklyReport, Insights | `{ content }` |
| `POST /ai/suggest-habits` `{goals, productiveTime, struggles}` | HabitSuggestionModal | `{ suggestions }` |
| `POST /ai/recovery-plan` `{habitId}` | StreakRecoveryCard | `{ content }` |
| `POST /ai/chat` `{question}` | AIChat | `{ content }` |
| `GET /ai/morning` | MorningMotivation | `{ content }` |

## Where the tutorial and the frontend disagree

**The frontend wins in every case.**

| Topic | Tutorial says | Frontend requires |
|---|---|---|
| Category names | Spoken in lowercase ("health, fitness…") | **Capitalized**: `Health`, `Fitness`, … (`constants.js`) |
| `GET /logs/stats` shape | "an array of per-habit summaries" | **`{ perHabit: [...], days: [...] }`**. `Stats.jsx` reads `stats.perHabit`. |
| `PUT /habits/reorder` | Built in the backend | **Not called anywhere** in the frontend. Optional. |
| Stats-per-habit route | `/logs/stats/:habitId` exists | Not called by current pages. Keep for completeness. |
| Cascade delete | "Come back and add it later" | Needed: deleting a habit must delete its logs |

## Per-item fields the pages read

`perHabit[]` items need: `habitId, name, icon, color, category, completions30d, currentStreak, longestStreak`.

## Known frontend quirks (not caused by the backend)

- The frontend has **14 ESLint errors** (mostly `react-hooks/set-state-in-effect` and unused variables) that do not affect the build. See the [Changelog](CHANGELOG.md).
- The production bundle is ~874 kB (248 kB gzipped); route-level code splitting would reduce it.
- `AuthContext` keeps the JWT in `localStorage`, which is fine for development but worth revisiting for production hardening.
- `react-router-dom` v6 has two moderate advisories. Neither applies here (client-side only, no SSR; navigation targets are not user-controlled). Upgrading to v7 is optional.

## Verifying the cutover

1. Both servers running: backend on 8000, frontend on 5173.
2. Open the app. You'll be redirected to login because the old mock token is rejected. This is expected.
3. Register a new account; confirm the dashboard is empty.
4. Create a habit, refresh, and confirm it persisted. Check it off, confirm the confetti, and check that a document appears in Atlas.
5. Generate an AI weekly report; open Insights and Stats; try the chat bubble.
6. Run `npm run seed` and log in as the demo user to check populated views.
