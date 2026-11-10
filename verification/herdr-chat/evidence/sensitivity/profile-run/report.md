# ProfileRun

TLC reached 176 states and 428 steps. The chart draws 32 states and 56 arrows.
The chart does not draw 217 steps that stay in one chart state.

## SelectedProfileValid breaks
The shortest path has 1 step:
0. Composer ready
1. choose CLI, model and effort: Unsupported model effort

## BusyProfileFrozen breaks
The shortest path has 2 steps:
0. Composer ready
1. send message: Reply uses accepted profile
2. choose CLI, model and effort: Selection changed during reply

## StaleRunCannotCreate breaks
The shortest path has 3 steps:
0. Composer ready
1. send message: Reply uses accepted profile
2. reply ends: Reply finished without a task
3. late operation tries to create work: Inactive reply created work

## WorkerFollowsAcceptedProfile breaks
The shortest path has 3 steps:
0. Composer ready
1. send message: Reply uses accepted profile
2. dispatch with accepted profile: Reply running; task identity saved
3. choose CLI, model and effort: Selection changed during reply; Worker retargeted

## HostEffectOnce breaks
The shortest path has 3 steps:
0. Composer ready
1. send message: Reply uses accepted profile
2. dispatch with accepted profile: Reply running; task identity saved
3. same operation retries: Repeated operation effects

## Rules that hold
NoDeadlock
