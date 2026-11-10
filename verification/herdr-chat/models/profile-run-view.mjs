export const title = "Accepted profile and scoped host operation";
export function state(v) {
  const broken = [];
  if (v.selected[2] === "C2-no-effort") broken.push("Unsupported model effort");
  if (v.phase === "running" && JSON.stringify(v.selected) !== JSON.stringify(v.origin))
    broken.push("Selection changed during reply");
  if (v.worker[1] !== "none" && JSON.stringify(v.worker) !== JSON.stringify(v.origin)) broken.push("Worker retargeted");
  if (v.effects > 1) broken.push("Repeated operation effects");
  if (v.staleEffect) broken.push("Inactive reply created work");
  if (broken.length) return broken.join("; ");
  if (v.phase === "idle") return v.switched ? "New profile selected" : "Composer ready";
  if (v.phase === "running") return v.receipt ? "Reply running; task identity saved" : "Reply uses accepted profile";
  if (v.phase === "unknown")
    return v.receipt ? "Reply disconnected; receipt retained" : "Reply disconnected; new effects denied";
  if (!v.receipt) return "Reply finished without a task";
  return JSON.stringify(v.selected) !== JSON.stringify(v.origin)
    ? "Task keeps origin after selection changes"
    : "Reply finished; receipt retained";
}
export const step = (action) =>
  ({
    Choose: "choose CLI, model and effort",
    Accept: "send message",
    Tool: "dispatch with accepted profile",
    Finish: "reply ends",
    Disconnect: "provider session closes",
    StaleTool: "late operation tries to create work",
    Retry: "same operation retries",
    Done: "wait",
  })[action] ?? action;
