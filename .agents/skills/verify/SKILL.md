---
name: verify
description: Drive the real Herdr GPUI chat workbench, dispatch a Codex task through its native composer, inspect its terminal, and prove results, explanations, persistence, and recovery. Use for desktop chat changes and live regression checks.
---

# Verify Herdr chat

Read [the feature index](features/README.md), then the matching journey. For changes to task dispatch, always run [the complete task journey](features/task-dispatch.md). Passing HTTP or protocol tests does not replace that journey.

## Launch

Run from this repository root. Require Bun, Python 3, `hc`, `herdr-app`, and a signed-in `codex` with Unix app-server and `resume --remote` support. Read `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, and `gpui-kit.d.ts` for the installed native API. This is GPUI, with no browser, DOM, or HTML.

One agent owns the native window for the entire run. `DORI_DESKTOP_HOME` isolates the bridge, state, and socket. It does not isolate the Herdr window or installed mod. The installer writes `~/.config/herdr-app/mods/dori-chat` directly even when `HERDR_APP_HOME` is set. Do not run concurrent installers or native drivers. Do not change the default `~/.local/state/dori-chat` during an isolated run.

Before installing, save `herdr-app status` and `herdr-app ls` outside the runtime directory. Record the active space, tab, and layout. Keep the existing dori-chat mod intact if it differs from this checkout. Use an existing Herdr window, or launch `herdr-app` and record that you opened it. The stock Herdr files are outside this verification's edit scope.

Fresh runtime, in one persistent shell:

```sh
REPO="$PWD"
RUN_DIR=$(mktemp -d /tmp/dori-verify.XXXXXX)
export DORI_DESKTOP_HOME="$RUN_DIR/runtime"
PROJECT="$RUN_DIR/project"
EVIDENCE="$REPO/evidence/herdr-chat/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DORI_DESKTOP_HOME" "$PROJECT" "$EVIDENCE"
git -C "$PROJECT" init -q
git rev-parse HEAD > "$EVIDENCE/revision.txt"
herdr-app status > "$EVIDENCE/herdr-before.txt"
herdr-app ls > "$EVIDENCE/herdr-before.json"
bun install --frozen-lockfile
codex app-server --listen "unix://$DORI_DESKTOP_HOME/codex.sock" > "$EVIDENCE/app-server.log" 2>&1 &
CODEX_SERVER_PID=$!
printf '%s\n' "$CODEX_SERVER_PID" > "$EVIDENCE/app-server.pid"
```

Wait for that exact socket to accept a connection before starting the bridge. Use this bounded readiness check. Failure means inspect the saved log and run Cleanup.

```sh
python3 - "$DORI_DESKTOP_HOME/codex.sock" <<'PY'
import socket, sys, time
for attempt in range(100):
    with socket.socket(socket.AF_UNIX) as client:
        try:
            client.connect(sys.argv[1])
            break
        except OSError:
            time.sleep(0.1)
else:
    raise SystemExit("Codex socket was not ready within 10 seconds")
