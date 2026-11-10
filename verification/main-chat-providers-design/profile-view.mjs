export const title = "CLI, model, and reasoning effort are one profile";
const valid = (p) => (Array.isArray(p) ? p : [p[1], p[2], p[3]]);
const isValid = (p) => {
  const [cli, model, effort] = valid(p);
  if (cli === "none") return true;
  return (
    (cli === "codex" && model === "C1" && ["high", "low"].includes(effort)) ||
    (cli === "antigravity" && model === "A1" && ["high", "low"].includes(effort)) ||
    (cli === "devin" && ((model === "D1" && effort === "high") || (model === "D2" && effort === "unsupported")))
  );
};
export const state = (v) =>
  (valid(v.proposed)[0] === "none" ? "配置已确认" : "校验 CLI、模型和强度") +
  (!isValid(v.selected) ? "（无效组合）" : "") +
  (JSON.stringify(v.task) !== JSON.stringify(v.origin) ? "（旧任务被改写）" : "") +
  (!isValid(v.task) ? "（执行配置无效）" : "");
export const step = (a) =>
  ({
    Choose: "选择配置",
    Accept: "接受配置",
    Reject: "拒绝不支持的组合，保留原配置",
    Dispatch: "将本轮配置固定到新任务",
    Wait: "保持配置",
  })[a] ?? a;
