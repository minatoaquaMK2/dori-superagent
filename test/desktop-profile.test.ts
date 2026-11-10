import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import type { Selection } from "../src/desktop/profile.ts";
import { Store } from "../src/desktop/store.ts";
import { fixture, until } from "./desktop-fixture.ts";

test("concurrent pane opens create one conversation", async () => {
  const f = await fixture();
  try {
    const input = { conversation: "two-panes", cwd: f.root, space: "shared" };
    const [first, second] = await Promise.all([f.engine.open(input), f.engine.open(input)]);
    expect(first).toBe(second);
    expect(
      f.store.state.conversations.filter((conversation) => conversation.conversation === input.conversation),
    ).toHaveLength(1);
  } finally {
    await f.close();
  }
});

test("composer profile uses CLI config and freezes each accepted request", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    expect(conversation.profile.resolved).toEqual({ provider: "codex", model: "model-a", effort: "high" });
    const catalog = f.engine.configuration.list(conversation.cwd)[0];
    expect(catalog).toBeDefined();
    const selection: Selection = { provider: "codex", modelChoice: "model-a", effortChoice: "low" };
    const configure = {
      conversation: "chat",
      requestId: "config-1",
      expectedRevision: 0,
      catalogRevision: catalog?.revision,
      selection,
    };
    expect((await f.request("/configure", configure)).status).toBe(202);
    expect((await f.request("/configure", configure)).status).toBe(202);
    expect(conversation.profileRevision).toBe(1);
    expect(
      (
        await f.request("/send", {
          conversation: "chat",
          requestId: "stale",
          expectedProfileRevision: 0,
          text: "Draft",
        })
      ).status,
    ).toBe(400);
    expect(conversation.entries).toHaveLength(0);
    expect(
      (
        await f.request("/send", {
          conversation: "chat",
          requestId: "accepted",
          expectedProfileRevision: 1,
          text: "Explain",
        })
      ).status,
    ).toBe(202);
    await until(() => f.requests.some((request) => request.method === "turn/start"));
    expect(f.requests.find((request) => request.method === "turn/start")?.params).toMatchObject({
      model: "model-a",
      effort: "low",
    });
    expect((await f.request("/configure", { ...configure, requestId: "busy", expectedRevision: 1 })).status).toBe(400);
    expect(conversation.runs[0]?.origin.profile.selection).toEqual(selection);
    const saved = new Store(`${f.root}/state.json`).conversation("chat");
    expect(saved.runs[0]?.origin.profile).toEqual(conversation.profile);
  } finally {
    await f.close();
  }
});

test("model catalog rejects unsupported effort without mutating profile or history", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    const catalog = f.engine.configuration.list(conversation.cwd)[0];
    const before = structuredClone(conversation);
    expect(
      (
        await f.request("/configure", {
          conversation: "chat",
          requestId: "bad-effort",
          expectedRevision: 0,
          catalogRevision: catalog?.revision,
          selection: { provider: "codex", modelChoice: "model-b", effortChoice: "high" },
        })
      ).status,
    ).toBe(400);
    expect(conversation).toEqual(before);
  } finally {
    await f.close();
  }
});

test("a retired model cannot accept another request under a cached profile", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    const catalog = f.engine.configuration.list(conversation.cwd)[0];
    if (!catalog) throw new Error("Missing fixture catalog");
    catalog.models = [];
    expect(
      (
        await f.request("/send", {
          conversation: "chat",
          requestId: "retired",
          expectedProfileRevision: 0,
          text: "Draft",
        })
      ).status,
    ).toBe(400);
    expect(conversation.requests).toHaveLength(0);
    expect(conversation.runs).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("v1 migration preserves history and request identities and writes one v2 store", async () => {
  const f = await fixture();
  try {
    const legacy = {
      version: 1,
      conversations: [
        {
          conversation: "old",
          cwd: f.root,
          space: "old-space",
          threadId: "old-thread",
          revision: 7,
          entries: [{ kind: "markdown", id: "old-message", role: "assistant", text: "History", source: "Codex" }],
          state: { kind: "idle" },
          pending: [],
          requests: ["request-1"],
          resultContext: ["Result"],
        },
      ],
      tasks: [],
    };
    const file = `${f.root}/legacy.json`;
    writeFileSync(file, JSON.stringify(legacy));
    const first = new Store(file);
    expect(first.state.version).toBe(2);
    expect(JSON.stringify(first.conversation("old").entries)).toBe(JSON.stringify(legacy.conversations[0]?.entries));
    expect(first.conversation("old").requests).toEqual(["request-1"]);
    expect(first.conversation("old").segments[0]?.sessionId).toBe("old-thread");
    const serialized = readFileSync(file, "utf8");
    expect(new Store(file).state).toEqual(first.state);
    expect(readFileSync(file, "utf8")).toBe(serialized);
  } finally {
    await f.close();
  }
});
