# Dispatch

TLC reached 87 states and 174 steps. The chart draws 22 states and 36 arrows.
The chart does not draw 75 steps that stay in one chart state.

## RecoveredOutcomeKnown breaks
The shortest path has 1 step:
0. Old bridge saved a result as disconnected
1. restart bridge and resume history: Known outcome still blocked

## UnknownThreadIdentityHeld breaks
The shortest path has 4 steps:
0. No task
1. dispatch task: Dispatch intent saved
2. save launch attempt before contacting Codex: Dispatch intent saved
3. bridge process stops: Bridge stopped before a turn
4. restart bridge and resume history: Unknown identity released

## TerminalBeforeTurn breaks
The shortest path has 5 steps:
0. No task
1. dispatch task: Dispatch intent saved
2. save launch attempt before contacting Codex: Dispatch intent saved
3. Codex creates thread: Worker thread created
4. save thread identity: Worker thread created
5. Codex starts turn: Turn ran before terminal

## NoInventedCompletion breaks
The shortest path has 5 steps:
0. No task
1. dispatch task: Dispatch intent saved
2. save launch attempt before contacting Codex: Dispatch intent saved
3. Codex creates thread: Worker thread created
4. save thread identity: Worker thread created
5. terminal attachment or start acknowledgement fails: Invented completion

## RecoveredEmptyTaskReleased breaks
The shortest path has 6 steps:
0. No task
1. dispatch task: Dispatch intent saved
2. save launch attempt before contacting Codex: Dispatch intent saved
3. Codex creates thread: Worker thread created
4. save thread identity: Worker thread created
5. bridge process stops: Bridge stopped before a turn
6. restart bridge and resume history: Empty task still blocks project

## Rules that hold
NoDeadlock
