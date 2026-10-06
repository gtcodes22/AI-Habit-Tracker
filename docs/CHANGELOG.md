# Changelog

All notable changes to this project are recorded here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

Each dated entry below corresponds to exactly one commit (noted inline, e.g. "commit `9f1f300`"), except where stated otherwise. See the [Development Roadmap's commit map](development-roadmap.md#commit-map) for the full phase ↔ commit ↔ date cross-reference, including the two early docs-only commits and the initial scaffold.

## [Unreleased]

### 2026-10-06 (2) — Phase 10 extension #3: per-user Ollama connection settings (not yet committed)

#### Added
- **Per-user Ollama connection URL.** New `ollamaBaseUrl` field on `User` — where this user's own Ollama install lives; empty means "use the server's `OLLAMA_BASE_URL`". Not a secret (Ollama has no auth), so it's always overwritten on save rather than following the API keys' "omit to leave untouched" convention.
- `aiService.js`: `chatCompletionOllama()` and the `chatCompletion()` dispatcher now accept/forward a `baseUrl` override, same shape as the existing per-call `apiKey` override for the other providers. `GET /api/ai/ollama-models?baseUrl=...` and `POST /api/ai/test-connection` both accept an optional `baseUrl` to test an unsaved address before saving it, falling back to the user's saved value, then the server default.
- `Sidebar.jsx` Settings modal: the Ollama section gains a server-URL text input, an "install Ollama" link with a `ollama pull <model>` hint for brand-new users, and a status line naming the actual address just tested — addressing that a new user had no way to point the app at their own Ollama install without server-level `.env` access.

#### Fixed
- **Cross-provider model collision, found while building the above.** `aiModel` was a single field shared across all four providers (Gemini/Ollama/Claude/ChatGPT) — a Claude model name means nothing to Ollama, so switching `aiProvider` in Settings (even just to look at something, then switching back) could silently overwrite a different provider's saved model, since `save()` always sent the one shared field unconditionally. Fixed by splitting it into `geminiModel`/`ollamaModel`/`anthropicModel`/`openaiModel`, matching how the API keys were already split per provider. Both real accounts' pre-existing `aiModel` values were confirmed empty (`""`) before making the change, so nothing was lost.

#### Verified
- 25 backend checks against a temp server: fresh-user defaults for all five new/changed fields; `ollamaModel`/`ollamaBaseUrl` survive an unrelated provider switch (the exact collision this fixes); `ollamaBaseUrl` format validation (rejects a URL with no `http(s)://` scheme) and empty-string-clears-to-default; both the query-param/body-param override path and the saved-value fallback path on `GET /ai/ollama-models` and `POST /ai/test-connection`; `anthropicModel`/`openaiModel` saved independently with no cross-field bleed.
- 7 Playwright checks against the real running app: the base URL input and install link render; the status line names the just-typed address after a refresh click; both the provider and the base URL persist across a full page reload; and the specific regression this was meant to fix — switching to Claude and back to Ollama leaves the saved base URL untouched.
- All test accounts removed afterward; the two real accounts (`alex@timetoprogram.com`, `demo@habittracker.local`) were untouched throughout.

### 2026-10-06 — Phase 10 extension: Gemini BYOK, rate limiter, shared-key gate, static demo (not yet committed)

#### Added
- **Gemini joins BYOK.** `geminiApiKeyEncrypted`/`hasGeminiKey` on `User`; `chatCompletionGemini()` and `testConnection()`'s gemini branch accept a per-call key, falling back to the server's shared client when none is given. Unlike Claude/OpenAI, a personal Gemini key is optional, not required.
- **A built-in AI rate limiter**, on by default at 5 requests/minute (`AI_RATE_LIMIT_PER_MINUTE`): `middleware/aiRateLimit.js` + `utils/rateLimiter.js` (in-process rolling window), applied to the five content-generating routes only. A BYOK user can raise/lower (1–60) or disable it for their own key via a new "Advanced" section in Settings, gated behind a freshly-checked "I understand the risk" box every time it's off. Ollama is exempt.
- **`GEMINI_SHARED_KEY_ENABLED`** (default `false`): gates the single choke point (`getClient()`) every shared-key caller already goes through. While false, no anonymous/no-personal-key user can reach the shared Gemini key at all — not rate-limited, *unreachable*.
- **The seeded demo account goes fully static.** `utils/demoAIContent.js` reuses the old mock API's sample text (which already matches the seed data's exact habit names and persona) for all five AI features. The demo account makes zero live calls, is exempt from the rate limiter, and skips input validation (always succeeds).
- All five AI-calling frontend components (`AIWeeklyReport`, `AIChat`, `StreakRecoveryCard`, `HabitSuggestionModal`, `MorningMotivation`) now surface the real backend error message instead of a generic fallback.

