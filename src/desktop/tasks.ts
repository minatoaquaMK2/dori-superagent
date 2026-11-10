import { attachTerminal } from "./herdr.ts";
import { activeTask, type Conversation, dispatchSchema, type Task } from "./model.ts";
import { itemEventSchema, resumeThread, startThread, startTurn, type Turn, turnEventSchema } from "./protocol.ts";
import type { Envelope, Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";

export class Tasks {
  constructor(
    private readonly store: Store,
    private readonly rpc: Rpc,
    private readonly socket: string,
  ) {}

  async dispatch(conversation: Conversation, callId: string, input: unknown): Promise<string> {
    const previous = this.store.state.tasks.find(
      (task) => task.conversation === conversation.conversation && task.callId === callId,
    );
    if (previous) return JSON.stringify({ id: previous.id, title: previous.title, state: previous.state.kind });
    const { title, prompt } = dispatchSchema.parse(input);
    if (this.store.state.tasks.some((task) => task.cwd === conversation.cwd && activeTask(task))) {
      throw new Error("这个项目已有任务正在执行或等待确认。请先在原侧栏查看该 Codex 终端，完成后再派下一项任务。");
    }
    const task: Task = {
      id: crypto.randomUUID(),
      callId,
      conversation: conversation.conversation,
      cwd: conversation.cwd,
      title,
      prompt,
      threadId: null,
      terminal: null,
      tab: crypto.randomUUID(),
      state: { kind: "launching" },
      reported: [],
      output: {},
    };
    this.store.state.tasks.push(task);
    this.store.save(conversation);
    try {
      task.threadId = await startThread(this.rpc, {
        cwd: task.cwd,
        developerInstructions:
          "Complete the user's task and verify your own changes. You are the only worker. Do not delegate or launch other agents. Report concrete results and checks truthfully in the user's language. Preserve the existing permission policy.",
      });
      this.store.save();
      const turnId = await startTurn(this.rpc, task.threadId, prompt);
      if (task.state.kind === "launching") task.state = { kind: "running", turnId };
      this.store.save();
      task.terminal = await attachTerminal(task, conversation.space, this.socket);
      this.store.message(
        conversation,
        `已开始「${title}」。可从 Herdr 原侧栏打开 Codex 终端查看或继续操作。`,
        "Codex",
        `task:${task.id}:start`,
      );
      return JSON.stringify({ id: task.id, title, terminal: task.terminal, state: task.state.kind });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (task.state.kind === "finished") {
        this.store.message(conversation, `「${title}」已返回结果，但终端窗口未能打开。${reason}`, "系统");
        return JSON.stringify({ id: task.id, title, terminal: task.terminal, state: task.state.kind, warning: reason });
      }
      if (activeTask(task)) task.state = task.threadId ? { kind: "disconnected", reason } : { kind: "failed", reason };
      this.store.message(
        conversation,
        `「${title}」未能完成启动。${reason}${task.threadId ? " Codex 会话可能仍在运行，未自动重试。" : ""}`,
      );
      throw error;
    }
  }

  event(task: Task, event: Envelope): void {
    if (event.method === "item/completed") {
      const { item } = itemEventSchema.parse(event.params);
      if (item.type === "agentMessage" && item.text && item.phase !== "commentary") {
        task.output[item.id] = item.text;
        this.store.save();
      }
    } else if (event.method === "turn/started") {
      const { turn } = turnEventSchema.parse(event.params);
      task.state = { kind: "running", turnId: turn.id };
      task.output = {};
      this.store.save();
    } else if (event.method === "turn/completed") {
      const { turn } = turnEventSchema.parse(event.params);
      if (!task.reported.includes(turn.id)) this.complete(task, turn);
    } else if (event.id !== undefined && event.method?.includes("requestApproval")) {
      this.store.message(
        this.store.conversation(task.conversation),
        `「${task.title}」需要你的确认。请从 Herdr 原侧栏打开 Codex 终端处理。`,
        "Codex",
        `approval:${task.id}:${event.id}`,
      );
    }
  }

  private complete(task: Task, turn: Turn): void {
    if (turn.status === "inProgress") return;
    const final = turn.items
      .filter((item) => item.type === "agentMessage" && item.phase !== "commentary")
      .map((item) => item.text ?? "")
      .filter(Boolean);
    const sameTurn = (task.state.kind === "running" || task.state.kind === "finished") && task.state.turnId === turn.id;
    const text =
      final.join("\n\n") ||
      (sameTurn ? Object.values(task.output).join("\n\n") : "") ||
      turn.error?.message ||
      "本次运行结束，未返回文字结果。";
    task.state = { kind: "finished", turnId: turn.id, outcome: turn.status, text };
    if (task.reported.includes(turn.id)) {
      this.store.save();
      return;
    }
    task.reported.push(turn.id);
    const conversation = this.store.conversation(task.conversation);
    const status = { completed: "返回结果", failed: "运行失败", interrupted: "已中断" }[turn.status];
    const summary = `**${task.title} · ${status}**\n\n${text}`;
    conversation.resultContext.push(summary);
    this.store.message(conversation, summary, "Codex", `task:${task.id}:${turn.id}`);
  }

  async recover(): Promise<void> {
    for (const task of this.store.state.tasks) {
      if (!task.threadId) {
        if (task.state.kind === "launching") this.failLaunch(task);
        continue;
      }
      try {
        const thread = await resumeThread(this.rpc, task.threadId);
        for (const turn of thread.turns) this.complete(task, turn);
        const latest = thread.turns.at(-1);
        if (!latest) {
          if (thread.status.type === "idle") this.failLaunch(task);
          continue;
        }
        if (latest.status === "inProgress")
          task.state =
            thread.status.type === "active"
              ? { kind: "running", turnId: latest.id }
              : { kind: "disconnected", reason: "上次运行结果不完整，未自动重试" };
        if (activeTask(task) || !task.terminal)
          task.terminal = await attachTerminal(task, this.store.conversation(task.conversation).space, this.socket);
      } catch (error) {
        if (activeTask(task)) task.state = { kind: "disconnected", reason: String(error) };
      }
    }
    this.store.save();
  }

  private failLaunch(task: Task): void {
    task.state = { kind: "failed", reason: "任务尚未开始执行时服务已退出，未自动重试" };
    this.store.message(
      this.store.conversation(task.conversation),
      `「${task.title}」未开始执行，请重新派发。`,
      "系统",
      `task:${task.id}:not-started`,
    );
  }
}
