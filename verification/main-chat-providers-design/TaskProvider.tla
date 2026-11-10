----------------------------- MODULE TaskProvider -----------------------------
EXTENDS Naturals, TLC
CONSTANT RetargetOnSwitch, DuplicateReport, ReplayUnknown
VARIABLES selected, switched, phase, origin, worker, launches, reports, originChat, reportChat
vars == <<selected, switched, phase, origin, worker, launches, reports, originChat, reportChat>>
Providers == {"codex", "antigravity", "devin"}
Init == /\ selected = "codex" /\ switched = FALSE /\ phase = "empty"
        /\ origin = "none" /\ worker = "none" /\ launches = 0 /\ reports = 0
        /\ originChat = "chat-A" /\ reportChat = "none"
Reserve == /\ phase = "empty" /\ phase' = "reserved"
           /\ origin' = selected /\ worker' = selected
           /\ UNCHANGED <<selected, switched, launches, reports, originChat, reportChat>>
Launch == /\ phase = "reserved" /\ launches = 0 /\ phase' = "running" /\ launches' = 1
          /\ UNCHANGED <<selected, switched, origin, worker, reports, originChat, reportChat>>
LoseAck == /\ phase = "reserved" /\ launches = 0 /\ phase' = "unknown" /\ launches' = 1
           /\ UNCHANGED <<selected, switched, origin, worker, reports, originChat, reportChat>>
Disconnect == /\ phase = "running" /\ phase' = "unknown"
              /\ UNCHANGED <<selected, switched, origin, worker, launches, reports, originChat, reportChat>>
ObserveRunning == /\ phase = "unknown" /\ phase' = "running"
                  /\ UNCHANGED <<selected, switched, origin, worker, launches, reports, originChat, reportChat>>
Report == /\ phase \in {"running", "unknown"} /\ phase' = "finished"
          /\ reports' = 1 /\ reportChat' = originChat
          /\ UNCHANGED <<selected, switched, origin, worker, launches, originChat>>
Switch(p) == /\ ~switched /\ p \in Providers \ {selected}
             /\ switched' = TRUE /\ selected' = p
             /\ worker' = IF RetargetOnSwitch /\ worker # "none" THEN p ELSE worker
             /\ UNCHANGED <<phase, origin, launches, reports, originChat, reportChat>>
RepeatTool == /\ phase # "empty" /\ UNCHANGED vars
RepeatReport == /\ phase = "finished" /\ reports < 2
                /\ reports' = IF DuplicateReport THEN reports + 1 ELSE reports
                /\ UNCHANGED <<selected, switched, phase, origin, worker, launches, originChat, reportChat>>
Replay == /\ ReplayUnknown /\ phase = "unknown" /\ launches = 1
          /\ launches' = 2
          /\ UNCHANGED <<selected, switched, phase, origin, worker, reports, originChat, reportChat>>
Wait == UNCHANGED vars
Next == Reserve \/ Launch \/ LoseAck \/ Disconnect \/ ObserveRunning \/ Report
        \/ (\E p \in Providers: Switch(p)) \/ RepeatTool \/ RepeatReport \/ Replay \/ Wait
TypeOK == /\ selected \in Providers /\ switched \in BOOLEAN
          /\ phase \in {"empty", "reserved", "running", "unknown", "finished"}
          /\ origin \in Providers \cup {"none"} /\ worker \in Providers \cup {"none"}
          /\ launches \in 0..2 /\ reports \in 0..2
          /\ originChat = "chat-A" /\ reportChat \in {"none", "chat-A"}
WorkerFollowsOrigin == worker = origin
AtMostOneLaunch == launches <= 1
AtMostOneReport == reports <= 1
ResultReturnsToOrigin == reports > 0 => reportChat = originChat
UnknownDoesNotInventCompletion == phase = "unknown" => reports = 0
Spec == Init /\ [][Next]_vars
=============================================================================
