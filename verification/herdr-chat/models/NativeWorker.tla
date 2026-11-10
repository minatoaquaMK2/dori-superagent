--------------------------- MODULE NativeWorker ---------------------------
EXTENDS Naturals
CONSTANTS ReleaseOnStop, ReportPartial, DuplicateResult, ReplayUnknown
VARIABLES phase, open, held, idle, launches, reports, crashed, replayedUnknown
vars == <<phase, open, held, idle, launches, reports, crashed, replayedUnknown>>
Init == /\ phase = "intent" /\ open = TRUE /\ held = TRUE /\ idle = FALSE
        /\ launches = 0 /\ reports = 0 /\ crashed = FALSE /\ replayedUnknown = FALSE
SaveAttempt == /\ phase = "intent" /\ phase' = "attempted"
               /\ UNCHANGED <<open, held, idle, launches, reports, crashed, replayedUnknown>>
Launch == /\ phase = "attempted" /\ phase' = "running" /\ launches' = 1
          /\ UNCHANGED <<open, held, idle, reports, crashed, replayedUnknown>>
PartialStop == /\ phase = "running" /\ phase' = "background"
               /\ reports' = IF ReportPartial THEN 1 ELSE 0
               /\ UNCHANGED <<open, held, idle, launches, crashed, replayedUnknown>>
FullStop == /\ phase \in {"running", "background"} /\ phase' = "reported"
            /\ idle' = TRUE /\ reports' = 1 /\ held' = ~ReleaseOnStop
            /\ UNCHANGED <<open, launches, crashed, replayedUnknown>>
DuplicateStop == /\ phase = "reported" /\ reports < 2
                 /\ reports' = IF DuplicateResult THEN reports + 1 ELSE reports
                 /\ UNCHANGED <<phase, open, held, idle, launches, crashed, replayedUnknown>>
Crash == /\ phase \in {"intent", "attempted", "running", "background", "reported"} /\ ~crashed
         /\ phase' = (IF phase = "intent" THEN "unstarted" ELSE "unknown") /\ crashed' = TRUE
         /\ UNCHANGED <<open, held, idle, launches, reports, replayedUnknown>>
RecoverUnstarted == /\ phase = "unstarted" /\ phase' = "closed" /\ open' = FALSE /\ held' = FALSE
                    /\ UNCHANGED <<idle, launches, reports, crashed, replayedUnknown>>
Replay == /\ phase = "unknown" /\ launches < 2 /\ ReplayUnknown /\ launches' = launches + 1
          /\ replayedUnknown' = TRUE
          /\ UNCHANGED <<phase, open, held, idle, reports, crashed>>
ObservedExit == /\ phase \in {"running", "background", "reported", "unknown"}
                /\ phase' = "closed" /\ open' = FALSE /\ held' = FALSE
                /\ UNCHANGED <<idle, launches, reports, crashed, replayedUnknown>>
Done == UNCHANGED vars
Next == SaveAttempt \/ Launch \/ PartialStop \/ FullStop \/ DuplicateStop \/ Crash
        \/ RecoverUnstarted \/ Replay \/ ObservedExit \/ Done
OpenTerminalRetainsProject == open => held
OnlyQuiescentResult == reports > 0 => idle
NativeResultOnce == reports <= 1
UnknownLaunchNotReplayed == ~replayedUnknown /\ launches <= 1
=============================================================================
