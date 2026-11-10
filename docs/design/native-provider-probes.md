# Native CLI observations

These observations were collected on 2026-11-10 through the installed `hc` and `herdr-app` skills. They test the native worker adapters. They do not prove dispatch from the chat composer.

The probes used separate Git directories under `/tmp/dori-native-probe` and a temporary Herdr space. Existing project workers were not modified. Raw hook payloads remain local because they contain prompts and account-specific paths.

## Launch and permission policy

| CLI | Observed version | Launch options | Observed result |
| --- | --- | --- | --- |
| Antigravity | 1.5.3 | `--dangerously-skip-permissions --model gemini-3.8-flash-medium --add-dir <private-hook-directory> --prompt-interactive <prompt>` | Created and read `yolo-proof.txt` without an approval prompt. Bytes were `HERDR_AGY_YOLO_OK\n`. |
| Devin | 3000.12.32 | `--permission-mode dangerous --model claude-sonnet-5-5-medium --config <private-config> --export <private-export> --prompt-file <prompt-file>` | Created and read `yolo-proof.txt` without an approval prompt. Bytes were `HERDR_DEVIN_YOLO_OK\n`. |

The user explicitly requested these worker defaults. Codex keeps its existing permission policy.

Both terminals appeared through the original Herdr space and tab labels. Antigravity emitted `app=antigravity` status and Devin emitted `app=devin` status. Both accepted another prompt in the same terminal and returned its distinct marker.

Antigravity discovers `.agents/hooks.json` under an added workspace. The prompt must name the absolute task project because the hook directory becomes another visible workspace. An earlier relative-path probe tried to target the hook directory. That write was denied, and the absolute-path probe succeeded. Antigravity does not load these hooks through `--settings`.

Devin loaded hooks from a private copy of the existing user configuration. The probe did not change the shared configuration or print its values.

## Result identity and background work

Antigravity `Stop.executionNum` was `0` on two distinct user turns. It cannot identify a reported turn. The native adapter must snapshot the latest transcript `USER_INPUT.step_index` with the session identity and the final model text when the hook runs. Reading the transcript later can accidentally capture a subsequent turn.

Antigravity resets `PreInvocation.invocationNum` for the next user turn. It also emits more invocations within one turn. A single invocation therefore does not equal a user turn.

When a command continued in the background, Herdr reported `done` while the Antigravity Stop payload had `fullyIdle=false`. The target file did not exist at that point. After the command finished, Antigravity invoked the model again and emitted `fullyIdle=true`. The file then contained the requested marker. Final completion requires the latter observation.

Devin preserved `session_id` and rotated `prompt_id` for each user prompt. Its Stop hook supplied `last_assistant_message`. The tested background command produced a Stop payload without a quiescence field. Stop proves that a response ended, not that all background work stopped.

## Hooks can reject a new turn

The following outputs blocked a requested file write in the existing YOLO terminals. Both target files remained absent.

Antigravity `PreInvocation` output was:

```json
{"terminationBehavior":"terminate","injectSteps":[{"errorMessage":{"userMessage":"HERDR_PROBE_PROJECT_BUSY"}}]}
```

Devin `UserPromptSubmit` output was:

```json
{"decision":"block","reason":"HERDR_PROBE_PROJECT_BUSY"}
```

This demonstrates the hook mechanism, not an implemented atomic project lease. The implementation retains a native session's project reservation while its terminal stays open.

## Main chat isolation

Antigravity's `--include-default-customizations=false` did not prevent a project MCP helper from starting during a real prompt. Session creation alone had missed this behavior.

A subsequent probe used an empty private workspace, a fresh relative app-data namespace, and no `--add-dir`. Its macOS sandbox denied project writes and reads under `~/.gemini/config`, while permitting writes to private provider state and temporary files. Authentication and session creation still succeeded. The same prompt attempted a built-in project write and called both host tools. The write failed with `operation not permitted`, both host calls reached the recording server, and the inherited project's helper log did not change.

Main chat therefore needs that isolated workspace and process policy. The real project remains available by absolute read path. Native workers keep the original project directory and the user's customizations. This containment is specific to the tested macOS adapter.

Devin's actual `mcp list` diagnostic rejected the helper because it was absent from the organization's allowlist. Its local permission deny rules also failed to block a built-in file write in a disposable project. The native YOLO pass does not establish main-chat readiness. That conclusion applied to the MCP transport tested at the time. The later user-requested local CLI helper uses Devin’s existing command tool instead. The [main-chat verification record](main-chat-verification.md) tracks that replacement and its separate product journey.

## Primary references

The [Antigravity hook reference](https://antigravity.google/docs/hooks/) defines discovery, PreInvocation termination, and Stop `fullyIdle`. The [Devin lifecycle reference](https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks) defines session identity, prompt identity, and lifecycle events. Runtime observations above take precedence where a field is insufficient for the integration.
