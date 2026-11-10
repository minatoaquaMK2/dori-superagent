# ProfileSelection

TLC reached 648 states, more than the chart budget of 500, so the chart draws only the bug paths: 5 states and 5 arrows.

## ValidProfile breaks
The shortest path has 2 steps:
0. 配置已确认
1. 选择配置: 校验 CLI、模型和强度
2. 接受配置: 配置已确认（无效组合）

## TaskProfileFrozen breaks
The shortest path has 3 steps:
0. 配置已确认
1. 将本轮配置固定到新任务: 配置已确认
2. 选择配置: 校验 CLI、模型和强度
3. 接受配置: 配置已确认（旧任务被改写）

## ValidWorkerProfile breaks
The shortest path has 3 steps:
0. 配置已确认
1. 选择配置: 校验 CLI、模型和强度
2. 接受配置: 配置已确认（无效组合）
3. 将本轮配置固定到新任务: 配置已确认（无效组合）（执行配置无效）

## Rules that hold
NoDeadlock
