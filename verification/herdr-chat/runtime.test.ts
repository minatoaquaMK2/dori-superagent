import { beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { z } from "zod";
import { Engine } from "../../src/desktop/engine.ts";
import { activeTask, type Task } from "../../src/desktop/model.ts";
import { Rpc } from "../../src/desktop/rpc.ts";
import { Store } from "../../src/desktop/store.ts";
import { fixture, until } from "../../test/desktop-fixture.ts";

const requestSchema = z.object({ id: z.number().optional(), method: z.string().optional() });
beforeAll(() => {
  const commands = process.env["DORI_FORMAL_COMMANDS"];
  if (!commands?.startsWith("/tmp/herdr-formal-commands-"))
    throw new Error("Run through verification/herdr-chat/runtime.ts");
  const probe = Bun.spawnSync(["hc", "--formal-isolation-probe"], { stdout: "pipe", stderr: "pipe" });
  if (probe.exitCode !== 72 || !probe.stderr.toString().includes("Formal probe blocked a real terminal command"))
    throw new Error("Terminal isolation failed; no task probes ran");
});

for (const boundary of ["thread/start", "turn/start"]) {
  test(`crash at ${boundary} leaves durable intent and recovery releases work that never ran`, async () => {
    const root = mkdtempSync("/tmp/herdr-formal-crash-");
    let reached = false;
    let turnStarts = 0;
    const protocol = Bun.serve<undefined>({
      unix: `${root}/codex.sock`,
      fetch(request, server) {
        if (server.upgrade(request, { data: undefined })) return;
        return new Response("WebSocket required", { status: 400 });
      },
      websocket: {
        message(socket, raw) {
          const request = requestSchema.parse(JSON.parse(String(raw)));
          if (request.id === undefined || !request.method) return;
          if (request.method === "turn/start") turnStarts++;
          if (request.method === boundary) {
            reached = true;
            return;
          }
          const result = request.method.startsWith("thread/")
            ? { thread: { id: "worker-thread", status: { type: "idle" }, turns: [] } }
            : {};
          socket.send(JSON.stringify({ id: request.id, result }));
        },
      },
    });
    const child = Bun.spawn([process.execPath, `${import.meta.dir}/crash-child.ts`, root], {
      stdout: "pipe",
      stderr: "pipe",
    });
    let rpc: Rpc | undefined;
    try {
      await until(() => reached);
      const before = new Store(`${root}/state.json`);
      expect(before.state.tasks).toHaveLength(1);
      expect(before.state.tasks[0]?.state.kind).toBe("launching");
      child.kill("SIGKILL");
      await child.exited;
      const store = new Store(`${root}/state.json`);
      rpc = new Rpc(`${root}/codex.sock`);
      const engine = new Engine(store, rpc, `${root}/codex.sock`);
      await engine.initialize();
      const task = store.state.tasks[0];
      if (!task) throw new Error("Durable task disappeared");
      const oldStarts = turnStarts;
      await engine.tasks.dispatch(store.conversation("chat"), "same-call", { title: "Duplicate", prompt: "Retry" });
      expect(turnStarts).toBe(oldStarts);
      expect(task.state.kind).not.toBe("launching");
      expect(activeTask(task)).toBe(false);
    } finally {
      child.kill("SIGKILL");
      await child.exited;
      rpc?.close();
      protocol.stop(true);
      await Bun.sleep(10);
      rmSync(root, { recursive: true, force: true });
    }
  });
}

function worker(cwd: string): Task {
  return {
    id: "worker",
    callId: "same-call",
    conversation: "chat",
    cwd,
    title: "Worker",
    prompt: "Task",
    threadId: "worker-thread",
    terminal: "isolated-terminal",
    tab: "isolated-tab",
    state: { kind: "running", turnId: "turn" },
    reported: [],
    output: {},
  };
}

test("a finished dispatch call stays deduplicated across reload", async () => {
  const f = await fixture();
  try {
    const task = worker(f.root);
    task.state = { kind: "finished", turnId: "turn", outcome: "completed", text: "done" };
    f.store.state.tasks.push(task);
    f.store.save();
    const reloaded = new Store(`${f.root}/state.json`);
    const engine = new Engine(reloaded, f.rpc, `${f.root}/codex.sock`);
    await engine.tasks
      .dispatch(reloaded.conversation("chat"), "same-call", { title: "Duplicate", prompt: "Retry" })
      .catch(() => {});
    expect(reloaded.state.tasks).toHaveLength(1);
    expect(f.requests.filter((r) => r.method === "thread/start")).toHaveLength(0);
    expect(f.requests.filter((r) => r.method === "turn/start")).toHaveLength(0);
  } finally {
    await f.close();
  }
});

for (const outcome of ["completed", "failed", "interrupted"] as const) {
  test(`duplicate ${outcome} result keeps one persisted report and context`, async () => {
    const f = await fixture();
    try {
      const task = worker(f.root);
      f.store.state.tasks.push(task);
      const event = {
        method: "turn/completed",
        params: { threadId: task.threadId, turn: { id: "turn", status: outcome, items: [] } },
      };
      f.engine.tasks.event(task, event);
      f.engine.tasks.event(task, event);
      f.store.save();
      const saved = new Store(`${f.root}/state.json`);
      expect(saved.state.tasks[0]?.state).toMatchObject({ kind: "finished", outcome });
      expect(saved.state.tasks[0]?.reported).toEqual(["turn"]);
      expect(saved.conversation("chat").resultContext).toHaveLength(1);
      expect(saved.conversation("chat").entries.filter((entry) => entry.id === "task:worker:turn")).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
}

test("worker approval remains unanswered by the bridge; chat approval is declined", async () => {
  const f = await fixture();
  try {
    const task = worker(f.root);
    f.store.state.tasks.push(task);
    f.store.conversation("chat").threadId = "chat-thread";
    f.send("item/commandExecution/requestApproval", { threadId: task.threadId }, "worker-approval");
    f.send("item/commandExecution/requestApproval", { threadId: "chat-thread" }, "chat-approval");
    await until(() => f.requests.some((r) => r.id === "chat-approval"));
    expect(f.requests.some((r) => r.id === "worker-approval")).toBe(false);
    expect(f.requests.find((r) => r.id === "chat-approval")?.["result"]).toEqual({ decision: "decline" });
    f.rpc.close();
    await until(() => !f.engine.connected);
    expect(() => f.engine.send({ conversation: "chat", requestId: "late", text: "Run" })).toThrow();
    expect(task.state.kind).toBe("disconnected");
  } finally {
    await f.close();
  }
});

test("terminal failure with an unconfirmed result remains disconnected", async () => {
  const f = await fixture();
  try {
    await f.engine.tasks
      .dispatch(f.store.conversation("chat"), "new-call", { title: "Unknown", prompt: "Task" })
      .catch(() => {});
    expect(f.store.state.tasks[0]?.state.kind).toBe("disconnected");
    expect(f.store.state.tasks[0]?.reported).toEqual([]);
    expect(f.store.conversation("chat").resultContext).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("recovery restores a persisted reported outcome without duplicating context", async () => {
  const root = mkdtempSync("/tmp/herdr-formal-legacy-");
  const turn = { id: "turn", status: "completed", items: [] };
  let starts = 0;
  const protocol = Bun.serve<undefined>({
    unix: `${root}/codex.sock`,
    fetch(request, server) {
      if (server.upgrade(request, { data: undefined })) return;
      return new Response("WebSocket required", { status: 400 });
    },
    websocket: {
      message(socket, raw) {
        const request = requestSchema.parse(JSON.parse(String(raw)));
        if (request.id === undefined || !request.method) return;
        if (request.method === "turn/start") starts++;
        const result =
          request.method === "thread/resume"
            ? { thread: { id: "worker-thread", status: { type: "idle" }, turns: [turn] } }
            : {};
        socket.send(JSON.stringify({ id: request.id, result }));
      },
    },
  });
  const rpc = new Rpc(`${root}/codex.sock`);
  try {
    const original = new Store(`${root}/state.json`);
    const engine = new Engine(original, rpc, `${root}/codex.sock`);
    engine.open({ conversation: "chat", cwd: root, space: "formal-test" });
    const task = worker(root);
    original.state.tasks.push(task);
    engine.tasks.event(task, { method: "turn/completed", params: { threadId: task.threadId, turn } });
    task.state = { kind: "disconnected", reason: "Old bridge saved a terminal failure after completion" };
    original.save();
    const reloaded = new Store(`${root}/state.json`);
    const recovered = new Engine(reloaded, rpc, `${root}/codex.sock`);
    await recovered.initialize();
    await recovered.tasks.recover();
    const persisted = new Store(`${root}/state.json`);
    expect(persisted.state.tasks[0]?.state).toMatchObject({ kind: "finished", outcome: "completed" });
    expect(persisted.state.tasks[0]?.reported).toEqual(["turn"]);
    expect(persisted.conversation("chat").resultContext).toHaveLength(1);
    expect(starts).toBe(0);
  } finally {
    rpc.close();
    protocol.stop(true);
    await Bun.sleep(10);
    rmSync(root, { recursive: true, force: true });
  }
});
