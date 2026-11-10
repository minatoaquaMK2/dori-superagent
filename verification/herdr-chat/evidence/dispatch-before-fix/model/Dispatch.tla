---------------------------- MODULE Dispatch ----------------------------
EXTENDS Naturals, TLC
CONSTANT FixEmptyRecovery, FixFinishedRecovery
VARIABLES pc, threadSaved, remoteTurn, status, reported, terminalExists
vars == <<pc, threadSaved, remoteTurn, status, reported, terminalExists>>
Outcomes == {"completed", "failed", "interrupted"}
Init == /\ pc = "idle" /\ threadSaved = FALSE /\ remoteTurn = "none"
        /\ status = "absent" /\ reported = FALSE /\ terminalExists = FALSE
SaveIntent == /\ pc = "idle" /\ pc' = "intent" /\ status' = "launching"
              /\ UNCHANGED <<threadSaved, remoteTurn, reported, terminalExists>>
CreateThread == /\ pc = "intent" /\ pc' = "threadMade"
                /\ UNCHANGED <<threadSaved, remoteTurn, status, reported, terminalExists>>
SaveThread == /\ pc = "threadMade" /\ pc' = "threadSaved" /\ threadSaved' = TRUE
              /\ UNCHANGED <<remoteTurn, status, reported, terminalExists>>
StartTurn == /\ pc = "threadSaved" /\ pc' = "turnMade" /\ remoteTurn' = "inProgress"
             /\ UNCHANGED <<threadSaved, status, reported, terminalExists>>
SaveTurn == /\ pc = "turnMade" /\ pc' = "turnSaved"
            /\ status' = IF status = "launching" THEN "running" ELSE status
            /\ UNCHANGED <<threadSaved, remoteTurn, reported, terminalExists>>
CreateTerminal == /\ pc = "turnSaved" /\ pc' = "terminalMade" /\ terminalExists' = TRUE
                  /\ UNCHANGED <<threadSaved, remoteTurn, status, reported>>
SaveTerminal == /\ pc = "terminalMade" /\ pc' = "ready"
                /\ UNCHANGED <<threadSaved, remoteTurn, status, reported, terminalExists>>
TerminalFailure == /\ pc \in {"turnSaved", "terminalMade"} /\ pc' = "failed"
                   /\ status' = "disconnected"
                   /\ UNCHANGED <<threadSaved, remoteTurn, reported, terminalExists>>
Complete == /\ remoteTurn = "inProgress"
            /\ pc \in {"turnMade", "turnSaved", "terminalMade", "ready", "failed", "crashed"}
            /\ remoteTurn' \in Outcomes
            /\ status' = IF pc = "crashed" THEN status ELSE "finished"
            /\ reported' = IF pc = "crashed" THEN reported ELSE TRUE
            /\ UNCHANGED <<pc, threadSaved, terminalExists>>
Crash == /\ pc \in {"intent", "threadMade", "threadSaved", "turnMade", "turnSaved", "terminalMade", "ready", "failed"}
         /\ pc' = "crashed"
         /\ UNCHANGED <<threadSaved, remoteTurn, status, reported, terminalExists>>
Recover == /\ pc = "crashed" /\ pc' = "recovered"
           /\ status' = IF ~threadSaved THEN "failed"
                        ELSE IF remoteTurn = "none"
                             THEN IF FixEmptyRecovery THEN "failed" ELSE status
                        ELSE IF remoteTurn = "inProgress" THEN "running"
                        ELSE IF ~reported \/ FixFinishedRecovery THEN "finished" ELSE status
           /\ reported' = (reported \/ remoteTurn \in Outcomes)
           /\ terminalExists' = (terminalExists \/ (threadSaved /\ remoteTurn # "none"))
           /\ UNCHANGED <<threadSaved, remoteTurn>>
Done == /\ pc \in {"idle", "ready", "failed", "recovered"} /\ UNCHANGED vars
Next == SaveIntent \/ CreateThread \/ SaveThread \/ StartTurn \/ SaveTurn \/ CreateTerminal
        \/ SaveTerminal \/ TerminalFailure \/ Complete \/ Crash \/ Recover \/ Done
RecoveredEmptyTaskReleased == pc = "recovered" /\ remoteTurn = "none" => status = "failed"
RecoveredOutcomeKnown == pc = "recovered" /\ remoteTurn \in Outcomes => status = "finished"
NoInventedCompletion == status = "finished" => remoteTurn \in Outcomes
=============================================================================
