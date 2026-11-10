import { expect, test } from "bun:test";
import { migrateState } from "../src/desktop/migration.ts";
import { fixture, until } from "./desktop-fixture.ts";

test("a migrated active Codex turn completes without granting unowned host tools", async () => {
  const f = await fixture({
    resume: { status: { type: "active" }, turns: [{ id: "legacy-turn", status: "inProgress", items: [] }] },
  });
  try {
    const old = f.store.conversation("chat");
    const migrated = migrateState({
      version: 1,
      conversations: [{ ...old, threadId: "chat-thread", state: { kind: "running", turnId: "legacy-turn" } }],
      tasks: [],
    }).conversations[0];
    if (!migrated) throw new Error("Missing migrated conversation");
    f.store.state.conversations.splice(0, 1, migrated);
    await f.engine.initialize();
    expect(migrated.activeRun).toBeNull();
    expect(migrated.state.kind).toBe("running");
    f.send(
      "item/tool/call",
      {
        threadId: "chat-thread",
        turnId: "legacy-turn",
        callId: "unowned",
        tool: "start_task",
        arguments: { title: "Unowned", prompt: "Must not execute" },
      },
      "unowned-tool",
    );
    await until(() => f.requests.some((request) => request.id === "unowned-tool"));
    expect(f.store.state.tasks).toHaveLength(0);
    f.send("turn/completed", { threadId: "chat-thread", turn: { id: "legacy-turn", status: "completed", items: [] } });
    await until(() => migrated.state.kind === "idle");
    expect(migrated.profile.resolved).toEqual({ provider: "codex", model: "model-a", effort: "high" });
    expect(f.requests.some((request) => request.method === "turn/start")).toBe(false);
    expect(
      (
        await f.request("/send", {
          conversation: "chat",
          requestId: "after-migration",
          text: "New request",
          expectedProfileRevision: migrated.profileRevision,
        })
      ).status,
    ).toBe(202);
    await until(() => f.requests.some((request) => request.method === "turn/start"));
    expect(migrated.runs[0]?.origin.profile.resolved).toEqual({ provider: "codex", model: "model-a", effort: "high" });
  } finally {
    await f.close();
  }
});

test("ACP crash before a saved session releases the unsent run without replay", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    conversation.profile = {
      id: "agy",
      selection: { provider: "antigravity", modelChoice: "family", effortChoice: "low" },
      catalogRevision: "probe",
      resolved: { provider: "antigravity", model: "variant-low", effort: "low" },
    };
    const segment = conversation.segments[0];
    if (!segment) throw new Error("Missing segment");
    segment.profile = conversation.profile;
    conversation.activeRun = "attempted";
    conversation.state = { kind: "running", turnId: null };
    conversation.runs.push({
      origin: {
        conversation: "chat",
        segment: segment.id,
        run: "attempted",
        request: "request",
        profile: conversation.profile,
      },
      text: "Never replay",
      context: "",
      operationId: "operation",
      state: "attempted",
      turnId: null,
      receipts: [],
    });
    await f.engine.initialize();
    expect(f.store.conversation("chat").state.kind).toBe("idle");
    expect(conversation.activeRun).toBeNull();
    expect(conversation.runs[0]?.state).toBe("unknown");
    expect(f.requests.some((request) => request.method === "turn/start")).toBe(false);
    const catalog = f.engine.configuration.list(conversation.cwd)[0];
    if (!catalog) throw new Error("Missing catalog");
    expect(
      (
        await f.request("/configure", {
          conversation: "chat",
          requestId: "recover-config",
          expectedRevision: conversation.profileRevision,
          catalogRevision: catalog.revision,
          selection: catalog.defaultSelection,
        })
      ).status,
    ).toBe(202);
  } finally {
    await f.close();
  }
});
