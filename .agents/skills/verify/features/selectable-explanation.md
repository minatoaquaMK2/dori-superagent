# Selectable explanation

The assistant generates an explanation with alternative scenarios. Native buttons switch the displayed summary, steps, and takeaway without executing generated UI code.

## Sub-features

- `explanation-generated` receives a real model-generated scenario card.
- `explanation-switch` switches between at least two visible scenarios.
- `explanation-content` displays each selected scenario's distinct explanation.
- `explanation-selection` lets the user select rendered explanation text.

## How to get to it (user POV)

- Ask for contrasting examples in **聊天工作台** through the native composer.
- Click a scenario's label in the returned explanation card.
- Drag across rendered explanation text to select it.

## Driving it with native computer use

Preconditions:

- Doctor succeeds and the chat is idle. Save a before snapshot and task count.

- **Ask.** Type `请用可切换的两个场景解释这个工作台如何处理请求：场景名用“普通问答”和“需要改代码”。每个场景给出不同的摘要、步骤和结论。使用交互说明卡片，不要执行任务。` in the native composer and press Enter. Capture the input and returned card.
- **Inspect.** Read the generated labels from the card and save the snapshot. Require an explanation entry with at least two scenarios. If only prose appears, report that this attempt did not produce the feature. Do not insert a synthetic card.
- **Switch.** Capture the first scenario's label, summary, steps, and takeaway. Click the second visible scenario button natively and capture it again. Verify the displayed content matches that second scenario in the read-only snapshot. Click the first button again and require the original content.
- **Select.** Drag across a visible paragraph and capture the text selection. This checks native selectable text, separately from scenario selection.
- **Check side effects.** Run the helper after the clicks. Require no new worker task. Record actual generated labels if the model used different wording.

## Gotchas

- The component supports two to five validated scenarios. It is not an arbitrary HTML or JavaScript renderer.
- Scenario selection is local view state. A bridge snapshot contains the card data, not proof that a native button was clicked.
- Scenario choice can reset when the mod reloads. Do not claim that selected choices persist across reopening.
- Long cards may require manual scrolling. Capture the chosen button and its changed content, not only a card title.
