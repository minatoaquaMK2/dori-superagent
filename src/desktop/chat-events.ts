import { type Conversation, explanationSchema } from "./model.ts";
import { providerNames } from "./profile.ts";
import { deltaSchema, eventParamsSchema, itemEventSchema, toolCallSchema, turnEventSchema } from "./protocol.ts";
import type { Envelope, Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";
import type { Tasks } from "./tasks.ts";

export class ChatEvents {
  constructor(
    private readonly store: Store,
    private readonly tasks: Tasks,
    private readonly rpc: Rpc,
    private readonly epoch: string,
    private readonly drain: (conversation: Conversation) => Promise<void>,
  ) {}
  assistant(conversation: Conversation, itemId: string, text: string, delta: boolean): void {
    const id = `${conversation.threadId}:${itemId}`;
    const entry = conversation.entries.find((entry) => entry.id === id);
    if (entry?.kind === "markdown") {
      entry.text = delta ? entry.text + text : text;
      if (delta) this.store.changed(conversation);
      else this.store.save(conversation);
    } else this.store.message(conversation, text, providerNames[conversation.profile.selection.provider], id);
  }

  async event(event: Envelope): Promise<void> {
    if (!event.method) return;
    const parsed = eventParamsSchema.safeParse(event.params);
    if (!parsed.success) {
      if (event.id !== undefined) this.rpc.reject(event.id, "Unsupported request");
      return;
    }
    const threadId = parsed.data.threadId;
    const task = this.store.state.tasks.find(
      (task) => task.origin.profile.selection.provider === "codex" && task.threadId === threadId,
    );
    if (task) {
      this.tasks.event(task, event);
      return;
    }
    const conversation = this.store.state.conversations.find(
      (c) =>
        c.profile.selection.provider === "codex" &&
        c.threadId === threadId &&
        c.segments.some((segment) => segment.id === c.activeSegment && segment.epoch === this.epoch),
    );
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
        const active = conversation.runs.find((run) => run.origin.run === conversation.activeRun);
        if (active?.turnId && active.turnId !== turn.id) break;
        if (active) active.state = "finished";
        conversation.activeRun = null;
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
        const run = conversation.runs.find((run) => run.origin.run === conversation.activeRun);
        if (run?.state !== "attempted" || (run.turnId && run.turnId !== call.turnId))
          throw new Error("This main run no longer owns tool access");
        if (call.tool === "start_task")
          result = await this.tasks.dispatch(conversation, run.operationId, call.arguments, run.origin);
        else if (call.tool === "show_explanation") {
          const explanation = explanationSchema.parse(call.arguments);
          const id = `explanation:${run.operationId}`;
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
}
