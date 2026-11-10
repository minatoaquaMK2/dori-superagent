----------------------------- MODULE Ledger -----------------------------
EXTENDS Naturals
CONSTANTS SaveBeforeRequest, DeduplicateCall, DeduplicateResult, PreserveOutcome
VARIABLES phase, durable, starts, sourceOutcome, shownOutcome, reports, contexts
vars == <<phase, durable, starts, sourceOutcome, shownOutcome, reports, contexts>>
Outcomes == {"completed", "failed", "interrupted"}
Init == /\ phase = "new" /\ durable = FALSE /\ starts = 0
        /\ sourceOutcome = "none" /\ shownOutcome = "none" /\ reports = 0 /\ contexts = 0
SaveIntent == /\ phase = "new" /\ phase' = "intent" /\ durable' = SaveBeforeRequest
              /\ UNCHANGED <<starts, sourceOutcome, shownOutcome, reports, contexts>>
RequestThread == /\ phase = "intent" /\ phase' = "working" /\ starts' = starts + 1
                 /\ UNCHANGED <<durable, sourceOutcome, shownOutcome, reports, contexts>>
WorkerFinishes == /\ phase = "working" /\ phase' = "result" /\ sourceOutcome' \in Outcomes
                  /\ UNCHANGED <<durable, starts, shownOutcome, reports, contexts>>
Report == /\ phase = "result" /\ phase' = "reported"
          /\ reports' = reports + 1 /\ contexts' = contexts + 1
          /\ shownOutcome' = IF PreserveOutcome THEN sourceOutcome ELSE "completed"
          /\ UNCHANGED <<durable, starts, sourceOutcome>>
DuplicateResult == /\ phase = "reported" /\ phase' = "duplicate"
                   /\ reports' = IF DeduplicateResult THEN reports ELSE reports + 1
                   /\ contexts' = IF DeduplicateResult THEN contexts ELSE contexts + 1
                   /\ UNCHANGED <<durable, starts, sourceOutcome, shownOutcome>>
DuplicateCall == /\ phase = "duplicate" /\ phase' = "done"
                 /\ starts' = IF DeduplicateCall THEN starts ELSE starts + 1
                 /\ UNCHANGED <<durable, sourceOutcome, shownOutcome, reports, contexts>>
Done == /\ phase = "done" /\ UNCHANGED vars
Next == SaveIntent \/ RequestThread \/ WorkerFinishes \/ Report \/ DuplicateResult \/ DuplicateCall \/ Done
IntentBeforeEffect == starts > 0 => durable
CallStartsOnce == starts <= 1
ResultReportedOnce == reports <= 1 /\ contexts <= 1
OutcomePreserved == shownOutcome # "none" => shownOutcome = sourceOutcome
=============================================================================
