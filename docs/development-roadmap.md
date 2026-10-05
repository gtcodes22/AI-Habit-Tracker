# Development Roadmap

Last updated: 2026-09-20

## Status summary

| Area | Status |
|---|---|
| Frontend UI (mock-backed) | **Built**: installs, builds and runs |
| Frontend housekeeping (`.gitignore`, `.env`, dependency audit) | **Done** |
| Backend `package.json` and dependencies | **Done**: 180 packages, 0 vulnerabilities |
| Backend `.gitignore` | **Done** |
| Backend source code | **Done**: all 7 phases (server foundation, auth, habits, logs & stats, AI, seed script, frontend cutover) built and tested |
| Frontend → backend cutover | **Not started** |
| Documentation | **Done** (this folder) |

## Backend build order

Follow this order. Each step should be tested before the next begins.

### Phase 1: Foundation
- [x] Create folders: `config`, `controllers`, `middleware`, `models`, `routes`, `utils`, `scripts`
- [x] Create `backend/.env` (Atlas URI, JWT secret, Gemini key, port, client URL)
- [x] `config/db.js`: `connectDB()`
- [x] `middleware/errorHandler.js`: `notFound`, `errorHandler`
- [x] `server.js`: CORS, JSON, health route, error handlers, connect-then-listen
- [x] **Test:** `GET /api/health`; terminal shows "MongoDB Connected" *(done 2026-09-21)*

### Phase 2: Authentication
- [x] `models/User.js` (hash hook, `matchPassword`, `toJSON`)
- [x] `middleware/auth.js` (`protect`)
- [x] `controllers/authController.js` (register, login, me, profile)
- [x] `routes/auth.js` and mount at `/api/auth`
- [x] **Test:** register → login → `me` with bearer token; no password in responses *(done 2026-09-21: 20 checks passed; test user deleted afterward)*
- [ ] Optional: confirm the bcrypt hash is stored in Atlas by registering a real account and viewing the `users` collection

### Phase 3: Habits
- [x] `models/Habit.js` (capitalized category enum, exported as `CATEGORIES`)
- [x] `models/HabitLog.js` (brought forward from Phase 4; only the schema was needed here, for the cascade delete)
- [x] `controllers/habitController.js` (list, create, update, delete **with log cascade**, archive toggle, reorder)
- [x] `routes/habits.js` (`/reorder` before `/:id/archive` before `/:id`) and mount
- [x] **Test:** create, list, update, archive, `includeArchived`, delete, reorder, cascade delete, malformed-id handling *(done 2026-10-05: 18 checks passed against live Atlas; test data cleaned up)*

### Phase 4: Logs and stats
- [x] `utils/dateHelpers.js` (`toDateKey`, `todayKey`, `last90Days`, `currentWeekKeys`, `lastNDays`, `calcStreak`)
- [x] `models/HabitLog.js` (unique compound index) — built early, in Phase 3, for cascade delete
- [x] `controllers/logController.js` (mark, unmark, today, range, heatmap, stats, per-habit stats)
- [x] `routes/logs.js` (`/stats` before `/stats/:habitId`) and mount
- [x] Return `/logs/stats` as `{ perHabit, days }`
- [x] **Test:** mark twice (no duplicate), today, range, heatmap, stats, per-habit stats, unmark *(done 2026-10-05: 23 checks passed against live Atlas, including hand-verified streak math; test data cleaned up)*
- [ ] `currentWeekKeys()` is written but not yet used by any endpoint — the weekly grid currently derives its own ranges from `/logs/range` on the frontend. Revisit only if a backend-driven weekly endpoint is needed later.

### Phase 5: AI
- [x] `models/AIInsight.js`
- [x] `utils/aiService.js` (lazy client, `parseJSON`, `chatCompletion` with retry/backoff, five prompts, `sanitizeSuggestion`, `DEFAULT_SUGGESTIONS`)
- [x] `controllers/aiController.js` (weekly, suggestions, recovery, chat, morning)
- [x] `routes/ai.js` (paths: `weekly-report`, `suggest-habits`, `recovery-plan`, `chat`, `morning`) and mount
- [x] **Test:** validation paths (23 checks, free — no Gemini calls), plus live Gemini calls for weekly-report, suggest-habits and chat *(done 2026-10-05)*
- [ ] `recovery-plan` and `morning` were not confirmed with a live call (Gemini was under sustained "high demand" / 503s during testing); their code is structurally identical to weekly-report and chat, which did succeed live. Worth a quick manual check in Thunder Client once Gemini is stable.

