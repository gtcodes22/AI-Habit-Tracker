# Development Roadmap

Last updated: 2026-09-20

## Status summary

| Area | Status |
|---|---|
| Frontend UI (mock-backed) | **Built**: installs, builds and runs |
| Frontend housekeeping (`.gitignore`, `.env`, dependency audit) | **Done** |
| Backend `package.json` and dependencies | **Done**: 180 packages, 0 vulnerabilities |
| Backend `.gitignore` | **Done** |
| Backend source code | **Not started** |
| Frontend → backend cutover | **Not started** |
| Documentation | **Done** (this folder) |

## Backend build order

Follow this order. Each step should be tested before the next begins.

### Phase 1: Foundation
- [ ] Create folders: `config`, `controllers`, `middleware`, `models`, `routes`, `utils`, `scripts`
- [ ] Create `backend/.env` (Atlas URI, JWT secret, Gemini key, port, client URL). *Needs the user to create the Atlas cluster and Gemini key.*
- [ ] `config/db.js`: `connectDB()`
- [ ] `middleware/errorHandler.js`: `notFound`, `errorHandler`
- [ ] `server.js`: CORS, JSON, health route, error handlers, connect-then-listen
- [ ] **Test:** `GET /api/health`; terminal shows "MongoDB connected"

### Phase 2: Authentication
- [ ] `models/User.js` (hash hook, `matchPassword`, `toJSON`)
- [ ] `middleware/auth.js` (`protect`)
- [ ] `controllers/authController.js` (register, login, me, profile)
- [ ] `routes/auth.js` and mount at `/api/auth`
- [ ] **Test:** register → login → `me` with bearer token; confirm the hash in Atlas and that no password appears in responses

### Phase 3: Habits
- [ ] `models/Habit.js` (capitalized category enum)
- [ ] `controllers/habitController.js` (list, create, update, delete **with log cascade**, archive toggle, reorder)
- [ ] `routes/habits.js` (`/reorder` before `/:id`) and mount
- [ ] **Test:** create, list, update, archive, `includeArchived`, delete

### Phase 4: Logs and stats
- [ ] `utils/dateHelpers.js` (`toDateKey`, `todayKey`, `last90Days`, `currentWeekKeys`, `lastNDays`, `calcStreak`)
- [ ] `models/HabitLog.js` (unique compound index)
- [ ] `controllers/logController.js` (mark, unmark, today, range, heatmap, stats, per-habit stats)
- [ ] `routes/logs.js` (`/stats` before `/stats/:habitId`) and mount
- [ ] Return `/logs/stats` as `{ perHabit, days }`
- [ ] **Test:** mark twice (no duplicate), today, heatmap, stats, unmark

### Phase 5: AI
- [ ] `models/AIInsight.js`
- [ ] `utils/aiService.js` (lazy client, `parseJSON`, `chatCompletion`, five prompts)
- [ ] `controllers/aiController.js` (weekly, suggestions, recovery, chat, morning)
- [ ] `routes/ai.js` (paths: `weekly-report`, `suggest-habits`, `recovery-plan`, `chat`, `morning`) and mount
- [ ] **Test:** each endpoint with real data; check `aiinsights` collection

### Phase 6: Seed script
- [ ] `scripts/seed.js`: demo user, 8 habits, about 500 logs over 90 days, deterministic patterns
- [ ] **Test:** `npm run seed`, log in as the demo user

### Phase 7: Frontend cutover
- [ ] Replace `src/api/axios.js` with the real client
- [ ] Delete `src/utils/mockData.js`
- [ ] Restart Vite; register a new account; click through every page
- [ ] Follow the verification list in [Frontend Integration](frontend-integration.md)

## Optional cleanup

- [ ] Fix the frontend's 14 ESLint errors (see [Changelog](CHANGELOG.md) for the list): unused imports, empty `catch`, `DeltaPill` defined inside a component, and `set-state-in-effect`.
- [ ] Route-level code splitting (`React.lazy`) to shrink the 874 kB bundle.
- [ ] Optionally upgrade `react-router-dom` to v7 (not needed for security).
- [ ] Deployment: backend to Render, Railway or Fly.io; frontend to Vercel or Netlify.

## Open questions and decisions

| Question | Current default |
|---|---|
| Database variable name (`URI` vs `MONGODB_URI`) | `MONGODB_URI` |
| Backend port | 8000 (frontend `.env`, `.env.example` and the axios TODO all agree) |
| Local MongoDB or Atlas | Atlas (as in the tutorial) |
| Implement `/habits/reorder`? | Yes for parity with the tutorial, though the frontend doesn't call it yet |
| How to version-control the frontend | **Resolved (2026-09-20).** Frontend merged into the root repo; its nested `.git` (which pointed at the tutorial author's repo) was removed. One repo now holds `backend/`, `frontend/` and `docs/`. |
| GitHub repository for this project | **Open.** Committed locally only; no remote configured and nothing pushed. Create an empty repo on GitHub, then `git remote add origin <url>` and `git push -u origin main`. |

## Out of scope (for now)

Push notifications, social streak sharing, custom icon uploads, a React Native mobile app.
