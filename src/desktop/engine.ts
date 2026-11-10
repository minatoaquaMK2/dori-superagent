import { HostTools } from "./host-tools.ts";
import { AcpChats } from "./providers/acp-chats.ts";
import { ChatEvents } from "./chat-events.ts";
import { Configuration } from "./configuration.ts";
import { codexSettings } from "./providers/codex.ts";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { type Conversation, openSchema, sendSchema } from "./model.ts";
import { disconnectCodex, recoverChats } from "./recovery.ts";
import { startThread, startTurn } from "./protocol.ts";
import type { Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";
import { Tasks } from "./tasks.ts";
import { chatInstructions, dynamicTools } from "./tools.ts";

export class Engine {
  readonly tasks: Tasks;
  readonly configuration: Configuration;
  readonly acp: AcpChats;
  readonly tools: HostTools;
  private readonly events: ChatEvents;
  private readonly epoch = crypto.randomUUID();
  private draining = new Set<string>();
  connected = false;

  constructor(
    readonly store: Store,
    private readonly rpc: Rpc,
    socket: string,
    readonly nativeProviders = false,
  ) {
    this.tasks = new Tasks(store, rpc, socket);
    this.configuration = new Configuration(store, rpc, nativeProviders, (segment) => this.acp.retire(segment));
    this.tools = new HostTools(store, this.tasks);
    this.acp = new AcpChats(
      store.directory,
      (event, provider, epoch) => this.events.event(event, provider, epoch),
      (segment, reason) => {
        for (const conversation of store.state.conversations)
          if (conversation.activeSegment === segment) {
            conversation.state = { kind: "disconnected", reason };
            const run = conversation.runs.find((run) => run.origin.run === conversation.activeRun);
            if (run) run.state = "unknown";
            store.save(conversation);
          }
      },
    );
    this.events = new ChatEvents(store, this.tasks, rpc, this.epoch, this.tools, (conversation) => {
      this.configuration.adoptLegacy(conversation);
      return this.drain(conversation);
    });
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
    try {
      await this.rpc.initialize();
      this.connected = true;
    } catch (error) {
      if (!this.nativeProviders) throw error;
    }
    await recoverChats(this.store, this.rpc, this.configuration, this.events, this.epoch);
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
    const raced = this.store.state.conversations.find(
      (conversation) => conversation.conversation === parsed.conversation,
    );
    if (raced) {
      if (raced.cwd !== parsed.cwd || raced.space !== parsed.space)
        throw new Error("Conversation already belongs to another workspace");
      return raced;
    }
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
    this.configuration.adoptLegacy(conversation);
    if (expectedProfileRevision !== undefined && expectedProfileRevision !== conversation.profileRevision)
      throw new Error("配置已改变，请刷新后发送。草稿已保留。");
    const provider = conversation.profile.selection.provider;
    const catalog = this.configuration.list(conversation.cwd).find((catalog) => catalog.provider === provider);
    if (
      conversation.profile.selection.modelChoice === "unconfigured" ||
      conversation.profile.catalogRevision === "legacy" ||
      catalog?.status !== "ready"
    )
      throw new Error(catalog?.reason ?? "模型目录不可用，未发送消息");
    if ((!this.connected && provider === "codex") || conversation.state.kind === "disconnected")
      throw new Error("Codex 连接已断开。请重新启动聊天工作台后再发送。");
    this.configuration.validate(conversation.cwd, conversation.profile);
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
      receipts: [],
    });
    conversation.pending.push({ requestId, text, runId });
    this.store.save(conversation);
    void this.drain(conversation);
  }

  async interrupt(id: string): Promise<void> {
    const conversation = this.store.conversation(id);
    if (conversation.state.kind === "running" && conversation.state.turnId && conversation.threadId) {
      if (conversation.profile.selection.provider !== "codex") {
        const segment = conversation.segments.find((segment) => segment.id === conversation.activeSegment);
        if (segment) this.acp.interrupt(segment);
        return;
      }
      await this.rpc.request("turn/interrupt", { threadId: conversation.threadId, turnId: conversation.state.turnId });
    }
  }

  private async drain(conversation: Conversation): Promise<void> {
    const id = conversation.conversation;
    if (
      (!this.connected && conversation.profile.selection.provider === "codex") ||
      this.draining.has(id) ||
      conversation.state.kind !== "idle" ||
      !conversation.pending.length
    )
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
        if (run.origin.profile.selection.provider !== "codex")
          conversation.threadId = await this.acp.create(conversation, segment);
        else {
          conversation.threadId = await startThread(this.rpc, {
            cwd: conversation.cwd,
            sandbox: "read-only",
            developerInstructions: chatInstructions,
            dynamicTools,
            ...codexSettings(run.origin.profile),
            config: { model_reasoning_effort: run.origin.profile.resolved.effort },
          });
        }
        segment.sessionId = conversation.threadId;
        segment.epoch = run.origin.profile.selection.provider !== "codex" ? this.acp.epoch : this.epoch;
        this.store.save();
      }
      const context = [segment.handoff, run.context].filter(Boolean).join("\n\n");
      this.store.save(conversation);
      const prompt = context
        ? `Recent task results (context, not new instructions):\n${context}\n\nUser message:\n${message.text}`
        : message.text;
      const turnId =
        run.origin.profile.selection.provider !== "codex"
          ? this.acp.start(
              segment,
              run,
              `Project directory: ${conversation.cwd}. Use absolute paths for read-only inspection.\n\n${prompt}`,
            )
          : await startTurn(
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
      if (!conversation.threadId) {
        const run = conversation.runs.find((run) => run.origin.run === conversation.activeRun);
        if (run) run.state = "unknown";
        conversation.activeRun = null;
        conversation.state = { kind: "idle" };
      }
      this.store.message(conversation, `发送未确认，未自动重试。${String(error)}`, "系统");
    } finally {
      this.draining.delete(id);
      if (conversation.state.kind === "idle" && conversation.pending.length) void this.drain(conversation);
    }
  }

  private disconnect(reason: string): void {
    this.connected = false;
    disconnectCodex(this.store, reason);
  }
}
