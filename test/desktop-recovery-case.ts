import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Engine } from "../src/desktop/engine.ts";
import { activeTask, type Task } from "../src/desktop/model.ts";
import { type Turn, turnSchema } from "../src/desktop/protocol.ts";
import { Rpc } from "../src/desktop/rpc.ts";
import { Store } from "../src/desktop/store.ts";

const [root, scenario] = z.tuple([z.string(), z.enum(["empty", "completed"])]).parse(process.argv.slice(2));
const socket = join(root, "codex.sock");
const completed = turnSchema.parse({
  id: "finished-turn",
  status: "completed",
  items: [{ id: "answer", type: "agentMessage", phase: "final_answer", text: "Task completed." }],
});
const turns: Turn[] = scenario === "completed" ? [completed] : [];
let starts = 0;
const requestSchema = z.object({ id: z.number().optional(), method: z.string().optional() });
const protocol = Bun.serve<undefined>({
  unix: socket,
  fetch(request, server) {
    if (server.upgrade(request, { data: undefined })) return;
    return new Response("WebSocket required", { status: 400 });
  },
  websocket: {
    message(peer, raw) {
      const request = requestSchema.parse(JSON.parse(String(raw)));
      if (request.id === undefined || !request.method) return;
      let result: unknown = {};
      if (request.method === "thread/start" || request.method === "thread/resume")
        result = { thread: { id: "worker-thread", status: { type: "idle" }, turns } };
      if (request.method === "turn/start") {
        starts++;
        result = { turn: { id: completed.id, status: "inProgress", items: [] } };
      }
      peer.send(JSON.stringify({ id: request.id, result }));
      if (request.method === "turn/start")
        peer.send(JSON.stringify({ method: "turn/completed", params: { threadId: "worker-thread", turn: completed } }));
    },
  },
});
const store = new Store(join(root, "state.json"));
const rpc = new Rpc(socket);
const engine = new Engine(store, rpc, socket);
await engine.initialize();
const conversation = await engine.open({ conversation: "chat", cwd: root, space: "test-space" });
try {
  if (scenario === "empty") {
    for (const kind of ["launching", "disconnected"] as const) {
      const task: Task = {
        id: `empty-${kind}`,
        callId: `dispatch-${kind}`,
        conversation: "chat",
        cwd: root,
        title: "Empty launch",
        prompt: "Never replay this",
        threadId: "worker-thread",
        terminal: null,
        tab: "unopened-tab",
        state: kind === "launching" ? { kind } : { kind, reason: "lost connection" },
        reported: [],
        output: {},
        runtime: { kind: "codex" },
        origin: { conversation: "chat", segment: "test", run: "test", request: "test", profile: conversation.profile },
        launch: "intent",
      };
      store.state.tasks.push(task);
      await engine.tasks.recover();
      await engine.tasks.recover();
      assert.equal(task.state.kind, "failed");
      assert.equal(activeTask(task), false);
    }
    assert.equal(starts, 0);
    assert.equal(conversation.entries.length, 2);
  } else {
    await assert.rejects(
      engine.tasks.dispatch(conversation, "first", { title: "Fast task", prompt: "Finish" }),
      /simulated/,
    );
    const task = store.state.tasks[0];
    assert(task);
    assert.equal(task.state.kind, "disconnected", "terminal failure must retain unknown ownership");
    assert.equal(starts, 0, "worker must not execute before terminal creation");
    task.state = { kind: "disconnected", reason: "Persisted by older bridge" };
    writeFileSync(
      join(root, "bin", "hc"),
      `#!/bin/sh\nif [ "$1" = "ls" ]; then\n  echo '{"terminals":[{"address":"t-existing"}]}'\nelse\n  echo '${JSON.stringify({ foreground: { argv: ["codex", "resume", "--remote", `unix://${socket}`, "worker-thread"] } })}'\nfi\n`,
      { mode: 0o755 },
    );
    await engine.tasks.recover();
    await engine.tasks.recover();
    assert.equal(task.state.kind, "finished", "authoritative history must restore reported completion");
    assert.equal(activeTask(task), false);
    assert.deepEqual(task.reported, [completed.id]);
    assert.equal(conversation.resultContext.length, 1);
    assert.equal(conversation.entries.filter((entry) => entry.id === `task:${task.id}:${completed.id}`).length, 1);
    assert.equal(starts, 0, "recovery must not replay turns");
    engine.tasks.event(task, {
      method: "turn/started",
      params: { turn: { id: "follow-up", status: "inProgress", items: [] }, threadId: task.threadId },
    });
    engine.tasks.event(task, { method: "turn/completed", params: { turn: completed, threadId: task.threadId } });
    assert.deepEqual(task.state, { kind: "running", turnId: "follow-up" });
  }
} finally {
  rpc.close();
  protocol.stop(true);
}
