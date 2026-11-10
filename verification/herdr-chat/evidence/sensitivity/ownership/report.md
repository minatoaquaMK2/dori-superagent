# Ownership

TLC reached 5 states and 5 steps. The chart draws 4 states and 4 arrows.
The chart does not draw 1 steps that stay in one chart state.

## TerminalOwnsWorkerApproval breaks
The shortest path has 1 step:
0. Chat connected
1. worker asks for approval: Bridge answered worker approval

## ChatNeverApproves breaks
The shortest path has 2 steps:
0. Chat connected
1. worker asks for approval: Bridge answered worker approval
2. chat asks for approval: Bridge answered worker approval; Chat approved operation

## DisconnectedRejectsNewWork breaks
The shortest path has 4 steps:
0. Chat connected
1. worker asks for approval: Bridge answered worker approval
2. chat asks for approval: Bridge answered worker approval; Chat approved operation
3. transport closes: Bridge answered worker approval; Chat approved operation
4. user sends another message: Bridge answered worker approval; Chat approved operation; Disconnected message accepted

## Rules that hold
NoDeadlock
