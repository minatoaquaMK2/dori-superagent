import { beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Engine } from "../../src/desktop/engine.ts";
import { Store } from "../../src/desktop/store.ts";
import { activeTask } from "../../src/desktop/model.ts";
import { fixture, until } from "../../test/desktop-fixture.ts";

beforeAll(() => {
  if (!process.env["DORI_FORMAL_COMMANDS"]?.startsWith("/tmp/herdr-formal-commands-"))
    throw new Error("Run through verification/herdr-chat/runtime.ts");
});

const explanation = {
  title: "An explanation",
  intro: "Compare the cases",
  scenarios: ["A", "B"].map((label) => ({
    label,
    summary: label,
    steps: [{ title: "Step", body: "Body" }],
    takeaway: label,
  })),
};

test("scoped host receipts survive reload, reject changed payloads and prevent stale first effects", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    f.engine.send({ conversation: "chat", requestId: "explain", text: "Explain the cases" });
    await until(() => f.requests.some((request) => request.method === "turn/start"));
    const run = conversation.runs[0];
    if (!run) throw new Error("No accepted run");
    const owner = { conversation: "chat", segment: run.origin.segment };
    const call = { name: "show_explanation", arguments: { ...explanation, operationId: run.operationId } };
    const result = await f.engine.tools.forBinding(owner, call);
    f.send("turn/completed", { threadId: "chat-thread", turn: { id: "chat-turn", status: "completed", items: [] } });
    await until(() => conversation.state.kind === "idle");
    const catalog = f.engine.configuration.list(conversation.cwd)[0];
    f.engine.configuration.configure({
      conversation: "chat",
      requestId: "switch",
      expectedRevision: 0,
      catalogRevision: catalog?.revision,
      selection: { provider: "codex", modelChoice: "model-a", effortChoice: "low" },
    });
    const reloaded = new Store(`${f.root}/state.json`);
    const recovered = new Engine(reloaded, f.rpc, `${f.root}/codex.sock`);
    expect(await recovered.tools.forBinding(owner, call)).toBe(result);
    expect(reloaded.conversation("chat").entries.filter((entry) => entry.kind === "explanation")).toHaveLength(1);
    await expect(
      recovered.tools.forBinding(owner, {
        ...call,
        arguments: { ...call.arguments, title: "Changed" },
      }),
    ).rejects.toThrow();
    await expect(
      recovered.tools.forBinding(owner, {
        name: "start_task",
        arguments: { title: "Too late", prompt: "No side effect", operationId: run.operationId },
      }),
    ).rejects.toThrow();
    expect(reloaded.state.tasks).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("worker dispatch uses the accepted origin and rejects a conflicting duplicate", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    f.engine.send({ conversation: "chat", requestId: "task-request", text: "Please create the task" });
    await until(() => f.requests.some((request) => request.method === "turn/start"));
    const run = conversation.runs[0];
    if (!run) throw new Error("No accepted run");
    const origin = structuredClone(run.origin);
    f.send("turn/completed", { threadId: "chat-thread", turn: { id: "chat-turn", status: "completed", items: [] } });
    await until(() => conversation.state.kind === "idle");
    const catalog = f.engine.configuration.list(conversation.cwd)[0];
    f.engine.configuration.configure({
      conversation: "chat",
      requestId: "later-selection",
      expectedRevision: 0,
      catalogRevision: catalog?.revision,
      selection: { provider: "codex", modelChoice: "model-a", effortChoice: "low" },
    });
    await f.engine.tasks
      .dispatch(conversation, "origin-call", { title: "Frozen", prompt: "Work" }, origin)
      .catch(() => {});
    const workerStart = f.requests.filter((request) => request.method === "thread/start").at(-1);
    expect(workerStart?.params).toMatchObject({ model: "model-a", config: { model_reasoning_effort: "high" } });
    expect(f.store.state.tasks[0]?.origin.profile).toEqual(origin.profile);
    await expect(
      f.engine.tasks.dispatch(conversation, "origin-call", { title: "Different", prompt: "Work" }, origin),
    ).rejects.toThrow();
    expect(f.store.state.tasks).toHaveLength(1);
  } finally {
    await f.close();
  }
});

