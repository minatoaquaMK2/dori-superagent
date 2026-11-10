# Herdr chat protocol verification

This checks the protocol behind a native Herdr chat that dispatches to a real Codex terminal and brings results back into chat. TLC explores finite event orders; runtime probes execute the actual TypeScript classes through an isolated Unix WebSocket server.

The source version is recorded in [source-sync.json](source-sync.json). The check refuses changed source until its model mapping is reviewed.

## Run the checks

Use Bun 1.4.4 and mise. Install the repository dependencies with `bun install --frozen-lockfile`, then run:

```sh
bun verification/herdr-chat/check.ts
bun verification/herdr-chat/mutations.ts
```

An optional first argument selects an evidence directory. The verifier pins TLC 1.7.4 by SHA-256 and Temurin Java 25.0.5+8.0.LTS. Read model results with the installed pstack `/statechart` skill, using each `.tla`, matching `.cfg`, and `*-view.mjs` file in `models`. That skill owns chart generation and its current command. Use a new output directory for every run.

Use `bun verification/herdr-chat/runtime.ts` for runtime checks alone. It supplies fake terminal commands before a fresh Bun process starts and checks that isolation before dispatch. Every socket, store, crash child, and source mutant lives under `/tmp`. It does not start a real Codex model, use the user's bridge, or modify source files.

## Feature map and checked promises

| User behavior | Implementation | Model or runtime coverage |
| --- | --- | --- |
| One tool call creates one worker | `Tasks.dispatch`, `activeTask`, `Store.save` | `Ledger`: durable intent before external request and call identity deduplication, including a duplicate after completion and reload |
| A bridge restart reconciles interrupted launch | `Tasks.dispatch`, `Tasks.recover`, `resumeThread` | `Dispatch`: external thread/turn/terminal effects separated from saved acknowledgements; crash at every modeled boundary |
| A known outcome releases the project | `Tasks.complete`, `Tasks.recover`, `activeTask` | `Dispatch`: recovery restores an authoritative completed turn even when its message was already reported |
| Results return once with truthful status | `Tasks.complete`, `Store.message` | `Ledger`: one report and result context, preserving completed, failed, and interrupted; runtime duplicates all three |
| An unknown result remains disconnected | `Tasks.dispatch` catch, `Engine.disconnect` | `Dispatch.NoInventedCompletion`; runtime attach failure with no outcome |
| Worker terminal owns approvals | `Tasks.event`, `Engine.event` | `Ownership`: worker requests remain unanswered by bridge; chat requests are declined |
| Disconnected chat rejects new work | `Engine.send`, `Rpc.fail` | `Ownership`; runtime closes the actual RPC socket before sending |
| Herdr terminal attaches to the intended thread | `attachTerminal` | Source mapping only: task label plus Codex foreground arguments or the exact adapter CLI path, thread ID, and socket. |
| Original Agents sidebar reflects the worker | `runTerminal`, `nativeStatus`, desktop CLI terminal command | Outside TLC scope: the adapter maps authoritative thread status to Herdr OSC status and starts the original Codex TUI. Its source is included in the sync record; native display needs the separate UI driver. |

## Model actions and atomic boundaries

`Dispatch.SaveIntent` is the synchronous task insertion and `Store.save(conversation)` in `Tasks.dispatch`. `CreateThread` is the external `thread/start` effect; `SaveThread` is assignment of its returned ID and the following save. `StartTurn` is the external `turn/start` effect; `SaveTurn` is the guarded launching-to-running transition and save after its response. This separation admits process death after an effect but before its acknowledgement is saved.

`CreateTerminal` represents `hc run` creating a task-labeled terminal. `SaveTerminal` represents the subsequent task terminal assignment and `Store.message` save. Recovery uses `attachTerminal` to find a terminal by label. `TerminalFailure` maps to the dispatch catch; the fixed code preserves a finished result and returns that result with an attachment warning. `Complete` maps to `Tasks.complete`; when the process is stopped, it changes only the external outcome until `recover` reads it. `Recover` maps to the idle empty-history branch, completed-turn reconciliation, active-turn branch, and terminal attachment in `Tasks.recover`. `RecoverIncomplete` maps to a latest in-progress turn whose thread is inactive, or failed reattachment while the task is active.

