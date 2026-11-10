# NativeWorker

TLC reached 31 states and 64 steps. The chart draws 15 states and 20 arrows.
The chart does not draw 40 steps that stay in one chart state.

## UnknownLaunchNotReplayed breaks
The shortest path has 3 steps:
0. Task reserved
1. save launch attempt: Launch attempted
2. bridge stops: Launch or terminal state unknown
3. retry an unknown launch: Unknown launch replayed

## OpenTerminalRetainsProject breaks
The shortest path has 3 steps:
0. Task reserved
1. save launch attempt: Launch attempted
2. Herdr starts interactive CLI: Native CLI running
3. final Stop arrives: Open terminal lost project

## OnlyQuiescentResult breaks
The shortest path has 3 steps:
0. Task reserved
1. save launch attempt: Launch attempted
2. Herdr starts interactive CLI: Native CLI running
3. non-idle Stop arrives: Background work reported complete

## NativeResultOnce breaks
The shortest path has 4 steps:
0. Task reserved
1. save launch attempt: Launch attempted
2. Herdr starts interactive CLI: Native CLI running
3. final Stop arrives: Open terminal lost project
4. same turn reports again: Turn returned twice; Open terminal lost project

## Rules that hold
NoDeadlock
