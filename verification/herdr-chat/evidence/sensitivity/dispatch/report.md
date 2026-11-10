# Dispatch

TLC reached 70 states and 144 steps. The chart draws 17 states and 22 arrows.
The chart does not draw 35 steps that stay in one chart state.

## RecoveredOutcomeKnown breaks
The shortest path has 1 step:
0. Old bridge saved a result as disconnected
1. restart bridge and resume history: Known result; project blocked

## RecoveredEmptyTaskReleased breaks
The shortest path has 5 steps:
0. No task
1. dispatch task: Dispatch intent saved
2. Codex creates thread: Worker thread created
3. save thread identity: Worker thread created
4. bridge process stops: Bridge stopped before a turn
5. restart bridge and resume history: No turn ran; project blocked

## NoInventedCompletion breaks
The shortest path has 6 steps:
0. No task
1. dispatch task: Dispatch intent saved
2. Codex creates thread: Worker thread created
3. save thread identity: Worker thread created
4. Codex starts turn: Worker running
5. save start response: Worker running
6. terminal attach fails: Unknown result labeled finished

## Rules that hold
NoDeadlock