#### Fixed
- **Two frontend components had no error handling at all** (`StreakRecoveryCard`, `HabitSuggestionModal`) — a failure, including the new 429, would leave an infinite loading spinner with zero explanation. Found while verifying this feature's own "keep the user informed" goal; both now show the real message.
- **A rate-limiter design gap, caught by the test suite itself**: a user's personal enabled/custom-limit preference was being honored even on the *shared* server key, meaning one person's "disable protection" choice could have exposed everyone else sharing that key to going over the real limit. Fixed: personal preferences now only govern a user's own key; the shared key is always limited at the server's default, non-adjustable per-user.

#### Context
- This extension followed directly from the project owner's review of the first rate-limiter design: a rolling-window limiter controls request *frequency*, not *spend* — real protection on a true free-tier key with no billing attached, but not an actual spending ceiling if that ever changed. The owner's stated goal ("never incur costs without my approval," plus the scalability argument that a shared key's capacity doesn't grow with user count the way BYOK's does) directly motivated `GEMINI_SHARED_KEY_ENABLED` and the move to a fully static demo account. See [Ideas & Future Development](ideas.md) for the full discussion.

#### Verified
- 13 additional backend checks: the real seeded demo account returns the correct static content for all 5 AI features with zero `AIInsight` documents created and zero rate-limit interference across 8 rapid calls; a fresh real registration with no personal key gets the graceful "shared key isn't available" placeholder instead of a live call; `test-connection` reports the same; a personal key still reaches the real Gemini API regardless of the switch (a real auth rejection came back, not the "shared key off" message), confirming BYOK and the shared-key gate are correctly independent.
- All test accounts removed afterward; the two real accounts were untouched, and the demo account's pre-existing data (including 6 `AIInsight` records likely from earlier manual exploration, confirmed not created by this session's testing) was left exactly as found.

### 2026-10-05 (8) — Phase 10: Claude/ChatGPT bring-your-own-key (not yet committed)

#### Added
- `utils/crypto.js`: AES-256-GCM encryption at rest for per-user API keys, keyed by a new `ENCRYPTION_KEY` env var (32-byte hex). Verified: round-trip encrypt/decrypt, tamper detection (an altered ciphertext fails to decrypt rather than silently returning garbage), and a clear thrown error when `ENCRYPTION_KEY` is unset.
- `models/User.js`: `aiProvider` enum extended to `claude`/`openai`; new `anthropicApiKeyEncrypted`/`openaiApiKeyEncrypted` fields. `toJSON` never serializes them — it exposes only `hasAnthropicKey`/`hasOpenaiKey` booleans, same treatment as `password`.
- `PUT /api/auth/profile` accepts `anthropicApiKey`/`openaiApiKey`: a non-empty string encrypts and saves it, an empty string clears it, omitting the field leaves an existing key untouched.
- `utils/aiService.js`: `chatCompletionClaude`/`chatCompletionOpenAI` (new deps `@anthropic-ai/sdk`, `openai`), dispatched from the same `chatCompletion()` as every other provider; both require a per-call `apiKey` (there is no server-wide key for either) and degrade to a friendly "add your API key in Settings" message otherwise. New `ANTHROPIC_MODEL` (default `claude-sonnet-5`) and `OPENAI_MODEL` (default `gpt-5.4-mini`) env vars.
- `POST /api/ai/test-connection`: validates a provider/key/model combination with one cheap, minimal call (works for `gemini`/`ollama` too) — accepts a freshly typed, not-yet-saved key, or falls back to the user's already-saved one.
- `Sidebar.jsx` Settings modal: Claude/ChatGPT options — a password-style key field, a "get a key" link, a Test connection button with a live status line, a Remove-saved-key action, and a billing note ("you'll be billed directly by Anthropic/OpenAI").

#### Fixed
- Found during UI testing, not before shipping: the typed API key wasn't cleared from React state after a successful save, so reopening Settings silently showed the stale typed value in the password field instead of the "key saved" placeholder — meaning the "Remove saved key" control (which only appears when the field is empty) never appeared after saving a key. Fixed by resetting the key input state on save; re-verified. The test itself was also strengthened (checking the actual input value, not just its placeholder attribute) so a regression like this can't pass silently again.

