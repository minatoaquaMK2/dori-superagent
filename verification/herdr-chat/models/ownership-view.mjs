export const title = "Approval ownership and disconnected admission";
export const state = (v) =>
  ({
    connected: "Chat connected",
    workerApproval:
      v.workerAnswer === "none" ? "Worker waits for terminal approval" : "Bridge answered worker approval",
    chatApproval: v.chatAnswer === "decline" ? "Chat declined its approval" : "Chat approved an operation",
    disconnected: "Connection lost",
    done: v.admitted ? "Disconnected message accepted" : "Disconnected message rejected",
  })[v.phase];
export const step = (a) =>
  ({
    WorkerApproval: "worker asks for approval",
    ChatApproval: "chat asks for approval",
    Disconnect: "transport closes",
    Send: "user sends another message",
    Done: "wait",
  })[a] ?? a;
