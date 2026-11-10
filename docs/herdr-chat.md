# Herdr chat workbench

This optional desktop entrypoint adds one native chat tab to Herdr. The stock sidebar, spaces, agent list, tabs, and terminals remain Herdr's own. Codex is the first supported agent.

## Open the workbench

Install Bun 1.4.4 or later, Herdr (`hc` and `herdr-app` on PATH), and a Codex CLI with `app-server --listen unix://…` and `resume --remote` support. Sign in to Codex normally and open Herdr first. This version was verified with Codex 0.162.1 and hc 0.1.19.

```sh
bun install --frozen-lockfile
bun run desktop:install /absolute/path/to/project
```

The command copies only the `dori-chat` mod into `~/.config/herdr-app/mods`, opens a project space if necessary, selects Herdr's stock `main` layout, and opens **聊天工作台**. Existing custom layouts and mods remain available. Running the command again selects the existing chat tab.

Type an instruction to start work. The chat assistant prepares the prompt and launches one Codex session in a normal Herdr terminal. A short acknowledgment and the worker's final response appear in the chat. The worker appears in Herdr's stock Agents sidebar under its task name. Click it to open the real Codex terminal, inspect progress, answer an approval, interrupt it, or continue the session. One worker handles each task and its own checks. A completed Codex turn does not by itself prove the task succeeded; the response states its actual checks and outcome.

Ask for an explanation with contrasting examples to receive selectable scenarios. The assistant supplies validated text and steps for a native component. The component does not execute generated HTML or JavaScript. The first version supports scenario selection; it does not embed arbitrary Open Intelligent UI components.

To submit text through Herdr's native mod command, keep the connected workbench visible and pass a percent-encoded prompt in the command string:

```sh
herdr-app do "$(bun -e 'process.stdout.write("dori-chat.send:" + encodeURIComponent(process.argv[1]))' 'Explain this project')"
```

Herdr delivers this command to every shown `dori-chat` copy. Keep only the intended workbench visible when sending. Mod commands receive a string; a separate JSON `text` argument does not reach the mod.

## Runtime and recovery

The installed `hc --skill` and `herdr-app --skill` describe the native driver. The bridge starts interactive terminals with `hc run --bg`, explicit project and task labels, and a task name. Herdr discovers those labels; `herdr-app do agent.focus --terminal ADDRESS` opens the corresponding worker. Read status with `hc get` and execution output with `hc read`. There is no one-shot Codex process or terminal-output scraping for task results.

The hc guide recommends `--no-daemon` for standalone Codex launches. Codex 0.162.1 rejects that flag together with `--remote`. This integration intentionally uses an explicit private app-server so the chat and terminal share the same worker. Its command execution belongs to that server, while hc owns the interactive terminal and its status observer.

The bridge listens only on loopback with a per-run bearer token. A private Unix socket connects the bridge and real Codex TUIs to one Codex app-server. Both reuse your Codex account and configured model. The chat thread is read-only; the worker inherits your normal permission policy. Approvals for worker commands belong to its terminal. The chat does not silently approve requests. A thin terminal launcher observes the same app-server and translates thread status into Herdr's native agent status. Active work shows as working, an approval or user-input wait shows as blocked, and an idle thread shows as idle. A lost connection or unavailable thread shows as an error. The launcher does not read input, answer approvals, or start turns. It remains connected when the chat bridge restarts.

State, connection details, and logs live under `~/.local/state/dori-chat`. Set `DORI_DESKTOP_HOME` to isolate another instance. The bridge is the only writer of chat/task state. Closing a chat tab or Herdr window does not stop Codex tasks. Reopening the app preserves chat history, and a bridge restart reconciles Codex history and discovers worker terminals by their task labels. It does not repeat an uncertain task. Only one active task per project can be dispatched through the chat at a time.

To restart a running bridge, read its PID from `connection.json`, send that process `SIGTERM`, then run `desktop:install` again. The Codex app-server and worker terminals continue. An abrupt bridge exit leaves a lock that the installer reclaims only after proving its owner is gone. If a live bridge has lost its Codex connection, inspect `bridge.log` and `codex.log` before restarting. An unknown task outcome remains explicit until the terminal/history resolves it.

Messages acknowledged before a crash are deduplicated by request identity. An incomplete launch is recorded before external work starts. A missing terminal is reattached to the existing Codex thread without starting a new model turn. If recovery finds an idle thread with no turns, it marks the launch as failed and releases the project for another task. A returned result remains finished even if its terminal window fails to open; recovery restores that state without repeating the result. Unsent queued chat messages are not automatically replayed after restart.

For an existing terminal created before native status support, first confirm its task has finished. Use `hc get ADDRESS --json` to verify `keep: true` and identify the foreground Codex TUI process for the saved socket and thread. Send `SIGTERM` to that foreground PID, then wait until `hc get` reports a shell at the same terminal address. `hc kill` suppresses kept-terminal recovery, so use the verified TUI PID for this migration. Run the following command in the recovered shell, using the same socket and thread ID from the saved task:

```sh
exec /absolute/path/to/bun /absolute/path/to/repo/src/desktop/cli.ts terminal /absolute/path/to/codex.sock THREAD_ID
```

This keeps the terminal address, tab, and task identity. It resumes the same Codex history without sending a prompt. Do not paste the command into an active Codex input box.

## Scope

This is a local desktop integration. Existing messenger and omo entrypoints keep their current behavior. Slack, Teams, Telegram, Devin, and Antigravity are not wired to this new chat backend yet. Each workbench is bound to one local project directory. The UI shows the latest 200 entries while the full transcript remains on disk. Scroll manually to read a long conversation.

## Verification

```sh
bun run check
bun run typecheck
bun run knip
bun run lint:loc
bun run test:desktop
herdr-app check /absolute/path/to/repo/herdr/mods/dori-chat
```

The desktop tests drive a real Unix WebSocket and HTTP server against a deterministic Codex protocol peer. They cover request deduplication, streamed transcript persistence, dynamic explanation validation, worker approval ownership, task-result identity, interrupted launch recovery, completed-task recovery, native status mapping, and disconnection. Terminal tests start their subprocesses with an isolated PATH so their Codex and hc fixtures cannot invoke the installed programs. Native layout, typing, scenario selection, and real Codex execution require live-app verification; the eager native checker cannot prove those interactions.
