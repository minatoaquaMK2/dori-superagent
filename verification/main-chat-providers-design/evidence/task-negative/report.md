# TaskProvider

TLC reached 48 states and 181 steps. The chart draws 19 states and 36 arrows.
The chart does not draw 95 steps that stay in one chart state.

## WorkerFollowsOrigin breaks
The shortest path has 2 steps:
0. 尚未派发
1. 保存派发意图: 已记录任务及 CLI
2. 切换 main chat 时错误改写任务 CLI: 已记录任务及 CLI（CLI 被改写）

## AtMostOneLaunch breaks
The shortest path has 3 steps:
0. 尚未派发
1. 保存派发意图: 已记录任务及 CLI
2. 启动发生但确认丢失: 执行状态未确认
3. 状态未知时错误重发执行: 执行状态未确认（重复执行）

## AtMostOneReport breaks
The shortest path has 4 steps:
0. 尚未派发
1. 保存派发意图: 已记录任务及 CLI
2. 创建原生终端并确认启动: 原生终端执行中
3. 收到可信的本轮结束记录: 结果已回到原聊天
4. 重复回调造成重复结果: 结果已回到原聊天（重复结果）

## Rules that hold
TypeOK, ResultReturnsToOrigin, UnknownDoesNotInventCompletion, NoDeadlock
