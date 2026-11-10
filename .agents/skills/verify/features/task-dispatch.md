# Task dispatch and results

The user asks for work in chat. One Codex worker executes it in a real Herdr terminal, and its final result returns to the originating conversation.

## Sub-features

- `task-native-request` dispatches a natural-language task through the native composer.
- `task-single-worker` creates one new worker and one labeled terminal for the request.
- `task-sidebar` shows that worker in Herdr's original Agents sidebar and opens its real terminal.
- `task-execution` runs the requested command in that worker's terminal session.
- `task-chat-result` returns the worker outcome to the same chat.
- `task-truthful-result` checks the promised file and distinguishes reported failure from successful work.

## How to get to it (user POV)

- Type a task in **聊天工作台** and press Enter or click **发送 ↑**.
- Open the new task in Herdr's original Agents sidebar, then return to **聊天工作台**.
- Open the same task by its title in Herdr's native tab bar as an additional entry point.

## Driving it with native computer use

Preconditions:

- Doctor succeeds. The scratch project has no active or uncertain task.
- `.dori/chat-smoke/feature-map.txt` does not exist in `$PROJECT`. If reusing a prior project, choose a new filename and record it before typing.
- Save the before snapshot with the helper. Record its task IDs and conversation ID.

- **Request.** Click the native composer and type `请直接执行这个小任务：在当前项目创建 .dori/chat-smoke/feature-map.txt，内容必须是 HERDR_FEATURE_MAP_OK 加一个换行。然后在终端运行 cat .dori/chat-smoke/feature-map.txt 验证。只用一个 Codex worker，不要委派其他代理。完成后报告实际结果与验证命令。`. Capture the populated composer and press Enter. For button coverage, repeat in a separate completed run with a new filename and click **发送 ↑**.
- **Dispatch.** Observe a task acknowledgment in chat, a new task entry in the original Agents sidebar, and a new named native task tab. Run the read-only helper into `$EVIDENCE/dispatched`. Compare task IDs with before. Exactly one new task must belong to the same conversation and `$PROJECT`. Record its `threadId`, `terminal`, and `tab`.
- **Open the execution.** Click that task's original sidebar entry using native computer use. Capture the real Codex TUI, its task prompt, and execution output. Save `hc get "$TASK_TERMINAL" --json` and `hc read "$TASK_TERMINAL" --lines 100`. The terminal must belong to the recorded task and resume its recorded thread. Confirm `hc ls --json --label "dori.chat.task=$TASK_ID"` contains exactly one terminal. If the task already completed, inspect its terminal history before continuing. Return to chat, then also click its native task tab and confirm the same terminal.
- **Read the effect.** Run `cat "$PROJECT/.dori/chat-smoke/feature-map.txt"` through the verifier's read-only shell and save its output. It must contain `HERDR_FEATURE_MAP_OK` and a newline. Compare this with the worker's `cat` command in terminal history. A file without terminal execution evidence is incomplete proof.
- **Receive the result.** Click **聊天工作台** and scroll to the latest response. Capture the task result and its actual checks. Save the helper output into `$EVIDENCE/completed`. The new task's completed turn must have exactly one matching chat result, whose ID includes that task ID and turn ID. The visible text must match the worker's actual outcome.
- **Finish.** Record `task-native-request`, `task-single-worker`, `task-sidebar`, `task-execution`, and `task-chat-result` separately in `actions.md`. Continue with the terminal-control journey before killing the worker, or run Cleanup.

## Gotchas

- When following the user's request for the official Herdr driver, the [documented mod command](../../../../docs/herdr-chat.md) submits the same prompt through the chat view's send handler. Continue with `agent.focus`, `hc get`, `hc read`, and `hc wait`. Keep the original task identity and result checks. Label this a command-driven live pass, and leave composer typing, button, and sidebar-click coverage separate.

- This entire journey is mandatory. A direct `hc run`, POST `/send`, copied output, or independently launched Codex session cannot replace it.
- A chat acknowledgment proves dispatch acceptance, not task completion. A `completed` turn can contain an unsuccessful result.
- A missing original-sidebar entry is a failure. A working native task tab does not replace the required sidebar journey.
- The configured worker permission policy may require approval. Continue through the terminal-control approval steps, or report a blocked task. Do not silently relax the policy.
- One active or disconnected task blocks another task for the same project. Finish or resolve the existing worker before repeating the journey.
