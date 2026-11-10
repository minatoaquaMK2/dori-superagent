# CLI, model, and reasoning effort

The composer selects a main-chat CLI and a model. The model menu also contains the reasoning-effort choices supported by that model. A task inherits the profile of the request that dispatched it.

## Sub-features

- `profile-provider` selects Codex, Antigravity, or Devin when that adapter is available.
- `profile-model` selects a model from the actual provider catalog.
- `profile-effort` selects effort inside the model menu.
- `profile-draft` keeps unsent text when the selection changes or a configuration request fails.
- `profile-busy` prevents switching while a main reply, queued request, or unresolved send exists.
- `profile-origin` preserves a worker's original CLI, model, and effort after a later chat selection.
- `profile-unavailable` shows a concrete capability failure and does not substitute another CLI.

## Native journey

1. Open the scratch project's **聊天工作台**. Save the snapshot, selected profile, catalog revision, and existing task IDs.
2. Put an unsent marker in the composer. Open the CLI menu, then the model menu. Capture both open menus. The reasoning-effort controls must appear inside the model menu.
3. Choose another supported effort. Confirm the composer still contains the marker and the saved selection contains that exact effort. Choose a model that lacks effort support, if the catalog has one. The menu must show that limitation instead of a fabricated setting.
4. Select another available CLI. Confirm its models and previous per-CLI preference. Keep the same visible transcript. Returning to the original CLI must restore a valid saved preference.
5. Send a request for a long explanation. During its reply, attempt a profile change. Confirm the profile remains unchanged. An additional queued request must retain the profile accepted when it was sent.
6. Run the complete [task journey](task-dispatch.md) for each available provider. Compare the persisted task origin, native launch settings, terminal model display, actual file, and one returned result. Antigravity and Devin workers must use the requested YOLO defaults without an approval action.
7. After dispatch, change the idle main chat to another supported profile. The existing worker must keep its original profile and return to the originating conversation.
8. Reopen the chat and restart only the owned bridge in the recovery journey. Confirm that the profile, transcript, and task origin survive. The restart must not repeat a prompt or create another worker.

## Capability failures and entry points

An unavailable provider stays visible with its actual reason. Record organization restrictions, missing CLI, sign-in failures, or failed capability checks as `blocked`. A grayed-out entry is not a successful provider conversation.

The official Herdr mod commands may exercise the same menu and selection handlers when the requested driver forbids pointer automation. Record this as command-driven coverage. It does not prove native clicks, keyboard navigation, or draft typing. Direct HTTP configuration tests remain protocol-only evidence.

Native Antigravity and Devin task sessions reserve the project while their terminals stay open. Close only an owned scratch worker before the next task in that project. A finished response is not evidence that its CLI session can no longer execute work.