**Real-world findings from this phase** (useful context, not just a checklist):
- **`gemini-2.5-flash` is no longer available to new API keys.** Google's own 404 pointed to `gemini-3.8-flash`; both the `.env` value and the code's fallback default were updated to match. If you see "model ... is no longer available" again in the future, check Google AI Studio for the current recommended model name.
- **The free tier is rate-limited to 5 requests/minute per model.** Rapid back-to-back test runs tripped this (`429 RESOURCE_EXHAUSTED`). `chatCompletion` now honors the server's suggested `retryDelay` instead of guessing.
- **A live outage surfaced a real gap**: `suggest-habits`' fallback to `DEFAULT_SUGGESTIONS` originally only covered *malformed JSON* from the model, not an outright API failure (e.g. a 503). Widened the `try/catch` in `getSuggestions` to cover both — confirmed fixed by reproducing the outage live and watching it fall back to `DEFAULT_SUGGESTIONS` with a `200` instead of erroring.

### Phase 6: Seed script
- [x] `scripts/seed.js`: demo user, **7** habits (matching the frontend's existing `mockData.js` exactly, rather than the tutorial's spoken "8" — see note below), ~441 logs over 90 days, deterministic patterns (weekday-only, drop-off, a forced broken streak)
- [x] **Test:** `npm run seed`, log in as the demo user *(done 2026-10-05)*

**Notes:**
- **7 habits, not 8.** The frontend's `src/utils/mockData.js` already defines 7 habits with this exact deterministic algorithm, used for months of frontend-only development. Matching it exactly (same names, categories, colors, icons, patterns) was more valuable than inventing an 8th habit just to match the tutorial's narrated count.
- **Idempotent, verified:** running `npm run seed` twice produced the identical user `_id`, the same 7 habits (not 14), and the same 441 logs (not doubled) — confirmed by direct DB query between runs.
- **Verified end-to-end**, not just at the database level: logged in as the demo user through the real `/api/auth/login` endpoint, then called `/api/habits`, `/api/logs/stats` and `/api/logs/heatmap` and got back realistic, varied streaks matching each habit's intended pattern (e.g. the 95%-probability water habit showing a 13-day current streak; the drop-off journal habit showing a short 1-day streak).
- **This demo data is meant to stay** — unlike every other phase's test data, it was not cleaned up afterward. Re-run `npm run seed` anytime to reset it.
- The weekday-vs-weekend differentiation is real but softer than the sine-based generator's nominal probabilities suggest (measured 61% vs 42% for a habit targeting ~70% vs ~24%, roughly a 1.45x gap rather than the implied ~3x). This is an inherent property of the existing algorithm (shared with the frontend mock), not a bug introduced here — the pattern is still clearly visible in the data.

### Phase 7: Frontend cutover
- [x] Replace `src/api/axios.js` with the real client
- [x] Delete `src/utils/mockData.js`
- [x] Restart Vite; register a new account; click through every page
- [x] **Test:** verified end-to-end with Playwright against the real running app — register, empty dashboard, create habit, check off (confetti fires), visit all 5 other pages, logout/login, confirm persistence. 11/11 checks passed, zero console errors *(done 2026-10-05)*. See [Frontend Integration](frontend-integration.md) for the full account.

**All 7 phases are now complete.** The backend is fully built and the frontend is fully cut over to it. What's left is optional cleanup and future ideas — see below and [Ideas & Future Development](ideas.md).

## Optional cleanup

- [ ] Fix the frontend's 14 ESLint errors (see [Changelog](CHANGELOG.md) for the list): unused imports, empty `catch`, `DeltaPill` defined inside a component, and `set-state-in-effect`.
- [ ] Route-level code splitting (`React.lazy`) to shrink the 874 kB bundle.
- [ ] Optionally upgrade `react-router-dom` to v7 (not needed for security).
- [ ] Deployment: backend to Render, Railway or Fly.io; frontend to Vercel or Netlify.

## Open questions and decisions

| Question | Current default |
|---|---|
| Database variable name | **Resolved:** `MONGO_URI` (as implemented in `config/db.js`) |
| Backend port | 8000 (frontend `.env`, `.env.example` and the axios TODO all agree) |
| Local MongoDB or Atlas | Atlas (as in the tutorial) |
| Implement `/habits/reorder`? | Yes for parity with the tutorial, though the frontend doesn't call it yet |
| How to version-control the frontend | **Resolved (2026-09-20).** Frontend merged into the root repo; its nested `.git` (which pointed at the tutorial author's repo) was removed. One repo now holds `backend/`, `frontend/` and `docs/`. |
| GitHub repository for this project | **Open.** Committed locally only; no remote configured and nothing pushed. Create an empty repo on GitHub, then `git remote add origin <url>` and `git push -u origin main`. |

## Out of scope (for now)

Push notifications, social streak sharing, custom icon uploads, a React Native mobile app, and support for AI providers other than Gemini (Claude, Ollama). These are tracked, with notes, in [Ideas & Future Development](ideas.md). New ideas go there, not here.
