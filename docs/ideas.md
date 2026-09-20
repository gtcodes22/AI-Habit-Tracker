# Ideas & Future Development

A running backlog of ideas that are **not** part of the current scope. Nothing here is committed work. It's a place to capture thinking so it isn't lost.

## How to use this file

- Add a new entry at the **top of the list** (newest first) using the template below.
- Give each idea a **status**. Change it as the idea evolves, and don't delete old entries: a rejected idea with a reason is useful history.
- When an idea is accepted, move its concrete tasks into the [Development Roadmap](development-roadmap.md) and note it in the [Changelog](CHANGELOG.md) when it ships.

### Status values

| Status | Meaning |
|---|---|
| **Idea** | Captured, not yet evaluated |
| **Exploring** | Being researched or prototyped |
| **Accepted** | Will be built; tasks belong in the roadmap |
| **Shipped** | Done; see the changelog |
| **Rejected** | Decided against. Keep the reason. |

### Entry template

```markdown
### <Short title>
- **Added:** YYYY-MM-DD
- **Status:** Idea
- **Summary:** One or two sentences.
- **Why:** What problem or opportunity it addresses.
- **Considerations:** Trade-offs, risks, dependencies.
- **Open questions:** What needs deciding.
```

---

## Ideas

### Support multiple AI providers (Claude, local models via Ollama)
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** The project currently uses only Google Gemini. Let the backend use other models too: Anthropic Claude, and local models served by Ollama, alongside or instead of Gemini.
- **Why:** Avoid lock-in to one vendor, compare answer quality per feature, control cost, and (with Ollama) keep habit data on the user's own machine.
- **Where it fits today:** All Gemini-specific code is meant to live in one file, `backend/utils/aiService.js`, behind a single function, `chatCompletion(system, user, temperature)`. The five AI controllers only call that function. So this idea is mostly a change *inside* `aiService.js`, not a rewrite of the features. See [AI Features](ai-features.md).
- **Sketch of an approach (not a decision):**
  - Define a small provider interface (for example `generate({ system, user, temperature })` returning text), with one implementation per provider: Gemini (`@google/genai`), Claude (`@anthropic-ai/sdk`), Ollama (its local HTTP API, default `http://localhost:11434`).
  - Choose the provider with configuration, for example `AI_PROVIDER=gemini|claude|ollama`, plus per-provider settings (`ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and so on).
  - Keep the "lazy client, degrade gracefully when unconfigured" behavior for every provider.
- **Considerations:**
  - **Prompts are tuned for Gemini.** Each model follows instructions differently, so expect to re-tune the five system prompts per provider.
  - **Structured output is the fragile part.** The habit-suggestion feature needs valid JSON. `parseJSON` and the hard-coded fallback already tolerate bad output, but smaller local models will fail more often. Provider-specific JSON modes or schema features could help.
  - **Local model quality and speed vary a lot** by model and hardware. The data-chat feature (largest context) is the most demanding.
  - **Privacy:** with Gemini or Claude, habit data leaves the machine as part of the prompt. Ollama keeps it local. That could be a selling point.
  - **Cost and rate limits** differ per provider; the empty-data shortcut and the frontend's weekly-report cache still apply.
  - **Model IDs change.** Keep model names in configuration, not code.
- **Open questions:**
  - One global provider, or a choice per feature (for example a cheap local model for morning motivation, a stronger model for the weekly report)?
  - Should users pick the provider in settings, or is it a deployment-level choice?
  - Record which provider and model produced each `AIInsight` (e.g. in `meta`) so results can be compared?
  - Any automatic fallback chain (try Claude, fall back to Gemini)?

### Push notifications
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** Remind users to check in, or deliver the morning motivation as a notification.
- **Source:** suggested at the end of the tutorial.
- **Open questions:** Web push, email, or mobile? Would need a scheduler on the backend.

### Social streak sharing
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** Let users share streaks or progress with friends.
- **Source:** suggested at the end of the tutorial.
- **Considerations:** Introduces privacy questions and likely new models (friends, shared views).

### Custom icon uploads
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** Habits currently pick from 12 emoji icons. Allow custom icons, or a larger emoji set.
- **Source:** suggested in the tutorial ("we can always add more emoji to this list in future").
- **Considerations:** Uploads need storage and validation; a larger emoji list is a much smaller change (`ICONS` in the frontend's `src/utils/constants.js`).

### Mobile app (React Native)
- **Added:** 2026-09-20
- **Status:** Idea
- **Summary:** A native mobile client for the same backend.
- **Source:** suggested at the end of the tutorial.
- **Considerations:** The REST API and JWT auth are client-agnostic, so a mobile client could reuse the backend as-is.

---

## Rejected / parked

*(none yet)*
