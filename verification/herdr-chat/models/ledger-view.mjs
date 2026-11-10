export const title = "One dispatch identity and one returned outcome";
export function state(v) {
  if (v.phase === "intent") return v.durable ? "Intent saved" : "Intent missing";
  if (v.phase === "working") return v.durable ? "One worker started" : "Worker started without saved intent";
  if (v.phase === "result") return `Worker returned ${v.sourceOutcome}`;
  if (v.phase === "reported")
    return v.sourceOutcome === v.shownOutcome
      ? `Chat shows ${v.shownOutcome} once`
      : `Chat mislabeled ${v.sourceOutcome}`;
  if (v.phase === "duplicate")
    return v.reports === 1 ? `Repeated ${v.shownOutcome} ignored` : "Result duplicated in context";
  if (v.phase === "done")
    return v.starts === 1 ? `Repeated dispatch ignored; ${v.shownOutcome}` : "Repeated dispatch started another worker";
  return "No dispatch";
}
export const step = (action) =>
  ({
    SaveIntent: "save task",
    RequestThread: "start worker",
    WorkerFinishes: "worker finishes",
    Report: "return outcome to chat",
    DuplicateResult: "same completion arrives again",
    DuplicateCall: "same tool call arrives again",
    Done: "wait",
  })[action] ?? action;