`Ledger` projects one dispatch and one duplicate delivery through the same synchronous guards. `Report` includes `task.state`, `task.reported`, `conversation.resultContext`, and the final `Store.message` save. The fixed `Tasks.event` ignores duplicate completion notifications, while `Tasks.complete` restores state before suppressing a duplicate report during recovery. `Ownership` projects `Tasks.event` worker approvals, `Engine.event` chat approvals, `Rpc.fail`/`Engine.disconnect`, and the admission guard in `Engine.send`.

Each synchronous save is an old-or-new whole-store transition for process crashes. JavaScript callbacks cannot interleave inside it. The model does not assume power-loss durability: `Store.save` renames a temporary file but does not fsync it. Disk errors, corrupted files, multiple bridge processes, concurrent `hc` creators, malicious servers, and arbitrary reordered turn notifications are outside the model.

## Bounds and limits

The dispatch model has one task, one turn, at most one process crash, three possible terminal outcomes, and authoritative history lookup after restart. It explores completion before or after terminal attachment fails, and incomplete-turn recovery. It also starts from a valid old snapshot with a reported outcome marked disconnected. Empty-thread recovery assumes the server reports idle, as required by the fix. It does not prove eventual remote completion, network reconnect fairness, unbounded queues, or multi-turn history ordering. The ledger adds one duplicate call and one duplicate completion. Ownership checks one worker approval, one chat approval, and one send after disconnect. These are separate projections, not a proof of all cross-products of those events.

The charts merge outcome values when their behavior is identical and omit transitions that stay inside one label. The current dispatch chart also merges thread-identity saves and terminal creation/acknowledgement while a worker runs. It draws 15 states and 19 arrows from the 67-state model. The original detailed chart keeps both bug paths.

## Findings and sensitivity

At source `5ed4312b8ef8a051d3a3209475ac7c92bf464a49`, `Dispatch` reached 77 states and 152 steps. It found two violations. [The original report](evidence/dispatch-before-fix/report.md) gives the shortest paths; [the Mermaid chart](evidence/dispatch-before-fix/chart.mmd) marks them.

1. `RecoveredEmptyTaskReleased`: save intent, create thread, save its ID, crash, recover empty history. The task stays launching and blocks the project. The real replay kills a child using `Engine`, `Rpc`, and `Store` after the server receives but does not execute `turn/start`.
2. `RecoveredOutcomeKnown`: save a completed result, then fail terminal attachment, crash, and recover the already-reported completed turn. Deduplication returns before restoring finished state, so the project stays blocked.

The fixed dispatch model reaches 67 states and 141 steps and passes all three invariants plus deadlock checking. It includes legacy persisted tasks and incomplete-turn recovery, which the original projection omitted. The ledger model reaches 15 states and 17 steps; ownership reaches 5 states and 5 steps. Both pass. [Current dispatch evidence](evidence/dispatch/report.md), [ledger evidence](evidence/ledger/report.md), and [ownership evidence](evidence/ownership/report.md) contain the generated results. No rule was weakened to get a pass.

The runtime suite passes 11 tests, including a real SIGKILL boundary, persisted legacy-state reload, and completion-before-attachment-failure replay. `mutations.ts` removes the durable save, call guard, and result guard; reintroduces both recovery defects; rewrites a failed outcome as completed; answers a worker approval; approves chat work; bypasses disconnected admission; and fabricates success after attachment failure. All ten variants fail their corresponding observable runtime assertions. [Sensitivity evidence](evidence/sensitivity) preserves those failures. The configurations in `models/negative` deliberately break all ten modeled safety rules; TLC finds them all. Their failure is expected, and they are not the default check configuration.

During initial probe development, an in-process PATH change failed to isolate Bun's executable resolution. Five synthetic, already-exited terminals were created against fake sockets and then removed: `t1x`, `t1y`, `t1z`, `t20`, and `t21`. The corrected runner supplies PATH at process startup and fails closed before any task action. The user's terminal `t1w` was untouched.
