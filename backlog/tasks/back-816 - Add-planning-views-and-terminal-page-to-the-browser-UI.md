---
id: BACK-816
title: Add planning views and terminal page to the browser UI
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-21T07:47:00Z'
updated_date: '2026-11-21T08:55:00Z'
labels:
  - web
dependencies: []
ordinal: 415000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser UI only offers a kanban board and lists, so there is no way to see work over time or by urgency, and running backlog commands means leaving the browser. The fork adds time-based and priority-based views plus a project-root terminal, and the browser UI must be usable on a phone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Gantt page shows each open task as a bar from its created date to its due date (open-ended to today when no due date), with a today marker
- [ ] #2 Month calendar page places tasks on their due dates; selecting a day lists its tasks
- [ ] #3 Week calendar page shows seven days of tasks by due date with previous/next/today navigation
- [ ] #4 Week + Eisenhower page splits each day into the four priority quadrants
- [ ] #5 Eisenhower page shows unfinished tasks in a 2x2 matrix: high and medium on top, low and no priority on the bottom
- [ ] #6 Terminal page opens an interactive shell in the project root; it is refused when the server listens on a non-loopback address unless started with an explicit opt-in flag
- [ ] #7 All new pages and the navigation work at phone width (sidebar becomes a drawer, no horizontal page scroll)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun run check:types passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure date/quadrant/gantt helpers in src/web/utils/planning.ts with unit tests.
2. Pages: GanttPage, CalendarPage (month, week, week-eisenhower views), EisenhowerPage, TerminalPage under src/web/components; routes in App.tsx and SPA routes in server.
3. Terminal: WebSocket at /api/terminal backed by Bun.spawn terminal (PTY) with cwd = project root; allowed on loopback listeners, or with 'backlog browser --terminal'. Client uses @xterm/xterm + fit addon.
4. Mobile: Layout turns the sidebar into a drawer below md with a menu button in the header; new pages stack on narrow screens.
5. Eisenhower mapping: high=Q1 top-left, medium=Q2 top-right, low=Q3 bottom-left, none/other=Q4 bottom-right.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: planning helpers (src/web/utils/planning.ts, tested), CalendarPage (month/week/week-eisenhower), GanttPage, EisenhowerPage, TerminalPage + src/server/terminal.ts (Bun PTY, /api/terminal WebSocket, /api/terminal/status), 'backlog browser --terminal' opt-in, mobile drawer navigation.
Verified: check:types clean, biome clean, planning + terminal unit tests pass, side-navigation DOM test passes, terminal WebSocket exercised live (shell cwd = project root, resize applied, cross-origin upgrade 403).
Not yet verified: visual check of the pages in a browser. The web bundle cannot build on this machine until 'bun install' completes; it failed with ENOSPC (disk full), so mermaid is missing and server-tasks-spa-fallback.test.ts fails for that reason only.

The task-based Gantt from this task was replaced by the milestone Gantt in BACK-817 at the user's request.
<!-- SECTION:NOTES:END -->
