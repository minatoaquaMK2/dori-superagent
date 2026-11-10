--------------------------- MODULE ProviderSwitch ---------------------------
EXTENDS Integers, TLC
CONSTANT AcceptStale
VARIABLES phase, provider, epoch, target, queued, requestEpoch, acceptedEpoch
vars == <<phase, provider, epoch, target, queued, requestEpoch, acceptedEpoch>>
Providers == {"codex", "antigravity", "devin"}
Init == /\ phase = "ready" /\ provider = "codex" /\ epoch = 0
        /\ target = "none" /\ queued = FALSE
        /\ requestEpoch = -1 /\ acceptedEpoch = -1
Send == /\ phase = "ready" /\ phase' = "busy"
        /\ requestEpoch' = epoch /\ acceptedEpoch' = -1
        /\ UNCHANGED <<provider, epoch, target, queued>>
Queue == /\ phase = "busy" /\ ~queued /\ queued' = TRUE
         /\ UNCHANGED <<phase, provider, epoch, target, requestEpoch, acceptedEpoch>>
Finish == /\ phase = "busy"
          /\ phase' = IF queued THEN "busy" ELSE "ready"
          /\ queued' = FALSE /\ requestEpoch' = IF queued THEN epoch ELSE -1
          /\ UNCHANGED <<provider, epoch, target, acceptedEpoch>>
Disconnect == /\ phase = "busy" /\ phase' = "unknown"
              /\ UNCHANGED <<provider, epoch, target, queued, requestEpoch, acceptedEpoch>>
Reconcile == /\ phase = "unknown" /\ phase' = "ready"
             /\ queued' = FALSE /\ requestEpoch' = -1
             /\ UNCHANGED <<provider, epoch, target, acceptedEpoch>>
Choose(p) == /\ phase = "ready" /\ ~queued /\ epoch = 0 /\ p \in Providers \ {provider}
             /\ phase' = "switching" /\ target' = p
             /\ UNCHANGED <<provider, epoch, queued, requestEpoch, acceptedEpoch>>
Commit == /\ phase = "switching"
          /\ phase' = "ready" /\ provider' = target /\ target' = "none"
          /\ epoch' = epoch + 1 /\ acceptedEpoch' = -1
          /\ UNCHANGED <<queued, requestEpoch>>
FailSwitch == /\ phase = "switching" /\ phase' = "ready" /\ target' = "none"
              /\ UNCHANGED <<provider, epoch, queued, requestEpoch, acceptedEpoch>>
Tool(e) == /\ phase = "busy" /\ e \in 0..epoch
           /\ (e = epoch \/ AcceptStale)
           /\ acceptedEpoch' = e
           /\ UNCHANGED <<phase, provider, epoch, target, queued, requestEpoch>>
Wait == UNCHANGED vars
Next == Send \/ Queue \/ Finish \/ Disconnect \/ Reconcile
        \/ (\E p \in Providers: Choose(p)) \/ Commit \/ FailSwitch
        \/ (\E e \in 0..epoch: Tool(e)) \/ Wait
TypeOK == /\ phase \in {"ready", "busy", "unknown", "switching"}
          /\ provider \in Providers /\ epoch \in 0..1
          /\ target \in Providers \cup {"none"} /\ queued \in BOOLEAN
          /\ requestEpoch \in {-1, 0, 1} /\ acceptedEpoch \in {-1, 0, 1}
NoRetargetedRequest == requestEpoch = -1 \/ requestEpoch = epoch
NoSwitchWithPendingWork == phase = "switching" => (~queued /\ requestEpoch = -1)
NoStaleTools == acceptedEpoch = -1 \/ acceptedEpoch = epoch
Spec == Init /\ [][Next]_vars
=============================================================================
