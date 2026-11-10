export const title = "Worker dispatch and recovery";
export function state(v) {
  const broken = [];
  const outcome = ["completed", "failed", "interrupted"].includes(v.remoteTurn);
  if (v.pc === "recovered" && v.remoteTurn === "none" && (v.threadSaved || !v.attempted) && v.status !== "failed")
    broken.push("Empty task still blocks project");
  if (v.pc === "recovered" && v.attempted && !v.threadSaved && v.status !== "disconnected")
    broken.push("Unknown identity released");
  if (v.attempted && v.remoteTurn !== "none" && !v.terminalExists) broken.push("Turn ran before terminal");
  if (v.pc === "recovered" && outcome && v.status !== "finished") broken.push("Known outcome still blocked");
  if (v.status === "finished" && !outcome) broken.push("Invented completion");
  if (broken.length) return broken.join("; ");
  if (v.pc === "legacy") return "Old bridge saved a result as disconnected";
  if (v.pc === "recovered") {
    if (v.attempted && !v.threadSaved)
      return v.status === "disconnected" ? "Launch identity unknown; project reserved" : "Unknown launch released";
    if (v.remoteTurn === "none")
      return v.status === "failed" ? "No turn ran; project released" : "No turn ran; project blocked";
    if (v.remoteTurn === "inProgress")
      return v.status === "running" ? "Worker resumed" : "Worker outcome remains unknown";
    return v.status === "finished" ? "Known result restored" : "Known result; project blocked";
  }
  if (v.pc === "crashed") {
    if (v.remoteTurn === "none") return "Bridge stopped before a turn";
    if (v.remoteTurn === "inProgress") return "Bridge stopped while worker runs";
    return "Bridge stopped; worker has an outcome";
  }
  if (v.pc === "failed") {
    if (v.status === "finished")
      return v.reported ? "Result returned; terminal unavailable" : "Unknown result labeled finished";
    return v.reported ? "Terminal failure hid a known result" : "Terminal unavailable; outcome unknown";
  }
  if (v.reported) return "Result returned to chat";
  if (v.pc === "idle") return "No task";
  if (v.pc === "intent" || v.pc === "attempted") return "Dispatch intent saved";
  if (v.pc === "threadMade" || v.pc === "threadSaved") return "Worker thread created";
  if (v.pc === "terminalMade" || v.pc === "terminalSaved") return "Native terminal created";
  return "Worker running";
}
export const step = (action) =>
  ({
    SaveIntent: "dispatch task",
    SaveAttempt: "save launch attempt before contacting Codex",
    CreateThread: "Codex creates thread",
    SaveThread: "save thread identity",
    StartTurn: "Codex starts turn",
    SaveTurn: "save start response",
    CreateTerminal: "Herdr creates terminal",
    SaveTerminal: "save terminal address",
    TerminalFailure: "terminal attachment or start acknowledgement fails",
    Complete: "Codex returns an outcome",
    Crash: "bridge process stops",
    Recover: "restart bridge and resume history",
    RecoverIncomplete: "restart finds an incomplete turn or terminal attachment fails",
    Done: "wait",
  })[action] ?? action;