#### Verified
- 19 backend checks: the raw key is absent from every response at every layer tested (register, profile update, `/auth/me`); the stored DB value is confirmed to be ciphertext (`iv:authTag:ciphertext` shape), not plaintext; validation on bad `aiProvider`/key types; switching providers doesn't wipe a previously saved key; `test-connection` correctly reports failure with no key, an unsaved bad key, or a saved bad key — including one real call to the live Anthropic API with a fake key, which came back with a clean `401 authentication_error`, proving the full request pipeline reaches the real service; an AI feature call with `aiProvider: claude` and no key degrades to the friendly placeholder instead of erroring.
- 17 Playwright UI checks against the real running app: the Claude/ChatGPT options, key field, test-connection flow (including a real failed test against the live Anthropic API, shown correctly in the UI), the saved-key placeholder and Remove-saved-key flow, and provider independence (switching to ChatGPT doesn't show Claude's saved-key state). Zero console errors.
- **Known gap:** no real Anthropic or OpenAI API key was available this session, so an actual successful generation was not confirmed — only the full pipeline up to the real API's authentication check (which correctly accepts the pipeline is well-formed and correctly rejects invalid credentials).
- All test accounts removed afterward; the two real accounts (`alex@timetoprogram.com`, `demo@habittracker.local`) were untouched throughout.

### 2026-10-05 (7) — Phase 9: user-managed AI settings (commit `9f1f300`)

#### Added
- Per-user AI provider preference, replacing the server-wide-only `AI_PROVIDER` from Phase 8:
  - `models/User.js`: `aiProvider` (`gemini`/`ollama`, default `gemini`) and `aiModel` fields.
  - `PUT /api/auth/profile` validates and saves both.
  - `utils/aiService.js`: `chatCompletion()` and the new `resolveProviderAndModel()` accept an optional `{ provider, model }` override, so a user's saved preference wins over the server default on a per-call basis — two users on the same server can use two different AI backends at once.
  - All five `aiController.js` handlers build this override from the calling user and record the actually-used `{ provider, model }` in `AIInsight.meta`.
- `GET /api/ai/ollama-models`: proxies Ollama's `/api/tags` to list locally-pulled models; doubles as a connectivity check for the Settings UI.
- `Sidebar.jsx` Settings modal: an "AI provider" section (Gemini/Ollama dropdown; for Ollama, a live connection-status line, a re-check button, and a model dropdown sourced from the real local Ollama install, falling back to free text if unreachable).

#### Verified
- Backend: 6 checks (fresh-user default, profile update + persistence, validation on bad `aiProvider`/`aiModel`, auth requirement and live reachability on the new endpoint).
- Frontend: drove the real running app with Playwright, Ollama actually running — 9/9 checks passed: default provider is Gemini; switching to Ollama shows a live "✓ Connected — 9 models found" status with the real 9 pulled models listed; a chosen model (`mistral:latest`) persisted through a page reload and a full logout/login cycle; zero console errors.
- One screenshot initially looked visually broken (modal overlapping the sidebar); investigated and confirmed it was a Playwright `fullPage` + `backdrop-blur` capture artifact, not a real bug — a viewport-only screenshot showed a correctly rendered, centered modal.
- Also discovered, while Ollama was running for this testing: this machine's GPU has 6 GB VRAM (~5 GB available), which explains Phase 8's `gemma2:9b` out-of-memory finding — noted in `docs/ideas.md` as a sizing guide for future local models.

### 2026-10-05 (6) — Phase 8: offline AI via Ollama (commit `9f1f300`, same as Phase 9 above)

