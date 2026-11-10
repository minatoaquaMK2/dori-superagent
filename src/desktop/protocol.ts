import { z } from "zod";
import type { Rpc } from "./rpc.ts";

export const itemSchema = z
  .object({ id: z.string(), type: z.string(), text: z.string().optional(), phase: z.string().nullable().optional() })
  .passthrough();
export const turnSchema = z
  .object({
    id: z.string(),
    status: z.enum(["inProgress", "completed", "failed", "interrupted"]),
    items: z.array(itemSchema),
    error: z.object({ message: z.string() }).passthrough().nullable().optional(),
  })
  .passthrough();
const threadResultSchema = z
  .object({
    thread: z
      .object({ id: z.string(), turns: z.array(turnSchema), status: z.object({ type: z.string() }).passthrough() })
      .passthrough(),
  })
  .passthrough();
export const eventParamsSchema = z.object({ threadId: z.string() }).passthrough();
export const itemEventSchema = eventParamsSchema.extend({ turnId: z.string(), item: itemSchema });
export const deltaSchema = eventParamsSchema.extend({ turnId: z.string(), itemId: z.string(), delta: z.string() });
export const turnEventSchema = eventParamsSchema.extend({ turn: turnSchema });
export const toolCallSchema = eventParamsSchema.extend({
  turnId: z.string(),
  callId: z.string(),
  tool: z.string(),
  arguments: z.unknown(),
});
export type Turn = z.infer<typeof turnSchema>;

export async function startThread(rpc: Rpc, params: object): Promise<string> {
  return threadResultSchema.parse(await rpc.request("thread/start", params)).thread.id;
}

export async function startTurn(rpc: Rpc, threadId: string, text: string, requestId?: string): Promise<string> {
  const result = await rpc.request("turn/start", {
    threadId,
    ...(requestId ? { clientUserMessageId: requestId } : {}),
    input: [{ type: "text", text, text_elements: [] }],
  });
  return z.object({ turn: turnSchema }).parse(result).turn.id;
}

export async function resumeThread(rpc: Rpc, threadId: string, developerInstructions?: string) {
  const result = await rpc.request("thread/resume", {
    threadId,
    excludeTurns: false,
    ...(developerInstructions ? { developerInstructions } : {}),
  });
  return threadResultSchema.parse(result).thread;
}
