# API Reference

Base URL (local): `http://localhost:8000/api`

**Status:** `/health` and `/auth/*` are **built and tested**. The `/habits`, `/logs` and `/ai` endpoints are still **planned**. This document is the target contract, verified against the frontend's actual calls (see [Frontend Integration](frontend-integration.md)).

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
Body: array of habit IDs in the desired order; sets each habit's `order`.
Declare this **before** `/:id`. *The current frontend does not call this endpoint.*

**Habit object:** `{ _id, userId, name, description, category, frequency, targetDays, color, icon, isArchived, order, createdAt, updatedAt }`

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
`completionRate` is based on days since the habit was created. `monthly` breaks completions down by month.

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

If `GEMINI_API_KEY` is not set, AI endpoints return a friendly "AI features are disabled" placeholder rather than failing.
