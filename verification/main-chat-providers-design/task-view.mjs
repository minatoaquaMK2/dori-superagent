export const title = "Worker provider ownership";
export const state = (v) =>
  ({
    empty: "尚未派发",
    reserved: "已记录任务及 CLI",
    running: "原生终端执行中",
    unknown: "执行状态未确认",
    finished: "结果已回到原聊天",
  })[v.phase] +
  [v.worker !== v.origin && "CLI 被改写", v.launches > 1 && "重复执行", v.reports > 1 && "重复结果"]
    .filter(Boolean)
    .map((x) => `（${x}）`)
    .join("");
export const step = (a, from, to) => {
  if (a === "Switch")
    return to.worker !== from.worker ? "切换 main chat 时错误改写任务 CLI" : "切换 main chat，保留任务 CLI";
  if (a === "RepeatReport") return to.reports > from.reports ? "重复回调造成重复结果" : "重复结果保持不变";
  return (
    {
      Reserve: "保存派发意图",
      Launch: "创建原生终端并确认启动",
      LoseAck: "启动发生但确认丢失",
      Disconnect: "失去连接",
      ObserveRunning: "确认原任务仍在运行",
      Report: "收到可信的本轮结束记录",
      Replay: "状态未知时错误重发执行",
      RepeatTool: "重复派发请求返回原任务",
      Wait: "保持状态",
    }[a] ?? a
  );
};