#### Added
- **Ollama support** (from [Ideas & Future Development](ideas.md)): `AI_PROVIDER` env var (`gemini` default, or `ollama`) lets the backend run entirely on a local model, no API key, no internet call. `chatCompletion()` in `utils/aiService.js` now dispatches to a plain `fetch` against Ollama's local HTTP API (`/api/chat`) when selected — no new SDK dependency. Degrades gracefully (a friendly message) if Ollama isn't running, same as the existing "no Gemini key" case.
- `AIInsight.meta` now records `{ provider, model }` on every AI response, so results can be compared across providers later.
- New env vars: `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (default `gemma2:9b`, per user preference). `AI_PROVIDER` defaults to `gemini`, so existing behavior is unchanged unless explicitly flipped.
- [docs/setup-guide.md](setup-guide.md): a "local AI via Ollama" section and two troubleshooting rows.

#### Verified
- Server boots correctly and Gemini remains the active default with the new env vars present.
- The Ollama code path degrades gracefully when Ollama is unreachable (wrong port), and correctly talks to the real local Ollama server — a bad model name produced Ollama's own clean 404 "model not found" with no hang.
- **Real generation confirmed end-to-end**: a live call returned a complete, well-formed response, and the content-extraction logic (`message.content`, distinct from `message.thinking`) pulled exactly the right text — proving the integration code itself is correct.
- **`gemma2:9b` (the chosen default) currently fails to load on this machine** with an out-of-memory error (reproduced twice, including with no other model loaded) — a real memory constraint on this machine, not a code defect. **`mistral:latest`** (already available) was confirmed working in ~9 seconds as a drop-in alternative via `OLLAMA_MODEL`, no code change.
- Two early test attempts that looked like hangs were a red herring: `qwen3.5:4b` and `deepseek-r1:1.5b` are reasoning models whose hidden chain-of-thought was cut off by an overly low `num_predict` cap before any visible answer appeared — not an Ollama or hardware problem. Documented in `docs/ideas.md` and `docs/setup-guide.md`.

### 2026-10-05 (5) — Phase 7 (commit `ada3e9e`)

#### Changed
- **Frontend cutover** (Phase 7): `src/api/axios.js` replaced with a real axios client (base URL from `VITE_API_URL`, JWT request interceptor, 401 response interceptor); `src/utils/mockData.js` deleted. The frontend now talks to the real backend end to end.

#### Verified
- Drove the real, running app with Playwright (not just read through the code): registered a fresh account, confirmed an empty dashboard (not stale mock data), created a habit, checked it off (confetti fired, stats/streak/weekly-grid updated), visited Habits/Weekly/Insights/Stats (all rendered correctly, zero console or page errors), logged out and back in, and confirmed the habit persisted through the real backend. 11/11 scripted checks passed, with screenshots reviewed at each step. The disposable test account (and one leftover from an earlier failed test run) were both found and removed from the database afterward.
- Noted one pre-existing, unrelated UI quirk: the dashboard's "This week %" stat can show briefly stale immediately after a check-off, correcting itself on the next render. Not caused by this cutover.

### 2026-10-05 (4) — Phase 6 (commit `9089b8d`)

#### Added
- **Seed script** (Phase 6): `scripts/seed.js` — a demo user (`demo@habittracker.local` / `Demo1234!`, overridable via `SEED_EMAIL`/`SEED_PASSWORD`) with 7 habits and ~441 logs over the last 90 days, reusing the frontend's existing `mockData.js` habit definitions and deterministic pseudo-random log generator (not the tutorial's spoken "8 habits" — matching the project's own established mock data was the priority). Safe to re-run: wipes and rebuilds the same account by email rather than creating duplicates.
- [Setup Guide](setup-guide.md): a "Demo account" section with the seeded login.

#### Verified
- Ran `npm run seed` twice: confirmed the same user `_id`, the same habit count (7, not 14) and the same log count (441, not doubled) both times.
- Logged in as the seeded demo user through the real `/api/auth/login` endpoint (not a direct DB check) and confirmed `/api/habits`, `/api/logs/stats` and `/api/logs/heatmap` all return realistic, varied data matching each habit's intended pattern — e.g. a 13-day current streak on the high-probability water habit, a short streak on the drop-off journal habit, and a confirmed 5-day gap with zero logs around the forced broken-streak habit.
- This demo data was intentionally **not** cleaned up afterward (unlike every other phase's throwaway test data) — it's meant to persist as a standing demo account.

### 2026-10-05 (3) — Phase 5 (commit `dd89c2e`)

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

### 2026-10-05 (2) — Phase 4 (commit `17b7b13`)

#### Added
- **Logs & stats** (Phase 4):
  - `utils/dateHelpers.js`: `toDateKey`, `todayKey`, `lastNDays`, `last90Days`, `currentWeekKeys` (Monday-start week), and `calcStreak` — a port of the frontend mock's `mockStreak` logic, so streak numbers match what the UI already expects.
  - `controllers/logController.js` and `routes/logs.js`, mounted at `/api/logs`: `POST /` (mark, idempotent upsert), `DELETE /` (unmark, idempotent), `GET /today`, `GET /range`, `GET /heatmap` (last 90 days), `GET /stats` (`{ perHabit, days }`, 30-day window), `GET /stats/:habitId` (full history, with `completionRate` and a monthly breakdown).
  - Input hardening consistent with earlier phases: `habitId`/dates must be well-formed strings; a malformed or unknown habit id returns 404, never a 500; a concurrent duplicate-mark race is caught and resolved rather than erroring.

#### Verified
- 23 endpoint checks against a live server and the Atlas database: auth requirement; mark (success, duplicate-is-idempotent, bad habitId, missing habitId, bad date); today; range (success, missing params → 400); heatmap (90 entries, correct counts at seeded offsets); stats and per-habit stats, with streak numbers hand-calculated in advance and matched exactly; not-found and malformed-id handling for per-habit stats; unmark (success, idempotent re-unmark).
- Test habits, logs and the throwaway test user were removed afterward; the pre-existing real account was left untouched.

### 2026-10-05 — Phase 3 (commit `ba81256`)

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

### 2026-09-21 — Phases 1 and 2 (commits `0890325` and `ab8a186`; `a467b4b` in between is docs-only)

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

### 2026-09-20 — initial scaffold (commits `3fb71be` and `5a09745`)

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