PY
bun src/desktop/cli.ts serve > "$EVIDENCE/bridge.log" 2>&1 &
BRIDGE_PID=$!
printf '%s\n' "$BRIDGE_PID" > "$EVIDENCE/bridge.pid"
```

Wait until the bridge log contains `"ready":true` and its connection file exists. Confirm the bridge PID is still alive. Then run:

```sh
bun run desktop:install "$PROJECT"
herdr-app check "$HOME/.config/herdr-app/mods/dori-chat"
```

Ready means **聊天工作台** is visible, the composer accepts focus, Doctor succeeds, and Herdr reports no dori-chat error. A listening server alone is insufficient.

Reuse mode is allowed when this session already owns the installed runtime and native window. Set `REPO`, `PROJECT`, `DORI_DESKTOP_HOME`, and a new `EVIDENCE` directory to their observed absolute paths. Record that the runtime and terminals predate this run. Save the before state, run `desktop:install` for that exact project, then Doctor. Do not launch a second bridge or terminate reused processes during Cleanup. This mode proves reopening and driving an existing installation, not startup from an empty directory.

## Doctor

Run this read-only check before driving and whenever anything looks wrong:

```sh
python3 .agents/skills/verify/scripts/observe.py --home "$DORI_DESKTOP_HOME" --project "$PROJECT" --output "$EVIDENCE/before"
herdr-app status
herdr-app ls
```

The helper requires a live bridge PID, authenticated `/health`, and a connected `/snapshot` for exactly one matching project. Review its `bridgeCommand` against the source checkout you launched. Match the returned conversation and project to the native tab. Record `codex --version`, `hc --version`, and `herdr-app --version`. Compare the installed mod's `main.js`, `explanation.js`, and `mod.json` with this checkout using `cmp`. The helper cannot establish the code version of a reused process by itself.

Doctor writes only to the explicit evidence directory. It never sends a chat message or modifies runtime state. Its successful output is a health check, not a feature pass. If Doctor fails during a recovery journey, save its stderr plus the screen and logs before restarting.

## Drive

Read the installed `hc --skill` and `herdr-app --skill` before controlling agents. When the user requests that driver, use its commands for terminal creation, navigation, messages, and observations. Its guide forbids experimenting with pointer or keyboard automation on the person's display. Record command-driven coverage separately from native typing and clicking; commands do not prove those input paths. Existing native evidence remains valid only for the code it exercised.

`herdr-app shot` can return the last frame of a minimized window. Compare it with `herdr-app status` and `ls`. Open the window with bare `herdr-app` when showing the requested result, then capture a newly drawn frame. Do not count a stale frame as a visual pass.

On an isolated display, or when the user explicitly authorizes native input verification, use the available computer-use tool to inspect the Herdr screen, click the visible composer, type the exact feature prompt, and press Enter. Follow that tool's returned API documentation. A native screenshot is the source of click coordinates. Refresh it after window changes. Do not copy fixed coordinates between runs.

The composer placeholder is **派个任务，或让 Codex 帮你解释一个问题…**. Enter submits, Shift+Enter inserts a newline, and **发送 ↑** submits by click. **停止回复** interrupts the chat reply only. Task interruption and approval belong to the task's Codex terminal.

Use native clicks for scenario buttons, the original Agents sidebar, task tabs, and the return to **聊天工作台**. Use native typing for terminal follow-ups and approval choices. The installed native UI exposes no browser selectors. GPUI element IDs in source are useful for code tracing, not DOM queries.

Do not substitute `herdr-app do dori-chat.send`, `TextareaState.set_value`, POST `/send`, state-file edits, or injected explanation data for a composer or scenario interaction. `herdr-app do` is permitted for installation and cleanup navigation. `hc read`, `hc get`, and authenticated GET `/snapshot` are second observations of real UI actions.

Always capture an action before its result. Scroll the transcript manually to the newest entry. This version does not automatically scroll. A dispatched task must appear in Herdr's original Agents sidebar with its current state. Click that sidebar entry and confirm its terminal identity. A task tab alone does not satisfy sidebar coverage. Missing sidebar entries are a failure, even when the remote Codex TUI itself emits no OSC 7501 status.

## Evidence

Create one subdirectory per feature and keep these artifacts under `$EVIDENCE`:

- `actions.md` records the feature ID, entry point, exact text typed, native clicks and keys, timestamps, and observed outcome. Include blockers and unrun entry points.
- Native screenshots show the populated composer, the dispatched task terminal, and the returned chat result. `herdr-app shot "$EVIDENCE/task-result.png"` captures the app's rendered frame. Inspect every captured image.
- Run the helper again with `--output "$EVIDENCE/after"` to save `doctor.json`, `snapshot.json`, and `conversation.json`. These omit the connection bearer token. They contain task text, so keep them local unless sharing is authorized.
- For each new task's recorded terminal, save `hc get "$TASK_TERMINAL" --json` and `hc read "$TASK_TERMINAL" --lines 100`. Derive `TASK_TERMINAL` from the helper's new task, never from list position.
- Read the actual file or other promised effect. A model's completion text alone does not prove it happened. A completed turn can report failure or no text.

Pair each pass with its action and evidence. Mark source-only, protocol-only, skipped, blocked, and failed separately from live passes. A feature with multiple entry points is fully verified only after every listed entry point is exercised.

## Cleanup

Capture final state and screenshots before cleanup. Close only the scratch task tabs and scratch chat tab created by this run through the native UI. Explicitly kill only the recorded scratch terminals with `hc kill "$TASK_TERMINAL"` if they still exist. Closing the window or tab does not terminate Codex tasks.

For a fresh runtime, verify each saved PID's command still names this run's bridge or exact socket, then send `SIGTERM` to the recorded bridge and app-server PIDs. Never kill by process name. If recovery replaced the bridge, use the current connection PID after confirming the runtime path and ownership. Remove only this run's empty scratch Herdr space. Restore the pre-run selected tab and layout. Restore any dori-chat files backed up before installation. Leave reused windows, processes, and tasks running.

Confirm the owned PIDs have exited and no scratch terminal remains. Keep `$RUN_DIR` until evidence is checked. Verify the files under `$EVIDENCE` still exist and open at least the final screenshot and JSON after cleanup. Evidence is outside `$RUN_DIR` and must survive its later removal. Run this cleanup after failed iterations too, retaining the failure artifacts.

## Helpers

`scripts/observe.py` is executable and can also run through Python as shown above. Omit `--output` for a read-only health report without evidence writes. It accepts explicit paths so it cannot silently select the default runtime. It does not retry a failed run or repair state.

Keep the map current with the pstack `maintain-verification-skill` workflow when user journeys change.
