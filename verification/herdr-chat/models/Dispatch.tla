---------------------------- MODULE Dispatch ----------------------------
EXTENDS Naturals, TLC
CONSTANT FixEmptyRecovery, FixFinishedRecovery, InventCompletionOnFailure, PreserveFinishedOnFailure, IncludeLegacyState,
         ForgetAttempt, StartBeforeTerminal
VARIABLES pc, attempted, threadSaved, remoteTurn, status, reported, terminalExists
vars == <<pc, attempted, threadSaved, remoteTurn, status, reported, terminalExists>>
Outcomes == {"completed", "failed", "interrupted"}
Fresh == /\ pc = "idle" /\ attempted = FALSE /\ threadSaved = FALSE /\ remoteTurn = "none"
        /\ status = "absent" /\ reported = FALSE /\ terminalExists = FALSE
Legacy == /\ IncludeLegacyState /\ pc = "legacy" /\ attempted = FALSE /\ threadSaved = TRUE
          /\ remoteTurn \in Outcomes /\ status = "disconnected"
          /\ reported = TRUE /\ terminalExists = FALSE
Init == Fresh \/ Legacy
SaveIntent == /\ pc = "idle" /\ pc' = "intent" /\ status' = "launching"
              /\ UNCHANGED <<attempted, threadSaved, remoteTurn, reported, terminalExists>>
SaveAttempt == /\ pc = "intent" /\ pc' = "attempted" /\ attempted' = TRUE
               /\ UNCHANGED <<threadSaved, remoteTurn, status, reported, terminalExists>>
CreateThread == /\ pc = "attempted" /\ pc' = "threadMade"
                /\ UNCHANGED <<attempted, threadSaved, remoteTurn, status, reported, terminalExists>>
SaveThread == /\ pc = "threadMade" /\ pc' = "threadSaved" /\ threadSaved' = TRUE
              /\ UNCHANGED <<attempted, remoteTurn, status, reported, terminalExists>>
StartTurn == /\ (pc = "terminalSaved" \/ (StartBeforeTerminal /\ pc = "threadSaved"))
             /\ pc' = "turnMade" /\ remoteTurn' = "inProgress"
             /\ UNCHANGED <<attempted, threadSaved, status, reported, terminalExists>>
SaveTurn == /\ pc = "turnMade" /\ pc' = "ready"
            /\ status' = IF status = "launching" THEN "running" ELSE status
            /\ UNCHANGED <<attempted, threadSaved, remoteTurn, reported, terminalExists>>
CreateTerminal == /\ pc = "threadSaved" /\ pc' = "terminalMade" /\ terminalExists' = TRUE
                  /\ UNCHANGED <<attempted, threadSaved, remoteTurn, status, reported>>
SaveTerminal == /\ pc = "terminalMade" /\ pc' = "terminalSaved"
                /\ UNCHANGED <<attempted, threadSaved, remoteTurn, status, reported, terminalExists>>
TerminalFailure == /\ pc \in {"threadSaved", "terminalMade", "terminalSaved", "turnMade"} /\ pc' = "failed"
                   /\ status' = IF InventCompletionOnFailure THEN "finished"
                                ELSE IF PreserveFinishedOnFailure /\ status = "finished"
                                     THEN status ELSE "disconnected"
                   /\ UNCHANGED <<attempted, threadSaved, remoteTurn, reported, terminalExists>>
Complete == /\ remoteTurn = "inProgress"
            /\ pc \in {"turnMade", "ready", "failed", "crashed"}
            /\ remoteTurn' \in Outcomes
            /\ status' = IF pc = "crashed" THEN status ELSE "finished"
            /\ reported' = IF pc = "crashed" THEN reported ELSE TRUE
            /\ UNCHANGED <<pc, attempted, threadSaved, terminalExists>>
Crash == /\ pc \in {"intent", "attempted", "threadMade", "threadSaved", "turnMade", "terminalSaved", "terminalMade", "ready", "failed"}
         /\ pc' = "crashed"
         /\ UNCHANGED <<attempted, threadSaved, remoteTurn, status, reported, terminalExists>>
Recover == /\ pc \in {"crashed", "legacy"} /\ pc' = "recovered"
           /\ status' = IF ~threadSaved THEN IF attempted /\ ~ForgetAttempt THEN "disconnected" ELSE "failed"
                        ELSE IF remoteTurn = "none"
                             THEN IF FixEmptyRecovery THEN "failed" ELSE status
                        ELSE IF remoteTurn = "inProgress" THEN "running"
                        ELSE IF ~reported \/ FixFinishedRecovery THEN "finished" ELSE status
           /\ reported' = (reported \/ remoteTurn \in Outcomes)
           /\ terminalExists' = (terminalExists \/ (threadSaved /\ remoteTurn # "none"))
           /\ UNCHANGED <<attempted, threadSaved, remoteTurn>>
RecoverIncomplete == /\ pc = "crashed" /\ remoteTurn = "inProgress"
                     /\ pc' = "recovered" /\ status' = "disconnected"
                     /\ UNCHANGED <<attempted, threadSaved, remoteTurn, reported, terminalExists>>
Done == /\ pc \in {"idle", "ready", "failed", "recovered"} /\ UNCHANGED vars
Next == SaveIntent \/ SaveAttempt \/ CreateThread \/ SaveThread \/ StartTurn \/ SaveTurn \/ CreateTerminal
        \/ SaveTerminal \/ TerminalFailure \/ Complete \/ Crash \/ Recover \/ RecoverIncomplete \/ Done
RecoveredEmptyTaskReleased == pc = "recovered" /\ remoteTurn = "none" /\ (threadSaved \/ ~attempted) => status = "failed"
UnknownThreadIdentityHeld == pc = "recovered" /\ attempted /\ ~threadSaved => status = "disconnected"
TerminalBeforeTurn == attempted /\ remoteTurn # "none" => terminalExists
RecoveredOutcomeKnown == pc = "recovered" /\ remoteTurn \in Outcomes => status = "finished"
NoInventedCompletion == status = "finished" => remoteTurn \in Outcomes
=============================================================================
