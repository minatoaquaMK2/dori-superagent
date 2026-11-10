# Native conversation

The user types in a native chat composer, continues the same conversation, and returns to saved messages after reopening the workbench.

## Sub-features

- `chat-enter` submits a message with Enter.
- `chat-button` submits through **发送 ↑**.
- `chat-multiline` keeps Shift+Enter inside the draft.
- `chat-continuation` uses a fact from an earlier message.
- `chat-persistence` preserves the transcript when the chat tab is reopened.
- `chat-stop` interrupts a chat reply through **停止回复**.

## How to get to it (user POV)

- Open **聊天工作台** with `bun run desktop:install "$PROJECT"`.
- Return to its existing native tab after viewing a task terminal.
- Close only the scratch chat tab and run the installer again to reopen it.

## Driving it with native computer use

Preconditions:

- Launch and Doctor from the driver succeed. No task is active in this scratch project.
- Save the before snapshot and task IDs.

- **Enter.** Click the composer and type `请记住本轮校验口令 MAP_NATIVE_01。只回复已记住，不要派任务。`. Capture the populated composer, then press Enter. Observe one user entry, a Codex reply, and no new task.
- **Multiline.** Type `请复述刚才的校验口令。`, press Shift+Enter, and type `不要派任务。`. Before submission, capture the two-line draft and confirm no new user entry exists.
- **Button.** Click **发送 ↑**. Observe the reply containing `MAP_NATIVE_01` and exactly one new user entry. Save a snapshot with the read-only helper.
- **Return.** Click another existing native tab, then **聊天工作台**. The previous messages remain visible after manual scrolling.
- **Reopen.** Close only this scratch chat tab using its native tab menu. Run `bun run desktop:install "$PROJECT"` again. Doctor must identify the same conversation. Capture the reopened transcript and compare entry IDs with the saved snapshot. Reopening must not append another copy of either user message.
- **Stop.** In a separate attempt, request a long explanation and click **停止回复** while it is visibly generating. Capture the in-progress and stopped states. Confirm the chat can accept a subsequent short question. If the reply finishes before the click, record that the interrupt entry point was not exercised.

## Gotchas

- Reopening a tab proves persisted transcript rendering. Bridge restart persistence is a separate recovery journey.
- The UI shows the latest 200 entries, while the stored transcript retains older entries. Use this short conversation for visible comparisons.
- The transcript does not automatically scroll to the latest entry. Scroll before deciding a response is missing.
- **停止回复** does not cancel a worker task. Use its Codex terminal for that.
