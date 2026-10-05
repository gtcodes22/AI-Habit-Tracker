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
- **Status:** Ollama support **shipped** (Phase 8: provider plumbing, 2026-10-05; Phase 9: per-user settings + live model picker, 2026-10-05). Claude/ChatGPT (user-supplied API keys) not started — see the BYOK design below.
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
  - ~~One global provider, or a choice per feature?~~ **Resolved for now:** one global switch (`AI_PROVIDER`), simplest to reason about. Per-feature choice is still on the table if a reason comes up.
  - Should users pick the provider in settings, or is it a deployment-level choice? Still open — currently a deployment-level `.env` setting only.
  - ~~Record which provider and model produced each `AIInsight`?~~ **Done** — every `AIInsight.meta` now includes `{ provider, model }`.
  - Any automatic fallback chain (try Claude, fall back to Gemini)? Still open. Claude isn't implemented at all yet.

**What was built (2026-10-05):**
- `backend/utils/aiService.js`: `chatCompletion()` now dispatches on `PROVIDER` (from `AI_PROVIDER`, default `"gemini"` — unchanged behavior if you never set it). The Ollama path is a plain `fetch` to `${OLLAMA_BASE_URL}/api/chat` (no SDK needed — Ollama's API is just local HTTP) and degrades gracefully (a friendly message, not a crash) if Ollama isn't running, exactly like the existing "no Gemini key" case.
- `.env`: added `AI_PROVIDER` (default `gemini`), `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (default `gemma2:9b`, per the user's choice). Flip `AI_PROVIDER=ollama` to switch over — no code change needed.
- All five AI features work unchanged with either provider, since they only ever call `chatCompletion()`.

**Testing status — fully resolved:**
- **The integration code is proven correct end-to-end**, including real generation: a live call through this exact code path (well, the same request shape `chatCompletion()` sends) to `deepseek-r1:1.5b` returned a complete, well-formed response, and the content-extraction logic (`message.content`, separate from `message.thinking` — see below) pulled exactly the right text.
- **`gemma2:9b` (the chosen default) currently fails to load on this machine with an out-of-memory error** (`failed to allocate buffer for kv cache`), reproduced twice, including after confirming no other model was loaded (`ollama ps` showed nothing resident). This is a real memory constraint on this machine, not a bug in the integration — `gemma2:9b` needs its ~5.4 GB of weights plus additional buffer space Ollama couldn't allocate. It may work fine on a machine with more free RAM, or after closing other memory-heavy apps.
- **A confirmed-working alternative on this machine: `mistral:latest`** (already pulled, 4.4 GB) — responded correctly in ~9 seconds. If you want local AI working right now without troubleshooting memory, set `OLLAMA_MODEL=mistral:latest` in `.env` — no code change needed.
- **A red herring worth knowing about:** two early test attempts (`qwen3.5:4b`, `deepseek-r1:1.5b`) appeared to "hang" with zero output. That wasn't a hang — both are **reasoning/"thinking" models** that spend a large hidden token budget on chain-of-thought (returned separately as `message.thinking`) before producing any `message.content`. The test had `num_predict` capped very low (10-30 tokens), which cut generation off mid-thinking, before content ever appeared. If you pick a reasoning model as `OLLAMA_MODEL`, don't cap `num_predict` too aggressively, or use Ollama's `think: false` option if the model supports it.

**Bottom line:** the feature works. If `gemma2:9b` OOMs for you too, switch `OLLAMA_MODEL` to `mistral:latest` (or free up memory) — both are a one-line `.env` change, no code involved.

**Hardware note, for picking future local models:** this machine has an NVIDIA RTX 4050 Laptop GPU — 6 GB VRAM total, ~5 GB available to Ollama. That's the practical ceiling for comfortably running a 9B-class model; `gemma2:9b`'s OOM is right at that edge. Models in the 1.5B–7B range (`mistral:latest`, `qwen2.5-coder:7b-instruct`, `qwen3.5:4b`, `deepseek-r1:1.5b`) fit more comfortably.

---

### Phase 9: per-user AI settings (built 2026-10-05)

What Phase 8 added at the server level, Phase 9 moved into the app itself — each user now picks their own provider and model from Settings, no `.env` editing:

- `models/User.js`: `aiProvider` (`"gemini"` | `"ollama"`, default `"gemini"`) and `aiModel` (free string, empty = "use that provider's server default").
- `PUT /api/auth/profile` validates and saves both, same pattern as the existing `morningMotivation` toggle.
- `aiService.js`: `chatCompletion(prompt, message, temperature, override)` — a 4th, optional `{ provider, model }` argument that wins over the server-wide `AI_PROVIDER`/`GEMINI_MODEL`/`OLLAMA_MODEL` when provided. `resolveProviderAndModel(override)` is the same resolution logic, exposed for recording accurate `{ provider, model }` metadata.
- All five AI controllers now build this override from `req.user.aiProvider`/`aiModel` and pass it through — so two different users on the same server can each be talking to a different AI backend simultaneously.
- `GET /api/ai/ollama-models`: proxies Ollama's own `/api/tags`, so the Settings UI shows exactly what's pulled locally — doubles as a "test connection" check.
- `Sidebar.jsx` Settings modal: a provider dropdown; picking Ollama triggers a live connectivity check (green "✓ Connected — N models found" / red "✕ Can't reach Ollama"), a re-check button, and a model dropdown sourced from that live list (falls back to a free-text field if Ollama isn't reachable, so the setting is never a dead end).

**Verified live** with Playwright against the real app, Ollama actually running: default is Gemini; switching to Ollama shows the real "9 models found" status with the actual pulled models listed; a chosen model (`mistral:latest`) survives a page reload and a full logout/login cycle; zero console errors. 9/9 checks passed. (One early screenshot looked visually broken — overlapping the sidebar — but that was confirmed to be a Playwright `fullPage` + `backdrop-blur` capture artifact, not a real rendering bug; a viewport-only screenshot showed a clean, correctly centered modal.)

**What Phase 9 deliberately didn't do:** no encryption, no user-supplied secrets. Ollama needs no API key, so there was nothing sensitive to store. That's exactly the harder problem BYOK (below) still needs to solve.

---

### Next (not yet started): "Bring Your Own Key" — Claude and ChatGPT

Lets a non-technical user add Claude or ChatGPT by pasting their own API key into Settings — no `.env`, no restart — and from then on the app uses their key, their provider, their chosen model.

**What it needs, beyond what Phase 9 already built:**

1. **Two more providers in `aiService.js`**, same shape as Ollama: `@anthropic-ai/sdk` for Claude, `openai` for ChatGPT. Each is one function; the five AI controllers don't change.
2. **Encryption at rest — the one genuinely new piece of infrastructure.** A per-user API key must never be stored in plain text (MongoDB backups, logs, or anyone with DB read access would otherwise see a live, billable credential). Plan: a server-side `ENCRYPTION_KEY` in `.env`, AES-256-GCM via Node's built-in `crypto` (no new dependency), decrypt only at the moment of calling the provider, strip the encrypted field from any `GET /auth/me` response the same way `password` already is — the client should only ever see "key saved ✓" or "not set," never the key itself.
3. **A "Test connection" step** — one cheap, minimal API call to validate a pasted key immediately (catches typos, wrong key type, expired keys) rather than a confusing failure three screens later.
4. **Clear cost messaging in the UI** — when a user supplies their own key, *they* are billed directly by Anthropic/OpenAI, not the app owner. A plain one-line note in Settings avoids a surprise bill.

**Open questions:**
- Encrypt in the `User` document itself, or a separate collection scoped tighter?
- Should the key ever be allowed to round-trip back to the client (e.g. to let a user re-paste/verify), or strictly write-only after the initial save?
- Same global-switch-per-user pattern as Phase 9's `aiProvider`, or does BYOK need its own enum value alongside `gemini`/`ollama`?
- **Still true as noted above:** expect `suggest-habits`' JSON-strictness to be the roughest edge with a local model — the `DEFAULT_SUGGESTIONS` fallback already covers this, so a bad response degrades rather than breaks.

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
