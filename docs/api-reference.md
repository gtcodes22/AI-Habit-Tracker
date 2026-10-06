# API Reference

Base URL (local): `http://localhost:8000/api`

**Status:** every endpoint below is **built**. `/health`, `/auth/*`, `/habits/*` and `/logs/*` are fully **tested**; `/ai/*` is tested for validation and two of five features confirmed with a live Gemini call (see the AI section below for which). This document is the target contract, verified against the frontend's actual calls (see [Frontend Integration](frontend-integration.md)).

## Conventions

- Requests and responses are JSON.
- Protected routes require `Authorization: Bearer <token>`. Missing or invalid tokens return `401`.
- Error responses have the shape `{ "message": "..." }`.
- Dates are strings in `yyyy-MM-dd` format.
- IDs are MongoDB ObjectIds serialized as `_id`.

| Status | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Validation error |
| 401 | Missing, invalid or expired token; bad login |
| 404 | Not found (resource or unknown route) |
| 500 | Server error |

---

## Health

### `GET /health`
Public. Returns server status and a timestamp.

---

## Auth: `/auth`

### `POST /auth/register` (public)
Body: `{ name, email, password }`
- All three required; password at least 6 characters; email must not already exist (`400` otherwise).
- Avatar is set to the first letter of the name, uppercased.

Response `201`: `{ user, token }`

### `POST /auth/login` (public)
Body: `{ email, password }`
Response `200`: `{ user, token }`
Errors: `401 "Invalid email or password"` (same message for unknown email and wrong password).

### `GET /auth/me` (protected)
Response `200`: `{ user }`

### `PUT /auth/profile` (protected)
Body (all optional): `{ name, morningMotivation, aiProvider, geminiModel, ollamaModel, anthropicModel, openaiModel, ollamaBaseUrl, geminiApiKey, anthropicApiKey, openaiApiKey, aiRateLimitEnabled, aiRateLimitPerMinute }`
Response `200`: `{ user }`. If `name` changes, `avatar` is recomputed from it.

