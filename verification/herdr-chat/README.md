# Herdr chat protocol verification

These checks describe task dispatch, accepted CLI/model/effort profiles, scoped host operations, and result recovery in the native Herdr chat. TLC explores finite event orders. Runtime replays exercise the actual TypeScript classes against isolated protocol servers and fake terminal commands.

[source-sync.json](source-sync.json) records the reviewed source commit and file hashes. The default check rejects changed source until its action mapping is reconciled. The earlier [provider design models](../main-chat-providers-design/README.md) remain historical specifications, separate from these implementation checks.

## Commands and evidence

The commands use Bun 1.4.4 and mise. `check.ts` pins TLC 1.7.4 by SHA-256 and Temurin Java 25.0.5+8.0.LTS.

```sh
bun verification/herdr-chat/check.ts /tmp/herdr-formal-new-run
bun verification/herdr-chat/mutations.ts /tmp/herdr-formal-new-mutations
bun verification/herdr-chat/runtime.ts
```

The first two commands accept an optional evidence directory. Runtime checks always start a fresh process with fake `hc`, `herdr-app`, `codex`, `agy`, and `devin` commands first on PATH. The isolation probe must exit 72 before dispatch tests run. Fake `hc ls` returns an empty terminal list. Only crash children explicitly allow a fake terminal creation response. No fake command can start a program. A log counts launch attempts for the native recovery replay. Sockets, stores, children, and source mutants use temporary directories.

The installed pstack `statechart` skill generates each report and Mermaid chart from a scratch copy of `models`. Each model has a matching view module. For example:

```sh
statechart /tmp/herdr-models/ProfileRun.tla --config /tmp/herdr-models/ProfileRun.cfg --view /tmp/herdr-models/profile-run-view.mjs --out /tmp/herdr-profile-chart
```

Here `statechart` is the installed skill's `scripts/statechart` command. Negative configurations live in `models/negative`; their nonzero exits are expected. Each report contains its shortest counterexamples and lists any rule that was not checked.

## Checked behavior

| User behavior | Implementation | Coverage |
| --- | --- | --- |
| One dispatch identity creates one task | `Tasks.dispatch`, `Store.save` | `Ledger`; persisted duplicate and conflicting-payload replays |
| A Codex terminal exists before execution begins | `Tasks.dispatch`, `attachTerminal` | `Dispatch.TerminalBeforeTurn`; SIGKILL at the first `turn/start` observes the saved fake terminal |
| Unknown launch identity is retained without retry | `Tasks.recover`, native `reconcile` | `Dispatch.UnknownThreadIdentityHeld`, `NativeWorker.UnknownLaunchNotReplayed`; crash and native launch-attempt replays |
| Authoritatively empty or completed work releases its reservation | `Tasks.recover`, `Tasks.complete` | `Dispatch`; empty history and already-reported completion after restart |
| Each real outcome returns once | `Tasks.complete`, native `apply`, `Store.message` | `Ledger`, `NativeWorker`; completed, failed, interrupted, and repeated native reports |
| CLI, model, and effort remain fixed for an accepted request | `Engine.send`, `Configuration.configure`, `Tasks.dispatch` | `ProfileRun`; busy and stale configuration rejection, exact outbound model settings, later-selection inheritance |
| Finished or unknown runs cannot create a first host effect | `HostTools.call`, `forBinding` | `ProfileRun`; persisted receipt replay, changed-payload rejection, stale run and revoked binding rejection |
| A native terminal keeps project ownership until it closes | `activeTask`, native `apply`, `reconcile` | `NativeWorker`; Stop, duplicate Stop, a second user-turn boundary, and ProcessExit |
| Antigravity background work is not reported complete | native `apply` | `NativeWorker.OnlyQuiescentResult`; `fullyIdle=false` replay |
| Codex worker approvals remain in its terminal | `Tasks.event`, `ChatEvents.event` | `Ownership`; worker request remains unanswered and main-chat request is declined |
| Unsent ACP messages do not lock the composer after restart | `recoverChats` | Persisted pre-session run replay, with no prompt resend |
| Migrated active Codex replies can finish | `migrateState`, `recoverChats`, `ChatEvents` | Active legacy completion releases the composer, denies unowned tools, and resolves the next request's profile |

Native worker YOLO defaults, real CLI authentication, process sandbox enforcement, and original Agents sidebar visibility require the separate native verification. The Codex approval model does not assert that native workers ask for approval.

## Actions and atomic boundaries

`Dispatch.SaveIntent` is task insertion plus `Store.save(conversation)`. `SaveAttempt` saves `launch = thread-attempted` before `thread/start`. `CreateThread` is the external effect; `SaveThread` saves its returned identity. `CreateTerminal` represents `hc run` creating the labeled Codex terminal, and `SaveTerminal` saves its address. `StartTurn` and `SaveTurn` separate the external turn from its saved acknowledgement. A process crash can occur between each external effect and save.

`TerminalFailure` covers the dispatch catch after thread creation, including an attachment or turn acknowledgement failure. It preserves an already-finished result. `Complete` represents `Tasks.complete`; while the bridge is stopped, only the remote outcome changes. `Recover` reads authoritative history, restores an outcome before checking report deduplication, and finds or reattaches the labeled terminal. `RecoverIncomplete` keeps unresolved active work disconnected.

