import { join } from "node:path";
import { z } from "zod";
import type { Conversation, MainRun, Segment } from "../model.ts";
import type { Envelope } from "../rpc.ts";
import type { Provider } from "../profile.ts";
import { chatInstructions } from "../tools.ts";
import { AcpSession } from "./acp-session.ts";
import { DevinSession } from "./devin-session.ts";

type Binding = {
  session: AcpSession | DevinSession;
  provider: Provider;
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
    private readonly event: (event: Envelope, provider: Provider, epoch: string) => Promise<void>,
    private readonly disconnected: (segment: string, reason: string) => void,
  ) {}

  async create(conversation: Conversation, segment: Segment): Promise<string> {
    const token = crypto.randomUUID() + crypto.randomUUID();
    const directory = join(this.directory, "main", segment.id);
    const scoped = { url: this.url, token };
    const provider = segment.profile.selection.provider;
    const session =
      provider === "devin"
        ? new DevinSession(directory, this.directory, scoped)
        : new AcpSession(directory, conversation.cwd, this.directory, scoped);
    const binding: Binding = {
      session,
      provider,
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
      void this.event({ method: "chat/notice", params: { threadId: session.id, text } }, provider, this.epoch);
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
        provider,
        this.epoch,
      );
    };
    try {
      await session.initialize();
      await session.set("model", segment.profile.selection.modelChoice);
      if (segment.profile.selection.effortChoice !== null)
        await session.set("thought_level", segment.profile.selection.effortChoice);
      if ((await session.effectiveModel()) !== segment.profile.resolved.model)
        throw new Error("CLI 实际模型与所选配置不同，未发送消息");
      const effort = session.data?.configOptions.find((option) => option.id === "thought_level")?.currentValue ?? null;
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
    void this.event({ method: "turn/started", params }, binding.provider, this.epoch);
    const text = `${chatInstructions}\n\n${binding.session.instructions(run.operationId)}\n\n${prompt}`;
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
            binding.provider,
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
          binding.provider,
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
