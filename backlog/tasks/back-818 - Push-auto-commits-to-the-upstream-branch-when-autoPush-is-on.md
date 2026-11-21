---
id: BACK-818
title: Push auto-commits to the upstream branch when autoPush is on
status: Done
assignee:
  - '@claude'
created_date: '2026-11-21T11:15:12Z'
updated_date: '2026-11-21T11:18:33Z'
labels: []
dependencies: []
ordinal: 417000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
autoCommit only commits locally. When the browser runs on a server (for example a VPS serving a Tasks repo), web edits stay in that server's clone until someone pushes by hand, so they are not version-controlled alongside work done elsewhere. An opt-in setting lets every auto-commit reach the remote immediately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With autoPush true, each Backlog auto-commit is pushed to the current branch's upstream
- [x] #2 autoPush defaults to false and nothing is pushed when it is off, when remoteOperations is false, or when the branch has no upstream
- [x] #3 A failed or rejected push keeps the local commit, does not fail the edit, and prints a warning naming the reason
- [x] #4 backlog config get/set/list support autoPush and config.yml round-trips auto_push
- [x] #5 ADVANCED-CONFIG.md documents autoPush
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bun run check:types passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add autoPush to BacklogConfig, config.yml parse/serialize (auto_push), config-watcher keys, DEFAULT config.
2. In GitOperations, after a commit lands (commitFiles and commitChanges), push HEAD to the branch upstream when autoPush is on and remoteOperations is not false; skip without upstream; warn on failure, never throw. Push only: no pull/rebase, since Backlog must not rewrite the working tree under a running server.
3. CLI config get/set/list support autoPush.
4. Document in ADVANCED-CONFIG.md.
5. Tests: real temp repo with a bare remote: pushes when on, not when off, rejected push warns and keeps the commit.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an opt-in autoPush setting (auto_push in config.yml, default false). After each Backlog auto-commit, GitOperations runs git push when autoPush is on, remoteOperations is not false, and the current branch has an upstream. It pushes only: no pull or rebase, so a running server never has files rewritten under it. A failed or rejected push keeps the commit, does not fail the edit, and logs "Committed locally but could not push to <upstream>. <git error>"; the next successful push carries the commit.

config get/set/list and the key list in help support autoPush; ADVANCED-CONFIG.md documents it.

Verification: src/test/auto-push.test.ts uses a bare remote to cover pushing when on, not pushing when off, and a rejected push (two of these tests fail when the push is disabled). A config-commands test covers get/set/list. check:types, Biome and the related git, auto-commit and config suites (118 tests) pass.

Limitation: the warning only goes to the server log, not the browser UI. Pulling changes made elsewhere stays the operator's job (for example a periodic git pull --rebase).
<!-- SECTION:FINAL_SUMMARY:END -->
