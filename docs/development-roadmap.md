# Development Roadmap

Last updated: 2026-10-05

## Status summary

| Area | Status |
|---|---|
| Frontend UI (mock-backed) | **Built**: installs, builds and runs |
| Frontend housekeeping (`.gitignore`, `.env`, dependency audit) | **Done** |
| Backend `package.json` and dependencies | **Done**: 180 packages, 0 vulnerabilities |
| Backend `.gitignore` | **Done** |
| Backend source code | **Done**: Phases 1–9 (server foundation, auth, habits, logs & stats, AI, seed script, frontend cutover, offline AI via Ollama, user-managed AI settings) built, tested and committed. **Phase 10** (Claude/ChatGPT bring-your-own-key) built and tested, **not yet committed**. |
| Frontend → backend cutover | **Done** (Phase 7) |
| Documentation | **Done** (this folder) |

## Commit map

**Phases 1–3 predate the "Phase N" convention in commit subjects** — their messages describe what changed but don't say which phase. This table is the authoritative cross-reference between phase, commit and the day's work; the phase sections below link back to it. (Phase labels first appear in commit subjects starting at Phase 4.)

| Phase | Commit | Date | Subject |
|---|---|---|---|
| — (initial scaffold) | [`3fb71be`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/3fb71be) | 2026-09-20 | Initial commit: frontend, backend scaffold and project docs |
| — (docs only) | [`5a09745`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/5a09745) | 2026-09-20 | adding extra docs |
| **Phase 1** — Foundation | [`0890325`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/0890325) | 2026-09-21 | Add backend server foundation: Express app, DB connection, error handlers |
| — (docs only) | [`a467b4b`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/a467b4b) | 2026-09-21 | Docs: align env var names with implementation |
| **Phase 2** — Authentication | [`ab8a186`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/ab8a186) | 2026-09-21 | Add JWT authentication (register, login, me, profile) |
| **Phase 3** — Habits | [`ba81256`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/ba81256) | 2026-10-05 | Add habit CRUD (list, create, update, archive, delete, reorder) |
| **Phase 4** — Logs & stats | [`17b7b13`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/17b7b13) | 2026-10-05 | Add logs, streaks, heat map and stats (Phase 4) |
| **Phase 5** — AI integration | [`dd89c2e`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/dd89c2e) | 2026-10-05 | Add AI integration: weekly report, suggestions, recovery, chat, morning (Phase 5) |
| **Phase 6** — Seed script | [`9089b8d`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/9089b8d) | 2026-10-05 | Add database seed script with demo account (Phase 6) |
| **Phase 7** — Frontend cutover | [`ada3e9e`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/ada3e9e) | 2026-10-05 | Cut over frontend to the real backend (Phase 7) |
| **Phase 8** + **Phase 9** — AI providers | [`9f1f300`](https://github.com/gtcodes22/AI-Habit-Tracker/commit/9f1f300) | 2026-10-05 | Add offline (Ollama) and per-user AI provider support (Phases 8-9) |
| **Phase 10** — Claude/ChatGPT BYOK | *(not yet committed)* | 2026-10-05 | — |

Phases 8 and 9 share one commit because both landed in the same files across one continuous uncommitted session, with no clean checkpoint to split them at — see that commit's message for the full breakdown of what each phase contributed.

`git log --oneline` in the project root shows this same history; `git show <hash>` shows any commit's full diff.

## Backend build order

Follow this order. Each step should be tested before the next begins.

### Phase 1: Foundation (commit `0890325`)
- [x] Create folders: `config`, `controllers`, `middleware`, `models`, `routes`, `utils`, `scripts`
- [x] Create `backend/.env` (Atlas URI, JWT secret, Gemini key, port, client URL)
- [x] `config/db.js`: `connectDB()`
- [x] `middleware/errorHandler.js`: `notFound`, `errorHandler`
- [x] `server.js`: CORS, JSON, health route, error handlers, connect-then-listen
- [x] **Test:** `GET /api/health`; terminal shows "MongoDB Connected" *(done 2026-09-21)*

### Phase 2: Authentication (commit `ab8a186`)
- [x] `models/User.js` (hash hook, `matchPassword`, `toJSON`)
- [x] `middleware/auth.js` (`protect`)
- [x] `controllers/authController.js` (register, login, me, profile)
- [x] `routes/auth.js` and mount at `/api/auth`
- [x] **Test:** register → login → `me` with bearer token; no password in responses *(done 2026-09-21: 20 checks passed; test user deleted afterward)*
- [ ] Optional: confirm the bcrypt hash is stored in Atlas by registering a real account and viewing the `users` collection

### Phase 3: Habits (commit `ba81256`)
- [x] `models/Habit.js` (capitalized category enum, exported as `CATEGORIES`)
- [x] `models/HabitLog.js` (brought forward from Phase 4; only the schema was needed here, for the cascade delete)
- [x] `controllers/habitController.js` (list, create, update, delete **with log cascade**, archive toggle, reorder)
- [x] `routes/habits.js` (`/reorder` before `/:id/archive` before `/:id`) and mount
- [x] **Test:** create, list, update, archive, `includeArchived`, delete, reorder, cascade delete, malformed-id handling *(done 2026-10-05: 18 checks passed against live Atlas; test data cleaned up)*

### Phase 4: Logs and stats (commit `17b7b13`)
- [x] `utils/dateHelpers.js` (`toDateKey`, `todayKey`, `last90Days`, `currentWeekKeys`, `lastNDays`, `calcStreak`)
- [x] `models/HabitLog.js` (unique compound index) — built early, in Phase 3, for cascade delete
- [x] `controllers/logController.js` (mark, unmark, today, range, heatmap, stats, per-habit stats)
- [x] `routes/logs.js` (`/stats` before `/stats/:habitId`) and mount
- [x] Return `/logs/stats` as `{ perHabit, days }`
- [x] **Test:** mark twice (no duplicate), today, range, heatmap, stats, per-habit stats, unmark *(done 2026-10-05: 23 checks passed against live Atlas, including hand-verified streak math; test data cleaned up)*
- [ ] `currentWeekKeys()` is written but not yet used by any endpoint — the weekly grid currently derives its own ranges from `/logs/range` on the frontend. Revisit only if a backend-driven weekly endpoint is needed later.

### Phase 5: AI (commit `dd89c2e`)
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

### Phase 6: Seed script (commit `9089b8d`)
- [x] `scripts/seed.js`: demo user, **7** habits (matching the frontend's existing `mockData.js` exactly, rather than the tutorial's spoken "8" — see note below), ~441 logs over 90 days, deterministic patterns (weekday-only, drop-off, a forced broken streak)
- [x] **Test:** `npm run seed`, log in as the demo user *(done 2026-10-05)*

**Notes:**
- **7 habits, not 8.** The frontend's `src/utils/mockData.js` already defines 7 habits with this exact deterministic algorithm, used for months of frontend-only development. Matching it exactly (same names, categories, colors, icons, patterns) was more valuable than inventing an 8th habit just to match the tutorial's narrated count.
- **Idempotent, verified:** running `npm run seed` twice produced the identical user `_id`, the same 7 habits (not 14), and the same 441 logs (not doubled) — confirmed by direct DB query between runs.
- **Verified end-to-end**, not just at the database level: logged in as the demo user through the real `/api/auth/login` endpoint, then called `/api/habits`, `/api/logs/stats` and `/api/logs/heatmap` and got back realistic, varied streaks matching each habit's intended pattern (e.g. the 95%-probability water habit showing a 13-day current streak; the drop-off journal habit showing a short 1-day streak).
- **This demo data is meant to stay** — unlike every other phase's test data, it was not cleaned up afterward. Re-run `npm run seed` anytime to reset it.
- The weekday-vs-weekend differentiation is real but softer than the sine-based generator's nominal probabilities suggest (measured 61% vs 42% for a habit targeting ~70% vs ~24%, roughly a 1.45x gap rather than the implied ~3x). This is an inherent property of the existing algorithm (shared with the frontend mock), not a bug introduced here — the pattern is still clearly visible in the data.

### Phase 7: Frontend cutover (commit `ada3e9e`)
- [x] Replace `src/api/axios.js` with the real client
- [x] Delete `src/utils/mockData.js`
- [x] Restart Vite; register a new account; click through every page
- [x] **Test:** verified end-to-end with Playwright against the real running app — register, empty dashboard, create habit, check off (confetti fires), visit all 5 other pages, logout/login, confirm persistence. 11/11 checks passed, zero console errors *(done 2026-10-05)*. See [Frontend Integration](frontend-integration.md) for the full account.

The original 7-phase build plan ended here: backend fully built, frontend fully cut over. Two more phases followed from [Ideas & Future Development](ideas.md).

### Phase 8: Offline AI via Ollama (commit `9f1f300`)
- [x] `AI_PROVIDER` env var (`gemini` default, or `ollama`); `chatCompletion()` in `utils/aiService.js` dispatches to a plain local HTTP call to Ollama's `/api/chat` — no SDK needed
- [x] `OLLAMA_BASE_URL`, `OLLAMA_MODEL` env vars; degrades gracefully (a friendly message, not a crash) if Ollama isn't reachable
- [x] `AIInsight.meta` records `{ provider, model }` on every AI response
- [x] **Test:** real end-to-end generation verified live (not just the request/response plumbing) — see [Ideas & Future Development](ideas.md) for the full story, including a mid-investigation correction (an early "hang" turned out to be reasoning-model behavior, not a bug) and a genuine finding (`gemma2:9b` currently OOMs on this machine's 6 GB VRAM GPU; `mistral:latest` confirmed working) *(done 2026-10-05)*

### Phase 9: User-managed AI settings (commit `9f1f300`, same as Phase 8)
- [x] `models/User.js`: per-user `aiProvider` (`gemini`/`ollama`) and `aiModel` fields, default `gemini` (unchanged behavior for existing users) — **superseded in Phase 10 extension #3 below**, which splits `aiModel` into one field per provider
- [x] `PUT /api/auth/profile` accepts and validates both fields
- [x] `aiService.js`: `chatCompletion()` and the new `resolveProviderAndModel()` accept a per-call `{ provider, model }` override, so a user's saved preference overrides the server default without any env change
- [x] All five `aiController.js` handlers resolve the calling user's preference and record the *actually used* provider/model in `AIInsight.meta`
- [x] `GET /api/ai/ollama-models` — lists models currently pulled in the local Ollama install (proxies `/api/tags`) and doubles as a connectivity check
- [x] Frontend: Settings modal (`Sidebar.jsx`) gets an "AI provider" section — a Gemini/Ollama dropdown, and for Ollama, a live connection status line, a re-check button, and a model dropdown populated from the real local install (falls back to a free-text field if Ollama isn't reachable)
- [x] **Test:** verified end-to-end with Playwright against the real running app (Ollama included) — default is Gemini, switching to Ollama shows a live "✓ Connected — 9 models found" status with the actual 9 pulled models in the dropdown, the chosen model persists through a page reload *and* a full logout/login cycle. 9/9 checks passed, zero console errors *(done 2026-10-05)*

### Phase 10: Bring Your Own Key — Claude and ChatGPT (not yet committed)
- [x] `utils/crypto.js`: AES-256-GCM encryption at rest for per-user API keys (`ENCRYPTION_KEY` env var, 32-byte hex); verified round-trip, tamper detection (altered ciphertext fails to decrypt), and a clear error when `ENCRYPTION_KEY` is missing
- [x] `models/User.js`: `aiProvider` enum extended to `claude`/`openai`; `anthropicApiKeyEncrypted`/`openaiApiKeyEncrypted` fields, never serialized — `toJSON` exposes only `hasAnthropicKey`/`hasOpenaiKey` booleans
- [x] `PUT /api/auth/profile` accepts `anthropicApiKey`/`openaiApiKey`: a non-empty string encrypts and saves it, an empty string clears it, omitting the field leaves it untouched (so saving unrelated settings never wipes a stored key)
- [x] `aiService.js`: `chatCompletionClaude`/`chatCompletionOpenAI` (via `@anthropic-ai/sdk` and `openai`), dispatched from the same `chatCompletion()` the other providers use; both require a per-call `apiKey` (there is no server-wide key for either) and degrade to a friendly "add your API key in Settings" message when one isn't available
- [x] `POST /api/ai/test-connection`: one cheap, minimal call per provider to validate a key (saved or just-typed, not yet saved) before committing to it
- [x] Frontend: Settings modal gains Claude/ChatGPT options — a password-style key field (placeholder shows "Key saved" when one exists, never echoes the value), a link to where to get a key, a Test connection button with a live status line, a Remove-saved-key action, and a one-line note that the user is billed directly by that provider
- [x] **Test:** 19 backend checks (encryption never leaks the raw key in any response, DB-level value is ciphertext not plaintext, validation, provider-switch doesn't wipe a saved key, test-connection against the real Anthropic API correctly rejects an invalid key, an AI feature call with no key degrades gracefully) plus 17 Playwright UI checks against the real running app, including a real bug found and fixed live (the typed key wasn't cleared from state after saving, so the "Remove saved key" control silently never appeared — fixed, re-verified). Zero console errors *(done 2026-10-05)*

**Scope note:** this is the "non-technical user pastes a key and it just works" design from [Ideas & Future Development](ideas.md), minus live generation verification — no real Anthropic/OpenAI API keys were available to confirm a full successful round-trip. Everything up to that boundary (encryption, storage, routing, validation, and the real API's rejection of an invalid key) was verified live.

**Phase 10 extension — Gemini BYOK, a built-in rate limiter, and a free/static demo (same day, not yet committed):**
- [x] Gemini joins BYOK: `geminiApiKeyEncrypted`/`hasGeminiKey`, `chatCompletionGemini()` and `testConnection()`'s gemini branch accept a per-call key override, falling back to the server's shared client when none is given — unlike Claude/OpenAI, a personal key is optional for Gemini, not required
- [x] `middleware/aiRateLimit.js` + `utils/rateLimiter.js`: an in-process rolling-window limiter, on by default at 5/min (configurable per-user, 1–60, for a BYOK key only), applied to the five content-generating routes. Ollama and the demo account are exempt
- [x] **Design fix caught by the test suite itself:** a user's own enabled/custom-limit preference only governs their *own* key — on the shared server key, the limit is always the server's default and can never be adjusted or disabled from a user account, since one person's "off" would have exposed everyone else sharing that key
- [x] Frontend: an "Advanced: AI request limit" disclosure in Settings — on/off plus a 1–60 number field, disabling requires a freshly-checked "I understand the risk" box every time (not persisted across sessions), Save is disabled until acknowledged
- [x] **Gap found and fixed:** two of the five AI-calling components (`StreakRecoveryCard`, `HabitSuggestionModal`) had no error handling at all — a failure (including the new 429) would leave an infinite loading spinner with no explanation. All five now surface the real backend message instead of a generic fallback
- [x] `GEMINI_SHARED_KEY_ENABLED` (default `false`): gates the one choke point (`getClient()`) every shared-key caller goes through, so no anonymous/no-personal-key user can reach the shared key at all until the owner explicitly opts in — raised directly by the project owner after seeing the shipped limiter only throttled frequency, not spend
- [x] `utils/demoAIContent.js`: the seeded demo account (`demo@habittracker.local`) now returns static sample content for all five AI features — zero live calls, ever, for that account. Exempt from both input validation and the rate limiter, so a visitor can't break or get stuck
- [x] **Test:** 13 additional backend checks (demo account returns correct static content for all 5 features with zero `AIInsight` writes and zero rate-limit interference across 8 rapid calls; a fresh real user gets the graceful shared-key-off placeholder instead of a live call; BYOK confirmed unaffected — a personal key still reaches the real API) *(done 2026-10-06)*

**Phase 10 extension #3 — per-user Ollama connection settings, and a model-field collision fix (2026-10-06, not yet committed):**
- [x] `models/User.js`: `aiModel` replaced with one field per provider — `geminiModel`, `ollamaModel`, `anthropicModel`, `openaiModel` — fixing a real bug where switching `aiProvider` in Settings and back could silently overwrite a different provider's saved model, since all four previously shared one field
- [x] `models/User.js`: new `ollamaBaseUrl` field — where this user's own Ollama install lives; empty means "use the server's `OLLAMA_BASE_URL`". Not a secret (Ollama has no auth), so always overwritten on save rather than following the API keys' "omit to leave untouched" pattern
- [x] `PUT /api/auth/profile` validates and saves all five new fields; `ollamaBaseUrl` must start with `http://`/`https://` when non-empty
- [x] `aiService.js`: `chatCompletionOllama()` and the `chatCompletion()` dispatcher accept/forward a `baseUrl` override, same shape as the existing per-call `apiKey` override for the other providers
- [x] `GET /api/ai/ollama-models?baseUrl=...` and `POST /api/ai/test-connection` both accept an optional `baseUrl` to test an unsaved address directly, falling back to the user's saved `ollamaBaseUrl`, then the server default
- [x] Frontend: Settings' Ollama section gains a server-URL text input, an "install Ollama" link with a pull-a-model hint for brand-new users, and a status line that names the actual address just tested; switching providers no longer clears any provider's model field
- [x] **Test:** 25 backend checks against a temp server (per-provider field defaults and independent persistence, URL format validation, empty-string-clears-to-default, both the query/body override path and the saved-value fallback path on both endpoints) plus 7 Playwright checks against the real running app, including the specific regression this was meant to fix — the Ollama base URL survives switching to Claude and back *(done 2026-10-06)*

See [Ideas & Future Development](ideas.md) for the full design discussion, including the owner's reasoning for why a shared key can't scale per-user the way BYOK does.

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

Push notifications, social streak sharing, custom icon uploads, a React Native mobile app, and Claude/ChatGPT support with user-supplied API keys. (Ollama support shipped in Phase 8–9, above — no longer out of scope.) These are tracked, with notes, in [Ideas & Future Development](ideas.md). New ideas go there, not here.