test("unknown runs and revoked bindings cannot create a first host effect", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    f.engine.send({ conversation: "chat", requestId: "connection-lost", text: "Explain" });
    await until(() => f.requests.some((request) => request.method === "turn/start"));
    const run = conversation.runs[0];
    if (!run) throw new Error("No accepted run");
    run.state = "unknown";
    conversation.state = { kind: "disconnected", reason: "Provider session closed" };
    f.store.save();
    const owner = { conversation: "chat", segment: run.origin.segment };
    const call = { name: "show_explanation", arguments: { ...explanation, operationId: run.operationId } };
    await expect(f.engine.tools.forBinding(owner, call)).rejects.toThrow();
    expect(() => f.engine.tools.forBinding(undefined, call)).toThrow();
    expect(() => f.engine.tools.forBinding({ ...owner, segment: "retired" }, call)).toThrow();
    expect(conversation.entries.filter((entry) => entry.kind === "explanation")).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("an ACP run interrupted before session creation releases the composer without replay", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    const profile = {
      id: "agy-profile",
      selection: { provider: "antigravity", modelChoice: "variant", effortChoice: "low" },
      catalogRevision: "fixture",
      resolved: { provider: "antigravity", model: "variant-low", effort: "low" },
    } satisfies typeof conversation.profile;
    conversation.profile = profile;
    const segment = conversation.segments[0];
    if (!segment) throw new Error("No segment");
    segment.profile = profile;
    conversation.runs.push({
      origin: { conversation: "chat", segment: segment.id, run: "pre-session", request: "request", profile },
      text: "Unsent",
      context: "",
      operationId: "operation",
      state: "attempted",
      turnId: null,
      receipts: [],
    });
    conversation.activeRun = "pre-session";
    conversation.state = { kind: "running", turnId: null };
    f.store.save();
    const reloaded = new Store(`${f.root}/state.json`);
    const recovered = new Engine(reloaded, f.rpc, `${f.root}/codex.sock`);
    await recovered.initialize();
    expect(reloaded.conversation("chat").state.kind).toBe("idle");
    expect(reloaded.conversation("chat").activeRun).toBeNull();
    expect(reloaded.conversation("chat").runs[0]?.state).toBe("unknown");
    expect(f.requests.filter((request) => request.method === "turn/start")).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("native recovery retains an unknown launch without starting a second worker", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    const profile = {
      id: "agy-profile",
      selection: { provider: "antigravity", modelChoice: "variant", effortChoice: "low" },
      catalogRevision: "fixture",
      resolved: { provider: "antigravity", model: "variant-low", effort: "low" },
    } satisfies typeof conversation.profile;
    await f.engine.tasks
      .dispatch(
        conversation,
        "native-attempt",
        { title: "Native", prompt: "Do not execute" },
        {
          conversation: "chat",
          segment: conversation.activeSegment,
          run: "run",
          request: "request",
          profile,
        },
      )
      .catch(() => {});
    const task = f.store.state.tasks[0];
    if (!task) throw new Error("No native task intent");
    expect(task.state.kind).toBe("disconnected");
    const log = `${process.env["DORI_FORMAL_COMMANDS"]}/run-attempts`;
    const attempts = readFileSync(log, "utf8");
    const reloaded = new Store(`${f.root}/state.json`);
    const recovered = new Engine(reloaded, f.rpc, `${f.root}/codex.sock`);
    await recovered.tasks.recover().catch(() => {});
    expect(readFileSync(log, "utf8")).toBe(attempts);
    const saved = reloaded.state.tasks[0];
    if (!saved) throw new Error("No recovered task");
    expect(activeTask(saved)).toBe(true);
    expect(saved.reported).toHaveLength(0);
  } finally {
    await f.close();
  }
});
