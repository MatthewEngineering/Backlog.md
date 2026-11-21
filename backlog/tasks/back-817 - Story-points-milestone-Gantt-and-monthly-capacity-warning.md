---
id: BACK-817
title: Story points, milestone Gantt and monthly capacity warning
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-21T08:19:29Z'
updated_date: '2026-11-21T08:55:00Z'
labels:
  - web
  - cli
  - mcp
dependencies:
  - BACK-816
ordinal: 416000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Planning needs a size for each task and a view of milestones over time. The Gantt added in BACK-816 drew tasks; it should show milestones only, with dependencies derived from the tasks inside them, and the team needs to see when a month holds more work than it can complete.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tasks have optional story points (non-negative number) settable via CLI create/edit, MCP task tools and the web task form, stored as story_points in frontmatter
- [ ] #2 Each milestone shows its story point total (and completed points) in the web milestones page and on the Gantt
- [ ] #3 Gantt shows milestones only, as diamonds on their due dates
- [ ] #4 Gantt draws an arrow from milestone B to milestone A when a task in A depends on a task in B
- [ ] #5 Config has a points-per-month team capacity setting, settable via CLI config and web settings
- [ ] #6 Each month's story points (by task due date, else its milestone's due date) are totalled and a warning is shown for months over capacity
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bun run check:types passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented story points (story_points frontmatter; CLI --points/--clear-points on task create/edit and draft edit; MCP task_create/task_edit storyPoints; web task form, card badge; JSON storyPoints field), milestone points rollup (core summarizeMilestoneTasks -> CLI milestone list, web milestones page, Gantt), pointsPerMonth config (CLI config get/set/list, web Settings, config watcher validation), milestone-only Gantt with task-derived dependency arrows (red when a milestone is due before one it depends on), per-month points in Gantt header + calendar month view with over-capacity warning.
Verified: types and biome clean; new tests cli-story-points, server-story-points-endpoint, web-gantt, planning helpers pass; full suite 3811 pass. The 41 full-suite failures were rerun in isolation: all pass except scripts/update-nix.test.cjs (requires Node >= 26.12.1; machine has 24.11.1). cli-json-output expectation updated for the additive storyPoints field (allowed by the documented schemaVersion 1 contract).
<!-- SECTION:NOTES:END -->
