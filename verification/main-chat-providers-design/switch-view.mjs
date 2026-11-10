export const title = "Main chat provider switching";
export const state = (v) =>
  ({ ready: "可发送或切换", busy: "正在回复", unknown: "等待确认旧会话状态", switching: "连接新 CLI" })[v.phase] +
  (v.acceptedEpoch >= 0 && v.acceptedEpoch !== v.epoch ? "（误接收旧会话工具）" : "");
export const step = (a, from, to) => {
  if (a === "Next" || a === "Tool")
    return to.acceptedEpoch >= 0 && to.acceptedEpoch !== to.epoch
      ? "误接收旧会话的延迟工具调用"
      : "接收当前会话工具调用";
  return (
    {
      Send: "发送消息",
      Queue: "排队消息",
      Finish: "回复结束或处理下一条",
      Disconnect: "连接中断",
      Reconcile: "确认旧请求已结束并处理未发队列",
      Choose: "选择另一个 CLI",
      Commit: "连接成功后切换",
      FailSwitch: "连接失败，保留原 CLI",
      Wait: "保持状态",
    }[a] ?? a
  );
};
