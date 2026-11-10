# Herdr chat verification record

Product source is `921cafbbeb12c16c73d0257ddcd33c89f9578fb2`. The installed app used Bun 1.4.4, Codex 0.162.1, and hc 0.1.19. This run reused the session-owned project, bridge, and Herdr window. Stock sidebar, layout, and settings files were unchanged across 52 hash comparisons.

## Live checks

| Journey | Observed result | Input method and limit |
| --- | --- | --- |
| Conversation | A real Codex reply streamed and persisted. | Native composer and Enter before the final command-adapter change. Send-button click remains unrun. |
| Explanation | Codex generated two selectable scenarios; selecting the second changed the native content. | Native click. Scenario preference is not persisted. |
| Initial task | One worker wrote and read `HERDR_CODEX_OK`; its result and a terminal follow-up returned to chat. | Native composer, native terminal typing, and original task tab. The raw remote TUI did not initially appear in Agents. |
| Existing task repair | The same task, thread, terminal, tab, and two completed turns survived attachment of the status observer. The stock Agents list showed Idle. | Official `hc send` resumed the same thread from its recovered shell; `herdr-app do agent.focus` opened it. No prompt was replayed. |
| New task after repair | One new worker appeared under Working, created `feature-map.txt`, ran `cat`, and became Idle. Exactly one result returned to chat. | Official `dori-chat.send:<encoded prompt>` entered the chat view's send handler. `agent.focus` opened the real terminal. This is command-driven coverage, not a sidebar-click or button test. |
| Actual effect | The file was exactly `b'HERDR_FEATURE_MAP_OK\n'`, 21 bytes. | Independent file read. The worker also reported and corrected a mistaken length assertion added by the chat model; the returned result preserved that failure. |
| Continued task | `hc send` submitted another turn to the same worker. It read the file and returned `TERMINAL_FOLLOWUP_OK` once. | Same task and terminal, distinct completed turn. |
| Recovery | Graceful and abrupt bridge restarts retained the original task, terminal, history, and result identities without replay. | Verified owned PID before each signal. Later source regressions cover empty-history and already-reported completion recovery. |

The final original-sidebar screenshot shows both workers. Evidence remains local under `evidence/herdr-chat/sidebar-fix`, including exact prompts, before/after snapshots, terminal identities, rendered frames, and file checks. Earlier native-input evidence is under `evidence/herdr-chat` and the session transcript. The native window remained available, and reused workers were left running at their prompts.

The live policy did not request approval, so blocked-sidebar rendering and a native approval decision were not exercised in the final workbench. Separate real Codex protocol/TUI probes verified approval ownership, including late TUI attachment. Deterministic tests verify status mapping and that the bridge does not answer worker approvals. These checks do not substitute for that missing native case. Native worker interruption and send-button coverage also remain unrun.

## Automated and formal checks

- Static checks, both project TypeScript configurations, Knip, and the 250-line source limit passed. Existing Biome warnings remained.
- The desktop suite passed 8 tests with 35 assertions. The broader run passed 414 tests with 1,362 assertions, excluding two hc integration files that already failed on the unchanged baseline. The baseline had 8 failures and 4 errors in those integration files. The separate skill suite passed 328 tests.
- [Formal verification](../verification/herdr-chat/REPORT.md) checked three finite models with 67, 15, and 5 states. Eleven runtime checks passed, and all ten deliberate source regressions were detected. [The guide](../verification/herdr-chat/README.md) records bounds, assumptions, source hashes, and exact commands.
- Independent review found two recovery defects in the initial source. Both were replayed against actual code, fixed, and re-reviewed. Final source and command-adapter reviews found no actionable issues in their stated scopes.

The first formal test isolation attempt changed PATH inside a running Bun process, which did not redirect executable resolution. It accidentally started five failed test terminals, with no model work. Only those test-owned terminals were removed. The retained verifier starts a fresh process with isolated PATH and a fail-closed command probe before dispatch.

These checks establish the stated finite properties and observed journeys. They do not prove arbitrary Codex behavior, all event interleavings, or the whole Herdr application.
