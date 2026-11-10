import type { ChatEvents } from "./chat-events.ts";
import { type Configuration, handoffText } from "./configuration.ts";
import { resumeThread } from "./protocol.ts";
import type { Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";
import { chatInstructions } from "./tools.ts";

export async function recoverChats(
  store: Store,
  rpc: Rpc,
  configuration: Configuration,
  events: ChatEvents,
  epoch: string,
): Promise<void> {
  for (const conversation of store.state.conversations) {
    await configuration.refresh(conversation.cwd);
    const segment = conversation.segments.find((segment) => segment.id === conversation.activeSegment);
    if (!segment) throw new Error("Conversation has no active segment");
    if (conversation.profile.selection.provider !== "codex") {
      if (conversation.activeRun || conversation.state.kind === "running") {
        conversation.state = { kind: "disconnected", reason: "CLI 会话在桥接退出后状态未知，未自动重放。" };
      } else {
        const fresh = {
          ...segment,
          id: crypto.randomUUID(),
          sessionId: null,
          epoch: null,
          handoff: handoffText(conversation),
        };
        conversation.segments.push(fresh);
        conversation.activeSegment = fresh.id;
        conversation.threadId = null;
        conversation.state = { kind: "idle" };
      }
    } else if (conversation.threadId) {
      try {
        segment.epoch = epoch;
        const thread = await resumeThread(rpc, conversation.threadId, chatInstructions);
        for (const turn of thread.turns) {
          for (const item of turn.items)
            if (item.type === "agentMessage" && item.text) events.assistant(conversation, item.id, item.text, false);
          const run = conversation.runs.find((run) => run.turnId === turn.id);
          if (run && turn.status !== "inProgress") run.state = "finished";
        }
        const latest = thread.turns.at(-1);
        conversation.state =
          latest?.status === "inProgress" && thread.status.type === "active"
            ? { kind: "running", turnId: latest.id }
            : { kind: "idle" };
        if (conversation.state.kind === "idle") conversation.activeRun = null;
      } catch (error) {
        conversation.state = { kind: "disconnected", reason: String(error) };
      }
    } else if (conversation.activeRun) {
      const run = conversation.runs.find((run) => run.origin.run === conversation.activeRun);
      if (run) run.state = "unknown";
      conversation.activeRun = null;
      conversation.state = { kind: "idle" };
      store.message(conversation, "上次消息尚未发送到 CLI，未自动重放。可以重新发送。", "系统");
    }
    if (conversation.pending.length) {
      for (const run of conversation.runs) if (run.state === "accepted") run.state = "unknown";
      conversation.pending = [];
      store.message(conversation, "断开前尚未发送的消息没有自动重放，请重新发送。", "系统");
    }
    store.save(conversation);
  }
}

export function disconnectCodex(store: Store, reason: string): void {
  for (const conversation of store.state.conversations) {
    if (conversation.profile.selection.provider !== "codex") continue;
    conversation.state = { kind: "disconnected", reason };
    store.save(conversation);
  }
  for (const task of store.state.tasks) {
    if (task.runtime.kind !== "codex") continue;
    if (task.state.kind === "running" || task.state.kind === "launching") task.state = { kind: "disconnected", reason };
  }
  store.save();
}
