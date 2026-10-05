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
Body (all optional): `{ name, morningMotivation }`
Response `200`: `{ user }`. If `name` changes, `avatar` is recomputed from it.

**User object:** `{ _id, name, email, avatar, morningMotivation, createdAt, updatedAt }` (plus Mongoose's `__v`). The password is never included. `morningMotivation` defaults to `false`.

**Implementation notes (verified):**
- `name`, `email` and `password` (register) and `email` and `password` (login) must be **strings**. Objects such as `{ "$gt": "" }` are rejected with `400`, which blocks NoSQL operator injection.
- Emails are normalized to lowercase, so `A@B.com` and `a@b.com` are the same account (duplicate register returns `400`).
- Invalid email format returns `400 "Please provide a valid email address"`.
- `PUT /auth/profile` validates that `name` is a non-empty string and `morningMotivation` is a boolean.
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

If `GEMINI_API_KEY` is not set, AI endpoints return a friendly "AI features are currently unavailable" placeholder rather than failing.

**Implementation notes (verified):**
- The default model is `gemini-3.8-flash` (overridable via `GEMINI_MODEL`). **`gemini-2.5-flash` no longer works for new API keys** — Google's API returns a 404 pointing at the replacement. If this happens again later, check Google AI Studio for the current model name.
- `chatCompletion()` retries once on a transient error (429 rate limit, 503 overload), honoring the server's suggested `retryDelay` when one is given.
- The Gemini **free tier is capped at 5 requests/minute per model** — expect `429 RESOURCE_EXHAUSTED` under rapid repeated testing; it clears on its own after the window resets.
- `suggest-habits` is designed to **never fail the user**: a Gemini outage, a rate limit, *and* malformed JSON all fall back to the same three hard-coded `DEFAULT_SUGGESTIONS`. This was verified by reproducing a live outage and confirming a `200` with the fallback content, rather than an error.
- Every suggestion (model-generated or fallback) is passed through `sanitizeSuggestion()`, which coerces `category`/`frequency` to valid values — so accepting a suggestion can never fail `POST /habits`' validation.
- `GET /ai/weekly-report` and `POST /ai/chat` were confirmed with live Gemini calls, producing on-topic, well-grounded output (real habit names, specific numbers, no markdown headers as instructed). `recovery-plan` and `morning` share the same code path but were not confirmed with a live call — Gemini was under sustained load during testing.
