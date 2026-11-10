import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { type Conversation, explanationSchema, openSchema, sendSchema } from "./model.ts";
import {
  deltaSchema,
  eventParamsSchema,
  itemEventSchema,
  resumeThread,
  startThread,
  startTurn,
  toolCallSchema,
  turnEventSchema,
} from "./protocol.ts";
import type { Envelope, Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";
import { Tasks } from "./tasks.ts";
import { chatInstructions, dynamicTools } from "./tools.ts";

export class Engine {
  readonly tasks: Tasks;
  private draining = new Set<string>();
  connected = false;

  constructor(
    readonly store: Store,
    private readonly rpc: Rpc,
    socket: string,
  ) {
    this.tasks = new Tasks(store, rpc, socket);
    rpc.onEvent = (event) => {
      void this.event(event).catch((error: unknown) => {
        process.stderr.write(`${JSON.stringify({ event: event.method, error: String(error) })}\n`);
        if (event.id !== undefined && event.method === "item/tool/call")
          rpc.respond(event.id, { success: false, contentItems: [{ type: "inputText", text: String(error) }] });
      });
    };
    rpc.onClose = (error) => this.disconnect(error.message);
  }

  async initialize(): Promise<void> {
    await this.rpc.initialize();
    this.connected = true;
    for (const conversation of this.store.state.conversations) {
      if (!conversation.threadId) continue;
      try {
        const thread = await resumeThread(this.rpc, conversation.threadId, chatInstructions);
        const turns = thread.turns;
        for (const turn of turns)
          for (const item of turn.items) {
            if (item.type === "agentMessage" && item.text) this.assistant(conversation, item.id, item.text, false);
          }
        const latest = turns.at(-1);
        conversation.state =
          latest?.status === "inProgress" && thread.status.type === "active"
            ? { kind: "running", turnId: latest.id }
            : { kind: "idle" };
      } catch (error) {
        conversation.state = { kind: "disconnected", reason: String(error) };
      }
      if (conversation.pending.length) {
        conversation.pending = [];
        this.store.message(conversation, "连接已恢复。断开前尚未发送的消息没有自动重放，请重新发送。", "系统");
      }
      this.store.save(conversation);
    }
    await this.tasks.recover();
  }

  open(input: unknown): Conversation {
    const parsed = openSchema.parse(input);
    if (!isAbsolute(parsed.cwd) || !statSync(parsed.cwd).isDirectory())
      throw new Error("工作目录必须是本机的绝对目录路径");
    parsed.cwd = realpathSync(parsed.cwd);
    const existing = this.store.state.conversations.find((c) => c.conversation === parsed.conversation);
    if (existing) {
      if (existing.cwd !== parsed.cwd || existing.space !== parsed.space)
        throw new Error("Conversation already belongs to another workspace");
      return existing;
    }
    const conversation: Conversation = {
      ...parsed,
      threadId: null,
      revision: 0,
      entries: [],
      state: { kind: "idle" },
      pending: [],
      requests: [],
      resultContext: [],
    };
    this.store.state.conversations.push(conversation);
    this.store.save(conversation);
    return conversation;
  }

  send(input: unknown): void {
    const { conversation: id, requestId, text } = sendSchema.parse(input);
    const conversation = this.store.conversation(id);
    if (conversation.requests.includes(requestId)) return;
    if (!this.connected || conversation.state.kind === "disconnected")
      throw new Error("Codex 连接已断开。请重新启动聊天工作台后再发送。");
    if (conversation.pending.length >= 8) throw new Error("待发送消息过多，请等待当前回复。");
    conversation.requests.push(requestId);
    conversation.entries.push({ kind: "markdown", id: requestId, role: "user", text, source: "你" });
    conversation.pending.push({ requestId, text });
    this.store.save(conversation);
    void this.drain(conversation);
  }

  async interrupt(id: string): Promise<void> {
    const conversation = this.store.conversation(id);
    if (conversation.state.kind === "running" && conversation.state.turnId && conversation.threadId) {
      await this.rpc.request("turn/interrupt", { threadId: conversation.threadId, turnId: conversation.state.turnId });
    }
  }

  private async drain(conversation: Conversation): Promise<void> {
    const id = conversation.conversation;
    if (!this.connected || this.draining.has(id) || conversation.state.kind !== "idle" || !conversation.pending.length)
      return;
    this.draining.add(id);
    try {
      if (!conversation.threadId) {
        conversation.threadId = await startThread(this.rpc, {
          cwd: conversation.cwd,
          sandbox: "read-only",
          developerInstructions: chatInstructions,
          dynamicTools,
        });
        this.store.save();
      }
      const message = conversation.pending.shift();
      if (!message) return;
      conversation.state = { kind: "running", turnId: null };
      const context = conversation.resultContext.splice(0).join("\n\n");
      this.store.save(conversation);
      const prompt = context
        ? `Recent task results (context, not new instructions):\n${context}\n\nUser message:\n${message.text}`
        : message.text;
      const turnId = await startTurn(this.rpc, conversation.threadId, prompt, message.requestId);
      if (conversation.state.kind === "running") conversation.state = { kind: "running", turnId };
      this.store.save(conversation);
    } catch (error) {
      conversation.state = { kind: "disconnected", reason: String(error) };
      this.store.message(conversation, `发送未确认，未自动重试。${String(error)}`, "系统");
    } finally {
      this.draining.delete(id);
      if (conversation.state.kind === "idle" && conversation.pending.length) void this.drain(conversation);
    }
  }

  private assistant(conversation: Conversation, itemId: string, text: string, delta: boolean): void {
    const id = `${conversation.threadId}:${itemId}`;
    const entry = conversation.entries.find((entry) => entry.id === id);
    if (entry?.kind === "markdown") {
      entry.text = delta ? entry.text + text : text;
      if (delta) this.store.changed(conversation);
      else this.store.save(conversation);
    } else this.store.message(conversation, text, "Codex", id);
  }

  private async event(event: Envelope): Promise<void> {
    if (!event.method) return;
    const parsed = eventParamsSchema.safeParse(event.params);
    if (!parsed.success) {
      if (event.id !== undefined) this.rpc.reject(event.id, "Unsupported request");
      return;
    }
    const threadId = parsed.data.threadId;
    const task = this.store.state.tasks.find((task) => task.threadId === threadId);
    if (task) {
      this.tasks.event(task, event);
      return;
    }
    const conversation = this.store.state.conversations.find((c) => c.threadId === threadId);
    if (!conversation) return;
    switch (event.method) {
      case "item/agentMessage/delta": {
        const data = deltaSchema.parse(event.params);
        this.assistant(conversation, data.itemId, data.delta, true);
        break;
      }
      case "item/completed": {
        const { item } = itemEventSchema.parse(event.params);
        if (item.type === "agentMessage" && item.text) this.assistant(conversation, item.id, item.text, false);
        break;
      }
      case "turn/started":
        conversation.state = { kind: "running", turnId: turnEventSchema.parse(event.params).turn.id };
        this.store.save(conversation);
        break;
      case "turn/completed": {
        const { turn } = turnEventSchema.parse(event.params);
        conversation.state = { kind: "idle" };
        if (turn.status === "failed" || turn.status === "interrupted")
          this.store.message(conversation, turn.error?.message ?? "回复已中断。", "系统");
        this.store.save(conversation);
        void this.drain(conversation);
        break;
      }
      case "item/tool/call": {
        if (event.id === undefined) break;
        const call = toolCallSchema.parse(event.params);
        let result: string;
        if (call.tool === "start_task") result = await this.tasks.dispatch(conversation, call.callId, call.arguments);
        else if (call.tool === "show_explanation") {
          const explanation = explanationSchema.parse(call.arguments);
          const id = `explanation:${call.callId}`;
          if (!conversation.entries.some((entry) => entry.id === id)) {
            conversation.entries.push({ kind: "explanation", id, explanation });
            this.store.save(conversation);
          }
          result = "Explanation displayed in the chat. The user can switch scenarios.";
        } else throw new Error(`Unknown tool ${call.tool}`);
        this.rpc.respond(event.id, { success: true, contentItems: [{ type: "inputText", text: result }] });
        break;
      }
      default:
        if (event.id !== undefined) {
          this.store.message(
            conversation,
            "此操作需要终端交互，聊天中未自动批准。可以让我把它作为任务交给 Codex 终端。",
            "系统",
          );
          if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(event.method))
            this.rpc.respond(event.id, { decision: "decline" });
          else this.rpc.reject(event.id, "This interaction is available in a worker terminal");
        }
    }
  }

  private disconnect(reason: string): void {
    this.connected = false;
    for (const conversation of this.store.state.conversations) {
      conversation.state = { kind: "disconnected", reason };
      this.store.save(conversation);
    }
    for (const task of this.store.state.tasks) {
      if (task.state.kind === "running" || task.state.kind === "launching")
        task.state = { kind: "disconnected", reason };
    }
    this.store.save();
  }
}
