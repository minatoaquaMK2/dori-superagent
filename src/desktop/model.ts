import { z } from "zod";

const text = z.string().min(1).max(20_000);
const id = z.string().min(1).max(200);
export const explanationSchema = z.object({
  title: z.string().min(1).max(120),
  intro: z.string().max(2000),
  scenarios: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        summary: z.string().max(2000),
        steps: z
          .array(z.object({ title: z.string().min(1).max(120), body: z.string().max(2000) }))
          .min(1)
          .max(8),
        takeaway: z.string().max(2000),
      }),
    )
    .min(2)
    .max(5),
});
const entrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("markdown"),
    id,
    role: z.enum(["user", "assistant", "system"]),
    text: z.string(),
    source: z.string(),
  }),
  z.object({ kind: z.literal("explanation"), id, explanation: explanationSchema }),
]);
const chatStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idle") }),
  z.object({ kind: z.literal("running"), turnId: z.string().nullable() }),
  z.object({ kind: z.literal("disconnected"), reason: z.string() }),
]);
export const taskStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("launching") }),
  z.object({ kind: z.literal("running"), turnId: z.string() }),
  z.object({
    kind: z.literal("finished"),
    turnId: z.string(),
    outcome: z.enum(["completed", "failed", "interrupted"]),
    text: z.string(),
  }),
  z.object({ kind: z.literal("failed"), reason: z.string() }),
  z.object({ kind: z.literal("disconnected"), reason: z.string() }),
]);
const messageSchema = z.object({ requestId: id, text });
export const openSchema = z.object({ conversation: id, cwd: z.string().min(1), space: id });
export const sendSchema = messageSchema.extend({ conversation: id });
const conversationSchema = openSchema.extend({
  threadId: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  entries: z.array(entrySchema),
  state: chatStateSchema,
  pending: z.array(messageSchema),
  requests: z.array(id),
  resultContext: z.array(z.string()),
});
export type Conversation = z.infer<typeof conversationSchema>;
const taskSchema = z.object({
  id,
  callId: id,
  conversation: id,
  cwd: z.string(),
  title: z.string(),
  prompt: text,
  threadId: z.string().nullable(),
  terminal: z.string().nullable(),
  tab: id,
  state: taskStateSchema,
  reported: z.array(z.string()),
  output: z.record(z.string(), z.string()),
});
export type Task = z.infer<typeof taskSchema>;
export const stateSchema = z.object({
  version: z.literal(1),
  conversations: z.array(conversationSchema),
  tasks: z.array(taskSchema),
});
export type State = z.infer<typeof stateSchema>;
export const dispatchSchema = z.object({ title: z.string().min(1).max(120), prompt: text });
export const connectionSchema = z.object({ url: z.url(), token: z.string().min(32), pid: z.number().int() });

export function activeTask(task: Task): boolean {
  return ["launching", "running", "disconnected"].includes(task.state.kind);
}
