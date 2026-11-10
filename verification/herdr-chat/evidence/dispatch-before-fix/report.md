# Dispatch

TLC reached 77 states and 152 steps. The chart draws 22 states and 33 arrows.
The chart does not draw 51 steps that stay in one chart state.

## RecoveredEmptyTaskReleased breaks
The shortest path has 5 steps:
0. No task
1. dispatch task: Intent saved
2. Codex creates thread: Thread created; identity not saved
3. save thread identity: Thread saved; no turn
4. bridge process stops: Bridge stopped; saved empty thread
5. restart bridge and resume history: No turn ran; project blocked

## RecoveredOutcomeKnown breaks
The shortest path has 9 steps:
0. No task
1. dispatch task: Intent saved
2. Codex creates thread: Thread created; identity not saved
3. save thread identity: Thread saved; no turn
4. Codex starts turn: Turn started; response pending
5. Codex returns an outcome: Result saved; terminal may be attaching
6. save start response: Result saved; terminal may be attaching
7. terminal attach fails: Terminal failed after result saved
8. bridge process stops: Bridge stopped; reported result marked disconnected
9. restart bridge and resume history: Known result; project blocked

## Rules that hold
NoInventedCompletion, NoDeadlock
