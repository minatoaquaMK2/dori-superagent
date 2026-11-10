---------------------------- MODULE ProfileRun ----------------------------
EXTENDS Naturals
CONSTANTS AcceptInvalid, SwitchBusy, RetargetWorker, AllowStaleTool, RepeatEffect
VARIABLES phase, selected, origin, worker, switched, receipt, effects, staleEffect
vars == <<phase, selected, origin, worker, switched, receipt, effects, staleEffect>>
Profiles == {<<"codex", "C1", "low">>, <<"codex", "C1", "high">>,
             <<"antigravity", "A1", "low">>, <<"devin", "D1", "medium">>}
Invalid == <<"codex", "C2-no-effort", "high">>
Empty == <<"none", "none", "none">>
Init == /\ phase = "idle" /\ selected = <<"codex", "C1", "high">>
        /\ origin = Empty /\ worker = Empty /\ switched = FALSE
        /\ receipt = FALSE /\ effects = 0 /\ staleEffect = FALSE
Choose(p) == /\ ~switched /\ (phase \in {"idle", "finished"} \/ SwitchBusy)
             /\ p \in Profiles \cup {Invalid} /\ (p \in Profiles \/ AcceptInvalid)
             /\ selected' = p /\ switched' = TRUE
             /\ worker' = IF RetargetWorker /\ worker # Empty THEN p ELSE worker
             /\ UNCHANGED <<phase, origin, receipt, effects, staleEffect>>
Accept == /\ phase = "idle" /\ phase' = "running" /\ origin' = selected
          /\ UNCHANGED <<selected, worker, switched, receipt, effects, staleEffect>>
Tool == /\ phase = "running" /\ ~receipt
        /\ worker' = origin /\ receipt' = TRUE /\ effects' = effects + 1
        /\ UNCHANGED <<phase, selected, origin, switched, staleEffect>>
Finish == /\ phase = "running" /\ phase' = "finished"
          /\ UNCHANGED <<selected, origin, worker, switched, receipt, effects, staleEffect>>
Disconnect == /\ phase = "running" /\ phase' = "unknown"
              /\ UNCHANGED <<selected, origin, worker, switched, receipt, effects, staleEffect>>
StaleTool == /\ phase \in {"finished", "unknown"} /\ ~receipt /\ AllowStaleTool
             /\ worker' = origin /\ receipt' = TRUE /\ effects' = effects + 1 /\ staleEffect' = TRUE
             /\ UNCHANGED <<phase, selected, origin, switched>>
Retry == /\ receipt /\ effects < 2
         /\ effects' = IF RepeatEffect THEN effects + 1 ELSE effects
         /\ UNCHANGED <<phase, selected, origin, worker, switched, receipt, staleEffect>>
Done == UNCHANGED vars
Next == (\E p \in Profiles \cup {Invalid}: Choose(p)) \/ Accept \/ Tool \/ Finish \/ Disconnect \/ StaleTool \/ Retry \/ Done
SelectedProfileValid == selected \in Profiles
BusyProfileFrozen == phase = "running" => selected = origin
WorkerFollowsAcceptedProfile == worker = Empty \/ worker = origin
StaleRunCannotCreate == ~staleEffect
HostEffectOnce == effects <= 1
=============================================================================
