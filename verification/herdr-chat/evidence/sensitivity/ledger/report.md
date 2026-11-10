# Ledger

TLC reached 15 states and 17 steps. The chart draws 11 states and 12 arrows.
The chart does not draw 3 steps that stay in one chart state.

## IntentBeforeEffect breaks
The shortest path has 2 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Worker started without saved intent

## OutcomePreserved breaks
The shortest path has 4 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Worker started without saved intent
3. worker finishes: Worker returned failed
4. return outcome to chat: Chat mislabeled failed

## ResultReportedOnce breaks
The shortest path has 5 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Worker started without saved intent
3. worker finishes: Worker returned completed
4. return outcome to chat: Chat shows completed once
5. same completion arrives again: Result duplicated in context

## CallStartsOnce breaks
The shortest path has 6 steps:
0. No dispatch
1. save task: Intent missing
2. start worker: Worker started without saved intent
3. worker finishes: Worker returned completed
4. return outcome to chat: Chat shows completed once
5. same completion arrives again: Result duplicated in context
6. same tool call arrives again: Repeated dispatch started another worker

## Rules that hold
NoDeadlock
