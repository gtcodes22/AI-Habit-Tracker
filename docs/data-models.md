# Data Models

**Status: Planned.** Mongoose schemas, all with `timestamps: true` (adds `createdAt` and `updatedAt`).

## User

| Field | Type | Rules |
|---|---|---|
| `name` | String | required, trimmed |
| `email` | String | required, **unique**, lowercase, trimmed |
| `password` | String | required, min length 6, stored as a bcrypt hash |
| `avatar` | String | first letter of name, uppercased |
| `morningMotivation` | Boolean | opt-in for the AI morning message |

Behavior:
- **Pre-save hook:** if `password` was modified, generate a salt and hash it. Skipped otherwise, so profile updates don't re-hash.
- **`matchPassword(plain)`:** instance method comparing a plain password to the stored hash.
- **`toJSON`:** removes `password` from serialized output.

## Habit

| Field | Type | Rules |
|---|---|---|
| `userId` | ObjectId → User | required, indexed |
| `name` | String | required, trimmed |
| `description` | String | default `""` |
| `category` | String | enum, default `"Other"` |
| `frequency` | String | `"daily"` or `"weekly"`, default `"daily"` |
| `targetDays` | Number | 1–7, default 7 |
| `color` | String | hex, default `"#6366f1"` |
| `icon` | String | emoji, default `"🎯"` |
| `isArchived` | Boolean | default `false` |
| `order` | Number | for ordering; new habits get the current count |

### Category values: **capitalized**

The frontend (`src/utils/constants.js`) uses these exact strings, and the frontend sends them straight to the API, so the enum must match them exactly:

```
Health, Fitness, Learning, Mindfulness, Productivity, Social, Finance, Creative, Other
```

(The tutorial narration says them in lowercase, but the code the frontend sends is capitalized. Use the capitalized form. The AI suggestion prompt must list these same capitalized values, because accepted suggestions are posted to `/habits` unchanged.)

Also exported by the model file so the enum can be reused.

## HabitLog

One document per habit per completed day.

| Field | Type | Rules |
|---|---|---|
| `userId` | ObjectId → User | required |
| `habitId` | ObjectId → Habit | required |
| `completedDate` | String | `"yyyy-MM-dd"`, required |
| `notes` | String | optional |

**Index:** unique compound `{ userId, habitId, completedDate }`. The database rejects a second check-off for the same habit and day.

Why a string and not a `Date`: no timezone drift, trivial range queries (`$gte` / `$lte` on strings), natural sort order.

**Cascade:** deleting a habit must delete its logs. (The tutorial defers this and never clearly returns to it. Implement it in `deleteHabit`.)

## AIInsight

Stores every AI-generated response, for history, caching and prompt tuning.

| Field | Type | Rules |
|---|---|---|
| `userId` | ObjectId → User | required |
| `type` | String | `weekly`, `suggestion`, `recovery`, `chat`, `morning` |
| `content` | String | the AI text (or serialized JSON for suggestions) |
| `meta` | Mixed | extra context: the question asked, the habit ID for a recovery plan, and so on |
| `generatedAt` | Date | time of generation |

## Relationships

```
User 1 ──── * Habit 1 ──── * HabitLog
 │
 └──── * AIInsight
```

## Frontend shapes (for reference)

The frontend's mock data (`src/utils/mockData.js`) shows the exact fields the UI reads:

```js
user  = { _id, name, email, avatar, morningMotivation }
habit = { _id, userId, name, description, category, frequency, targetDays,
          color, icon, isArchived, order, createdAt, updatedAt }
log   = { _id, userId, habitId, completedDate }
```
