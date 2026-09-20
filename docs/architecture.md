# Architecture

## Overview

```
Browser (React SPA, :5173)
        │  axios + JWT (Authorization: Bearer <token>)
        ▼
Express API (:8000)  ──►  MongoDB Atlas (Mongoose)
        │
        └──►  Google Gemini (@google/genai)
```

The frontend is a client-side-only SPA. The backend is a stateless REST API. Auth state lives in the JWT, which the frontend keeps in `localStorage`.

## Backend structure (planned)

```
backend/
├── server.js                  Entry point: config, middleware, route mounting, start
├── config/
│   └── db.js                  connectDB(): mongoose.connect; process.exit(1) on failure
├── middleware/
│   ├── auth.js                protect: verify Bearer JWT, load user, set req.user
│   └── errorHandler.js        notFound (404) and errorHandler (central JSON errors)
├── models/
│   ├── User.js
│   ├── Habit.js
│   ├── HabitLog.js
│   └── AIInsight.js
├── controllers/
│   ├── authController.js
│   ├── habitController.js
│   ├── logController.js
│   └── aiController.js
├── routes/
│   ├── auth.js                mounted at /api/auth
│   ├── habits.js              mounted at /api/habits
│   ├── logs.js                mounted at /api/logs
│   └── ai.js                  mounted at /api/ai
├── utils/
│   ├── dateHelpers.js         date keys, week and range helpers, streak calculation
│   └── aiService.js           Gemini client wrapper and system prompts
└── scripts/
    └── seed.js                Demo data generator (npm run seed)
```

`package.json` sets `"type": "module"`, so all backend code uses `import` / `export`.

## `server.js` responsibilities

1. Load environment variables (`dotenv`).
2. Build the CORS policy:
   - Allow requests with no `Origin` (curl, server-to-server).
   - Allow any `localhost` origin (regex) for development.
   - Allow origins in `CLIENT_URL`, a comma-separated list that is trimmed and de-blanked.
3. Handle preflight `OPTIONS` requests.
4. Parse JSON with a body-size limit.
5. Mount `GET /api/health` (returns status plus timestamp).
6. Mount the four route groups.
7. Register `notFound` then `errorHandler` last.
8. **Connect to the database first, then listen.** The server never accepts traffic without a database.

## Request lifecycle

```
request → CORS → JSON parser → route
        → protect (JWT → req.user)      [all routes except register/login/health]
        → controller (queries always scoped by req.user._id)
        → response
errors → notFound / errorHandler → { message } JSON with correct status
```

## Design decisions

| Decision | Reason |
|---|---|
| **Ownership in every query** (`userId: req.user._id`) | A user can never read or modify another user's data, even with a known ID. `userId` is never taken from the request body. |
| **Dates stored as `"yyyy-MM-dd"` strings** on logs | Avoids timezone bugs; range queries become plain string comparisons; sorts naturally. |
| **Unique index on `(userId, habitId, completedDate)`** | The database itself guarantees one check-off per habit per day. |
| **Upsert with `$setOnInsert` for check-offs** | Marking a habit twice is safe (idempotent); no duplicate errors. |
| **Soft archive (`isArchived` flag)** | History is preserved; the habit simply drops out of the daily list. |
| **Password hashed in a pre-save hook, only when modified** | Profile updates never re-hash an already-hashed password. |
| **`toJSON` strips the password** | The hash can't leak even if a controller forgets to filter it. |
| **Generic login error** ("Invalid email or password") | Doesn't reveal whether the email exists. |
| **Lazy Gemini client** | The server boots without an API key; AI features degrade instead of crashing the app. |
| **Fallbacks for AI failures** | Malformed JSON from the model falls back to hard-coded suggestions; users with no habits skip the AI call. |
| **Route order matters** | Specific paths (`/reorder`, `/stats`) must be declared before parameterized ones (`/:id`, `/stats/:habitId`). |

## Streak algorithm

Input: an array of date keys (newest first). Output: `{ current, longest }`.

**Current streak**
1. If neither today nor yesterday is in the set → `0`.
2. If today is in the set, count backward from today.
3. If today is missing but yesterday is present, the streak is **still alive**: start counting from yesterday.
4. Walk backward one day at a time while each date is in the set.

**Longest streak**
1. Sort dates ascending.
2. For each date, if it is exactly one day after the previous, increment the current run; otherwise reset it to 1.
3. Track the maximum run seen.

The frontend mock (`src/api/axios.js`, `mockStreak`) implements the same logic and is a useful reference implementation.

## Week convention

Weeks start on **Monday** (`weekStartsOn: 1` in date-fns).

## Authentication

- `POST /api/auth/register` and `/login` return `{ user, token }`.
- Tokens are signed with `JWT_SECRET` and expire in **30 days**.
- The frontend stores `token` and `user` in `localStorage`, attaches the token to every request via an axios interceptor, and on any `401` (outside `/`, `/login`, `/register`) clears storage and redirects to `/login`.

## Deployment notes

- **Backend:** Render, Railway or Fly.io. Set `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `CLIENT_URL`.
- **Frontend:** Vercel or Netlify. Set `VITE_API_URL` to the deployed backend's `/api` URL.
- The frontend's `.env` value is baked in at build time, so changing it requires a rebuild.