The earlier `RecoveredEmptyTaskReleased` wording covered every empty result. It now covers an unattempted launch or a known idle thread with no turns. An attempted launch with no saved thread ID remains disconnected. The durable launch checkpoints and no-replay decision in `9b29dce`, documented in the [implementation reconciliation](../../docs/design/main-chat-implementation.md), deliberately changed this admission rule. `UnknownThreadIdentityHeld` separately checks the new branch. No completed-result rule was weakened.

`Ledger` projects durable intent, one repeated call, one outcome, and one repeated completion. Its report transition includes task state, reported IDs, result context, and `Store.message`. `Ownership` projects Codex worker approvals, main-chat approvals, transport loss, and admission after disconnect. Event handling moved from `Engine` into `ChatEvents` and `recovery.ts`; the model's ownership promise is unchanged.

`ProfileRun.Choose` maps to catalog validation and the idle/pending/active-run guards in `Configuration.configure`. `Accept` maps to `Engine.send` freezing the entire profile inside `MainRun.origin`. `Tool` combines the `HostTools` ownership guard, the durable task identity, and its receipt. `Finish` removes active ownership; `Disconnect` marks the ACP run unknown. `Retry` returns a matching saved receipt. The runtime replay additionally checks argument fingerprints, segment ownership, configuration revisions, and the exact worker model/effort sent to the protocol.

`NativeWorker.SaveAttempt` saves `terminal-attempted` before `attachNativeTerminal`. `Launch` abstracts the inseparable native `hc run` terminal/CLI effect. `PartialStop` is Antigravity Stop with `fullyIdle=false`; `FullStop` is its final Stop or an authoritative Devin Stop. `DuplicateStop` is a repeated session/turn identity. `ObservedExit` is ProcessExit or an identity-checked terminal closure. A Stop returns a result but keeps `runtime.open`, which keeps `activeTask` true. Recovery polls durable spool entries and reconciles the existing terminal; it never calls launch again.

Each synchronous `Store.save` is an old-or-new whole-store transition for process crashes. JavaScript callbacks do not interleave inside that save. Power-loss durability is excluded because the store renames a temporary file without fsync.

## Results and limits

| Model | Reachable states | Explored steps | Evidence |
| --- | ---: | ---: | --- |
| Dispatch | 57 | 106 | [Report and chart](evidence/dispatch/report.md) |
| Ledger | 15 | 17 | [Report and chart](evidence/ledger/report.md) |
| Ownership | 5 | 5 | [Report and chart](evidence/ownership/report.md) |
| ProfileRun | 41 | 101 | [Report and chart](evidence/profile-run/report.md) |
| NativeWorker | 14 | 32 | [Report and chart](evidence/native-worker/report.md) |

All five pass their safety invariants and deadlock checks with explicit terminal stuttering. These counts describe finite abstractions, not production scale or a percentage of behavior covered. The [runtime suite](evidence/runtime-current.txt) passes 24 tests and 106 assertions. All 23 deliberately changed source variants fail their corresponding runtime assertions. Syntax errors and failed isolation checks do not count as caught mutations. [Sensitivity evidence](evidence/sensitivity) includes the source-replay failures and all 21 deliberately broken model properties.

Dispatch bounds one task, one turn, one crash, and three possible outcomes. Ledger bounds one duplicate call and one duplicate result. Ownership bounds one worker approval, one chat approval, and one disconnected send. ProfileRun bounds one run, one optional selection change, one host operation, four valid synthetic profiles across all three CLIs, and one invalid effort combination. NativeWorker bounds one task, one result identity, one crash, and counts up to two in fault variants. Its partial-Stop condition applies to Antigravity. Devin Stop lacks a quiescence field; retaining the terminal reservation protects project exclusivity, but these checks do not prove that Devin has no background work.

The models are separate projections. They do not explore their cross-product, multiple bridge writers, disk errors, corrupt stores, unbounded histories, arbitrary reordered provider events, malicious reports, or native model internals. They do not prove eventual completion or network fairness. Profile catalog availability and CLI permission behavior remain external assumptions. UI clicks, terminal OSC display, real model choice, helper transport authentication, and OS sandbox policy need separate tests and native evidence. The shared `HostTools` checks apply to callers that reached the validated ownership boundary, regardless of transport; they do not establish a provider's readiness.

Charts merge normal states that have the same user-visible behavior and omit transitions that stay inside one label. Negative charts distinguish combinations of broken rules so that one violation does not hide another. The detailed dispatch chart retains its crash branches even though that produces 25 arrows.

## Reconciliation record

The prior source sync was `921cafbbeb12c16c73d0257ddcd33c89f9578fb2`. Running its check against the new code stopped at the source hash guard. The old model pass did not establish correctness of the new implementation. The update changes Codex terminal ordering and unknown launch recovery, adds profile and native ownership projections, and updates runtime fixtures to persisted version 2 data.

The replay initially reproduced the ACP pre-session lock in `704eb0a`. The recovery change in `527e549` releases that unsent run without replay. This was a product defect, not model drift. Fixture failures from missing v2 fields and catalog responses were verification drift. A missing assignment in the first new NativeWorker model was a specification error; it was corrected before accepting any result.

The [original dispatch defect report](evidence/dispatch-before-fix/report.md) and its exact model remain for historical comparison. They describe old empty-thread and already-reported completion recovery bugs. Current runtime mutations reintroduce those errors and still fail. During the original verification work, an in-process PATH change created five already-exited synthetic terminals; that incident is why the current runner enforces fresh-process command isolation before any task action.
