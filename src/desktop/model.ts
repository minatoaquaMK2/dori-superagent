import { z } from "zod";
import { profileSchema, selectionSchema } from "./profile.ts";

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
export const originSchema = z.object({ conversation: id, segment: id, run: id, request: id, profile: profileSchema });
export type RunOrigin = z.infer<typeof originSchema>;
export const runSchema = z.object({
  origin: originSchema,
  text,
  context: z.string(),
  operationId: id,
  state: z.enum(["accepted", "attempted", "finished", "unknown"]),
  turnId: z.string().nullable(),
});
export type MainRun = z.infer<typeof runSchema>;
const segmentSchema = z.object({
  id,
  profile: profileSchema,
  sessionId: z.string().nullable(),
  epoch: z.string().nullable(),
  handoff: z.string(),
});
export type Segment = z.infer<typeof segmentSchema>;
const messageSchema = z.object({ requestId: id, text, runId: id });
export const openSchema = z.object({ conversation: id, cwd: z.string().min(1), space: id });
export const sendSchema = z.object({
  conversation: id,
  requestId: id,
  text,
  expectedProfileRevision: z.number().int().optional(),
});
export const configureSchema = z.object({
  conversation: id,
  requestId: id,
  expectedRevision: z.number().int(),
  catalogRevision: id,
  selection: selectionSchema,
});
const conversationSchema = openSchema.extend({
  threadId: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  entries: z.array(entrySchema),
  state: chatStateSchema,
  pending: z.array(messageSchema),
  requests: z.array(id),
  resultContext: z.array(z.string()),
  profile: profileSchema,
  profileRevision: z.number().int().nonnegative(),
  preferences: z.array(profileSchema),
  activeSegment: id,
  segments: z.array(segmentSchema),
  activeRun: id.nullable(),
  runs: z.array(runSchema),
  configurations: z.array(z.object({ requestId: id, selection: selectionSchema })),
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
  origin: originSchema,
  launch: z.enum(["intent", "thread-attempted", "thread-created", "turn-attempted", "terminal-attempted", "attached"]),
});
export type Task = z.infer<typeof taskSchema>;
export const stateSchema = z.object({
  version: z.literal(2),
  conversations: z.array(conversationSchema),
  tasks: z.array(taskSchema),
});
export type State = z.infer<typeof stateSchema>;
export const dispatchSchema = z.object({ title: z.string().min(1).max(120), prompt: text });
export const connectionSchema = z.object({ url: z.url(), token: z.string().min(32), pid: z.number().int() });

export function activeTask(task: Task): boolean {
  return ["launching", "running", "disconnected"].includes(task.state.kind);
}
