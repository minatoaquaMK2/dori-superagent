# Terminal continuation and approval

The user opens the task's normal Codex terminal, continues the same worker, and handles any command approval there. Each completed turn returns its own outcome to chat.

## Sub-features

- `terminal-navigation` opens the exact dispatched worker from the original sidebar and native task tab.
- `terminal-sidebar-state` displays running, waiting for approval, and finished worker states in the original sidebar.
- `terminal-followup` submits another turn to the same worker.
- `terminal-result` returns the new turn's result once to the same chat.
- `terminal-approval` leaves a real permission decision in the Codex terminal.
- `terminal-interrupt` interrupts the worker in the terminal and reports the resulting outcome honestly.

## How to get to it (user POV)

- Click the named task tab created by a chat request.
- Select the worker in the original Agents sidebar.
- When chat says the task needs confirmation, open its named task tab.

## Driving it with native computer use

Preconditions:

- Complete task-dispatch through its returned result, retaining that worker's terminal.
- Record its task ID, thread ID, terminal address, and completed turn ID.
- Approval coverage requires a real permission prompt under the existing Codex policy. Do not fabricate an approval event or weaken policy to make this recipe pass.

- **Navigate.** Click the worker in the original Agents sidebar. Save a screenshot and `hc get "$TASK_TERMINAL" --json`. The foreground command and remote thread must still identify the dispatched worker. Repeat through the native task tab and require the same terminal.
- **Continue.** In that terminal's real Codex input, type `请继续刚才的任务：运行 cat .dori/chat-smoke/feature-map.txt，然后只用一句话报告文件内容，并带上 TERMINAL_FOLLOWUP_OK。不要派发其他任务。` and submit. Capture the input and resulting command output. Adapt only the filename if the dispatch journey recorded a different one.
- **Return.** Click **聊天工作台** and scroll down. Save the new visible result and helper output. Require the same task ID, thread ID, and terminal, plus a new completed turn and exactly one chat result containing `TERMINAL_FOLLOWUP_OK`. No new task may appear.
- **Approval.** If the worker requests approval, capture the chat notice, waiting state in the original sidebar, and the actual terminal prompt before responding. Follow the task's authorized decision through native terminal input. Capture the resumed or denied outcome and its returned chat result. If no real prompt appears, mark `terminal-approval` and the waiting-state subcase blocked by the permission-policy precondition and retain any protocol-only coverage separately.
- **Interrupt.** On an authorized scratch task that is still running, use the interruption control shown by the current Codex TUI. Capture the control and stopped outcome. Return to chat and require an interrupted or otherwise accurate result. Do not infer worker cancellation from the chat's **停止回复** button.
- **Sidebar states.** During a bounded scratch task, capture the original sidebar's running state before completion and its finished state afterward. Capture waiting separately when a real approval occurs. Match each state to the task's actual terminal and turn. If viewing the finished task clears its attention state to idle, capture completion before that click and record both transitions. Missing, stale, or fabricated sidebar status fails this sub-feature.

## Gotchas

- A terminal address alone is insufficient identity if its foreground program has changed. Read `hc get` before continuing.
- Terminal continuation must reuse the worker started from chat. Starting another Codex session does not exercise result routing.
- A fast task can finish before an interruption control is used. Record that attempt as not exercised.
- The bridge posts an approval notice but must not silently approve the worker command. Protocol tests can supplement, but cannot prove, a real terminal decision.
