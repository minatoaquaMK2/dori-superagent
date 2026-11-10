---
name: herdr-chat-state
description: Check Herdr chat profile inheritance, scoped host operations, task dispatch, crash recovery, native terminal ownership, and result identity after desktop bridge changes.
---

Use this skill when desktop changes affect persisted profiles or runs, configuration admission, host tools, task creation, event routing, worker reports, or recovery. `verification/herdr-chat/source-sync.json` lists the exact source files and dependencies covered by the current mapping. Native UI display and provider readiness require the separate `verify` skill.

The promise is that accepted CLI/model/effort settings stay with their task, one operation starts work once, real outcomes return once, and unknown work is not replayed. An open native terminal retains project ownership. Codex worker approvals remain in its terminal; Antigravity and Devin worker YOLO defaults are intentional and are checked separately against real CLI launches.

Read `verification/herdr-chat/README.md` for the five bounded models, action-to-code mapping, runtime replays, assumptions, and known findings. The reviewed source commit is `657556a3b997a3b2579f2b155444f57ae59851a2`. The reconciliation record is `verification/herdr-chat/reconciliation.md`. Update that record, the hashes, and this commit only after comparing changed transitions with their mapped actions.

1. Read `~/.codex/pstack-model.md` before using a pstack skill.
2. Run `bun verification/herdr-chat/check.ts` from the repository root with Bun 1.4.4. The runner installs pinned TLC 1.7.4 and Temurin Java 25.0.5 through mise if needed. It writes evidence to a new temporary directory and returns nonzero on a broken invariant, stale source mapping, or failed runtime replay.
3. Read every TLA+ result with the installed pstack `statechart` skill. Copy `models` to scratch, then check each `.tla`, matching `.cfg`, and view module. Keep the generated Mermaid text and shortest violation paths. The projections bound a task, a run, one profile change, and duplicate deliveries; they do not prove arbitrary production event orderings.
4. Replay violations against the actual implementation. `bun verification/herdr-chat/runtime.ts` starts an isolated test process with blocked provider commands and fake terminal responses. Never invoke its test files directly or substitute an in-process PATH change. The runtime also exercises migration, stale revisions, persisted receipts, native turn boundaries, and lease release.
5. Run `bun verification/herdr-chat/mutations.ts`. Each source mutation must fail its corresponding runtime assertion. The script copies source to temporary directories, never changes this checkout, and rejects moved mutation targets. Syntax errors and isolation failures do not count as sensitivity evidence.
6. Reconcile changed source before updating the stamp. Keep one indivisible code step as one model action, and preserve external-effect/acknowledgement crash boundaries. Distinguish verification drift from a real product failure. Keep each current-code failure as a finding. After a product fix, retain the failing evidence and check a deliberate regression.
7. Update the README, mapping record, source-sync hashes, and source commit together after the model and runtime replays agree. Rerun this skill's commands as the next agent would. Keep verification changes separate from product changes.

Use pstack `maintain-formal-verification-skill` when source changes without this reconciliation. The checked models cover `Tasks`, `HostTools`, `Configuration`, `ChatEvents`, recovery, the result ledger, and native worker ownership. Process sandbox policy, transport credentials, real catalogs, UI clicks, and original sidebar rendering remain outside TLC coverage.
