export const title = "Native worker result and project ownership";
export function state(v) {
  const broken = [];
  if (v.replayedUnknown || v.launches > 1) broken.push("Unknown launch replayed");
  if (v.reports > 1) broken.push("Turn returned twice");
  if (v.reports > 0 && !v.idle) broken.push("Background work reported complete");
  if (v.open && !v.held) broken.push("Open terminal lost project");
  if (broken.length) return broken.join("; ");
  return {
    intent: "Task reserved",
    attempted: "Launch attempted",
    running: "Native CLI running",
    background: "Background work still active",
    reported: "Result returned; terminal keeps project",
    unstarted: "Bridge stopped before launch",
    unknown: "Launch or terminal state unknown",
    closed: "Terminal closed; project released",
  }[v.phase];
}
export const step = (action) =>
  ({
    SaveAttempt: "save launch attempt",
    Launch: "Herdr starts interactive CLI",
    PartialStop: "non-idle Stop arrives",
    FullStop: "final Stop arrives",
    DuplicateStop: "same turn reports again",
    Crash: "bridge stops",
    RecoverUnstarted: "restart finds no launch attempt",
    Replay: "retry an unknown launch",
    ObservedExit: "owned terminal is confirmed closed",
    Done: "wait",
  })[action] ?? action;
