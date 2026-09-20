# Project Overview

## Goal

Build a full-stack habit tracker with user accounts, daily check-offs, streaks, a 90-day heat map, weekly and statistics views, and five AI features powered by Google Gemini.

The frontend is a pre-built, polished UI boilerplate that runs against an in-memory mock API. The main engineering work is **building the backend from scratch** and **swapping the mock out for it**.

## Features

### Core
- Register and login with JWT authentication (passwords hashed with bcrypt).
- Create, edit, archive and delete habits. Archived habits keep their full history but leave the daily list.
- Daily check-off with confetti celebration; a larger celebration when every habit for the day is done.
- Current and longest streak tracking per habit.
- 90-day GitHub-style heat map.
- Weekly grid with week navigation (cannot navigate into the future).
- Statistics page with charts and a per-habit breakdown.
- Light and dark mode. The preference is saved in `localStorage` and defaults to the system setting.

### AI features (Google Gemini 2.5 Flash)

| # | Feature | Where it appears |
|---|---|---|
| 1 | **Weekly report**: a 120–180 word review of the last 7 days | Dashboard card and Insights page |
| 2 | **Habit suggestion wizard**: 3 questions, returns 3 habits | Dashboard and Habits page ("Suggest a habit") |
| 3 | **Streak recovery coach**: a 3-day comeback plan when a streak of 7 or more days breaks | Dashboard recovery card |
| 4 | **Data chat**: natural-language questions answered from the user's own data | Floating chat bubble on Stats page |
| 5 | **Morning motivation**: short personalized message; opt-in in settings | Dashboard banner |

Details are in [AI Features](ai-features.md).

### Pages

| Route | Page |
|---|---|
| `/` | Landing (animated orbital-habits illustration) |
| `/login`, `/register` | Auth |
| `/dashboard` | Today's habits, progress ring, AI report, weekly grid, heat map |
| `/habits` | Manage habits: search, category filter, active or archived tabs |
| `/weekly` | Weekly grid with week navigation and summary cards |
| `/insights` | AI weekly report, week-vs-week charts, category donut, performance bars |
| `/stats` | Streak highlights, 7 and 30-day charts, AI chat bubble |

Everything except `/`, `/login` and `/register` sits behind a `ProtectedRoute`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 6, Recharts, lucide-react, react-icons, react-markdown, canvas-confetti, dnd-kit, date-fns, axios |
| Backend | Node.js (ES modules), Express 4, Mongoose 8, jsonwebtoken, bcryptjs, cors, dotenv, date-fns, nodemon (dev) |
| Database | MongoDB Atlas |
| AI | Google Gemini 2.5 Flash via the `@google/genai` SDK |

## Repository layout

```
AI-Habit-Tracker/
├── backend/                                   Express API (in progress)
├── frontend/
│   └── ai-habit-tracker-ui-boilerplate-code/  React app (own git repository)
└── docs/                                      This documentation
```

> **Git state:** the project root is a git repository (initialized, no commits or remote yet). The frontend folder is *also* a separate, nested git repository, cloned from the tutorial author's boilerplate (`time-to-program/ai-habit-tracker-ui-boilerplate-code`). A root commit would record that nested repo as a bare pointer, without its files. See the [Development Roadmap](development-roadmap.md) for how this is being resolved.

## Scope notes

- The frontend is treated as **given**. The backend is built to satisfy what the frontend already calls.
- The tutorial suggests extensions (push notifications, social streak sharing, custom icons, React Native). These are out of scope for now.
