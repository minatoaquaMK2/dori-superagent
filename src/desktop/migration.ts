import { z } from "zod";
import { type State, stateSchema } from "./model.ts";
import { legacyProfile } from "./profile.ts";

const oldState = z.object({
  version: z.literal(1),
  conversations: z.array(
    z
      .object({
        conversation: z.string(),
        threadId: z.string().nullable(),
        pending: z.array(z.object({ requestId: z.string(), text: z.string() })),
      })
      .passthrough(),
  ),
  tasks: z.array(
    z
      .object({ id: z.string(), callId: z.string(), conversation: z.string(), threadId: z.string().nullable() })
      .passthrough(),
  ),
});

export function migrateState(input: unknown): State {
  if (!oldState.safeParse(input).success) return stateSchema.parse(input);
  const old = oldState.parse(input);
  const profile = legacyProfile();
  return stateSchema.parse({
    version: 2,
    conversations: old.conversations.map((conversation) => ({
      ...conversation,
      profile,
      profileRevision: 0,
      preferences: [profile],
      activeRun: null,
      configurations: [],
      activeSegment: `legacy:${conversation.conversation}`,
      segments: [
        {
          id: `legacy:${conversation.conversation}`,
          profile,
          sessionId: conversation.threadId,
          epoch: null,
          handoff: "",
        },
      ],
      pending: conversation.pending.map((message) => ({ ...message, runId: `legacy:${message.requestId}` })),
      runs: conversation.pending.map((message) => ({
        origin: {
          conversation: conversation.conversation,
          segment: `legacy:${conversation.conversation}`,
          run: `legacy:${message.requestId}`,
          request: message.requestId,
          profile,
        },
        text: message.text,
        context: "",
        operationId: `legacy:${message.requestId}`,
        state: "accepted",
        turnId: null,
        receipts: [],
      })),
    })),
    tasks: old.tasks.map((task) => ({
      ...task,
      runtime: { kind: "codex" },
      launch: task.threadId ? "turn-attempted" : "intent",
      origin: {
        conversation: task.conversation,
        segment: `legacy:${task.conversation}`,
        run: `legacy:${task.callId}`,
        request: `legacy:${task.callId}`,
        profile,
      },
    })),
  });
}
