--------------------------- MODULE ProfileSelection ---------------------------
EXTENDS Naturals, TLC
CONSTANT AdmitInvalid, RetargetTask
VARIABLES selected, proposed, task, origin
vars == <<selected, proposed, task, origin>>
NoProfile == <<"none", "none", "none">>
Profiles == {<<"codex", "C1", "high">>, <<"codex", "C1", "low">>,
             <<"antigravity", "A1", "high">>, <<"antigravity", "A1", "low">>,
             <<"devin", "D1", "high">>, <<"devin", "D2", "unsupported">>}
Invalid == {<<"devin", "C1", "high">>, <<"devin", "D2", "high">>}
Init == /\ selected = <<"codex", "C1", "high">>
        /\ proposed = NoProfile /\ task = NoProfile /\ origin = NoProfile
Choose(p) == /\ proposed = NoProfile /\ p \in Profiles \cup Invalid
             /\ proposed' = p /\ UNCHANGED <<selected, task, origin>>
Accept == /\ proposed # NoProfile /\ (proposed \in Profiles \/ AdmitInvalid)
          /\ selected' = proposed /\ proposed' = NoProfile
          /\ task' = IF RetargetTask /\ task # NoProfile THEN proposed ELSE task
          /\ UNCHANGED origin
Reject == /\ proposed \in Invalid /\ ~AdmitInvalid /\ proposed' = NoProfile
          /\ UNCHANGED <<selected, task, origin>>
Dispatch == /\ proposed = NoProfile /\ task = NoProfile
            /\ task' = selected /\ origin' = selected
            /\ UNCHANGED <<selected, proposed>>
Wait == UNCHANGED vars
Next == (\E p \in Profiles \cup Invalid: Choose(p)) \/ Accept \/ Reject \/ Dispatch \/ Wait
ValidProfile == selected \in Profiles
TaskProfileFrozen == task = origin
ValidWorkerProfile == task = NoProfile \/ task \in Profiles
Spec == Init /\ [][Next]_vars
=============================================================================
