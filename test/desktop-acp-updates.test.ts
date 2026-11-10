import { expect, test } from "bun:test";
import { agentMessage } from "../src/desktop/providers/acp-chats.ts";

test("Devin tool progress does not interrupt subsequent assistant text", () => {
  const updates = [
    { sessionUpdate: "tool_call", toolCallId: "read", status: "pending", content: [] },
    {
      sessionUpdate: "tool_call_update",
      toolCallId: "read",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "1 lines" } }],
    },
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Private reasoning" } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "读取成功" } },
  ];
  expect(updates.map((update) => agentMessage({ sessionId: "session", update })).filter(Boolean)).toEqual([
    { sessionId: "session", text: "读取成功" },
  ]);
});

test("nontext assistant content is ignored while malformed text is rejected", () => {
  expect(
    agentMessage({
      sessionId: "session",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "image" } },
    }),
  ).toBeNull();
  expect(() =>
    agentMessage({ sessionId: "session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text" } } }),
  ).toThrow();
});
