# Ledger

TLC reached 15 states and 17 steps. The chart draws 8 states and 8 arrows.
The chart does not draw 4 steps that stay in one chart state.

## IntentBeforeEffect breaks
The shortest path has 2 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Started without durable intent

## OutcomePreserved breaks
The shortest path has 4 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Started without durable intent
3. worker finishes: Started without durable intent
4. return outcome to chat: Started without durable intent; Wrong outcome

## ResultReportedOnce breaks
The shortest path has 5 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Started without durable intent
3. worker finishes: Started without durable intent
4. return outcome to chat: Started without durable intent
5. same completion arrives again: Started without durable intent; Duplicated result

## CallStartsOnce breaks
The shortest path has 6 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Started without durable intent
3. worker finishes: Started without durable intent
4. return outcome to chat: Started without durable intent
5. same completion arrives again: Started without durable intent; Duplicated result
6. same tool call arrives again: Started without durable intent; Repeated worker launch; Duplicated result

## Rules that hold
NoDeadlock
