# Recovery and duplicate prevention

The user reopens the workbench after a bridge interruption and sees preserved conversation and task identities. Uncertain work remains explicit and is not automatically executed again.

## Sub-features

- `recovery-reopen` restores a saved conversation after bridge restart.
- `recovery-live-worker` reconnects to the same worker and reports its existing turn.
- `recovery-dedup` avoids duplicate accepted messages, workers, and task results.
- `recovery-disconnected` shows a real connection failure without claiming success.
- `recovery-queued` does not replay messages left unsent before restart.
- `recovery-uncertain` preserves uncertainty when history or launch state cannot establish an outcome.

## How to get to it (user POV)

- Reopen **聊天工作台** after closing its tab or the Herdr window.
- Restart a disconnected bridge using the documented installer flow, then return to chat.
- Retry a failed native send when the same draft remains in the composer.

## Driving it with native computer use

Preconditions:

- Use only a runtime and scratch worker owned by this verification. Record the bridge PID and exact app-server socket. Never fault the shared default runtime.
- Save screenshots, terminal output, the helper's conversation and task identities, and the persisted state before the interruption.
- Reopening without a process fault is covered by native-conversation. It does not prove crash recovery.

- **Restart.** Once the marker task has completed, confirm the connection PID belongs to this run's bridge. Send `SIGTERM` to that PID. Capture the visible connection error. Run `bun run desktop:install "$PROJECT"` with the same `DORI_DESKTOP_HOME`. Doctor must succeed again. Capture the restored transcript. Compare user-entry IDs, worker thread IDs, reported turn IDs, and task-result IDs before and after. They must not multiply or change identity.
- **Live worker.** In a separate scratch attempt, dispatch a bounded task through the native composer that runs `sleep 15` before writing a new marker. Observe actual execution, then restart only the bridge while the worker is active. Reopen the chat natively and require the same worker thread and terminal, one file effect, and one result for its completed turn. If timing prevents the interruption while active, record that precondition as unmet.
- **Abrupt exit.** Repeat a scratch restart with `SIGKILL` to only the recorded bridge PID. Confirm the old PID is gone before reinstalling. Capture recovery of its stale lock and compare the same identities. Keep this separate from graceful shutdown evidence.
- **Disconnected backend.** On an otherwise disposable run, terminate only its recorded app-server PID while leaving the bridge alive. Capture the disconnected status and failed native send. The chat must not claim the uncertain task succeeded. Save Doctor's failure and logs, then restart the owned bridge through the installer. Compare the recovered result with terminal history. Do not create a new task to hide an unresolved old one.
- **Retry identity.** A transport failure after server acceptance but before the native client receives its acknowledgment is needed to prove native retry deduplication. If that condition occurs, retain the same draft, retry with the native send button, and compare one request ID, one user entry, and one dispatched worker. If the run cannot create that condition reliably, mark this subcase `protocol only` and name the missing live evidence. Re-sending identical text after a successful send creates a new request and is not a deduplication test.
- **Queued messages.** While a chat reply is running, submit a second distinct native message and capture the queued indicator. Restart the owned bridge before the queued message starts. Require the recovery notice saying unsent messages were not replayed and no execution of that second message. If the queue drains first, record the attempt as not exercised.
- **Uncertain launch.** If a real interruption leaves a task launching or disconnected, inspect its history and terminal before retrying. Require an explicit unresolved or not-started outcome, with no automatically repeated model turn. Do not hand-edit state to manufacture live proof. Without the timing condition, record source or protocol coverage only.

## Gotchas

- Bridge restart must preserve the app-server and worker for the live-worker case. Killing all processes cannot prove reconnecting to an existing worker.
- Recovered historical results must keep task and turn identity. A plausible new summary is not sufficient evidence against duplicates.
- A helper health failure is expected evidence during disconnect, but ordinary features remain blocked until Doctor passes again.
- Capture state before cleanup and retain it outside the runtime directory. Never copy the bearer token into evidence.
- Crash timing, accepted-but-unacknowledged sends, approval prompts, and uncertain launches require actual runtime conditions. Mark unobserved cases honestly.
