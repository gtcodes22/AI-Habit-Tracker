# Frontend Integration

## Current state

The frontend (`frontend/ai-habit-tracker-ui-boilerplate-code`) runs entirely on an **in-memory mock**:

- `src/api/axios.js` is *not* axios. It is a hand-written router that fakes every endpoint (250 ms delay, data from `src/utils/mockData.js`). State resets on refresh.
- A commented block at the top of that file contains the real axios client to paste in later.
- `src/utils/mockData.js` exists only to feed the mock.

Every page imports `api` from `src/api/axios.js` and calls `api.get/post/put/delete`, so **swapping that one file switches the whole app to the real backend.**

## The cutover (two changes)

1. **`.env`** in the frontend: `VITE_API_URL=http://localhost:8000/api` (already set). Restart Vite afterwards.
2. **Replace `src/api/axios.js`** with the real client:
   - `axios.create({ baseURL: import.meta.env.VITE_API_URL })`. The boilerplate's commented version hardcodes `http://localhost:8000/api`; using the env var is better.
   - **Request interceptor:** attach `Authorization: Bearer <token>` from `localStorage`.
   - **Response interceptor:** on `401`, unless the path is `/`, `/login` or `/register`, remove `token` and `user` from `localStorage` and redirect to `/login`.
3. **Delete `src/utils/mockData.js`.**

Do this only after the backend endpoints below exist and are tested.

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
