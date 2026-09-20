# AI Habit Tracker — Documentation

Documentation for the AI Habit Tracker, a full-stack MERN app (MongoDB, Express, React, Node.js) with five Google Gemini AI features.

## Index

| Document | What it covers |
|---|---|
| [Project Overview](project-overview.md) | Goals, features, tech stack, repository layout |
| [Architecture](architecture.md) | Backend structure, request flow, design decisions |
| [API Reference](api-reference.md) | Every endpoint, request and response shapes |
| [Data Models](data-models.md) | MongoDB schemas and field rules |
| [AI Features](ai-features.md) | The five Gemini features, prompts, fallbacks |
| [Setup Guide](setup-guide.md) | Environment variables, MongoDB Atlas, Gemini key, running locally |
| [Frontend Integration](frontend-integration.md) | Swapping the mock API for the real backend; contract checklist |
| [Development Roadmap](development-roadmap.md) | Build order, current status, open questions |
| [Ideas & Future Development](ideas.md) | Backlog of ideas outside the current scope (multi-provider AI, notifications, and more). Add new ideas here. |
| [Changelog](CHANGELOG.md) | History of changes to the project |

## Source of truth

This project follows a tutorial build ("Build a Full-Stack AI-Powered Habit Tracker App — MERN, React, Node.js, MongoDB, Express"). The docs combine two sources:

1. **The tutorial transcript**, which describes the intended backend.
2. **The actual frontend code**, which defines the API contract the backend must satisfy.

Where the two disagree, **the frontend code wins**, because it is what will call the backend. Those cases are called out in [Frontend Integration](frontend-integration.md).

## Status legend

Docs describing the backend use these markers, since the backend is still being built:

- **Built**: exists in the repo and works.
- **Planned**: specified in the docs, not yet written.

See the [Development Roadmap](development-roadmap.md) for the current state.