**User object:** `{ _id, name, email, avatar, morningMotivation, aiProvider, geminiModel, ollamaModel, anthropicModel, openaiModel, ollamaBaseUrl, hasGeminiKey, hasAnthropicKey, hasOpenaiKey, aiRateLimitEnabled, aiRateLimitPerMinute, createdAt, updatedAt }` (plus Mongoose's `__v`). The password and all three encrypted key fields are never included — `hasGeminiKey`/`hasAnthropicKey`/`hasOpenaiKey` are booleans only. Defaults: `morningMotivation` `false`, `aiProvider` `"gemini"`, `aiRateLimitEnabled` `true`, `aiRateLimitPerMinute` `5`.

**Implementation notes (verified):**
- `name`, `email` and `password` (register) and `email` and `password` (login) must be **strings**. Objects such as `{ "$gt": "" }` are rejected with `400`, which blocks NoSQL operator injection.
- Emails are normalized to lowercase, so `A@B.com` and `a@b.com` are the same account (duplicate register returns `400`).
- Invalid email format returns `400 "Please provide a valid email address"`.
- `PUT /auth/profile` validates that `name` is a non-empty string, `morningMotivation` is a boolean, `aiProvider` is one of `gemini`/`ollama`/`claude`/`openai`, `geminiModel`/`ollamaModel`/`anthropicModel`/`openaiModel`/`geminiApiKey`/`anthropicApiKey`/`openaiApiKey` are strings, `ollamaBaseUrl` is a string starting with `http://` or `https://` (when non-empty), `aiRateLimitEnabled` is a boolean, and `aiRateLimitPerMinute` is an integer 1–60.
- **Each provider has its own model field** (`geminiModel`/`ollamaModel`/`anthropicModel`/`openaiModel`) rather than one shared field — a Claude model name means nothing to Ollama, so these are stored, validated and returned independently and switching `aiProvider` back and forth never overwrites one provider's remembered model with another's.
- `geminiApiKey`/`anthropicApiKey`/`openaiApiKey`: a **non-empty** string encrypts and saves it; an **empty string** clears it; **omitting the field** leaves an existing key untouched (so saving your display name never silently wipes a saved key). Saving a non-empty key when `ENCRYPTION_KEY` isn't configured on the server returns `500`.
- `ollamaBaseUrl` isn't a secret (Ollama has no auth), so unlike the API keys it's always overwritten with whatever is sent — an empty string resets it to "use the server's default" (`OLLAMA_BASE_URL`).
- Switching `aiProvider` away from a provider with a saved key does **not** clear that key — switching back later still works.
- **`aiRateLimitEnabled`/`aiRateLimitPerMinute` only take effect for a provider where you have your own saved key.** On the shared server-wide Gemini key, these are saved but silently have no effect — the shared key is always limited at the server's own default and can never be adjusted or disabled per-user (see `GET/POST /ai/*` notes below).
- Token lifetime comes from `JWT_EXPIRES_IN` (default `30d`).
- Protected routes return `401` with `"Not authorized, no token"` or `"Not authorized, token is invalid or expired"`.

---

## Habits: `/habits` (all protected)

### `GET /habits`
Query: `includeArchived=true` (string) to include archived habits. Default excludes them.
Sorted by `order` ascending, then `createdAt` ascending.
Response: array of habits.

### `POST /habits`
Body: `{ name (required), description, category, frequency, targetDays, color, icon }`
- `order` is set to the user's current habit count (appends to the end).
- Frontend sends `targetDays: 7` for daily and `3` for weekly when accepting an AI suggestion.

Response `201`: the habit.

### `PUT /habits/:id`
Body: any of `name, description, category, frequency, targetDays, color, icon`
Response: the updated habit. `404` if not found or not owned by the user.

### `PUT /habits/:id/archive`
Toggles `isArchived`. No body. Response: the updated habit. The frontend reads `res.data.isArchived` to decide whether to remove it from the list.

### `DELETE /habits/:id`
Response: `{ message }`. **Must also delete all logs for the habit** (cascade).

### `PUT /habits/reorder`
Body: `{ order: [habitId, habitId, ...] }`, an array of habit IDs in the desired order; sets each habit's `order` to its index in the array. IDs that don't belong to the caller are silently skipped (scoped by `userId`), not an error. Declared **before** `/:id` in the route file. *The current frontend does not call this endpoint.*

**Habit object:** `{ _id, userId, name, description, category, frequency, targetDays, color, icon, isArchived, order, createdAt, updatedAt }` (plus Mongoose's `__v`).

**Implementation notes (verified):**
- `category` is rejected with `400` unless it's one of the nine capitalized values; `frequency` must be `daily` or `weekly`; `targetDays` must be an integer 1–7; `color` must match `#rrggbb`.
- A malformed or unknown habit `:id` returns `404 "Habit not found"`, not a 500.
- `DELETE /habits/:id` also deletes every `HabitLog` for that habit (cascade), verified by creating a log then deleting its habit and confirming the log is gone.

---

## Logs: `/logs` (all protected)

### `POST /logs`: mark complete
Body: `{ habitId, date? }`. `date` defaults to today.
- Verifies the habit belongs to the user (`404` otherwise).
- Idempotent upsert: repeating the same request returns the existing log.

Response `201`: `{ _id, userId, habitId, completedDate }`

### `DELETE /logs`: unmark
Body: `{ habitId, date? }` (sent as a request body on DELETE).
Response: `{ message }`

### `GET /logs/today`
Response: array of today's logs for the user.

### `GET /logs/range?start=yyyy-MM-dd&end=yyyy-MM-dd`
Response: array of logs with `start <= completedDate <= end`. Used by Dashboard, Habits, Weekly, Insights and Stats.

### `GET /logs/heatmap`
Response: array of 90 objects, oldest first: `[{ date: "yyyy-MM-dd", count: number }]`. Days with no completions have `count: 0`.

### `GET /logs/stats`
Response (**this shape is required by `Stats.jsx`**):
```json
{
  "perHabit": [
    {
      "habitId": "...", "name": "...", "icon": "...", "color": "...", "category": "...",
      "completions30d": 12, "currentStreak": 4, "longestStreak": 9
    }
  ],
  "days": ["yyyy-MM-dd", "... 30 entries, oldest first"]
}
```
Covers non-archived habits only.

### `GET /logs/stats/:habitId`
Declare **after** `/logs/stats`. Response:
```json
{
  "habit": { },
  "totalCompletions": 0,
  "currentStreak": 0,
  "longestStreak": 0,
  "completionRate": 0,
  "monthly": { }
}
```
`completionRate` is `totalCompletions / daysSinceCreated`, as a whole-number percentage, capped at 100. `monthly` maps `"yyyy-MM"` to a completion count for that month, covering the habit's full history. *The current frontend does not call this endpoint* (see [Frontend Integration](frontend-integration.md)); its response shape is otherwise unconstrained by the UI.

**Implementation notes (verified for all `/logs/*` endpoints):**
- `POST /logs` (mark) is a true **idempotent upsert**: calling it twice for the same habit and day returns the same log document (confirmed only one document exists in the database either way). A concurrent duplicate-key race is caught and resolved by re-reading the existing log rather than erroring.
- `DELETE /logs` (unmark) is also idempotent: unmarking an already-unmarked day still returns `200 "Unmarked"` rather than a `404`.
- `habitId` must belong to the authenticated user; an unknown or malformed `habitId` returns `404 "Habit not found"`, not a 500.
- `GET /logs/range` requires `start` and `end` as plain date strings; anything else (missing, or a non-string shape such as a query-injection attempt) returns `400`.
- `GET /logs/stats` streaks are computed **only from the last 30 days** of logs (matching the frontend's mock `mockStreak` behavior exactly), not the habit's full history — that's what `GET /logs/stats/:habitId` is for.
- The streak algorithm (`calcStreak` in `utils/dateHelpers.js`) was hand-verified: a 2-day current streak (today + yesterday) and a separate, non-adjacent 4-day run further back correctly produced `currentStreak: 2, longestStreak: 4`.

---

## AI: `/ai` (all protected)

All AI responses are persisted as `AIInsight` documents. See [AI Features](ai-features.md) for prompts and fallbacks.

### `POST /ai/weekly-report`
No body. Response: `{ content }`. If the user has no active habits, returns a friendly fallback message without calling Gemini.

### `POST /ai/suggest-habits`
Body: `{ goals, productiveTime, struggles }`
Response: `{ suggestions: [{ name, description, frequency, category, icon, reason }] }` (3 items). Falls back to three defaults if Gemini's JSON can't be parsed.

### `POST /ai/recovery-plan`
Body: `{ habitId }`
Response: `{ content }`: an empathetic 3-day plan.

### `POST /ai/chat`
Body: `{ question }`
Response: `{ content }`, answered from the user's habits, 30-day logs and per-weekday breakdown.

### `GET /ai/morning`
Response: `{ content }`: 30–60 words mentioning real habits and streaks.

All five of the above use **the calling user's saved AI preference** (`aiProvider`, that provider's own model field, and for `claude`/`openai`/`gemini`, their saved encrypted key; for `ollama`, their saved `ollamaBaseUrl`) if they've set one in Settings, falling back to the server-wide default (`AI_PROVIDER`, `OLLAMA_BASE_URL`, et al.) otherwise. If the resolved provider is `gemini`/`ollama` and unconfigured/unreachable, or `claude`/`openai` and the user has no key, the endpoint returns a friendly "AI features are currently unavailable" placeholder rather than failing.

### `GET /ai/ollama-models?baseUrl=...`
Query `baseUrl` (optional string): tests that (unsaved) address directly, so a user can verify a URL in Settings before saving it. Otherwise falls back to the caller's saved `ollamaBaseUrl`, then the server's own `OLLAMA_BASE_URL`.
Response: `{ reachable: boolean, models: string[] }` — proxies Ollama's own `/api/tags`. `models` is empty when `reachable` is `false`. Doubles as a connectivity check for the Settings UI; never throws.

### `POST /ai/test-connection`
Body: `{ provider, apiKey?, model?, baseUrl? }`. `provider` is one of `gemini`/`ollama`/`claude`/`openai`. For `claude`/`openai`/`gemini`: if `apiKey` is given, tests that (unsaved) key directly; otherwise falls back to the caller's already-saved key for that provider. For `ollama`: if `baseUrl` is given, tests that (unsaved) address directly; otherwise falls back to the caller's saved `ollamaBaseUrl`. Makes one cheap, minimal call to the real provider.
Response: `{ ok: boolean, message: string }`. Never throws — a bad key, unreachable Ollama, or any other failure comes back as `{ ok: false, message: "..." }` with `200`, not an error status.

**Implementation notes (verified):**
- The default Gemini model is `gemini-3.8-flash` (overridable via `GEMINI_MODEL`). **`gemini-2.5-flash` no longer works for new API keys** — Google's API returns a 404 pointing at the replacement. If this happens again later, check Google AI Studio for the current model name.
- `chatCompletion()` retries once on a transient Gemini error (429 rate limit, 503 overload), honoring the server's suggested `retryDelay` when one is given.
- The Gemini **free tier is capped at 5 requests/minute per model** — expect `429 RESOURCE_EXHAUSTED` under rapid repeated testing; it clears on its own after the window resets.
- `suggest-habits` is designed to **never fail the user**: a provider outage, a rate limit, *and* malformed JSON all fall back to the same three hard-coded `DEFAULT_SUGGESTIONS`. This was verified by reproducing a live Gemini outage and confirming a `200` with the fallback content, rather than an error.
- Every suggestion (model-generated or fallback) is passed through `sanitizeSuggestion()`, which coerces `category`/`frequency` to valid values — so accepting a suggestion can never fail `POST /habits`' validation.
- `GET /ai/weekly-report` and `POST /ai/chat` were confirmed with live Gemini calls, producing on-topic, well-grounded output (real habit names, specific numbers, no markdown headers as instructed). `recovery-plan` and `morning` share the same code path but were not confirmed with a live Gemini call — Gemini was under sustained load during testing.
- Ollama generation was confirmed live end-to-end through `deepseek-r1:1.5b` (a non-default model, used because the configured default `gemma2:9b` currently OOMs on this machine's GPU — see [Ideas & Future Development](ideas.md)).
- Claude/OpenAI: the request pipeline (encryption, key resolution, the real API call) was confirmed live — a deliberately invalid key reached the real Anthropic API and was cleanly rejected with `401`. No real key was available to confirm a successful generation.
- **Gemini is BYOK-optional, unlike Claude/OpenAI**: a user without a personal `geminiApiKey` falls back to the server's shared key — *if* the server owner has enabled it (see below). With a personal key, Gemini behaves exactly like Claude/OpenAI.
- **`GEMINI_SHARED_KEY_ENABLED` (server `.env`, default `false`):** while unset or `false`, the shared Gemini key is **completely unreachable** — no live request against it happens for any user without their own key, under any circumstance. `POST /ai/weekly-report` etc. return `200` with a placeholder explaining this; `POST /ai/test-connection` returns `{ ok: false, message: "..." }` the same way. A user's own key is entirely unaffected by this switch.
- **Built-in rate limit:** the five content-generating routes (not `/ollama-models` or `/test-connection`) are capped at `aiRateLimitPerMinute` (default `5`) per minute. Exceeding it returns `429` with `{ message, retryAfterSeconds }` rather than attempting the provider call. Ollama is exempt (no cost/quota concern). **Scoping matters:** a user's own key is limited per-user, using their own `aiRateLimitEnabled`/`aiRateLimitPerMinute`; the shared server key is limited **globally across everyone using it**, always at the server's own default, and a user's personal preference has no effect on that shared bucket — verified by seeding one bucket from one user and confirming a second user sharing it was immediately affected, and, separately, confirming a shared-key user's own customized limit was silently ignored in favor of the server default.
- **The seeded demo account (`demo@habittracker.local`, or whatever `SEED_EMAIL` is set to) never makes a live call at all.** All five endpoints return fixed sample content from `utils/demoAIContent.js`, are exempt from the rate limiter, and skip input validation entirely (always succeed) — so a visitor exploring the demo can't hit an error or a rate limit no matter what they click.
