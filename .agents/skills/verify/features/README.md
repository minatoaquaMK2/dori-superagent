# Herdr chat feature map

This is the maintained verification map for the native Herdr chat workbench. Read [the driver](../SKILL.md) first. Each feature pairs user actions with observable evidence. The [source map](../../../../docs/herdr-chat-feature-map.md) identifies implementation and protocol coverage.

## Baseline preconditions

- One driver owns the Herdr window. Use an isolated project and `DORI_DESKTOP_HOME`, or explicitly record reuse of a session-owned instance.
- Codex is signed in, the project directory exists, and Doctor matches the visible **聊天工作台** tab.
- Record the current task IDs before dispatch. Do not dispatch into a project with an active or uncertain worker.
- Capture evidence outside runtime state. Do not copy `connection.json`, which contains the bearer token.

## Driving conventions

- Follow the driver's choice between official Herdr commands and authorized native input. Record them as separate entry points. Native input verification drives the composer, scenario choices, tabs, and terminal input from the current screen.
- Use `herdr-app shot` for frames, `hc read` and `hc get` for terminal evidence, and the read-only helper for chat state.
- Keep the exact prompt in `actions.md`. A backend request cannot substitute for native input.
- Reuse the worker created by task dispatch for terminal continuation. An independently launched Codex terminal cannot prove the chat dispatch path.
- Scroll manually to the entry being checked. Observe generated labels before clicking them.

## Proof and skip reporting

Record a status for each sub-feature and entry point. Use `live pass`, `failed`, `blocked`, `not run`, `protocol only`, or `source only`. Include the evidence path or the unmet precondition. No entry in this index is a claim that a particular run passed.

An absent approval prompt is an unmet precondition for approval verification. A disconnected backend is a failure to run ordinary chat, and can be valid evidence only for a recovery journey. Never weaken a journey or relabel a mock as native proof.

## Features

| Journey | Required proof |
| --- | --- |
| [CLI, model, and reasoning effort](profile-selection.md) | Real catalogs, effort inside the model menu, draft preservation, busy lock, durable preferences, and worker profile inheritance. |
| [Native conversation](native-conversation.md) | Enter and button submission, continuation, reopening, and persisted transcript. |
| [Task dispatch and results](task-dispatch.md) | Native chat request, one new Codex worker in the original sidebar, its actual terminal execution, the file effect, and the returned chat result. Mandatory for task dispatch changes. |
| [Terminal continuation and approval](terminal-control.md) | Original sidebar and task-tab navigation, live worker states, another turn in the same thread, returned result, and approval ownership when a real prompt occurs. |
| [Selectable explanation](selectable-explanation.md) | Model-generated scenarios, real native scenario clicks, and changed visible content. |
| [Recovery and duplicate prevention](recovery.md) | Owned-process restart or disconnect, preserved identities and transcript, no replay, and truthful unresolved status. |
