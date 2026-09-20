# AI Features

**Status: Planned.** All five features use Google Gemini (default model `gemini-2.5-flash`, overridable via `GEMINI_MODEL`) through the `@google/genai` SDK.

## The Gemini wrapper: `utils/aiService.js`

| Piece | Behavior |
|---|---|
| `getClient()` | **Lazy**: creates the client on first use, and only if `GEMINI_API_KEY` is set. The server boots fine without a key. |
| `MODEL` | `process.env.GEMINI_MODEL`, defaulting to Gemini 2.5 Flash. Flash is fast and cheap, and follows structured-output instructions well. |
| `parseJSON(text)` | Strips markdown code fences (```` ```json ````) before `JSON.parse`, since the model often wraps JSON in them. |
| `chatCompletion(system, user, temperature?)` | Calls the model with the system prompt in config and returns trimmed text. With no client, returns a placeholder saying AI features are disabled. |

## The five features

Each is a controller function in `aiController.js` that **builds context from MongoDB**, sends it with a tuned system prompt, saves an `AIInsight`, and returns `{ content }` (or `{ suggestions }`).

### 1. Weekly report: `POST /ai/weekly-report`
- **Context:** the user's active habits and their last 7 days of logs, giving each habit's name, category, frequency, completed days and target.
- **Prompt:** 120–180 words covering wins, struggles, patterns and encouragement, using real habit names. Plain prose, no markdown headers.
- **Shortcut:** no active habits → friendly fallback, no API call.
- **Frontend caching:** the Insights page caches the report in `localStorage` keyed by the week's start date (`weekly-report-<weekStart>`), so revisits don't spend API calls. A "regenerate" button forces a refresh.

### 2. Habit suggestions: `POST /ai/suggest-habits`
- **Input:** `{ goals, productiveTime, struggles }` from the 3-step wizard.
- **Prompt:** the strictest of the five. It must return **valid JSON only**, with this shape per item: `name, description, frequency, category, icon, reason`. It lists the valid categories explicitly so the model doesn't invent new ones. **Use the capitalized category names**, and restrict `frequency` to `daily` or `weekly`.
- **Fallback:** if parsing fails, return three hard-coded sensible suggestions.
- The UI shows `reason` as the "Why this fits you" box; accepting one posts it to `/habits`.

### 3. Streak recovery plan: `POST /ai/recovery-plan`
- **Input:** `{ habitId }`.
- **Context:** the habit's name and category, plus current and longest streak (computed with `calcStreak` over its full log history).
- **Prompt:** empathetic opening → Day 1, Day 2, Day 3, each with one concrete action → a closing line of encouragement.
- **Trigger (frontend):** appears when a habit has a longest streak of at least 7 and a current streak of 0 (see `Dashboard.jsx`).

### 4. Data chat: `POST /ai/chat`
- **Input:** `{ question }`.
- **Context (the largest):** all active habits, their last 30 days of logs, and a **completions-per-weekday breakdown** (Sunday–Saturday) for each habit. That breakdown is what lets it answer "which day am I most consistent?"
- **Prompt:** answer using **only** the provided data, citing actual habit names, days and percentages. This keeps answers grounded in real numbers.
- The frontend renders the response through its Markdown component.

### 5. Morning motivation: `GET /ai/morning`
- **Context:** the user's habits with current streaks, plus how many habits are done today out of the total.
- **Prompt:** 30–60 words, warm but not cheesy, mentions specific habits and streaks, at most one emoji.
- **Temperature 0.8**, higher than the others, because it runs daily and shouldn't feel repetitive.
- Only shown if the user enabled `morningMotivation` in settings.

## Cross-cutting rules

- **Persist everything** as `AIInsight` (`weekly`, `suggestion`, `recovery`, `chat`, `morning`), giving history, potential caching, and data for improving prompts.
- **Degrade gracefully:** no API key, empty data, or malformed model output must never crash a request.
- **Never trust model output as code or data shape.** Parse defensively and fall back.
- **Prompt quality is the highest-leverage part** of the AI work. Keep the five prompts together in `aiService.js` so they are easy to tune.

## Costs and safety notes

- Each request is one Gemini call. The main cost controls are the empty-data shortcut and the frontend's weekly-report cache.
- `GEMINI_API_KEY` is a secret. It lives only in `backend/.env`, which is git-ignored.
- User habit data is sent to Google as part of the prompt. Worth stating in any privacy notice if the app is ever deployed for other people.
