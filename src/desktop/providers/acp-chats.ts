import { join } from "node:path";
import { z } from "zod";
import type { Conversation, MainRun, Segment } from "../model.ts";
import type { Envelope } from "../rpc.ts";
import { chatInstructions } from "../tools.ts";
import { AcpSession } from "./acp-session.ts";

type Binding = {
  session: AcpSession;
  token: string;
  conversation: string;
  segment: string;
  run: MainRun | null;
  replied: boolean;
};

export class AcpChats {
  private sessions = new Map<string, Binding>();
  url = "";
  readonly epoch = crypto.randomUUID();
  constructor(
    private readonly directory: string,
    private readonly event: (event: Envelope, epoch: string) => Promise<void>,
    private readonly disconnected: (segment: string, reason: string) => void,
  ) {}

  async create(conversation: Conversation, segment: Segment): Promise<string> {
    const token = crypto.randomUUID() + crypto.randomUUID();
    const session = new AcpSession(join(this.directory, "main", segment.id), conversation.cwd, this.directory, {
      url: this.url,
      token,
    });
    const binding: Binding = {
      session,
      token,
      conversation: conversation.conversation,
      segment: segment.id,
      run: null,
      replied: false,
    };
    this.sessions.set(segment.id, binding);
    session.rpc.onClose = (error) => {
      this.sessions.delete(segment.id);
      this.disconnected(segment.id, error.message);
    };
    session.onNotice = (text) => {
      void this.event({ method: "chat/notice", params: { threadId: session.id, text } }, this.epoch);
    };
    session.onUpdate = (message) => {
      if (message.method !== "session/update" || !binding.run) return;
      const update = z
        .object({
          sessionId: z.string(),
          update: z
            .object({
              sessionUpdate: z.string(),
              content: z.object({ type: z.string(), text: z.string().optional() }).optional(),
            })
            .passthrough(),
        })
        .parse(message.params);
      if (
        update.sessionId !== session.id ||
        update.update.sessionUpdate !== "agent_message_chunk" ||
        update.update.content?.type !== "text"
      )
        return;
      binding.replied = true;
      void this.event(
        {
          method: "item/agentMessage/delta",
          params: {
            threadId: session.id,
            turnId: binding.run.origin.run,
            itemId: binding.run.origin.run,
            delta: update.update.content.text ?? "",
          },
        },
        this.epoch,
      );
    };
    try {
      await session.initialize();
      await session.rpc.request("session/set_model", {
        sessionId: session.id,
        modelId: segment.profile.resolved.model,
      });
      const applied = await session.load();
      if (applied.models?.currentModelId !== segment.profile.resolved.model)
        throw new Error("CLI 实际模型与所选配置不同，未发送消息");
      const effort = applied.configOptions.find((option) => option.id === "thought_level")?.currentValue ?? null;
      if (effort !== segment.profile.resolved.effort) throw new Error("CLI 实际强度与所选配置不同，未发送消息");
      return session.id;
    } catch (error) {
      this.sessions.delete(segment.id);
      session.close();
      throw error;
    }
  }

  start(segment: Segment, run: MainRun, prompt: string): string {
    const binding = this.sessions.get(segment.id);
    if (!binding) throw new Error("ACP 会话已断开；消息未重放");
    binding.run = run;
    binding.replied = false;
    const turnId = run.origin.run;
    const params = { threadId: binding.session.id, turn: { id: turnId, status: "inProgress", items: [] } };
    void this.event({ method: "turn/started", params }, this.epoch);
    const text = `${chatInstructions}\n\nFor both herdr_host tools, use operationId=${run.operationId}. This ID identifies only this user turn.\n\n${prompt}`;
    void binding.session.rpc
      .request("session/prompt", { sessionId: binding.session.id, prompt: [{ type: "text", text }] }, 600_000)
      .then((value) => {
        const result = z.object({ stopReason: z.string() }).parse(value);
        const status =
          result.stopReason === "cancelled" ? "interrupted" : result.stopReason === "end_turn" ? "completed" : "failed";
        if (!binding.replied && !run.receipts.length)
          void this.event(
            {
              method: "chat/notice",
              params: {
                threadId: binding.session.id,
                text: "CLI 已结束本轮，但没有返回文字或工具结果。可以重新描述问题后发送。",
              },
            },
            this.epoch,
          );
        binding.run = null;
        return this.event(
          {
            method: "turn/completed",
            params: {
              threadId: binding.session.id,
              turn: {
                id: turnId,
                status,
                items: [],
                ...(status === "failed" ? { error: { message: `CLI 停止原因：${result.stopReason}` } } : {}),
              },
            },
          },
          this.epoch,
        );
      })
      .catch((error: unknown) => {
        this.disconnected(segment.id, String(error));
        this.retire(segment.id);
      });
    return turnId;
  }

  interrupt(segment: Segment): void {
    const binding = this.sessions.get(segment.id);
    if (binding) binding.session.rpc.notify("session/cancel", { sessionId: binding.session.id });
  }
  owner(token: string): { conversation: string; segment: string } | undefined {
    return [...this.sessions.values()].find((session) => session.token === token);
  }
  retire(segment: string): void {
    const binding = this.sessions.get(segment);
    if (!binding) return;
    this.sessions.delete(segment);
    binding.session.rpc.onClose = () => {};
    binding.session.close();
  }
  close(): void {
    for (const binding of this.sessions.values()) binding.session.close();
  }
}
