---
id: BACK-819
title: TickTick-style task app with nested lists
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-26T09:02:17Z'
updated_date: '2026-11-28T06:05:30Z'
labels:
  - web
dependencies: []
ordinal: 418000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser UI is a kanban board; day-to-day planning wants TickTick's model instead: smart lists (Today, Next 7 Days, Inbox), lists that nest, an Eisenhower matrix, a calendar to drag tasks onto, and a focus timer, in a UI that looks and works like TickTick. The fork serves it at /app and lands there by default; the classic pages stay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Milestones can nest: optional parent frontmatter, set on create (POST /api/milestones parent) and via PUT /api/milestones/:id/parent; cycles and unknown parents are refused; rename keeps the parent
- [ ] #2 /app shows TickTick's three-pane layout: icon rail, sidebar (Today, Next 7 Days, Inbox, All, area folders with nested lists, tags, Completed), task list, detail pane
- [ ] #3 Quick add reads TickTick syntax: dates (today, tomorrow, weekdays, dec 3, in 3 days), !priority, #tag, ~list, @area
- [ ] #4 Lists group by date (Overdue/Today/Tomorrow/Next 7 Days/Later/No Date), priority, list or none; Next 7 Days shows each day; done tasks fold into Completed
- [ ] #5 Detail pane edits title, description, due date, priority, list, area, status, tags, checklist (acceptance criteria) and points, and opens the full editor
- [ ] #6 Eisenhower matrix: four TickTick quadrants by priority; dropping a task in a quadrant sets its priority
- [ ] #7 Calendar month/week with drag to reschedule and an Unscheduled tray; Pomodoro focus timer
- [ ] #8 Drag a task onto a list, area, tag, Today, Inbox, date group or calendar day to move it; drag a list onto another to nest it
- [ ] #9 Works at phone width (drawer sidebar, bottom tab bar, full-screen detail) and in light and dark themes
- [ ] #10 Settings > Web UI > Interface (config web_interface: app | classic, default app; also `backlog config set webInterface`) picks what / opens; the two link to each other
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun run check:types passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in src/web/ticktick/ (model.ts holds the rules and is unit-tested; store.tsx adds optimistic edits + undo toast; TickApp.tsx routes /app/*; Sidebar, TaskListView, TaskDetail, MatrixView, CalendarView, FocusView; ticktick.css scoped under .tt-root with light/dark tokens). Backend: Milestone.parent (parser, serializer, rename keeps it), FileSystem.setMilestoneParent, Core.setMilestoneParent (cycle check, auto-commit), Core.commitCreatedMilestone (browser-created milestones are now committed when auto-commit is on, so the Tasks VPS sync pushes them), server PUT /api/milestones/:id/parent and parent on POST, SPA routes /app and /app/*. / now redirects to /app/today; classic sidebar links to the app.
Lists are milestones; folders are config projects (areas). A top-level milestone sits in an area folder by its 'Area::' body line (the Tasks repo convention), else the project most of its tasks carry. Matrix quadrants follow TickTick's default rule (priority); critical counts as high.
Verified: check:types clean; biome clean on .ts; src/web/ticktick/model.test.ts (14) and src/test/server-milestone-parent.test.ts (3) pass, plus milestone CLI/MCP/broadcast suites; dev server and compiled binary (bun run build) driven over Chrome DevTools against a copy of the Tasks backlog: quick add with smart syntax, complete + undo toast, title edit, checklist add, every view loads with no console errors; screenshots checked in light, dark and narrow widths.
Drag and drop exercised with synthetic DragEvents (task onto a list, a matrix quadrant and a calendar day; list onto list): files changed as expected. Not verified: drag by hand, phone hardware. Pomodoro history is per browser (localStorage), not in the backlog.

Interface toggle: BacklogConfig.webInterface ("app" | "classic"), read/written as web_interface, validated by the config watcher and PUT /api/config, CLI config get/set/list; the index route waits for config before redirecting. Verified: PUT classic writes web_interface: "classic" and / lands on the Kanban board; an invalid value is rejected (400); config tests (72) pass.

Full suite (bun test): 3636 pass / 242 fail under load. Every failing file rerun alone with --timeout=10000 passes except scripts/update-nix.test.cjs (needs Node >= 26.12.1; this machine has 24.11.1, as in BACK-817). The one real break was mine: web-task-detail-deeplink expected / to open the board. Fixed by keeping legacy /?highlight= links on the board and marking that suite classic (webInterface: "classic"); 32/32 pass.

Follow-up (2026-11-28): classic pages are back to upstream (the Interface select and the sidebar link were removed). The interface toggle now lives in the app's own Settings dialog (rail gear). Projects are dropped from the app: a list with lists inside is a folder, and POST /api/milestones/folders-from-projects (Core.convertProjectsToFolders, src/core/milestone-folders.ts) turns configured projects into top-level milestone folders in one commit. It nests each area's milestones (by Area:: line or majority task project), files project-only tasks into the folder, and clears task.project where the folder already says it. Config projects are left alone. Quick add: @List is an alias for ~List.

Follow-up (2026-11-28): the app calls them milestones, not lists. New Milestones screen (rail flag icon, /app/milestones/<list|board|gantt>, MilestonesView.tsx; numbers in milestoneStats.ts with tests). List: tree table of tasks/points done, open, overdue. Board: columns by progress, parent (drag re-parents), or due. Gantt: bars from first task created/due to last deadline, with diamonds at milestone due dates. Columns show rolled-up Pts, Open, Period and Late. A period picker (week, 2 weeks, month, next month, quarter, custom) drives a summary: due in period, required by period end (overdue included), capacity left from points_per_month, and open. A per-week/month points-due row is drawn against capacity. A task's deadline is its due date, else the nearest dated milestone above it.

Follow-up (2026-11-28): resizable panes. ResizeHandle in parts.tsx is a pointer-drag, keyboard and double-click-reset separator. It sizes the sidebar (180-480; drag past it to hide), the task detail (300-900) and the Gantt's milestone columns (300-900). Widths live in localStorage (tt-layout, tt-milestones). The header button by the title folds the sidebar on desktop and opens the drawer on phones.

Follow-up (2026-11-28): interface switch button. classic sidebar has a ⇅ button beside Settings ("Switch to the task app"); the app rail has a board button directly above the gear ("Switch to classic Backlog.md"). Each saves `web_interface` so the home page follows, then does a full page load to the other interface.

Follow-up (2026-11-28): phone pass (390px). On phones the drawer footer has the rail's theme, classic switch and settings buttons, since the rail is hidden there. Task rows drop the label chip. The Milestones header drops its title and turns + Milestone into an icon. The list hides Due and the progress bar, and the Gantt's name column is 170px. No page scrolls sideways; the boards and the Gantt scroll inside their own panes. Classic's own mobile layout is left as upstream, with the switch button in its drawer next to Settings.
<!-- SECTION:NOTES:END -->
