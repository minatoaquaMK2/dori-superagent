---
name: herdr-chat-state
description: Check Herdr chat dispatch, crash recovery, completion identity, and permission ownership after changes to the desktop bridge protocol.
---

Use this skill when a change touches `src/desktop/tasks.ts`, `engine.ts`, `store.ts`, `rpc.ts`, `protocol.ts`, `herdr.ts`, `model.ts`, `bridge.ts`, `cli.ts`, or `terminal.ts`. The last two files are source-mapped dependencies; the native sidebar display is outside the TLC model.

The promise is that one dispatch identity starts work once, returns the real outcome once, and remains recoverable after a bridge process crash. A broken promise can duplicate work, invent success, or block the project indefinitely. Worker approvals belong to the real Codex terminal.

The last checked source commit is `921cafbbeb12c16c73d0257ddcd33c89f9578fb2`. Coverage is `Tasks.dispatch`/`recover`/`complete` and `Store.save`/`message` in the dispatch and ledger models, plus `Tasks.event`, `Engine.event`/`send`/`disconnect`, and `Rpc.fail` in the ownership model. `protocol.ts`, `herdr.ts`, `model.ts`, `bridge.ts`, `cli.ts`, and `terminal.ts` define the mapped dependencies and boundaries.

Read `verification/herdr-chat/README.md` for the bounded model, action-to-code mapping, assumptions, and known findings. `verification/herdr-chat/source-sync.json` records the same source commit and file hashes. Do not move either commit record or refresh the hashes until you have compared every affected model action with the new source.

1. Read `~/.codex/pstack-model.md` before using any pstack skill.
2. Run `bun verification/herdr-chat/check.ts` from the repository root with Bun 1.4.4. The runner installs pinned TLC 1.7.4 and Temurin Java 25.0.5 through mise if needed. It writes evidence to a new temporary directory and returns nonzero on a broken invariant, stale source mapping, or failed runtime replay.
3. Read every TLA+ result with the installed pstack `/statechart` skill. Follow that skill's current instructions to check each model and its matching view module under `verification/herdr-chat/models`. Keep the shortest violation path and generated Mermaid text. Do not claim an unbounded proof.
4. Replay each violation against the real implementation, one model action at a time. Use `bun verification/herdr-chat/runtime.ts`, which starts a fresh isolated test process. Never invoke its test file directly or substitute an in-process PATH change. The runner blocks real `hc` and `herdr-app` commands and uses only temporary Unix sockets and stores.
5. Run `bun verification/herdr-chat/mutations.ts`. Each deliberate source mutation must fail its corresponding runtime assertion. The script copies source into temporary directories, never mutates this checkout, and rejects changed mutation targets. A syntax error or isolation failure is not a successful sensitivity check.
6. If behavior intentionally changed, update the model and its mapping together. Preserve the user-facing invariant unless the intended promise changed. Keep a current-code violation as a finding. After a fix, retain the original failing configuration and replay evidence, then check the fixed behavior and a deliberate regression.

The coverage record belongs in the README and source-sync manifest. Update the evidence and sync commit only after the model, runtime replay, and mutation checks agree. Use `/maintain-formal-verification-skill` when source changed without this reconciliation.
