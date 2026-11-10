---------------------------- MODULE Ownership ----------------------------
EXTENDS Naturals
CONSTANTS AnswerWorkerApproval, ApproveChat, AdmitDisconnected
VARIABLES phase, workerAnswer, chatAnswer, connected, admitted
vars == <<phase, workerAnswer, chatAnswer, connected, admitted>>
Init == /\ phase = "connected" /\ workerAnswer = "none" /\ chatAnswer = "none"
        /\ connected = TRUE /\ admitted = FALSE
WorkerApproval == /\ phase = "connected" /\ phase' = "workerApproval"
                  /\ workerAnswer' = IF AnswerWorkerApproval THEN "approve" ELSE "none"
                  /\ UNCHANGED <<chatAnswer, connected, admitted>>
ChatApproval == /\ phase = "workerApproval" /\ phase' = "chatApproval"
                /\ chatAnswer' = IF ApproveChat THEN "approve" ELSE "decline"
                /\ UNCHANGED <<workerAnswer, connected, admitted>>
Disconnect == /\ phase = "chatApproval" /\ phase' = "disconnected" /\ connected' = FALSE
              /\ UNCHANGED <<workerAnswer, chatAnswer, admitted>>
Send == /\ phase = "disconnected" /\ phase' = "done" /\ admitted' = AdmitDisconnected
        /\ UNCHANGED <<workerAnswer, chatAnswer, connected>>
Done == /\ phase = "done" /\ UNCHANGED vars
Next == WorkerApproval \/ ChatApproval \/ Disconnect \/ Send \/ Done
TerminalOwnsWorkerApproval == workerAnswer = "none"
ChatNeverApproves == chatAnswer # "approve"
DisconnectedRejectsNewWork == ~connected => ~admitted
=============================================================================
