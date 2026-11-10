# Main chat provider verification

The workbench keeps Herdr's original sidebar and terminal navigation. The composer selects a CLI and a model; reasoning effort lives inside the model menu. Each accepted request saves its complete profile, and a worker keeps that profile after the main chat changes.

## Native run

The 2026-11-10 run used the installed `hc` and `herdr-app` skills, an empty Git project, and a separate bridge under `/tmp/dori-main-chat-verify-20261110`. Evidence remains in that directory's `evidence` folder. The driver used official mod commands that call the composer and selection handlers. This is command-driven native coverage, not proof of pointer clicks, text entry, or keyboard navigation.

| Journey | Observed result |
| --- | --- |
| Codex dispatch | Selected GPT-6.1-Sol / low. One worker appeared in the original Agents sidebar, executed in a real Codex terminal, wrote `HERDR_CODEX_PROFILE_OK\n`, and returned one result. The saved origin and terminal model display matched. |
| Antigravity dispatch | Selected Gemini 3.8 Flash / low. One native worker used `--dangerously-skip-permissions`, wrote `HERDR_AGY_PROFILE_OK\n`, and returned one result without an approval action. |
| Antigravity continuation | After main chat switched to Codex, the same native Antigravity terminal read the file and returned `HERDR_AGY_FOLLOWUP_OK`. The first and second reports used distinct user-turn boundaries and retained the original profile. |
| Native project ownership | A completed Antigravity response retained its terminal reservation. Closing only that scratch terminal set `runtime.open=false` and released the project without removing either report. |
| Antigravity read and explanation | A real main-chat `read_file` returned `HERDR_AGY_READ_OK`; `show_explanation` produced a validated two-scenario card without creating a worker. |
| Codex explanation and busy selection | A real `show_explanation` produced a three-scenario card. An official effort-change command during the reply left the accepted low effort unchanged. |
| Model menu | The inspected native Antigravity popup showed the model list and Low / Medium / High controls together. The model list scrolls independently. |
| Persistence | Owned bridge restarts preserved task identities, profiles, and returned results without creating another worker. |
| Devin read and explanation | A real main-chat file read returned `HERDR_DEVIN_READ_OK`. The local helper produced a two-scenario explanation card without creating another worker. |
| Devin dispatch | Selected Gemini 3.8 Flash / low. The local helper created a worker in the original Agents sidebar. Its terminal showed the exact low variant and bypass mode, wrote `HERDR_DEVIN_PROFILE_OK\n` (23 bytes), and returned one result without any approval action. |
| Devin continuation | After main chat switched to Codex, the same Devin terminal returned `HERDR_DEVIN_FOLLOWUP_OK`. Two distinct prompt IDs produced two results while its original Devin profile remained fixed. |

The final Devin worker uses both `--permission-mode dangerous` and `--respect-workspace-trust false`. An earlier run exposed the independent workspace trust prompt and was closed without accepting it. The corrected fresh-directory run completed without that prompt.

The native worker screenshots, `hc get` identities, terminal output, exact file bytes, snapshots, and action log support these results. The screenshot `agy-model-effort-menu.png` shows the final model-menu layout. Earlier screenshots captured stale frames and do not count as passes. A failed provider selection immediately after mod reload sent one explanation request to Codex; the action log records that correction, and subsequent sends assert the expected provider first.

The native explanation tool was exercised, but scenario clicking and text selection were not repeated in this command-driven run. The [feature map](../herdr-chat-feature-map.md) keeps those entry points separate.

## Devin CLI transport probe

The user requested a script or CLI path after the organization rejected a custom MCP server. A separate ACP probe under `/tmp/dori-devin-cli-bridge-probe` used the normal built-in command tool with no MCP servers. It did not change the organization allowlist or impersonate an approved server.

The probe used private XDG configuration, data, cache, temporary files, and an empty workspace. It read a real project file and invoked a local recorder twice for `start-task` and `show-explanation`; both commands exited successfully. An attempted built-in project write failed under the process sandbox, and the target file remained absent. These were fake host operations, not real dispatches.

The application adapter retains session-scoped credentials and host-issued operation identity, validates the exact helper command, and uses the same `HostTools` receipt logic as the other providers. The CLI's persisted effective model is authoritative when its menu's family ID differs from the actual variant.

The first product Devin prompt exposed an ACP parser defect: tool-progress updates carry an array, while assistant text carries an object. The parser now validates the update discriminator first. The failed round remains unknown without automatic replay; verification continued in a new native chat. Its focused regression replays the observed update shape and confirms that subsequent assistant text is preserved.

## Protocol and formal checks

The [protocol verification](../../verification/herdr-chat/README.md) documents the source mapping, bounded models, runtime crash probes, mutation sensitivity, and limits. Five finite projections cover dispatch, result deduplication, Codex approval ownership, accepted profiles and scoped operations, and native terminal ownership. These checks do not prove provider internals, OS sandbox completeness, unbounded histories, or native input behavior.

Independent review found and drove fixes for local control-plane access, unresolved legacy profiles, active legacy completion, unsent ACP recovery, and abandoned ACP processes. A real integration test also exposed DNS access through macOS's resolver socket and a main-chat read permission that ended a reply without text. The fixes preserve the underlying restrictions and report denied or empty replies explicitly.

Module-import testing previously invoked the installer through an unguarded desktop CLI import. The accidental scratch space and terminal were removed. The CLI now checks `import.meta.main`, and module-graph children use fake external commands and private runtime/app directories. User terminals were preserved.

The final local CI command `bun run ci` passed at product revision `657556a`: 440 application tests and 328 skill tests, plus Biome, both TypeScript projects, Knip, and LOC checks. The stamped formal check passed five models and 24 runtime tests (106 assertions); all 23 source mutations were caught. Independent source review closed the five recovery/containment findings and the disabled-default chooser defect with no remaining actionable finding.

The original idle bridge was backed up and upgraded to protocol 2. All original chat entries were compared by identity and contents and preserved. All three catalogs are ready, with Codex selected. Scratch spaces, terminals, bridge, and its exact app-server were removed. The original tab is selected. Stock sidebar modules, layout, and key bindings match their before-run hashes. `settings.json` changed during the session and was left as found. The old terminals `t1w` and `t25` were already absent in the inventory before final cleanup; their task history remains intact, so this run does not claim they are still live.

## Inspected native screenshots

- [All three CLI choices](screenshots/main-chat-cli.png).
- [Model list with reasoning effort](screenshots/main-chat-model.png).
- [Devin worker in the original sidebar and terminal](screenshots/devin-worker.png).
