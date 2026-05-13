# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step. Open `index.html` directly in a browser, or serve locally:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

External dependency loaded via CDN: Chart.js 4.4.1.

## Architecture

Single-page app with no framework. All logic lives in one class:

- `app.js` — `TodoTracker` class (~2600 lines), instantiated once at the bottom
- `index.html` — markup for all four views (all rendered simultaneously, toggled by CSS)
- `styles.css` — dark-theme styles

### Four Views

Toggled by tab buttons; each section is always in the DOM:
- **Daily** (`dailyView`) — task list for the selected date + backlog sidebar + hero focus timer
- **Portfolio** (`weeklyView`) — PM work category breakdown (donut + bar charts via Chart.js)
- **Calendar Habits** (`calendarView`) — monthly habit tracker with stamp logging
- **Diary** (`diaryView`) — daily journal entries

### Data Model

All data persisted in `localStorage` and synced to a single GitHub Gist JSON file:

| localStorage key | Property | Shape |
|---|---|---|
| `todoTrackerData` | `this.todos` | `{ [YYYY-MM-DD]: Todo[] }` |
| `todoTrackerTags` | `this.tags` | `Tag[]` |
| `todoTrackerHabits` | `this.habits` | `Habit[]` |
| `todoTrackerDiary` | `this.diary` | `{ [YYYY-MM-DD]: DiaryEntry[] }` |

Gist token/ID stored in `localStorage` as `gist_token` / `gist_id`.

### Sync Flow

- **Pull**: `syncFromGist()` (L1468) — merges Gist data into localStorage on load
- **Push**: `syncToGist()` (L1511) — triggered on data change, every 10 min, and on tab close via `syncToGistKeepAlive()`

### Portfolio Categories

Six fixed PM work categories defined in `pfCategories()` (L2335):
`delivery`, `stakeholder`, `planning`, `discovery`, `operations`, `learning`

Auto-classification of tasks into these categories: `pfAutoClassifyMultiple()` (L2255), called inside `autoAssignTagsFromText()` (L978) when adding a todo.

Category overrides (manual reclassification) are stored in `localStorage` as `pfCatOverrides`.

### Key Method Locations

| Feature | Method | Line |
|---|---|---|
| Add todo | `addTodo()` | 953 |
| Auto-tag from text | `autoAssignTagsFromText()` | 978 |
| Task list render | `render()` | 2163 |
| Focus score calc | `calculateFocusScore()` | 1694 |
| Hero section update | `updateHero()` | 1869 |
| Backlog render | `renderBacklog()` | 1898 |
| Portfolio render | `renderPortfolioWeekly()` | 2351 |
| Multi-category classify | `pfAutoClassifyMultiple()` | 2255 |
| Gist pull | `syncFromGist()` | 1468 |
| Gist push | `syncToGist()` | 1511 |
