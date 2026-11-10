# Source reconciliation

The formal update supports selectable CLI/model/effort profiles, frozen task inheritance, scoped host operations, and native worker ownership. The reviewed product revision is `657556a3b997a3b2579f2b155444f57ae59851a2`. The earlier transition review covered `d72d426`; the coordinator read the subsequent provider and helper diffs before updating the source manifest.

## Reviewed changes

| Files | Effect on the verification |
| --- | --- |
| `tasks.ts`, `herdr.ts` | Saved attempt before RPC; terminal creation before turn start; conflicting call identities rejected; native branch and recovery split. Dispatch actions and crash probes now match. |
| `model.ts`, `store.ts`, `migration.ts` | Version 2 profile, segment, run, receipt, native runtime, and launch records. Whole-store rename remains the process-crash boundary. Runtime fixtures use the persisted schemas. |
| `engine.ts`, `configuration.ts`, `profile.ts`, `providers/codex.ts` | Actual catalog/config resolution, full profile snapshot at admission, revision and busy guards, new segment on selection, legacy adoption. ProfileRun and protocol payload replays cover the guarded behavior. |
| `chat-events.ts`, `recovery.ts`, `rpc.ts`, `protocol.ts` | Event ownership moved out of Engine; current segment/epoch identity; legacy active completion; pre-session ACP recovery; exact outbound settings. Ownership mutation targets follow the moved code. |
| `host-tools.ts`, `http.ts`, `providers/acp-chats.ts` | Shared handler uses scoped owner, operation ID, parsed argument fingerprint, and durable receipt. Closed ACP sessions drop bindings and mark runs unknown. ProfileRun and actual handler replays cover effects after this boundary. Transport permission enforcement remains outside TLC. |
| `workers/native-cli.ts`, `workers/reporter.ts`, `workers/manifest.ts` | Native launch attempt, task-private reports, real turn identity, partial Stop, terminal-held project lease, and non-replayed recovery. NativeWorker and report/launch-count replays cover these decisions. CLI flags and real hook delivery remain native verification. |
| `bridge.ts`, `cli.ts`, `terminal.ts` | Native polling/reconciliation and CLI entry points are mapped dependencies. Import purity and UI OSC behavior are outside the model. |
| Listed test fixtures, package metadata, lockfile | Protocol responses and dependencies used by the executable replays. Added fixture catalogs and v2 fields are verification drift repairs. |

Changes read span the prior source sync through `f68f81f`, `9b29dce`, `704eb0a`, `527e549`, and `d72d426`. The later `fe416b8` adds chat notices for denied/empty ACP responses and read-file permission handling; its diff does not change the modeled profile, task, or receipt transitions. Its permission behavior remains outside TLC coverage. The documentation-only commits `17078da` and `2cc46a1` did not alter product transitions.

The bounded dispatch rule changed deliberately for an attempted launch whose returned identity was not saved. The old empty-result rule now covers known empty work; a separate invariant holds unknown identity. The implementation reconciliation documents that no-replay decision. Completed-result truth and deduplication rules remain unchanged.

The no-session ACP replay first failed on `704eb0a` and passed after `527e549`. This was a product defect. Missing schema fields and model/config protocol responses were stale verification fixtures. A missing assignment in the first NativeWorker spec was a model error. The corrected specification rejects even one replay after an unknown launch, including a crash before the modeled external launch effect.

## Recorded checks

- TLC and statechart: Dispatch 57 states/106 steps, Ledger 15/17, Ownership 5/5, ProfileRun 41/101, NativeWorker 14/32. All safety invariants and explicit-stutter deadlock checks pass.
- The 21 negative model properties all fail with recorded shortest paths. Native unknown replay now fails on the first retry after an attempted launch and crash.
- Runtime: 24 tests, 106 assertions pass against actual classes with fake terminal/provider commands supplied at process startup.
- Sensitivity: all 23 source mutations fail observable runtime assertions. The runner rejects shifted targets and excludes parser/isolation failures from caught results.
- Strict TypeScript check of all formal TypeScript files passes with the repository's compiler settings. Biome checks pass for changed TypeScript and view modules.
- No real provider process, native UI command, user runtime, credential, or terminal was used by these checks.

Evidence is under `evidence/`. Copied text logs have trailing whitespace and extra terminal blank lines removed; raw logs remain under `/tmp/dori-profile-formal-*`. The source mutation logs exercise code, not just fault switches in TLA+. Existing historical defect evidence is retained. The Model the Domain principle shaped the separate profile and native-worker projections. Test Behavior, Not Implementation shaped the outbound profile, durable receipt, returned-result, and terminal-launch-count assertions.

## Final provider boundary review

The final Devin integration adds `DevinSession` and a local `host-cli` transport, and routes both ACP providers through the same catalog, run, event, and host-tool ownership logic. It does not change the modeled save/attempt/receipt/result transitions. ProfileRun already includes a synthetic Devin profile. The helper takes its operation identity from a fixed command prefix; parsed payload fields cannot override it.

The source manifest now includes the provider session, catalog, helper, sandbox and stdio dependencies. Their authentication, shell-command validation and OS enforcement remain outside TLC; dedicated runtime tests and the native integration journey cover those boundaries. The helper subprocess test preserves literal shell metacharacters, overrides a forged operation ID, and proves that private workspace Bun preload configuration does not run. The sandbox test preserves access to the scoped broker and denies sibling credentials, directory listing, unrelated localhost ports and Unix control sockets.

The default check at `af8a9a8` passed all five models and 24 runtime tests (106 assertions); all 23 mutations were caught. The subsequent ACP update parser fix validates the message discriminator before text content. Valid tool progress arrays no longer terminate a reply. This changes transport parsing, outside the modeled transitions. The final default check at `657556a` passed all five models and the same 24 runtime tests. All 23 source mutations were caught again. Raw final logs are `/tmp/dori-main-chat-formal-657556a.log` and `/tmp/dori-main-chat-mutations-657556a.log`. Verification stays separate from product commits. Historical design artifacts remain in `verification/main-chat-providers-design` and are not substituted for this source mapping.

The final chooser correction requires an explicit target-model choice when a saved or configured default is disabled. It does not change `Configuration.configure` admission. Devin workers now add the documented workspace-trust skip flag to the user-authorized YOLO launch. That flag changes native CLI startup, outside the modeled launch effect; the native journey verifies it.
