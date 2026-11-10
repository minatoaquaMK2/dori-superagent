# ProviderSwitch

TLC reached 44 states and 148 steps. The chart draws 7 states and 12 arrows.
The chart does not draw 76 steps that stay in one chart state.

## NoStaleTools breaks
The shortest path has 4 steps:
0. 可发送或切换
1. 选择另一个 CLI: 连接新 CLI
2. 连接成功后切换: 可发送或切换
3. 发送消息: 正在回复
4. 误接收旧会话的延迟工具调用: 正在回复（误接收旧会话工具）

## Rules that hold
TypeOK, NoRetargetedRequest, NoSwitchWithPendingWork, NoDeadlock
