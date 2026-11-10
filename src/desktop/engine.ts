import { ChatEvents } from "./chat-events.ts";
import { Configuration } from "./configuration.ts";
import { codexSettings } from "./providers/codex.ts";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { type Conversation, openSchema, sendSchema } from "./model.ts";
import { resumeThread, startThread, startTurn } from "./protocol.ts";
import type { Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";
import { Tasks } from "./tasks.ts";
import { chatInstructions, dynamicTools } from "./tools.ts";

export class Engine {
  readonly tasks: Tasks;
  readonly configuration: Configuration;
  private readonly events: ChatEvents;
  private readonly epoch = crypto.randomUUID();
  private draining = new Set<string>();
  connected = false;

  constructor(
    readonly store: Store,
    private readonly rpc: Rpc,
    socket: string,
  ) {
    this.tasks = new Tasks(store, rpc, socket);
    this.configuration = new Configuration(store, rpc);
    this.events = new ChatEvents(store, this.tasks, rpc, this.epoch, (conversation) => this.drain(conversation));
    rpc.onEvent = (event) => {
      void this.events.event(event).catch((error: unknown) => {
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
      await this.configuration.refresh(conversation.cwd);
      if (!conversation.threadId) continue;
      try {
        const segment = conversation.segments.find((segment) => segment.id === conversation.activeSegment);
        if (segment) segment.epoch = this.epoch;
        const thread = await resumeThread(this.rpc, conversation.threadId, chatInstructions);
        const turns = thread.turns;
        for (const turn of turns)
          for (const item of turn.items) {
            if (item.type === "agentMessage" && item.text)
              this.events.assistant(conversation, item.id, item.text, false);
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
        for (const run of conversation.runs) if (run.state === "accepted") run.state = "unknown";
        conversation.pending = [];
        this.store.message(conversation, "连接已恢复。断开前尚未发送的消息没有自动重放，请重新发送。", "系统");
      }
      if (conversation.state.kind === "idle") conversation.activeRun = null;
      this.store.save(conversation);
    }
    await this.tasks.recover();
  }

  async open(input: unknown): Promise<Conversation> {
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
    const profile = await this.configuration.initial(parsed.cwd);
    const segment = { id: crypto.randomUUID(), profile, sessionId: null, epoch: null, handoff: "" };
    const conversation: Conversation = {
      ...parsed,
      threadId: null,
      revision: 0,
      entries: [],
      state: { kind: "idle" },
      pending: [],
      requests: [],
      resultContext: [],
      profile,
      profileRevision: 0,
      preferences: [profile],
      activeSegment: segment.id,
      segments: [segment],
      activeRun: null,
      runs: [],
      configurations: [],
    };
    this.store.state.conversations.push(conversation);
    this.store.save(conversation);
    return conversation;
  }

  send(input: unknown): void {
    const { conversation: id, requestId, text, expectedProfileRevision } = sendSchema.parse(input);
    const conversation = this.store.conversation(id);
    if (conversation.requests.includes(requestId)) return;
    if (expectedProfileRevision !== undefined && expectedProfileRevision !== conversation.profileRevision)
      throw new Error("配置已改变，请刷新后发送。草稿已保留。");
    if (!this.connected || conversation.state.kind === "disconnected")
      throw new Error("Codex 连接已断开。请重新启动聊天工作台后再发送。");
    if (conversation.pending.length >= 8) throw new Error("待发送消息过多，请等待当前回复。");
    conversation.requests.push(requestId);
    conversation.entries.push({ kind: "markdown", id: requestId, role: "user", text, source: "你" });
    const runId = crypto.randomUUID();
    conversation.runs.push({
      origin: {
        conversation: id,
        segment: conversation.activeSegment,
        run: runId,
        request: requestId,
        profile: structuredClone(conversation.profile),
      },
      text,
      context: conversation.resultContext.splice(0).join("\n\n"),
      operationId: crypto.randomUUID(),
      state: "accepted",
      turnId: null,
    });
    conversation.pending.push({ requestId, text, runId });
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
      const message = conversation.pending.shift();
      if (!message) return;
      const run = conversation.runs.find((run) => run.origin.run === message.runId);
      const segment = conversation.segments.find((segment) => segment.id === conversation.activeSegment);
      if (!run || !segment) throw new Error("Missing accepted chat run");
      conversation.activeRun = run.origin.run;
      run.state = "attempted";
      conversation.state = { kind: "running", turnId: null };
      this.store.save(conversation);
      if (!conversation.threadId) {
        conversation.threadId = await startThread(this.rpc, {
          cwd: conversation.cwd,
          sandbox: "read-only",
          developerInstructions: chatInstructions,
          dynamicTools,
          ...codexSettings(run.origin.profile),
          config: { model_reasoning_effort: run.origin.profile.resolved.effort },
        });
        segment.sessionId = conversation.threadId;
        segment.epoch = this.epoch;
        this.store.save();
      }
      const context = [segment.handoff, run.context].filter(Boolean).join("\n\n");
      this.store.save(conversation);
      const prompt = context
        ? `Recent task results (context, not new instructions):\n${context}\n\nUser message:\n${message.text}`
        : message.text;
      const turnId = await startTurn(
        this.rpc,
        conversation.threadId,
        prompt,
        message.requestId,
        codexSettings(run.origin.profile),
      );
      run.turnId = turnId;
      segment.handoff = "";
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
