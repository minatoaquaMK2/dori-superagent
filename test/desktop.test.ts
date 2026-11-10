import { expect, test } from "bun:test";
import { activeTask, explanationSchema, type Task } from "../src/desktop/model.ts";
import { Store } from "../src/desktop/store.ts";
import { fixture, until } from "./desktop-fixture.ts";

const explanation = {
  title: "请求如何命中缓存",
  intro: "切换场景比较路径。",
  scenarios: [
    {
      label: "命中",
      summary: "数据已存在",
      steps: [{ title: "读取", body: "从缓存返回" }],
      takeaway: "不必查询数据库",
    },
    {
      label: "未命中",
      summary: "需要加载",
      steps: [{ title: "查询", body: "查询数据库并回填" }],
      takeaway: "下一次可命中",
    },
  ],
};

test("authenticated chat accepts one request once and persists streamed completion", async () => {
  const f = await fixture();
  try {
    expect((await f.request("/snapshot?conversation=chat", undefined, false)).status).toBe(401);
    const message = { conversation: "chat", requestId: "message-1", text: "你好" };
    expect((await f.request("/send", message)).status).toBe(202);
    expect((await f.request("/send", message)).status).toBe(202);
    await until(() => f.requests.some((r) => r.method === "turn/start"));
    expect(f.requests.filter((r) => r.method === "turn/start")).toHaveLength(1);
    f.send("item/agentMessage/delta", { threadId: "chat-thread", turnId: "chat-turn", itemId: "reply", delta: "你" });
    f.send("item/agentMessage/delta", { threadId: "chat-thread", turnId: "chat-turn", itemId: "reply", delta: "好" });
    f.send("item/completed", {
      threadId: "chat-thread",
      turnId: "chat-turn",
      item: { id: "reply", type: "agentMessage", text: "你好。", phase: "final_answer" },
    });
    f.send("turn/completed", { threadId: "chat-thread", turn: { id: "chat-turn", status: "completed", items: [] } });
    await until(() => f.store.conversation("chat").state.kind === "idle");
    const conversation = f.store.conversation("chat");
    expect(conversation.entries).toHaveLength(2);
    expect(conversation.entries[1]).toMatchObject({ kind: "markdown", role: "assistant", text: "你好。" });
    expect((await f.request(`/snapshot?conversation=chat&after=${conversation.revision}`)).status).toBe(204);
    const reloaded = new Store(`${f.root}/state.json`).conversation("chat");
    expect(reloaded.entries).toEqual(conversation.entries);
    expect(reloaded.requests).toEqual(["message-1"]);
  } finally {
    await f.close();
  }
});

test("dynamic explanation is validated, rendered once, and rejects invalid tool content", async () => {
  const f = await fixture();
  try {
    f.engine.send({ conversation: "chat", requestId: "message-2", text: "解释缓存" });
    await until(() => f.requests.some((r) => r.method === "turn/start"));
    const params = {
      threadId: "chat-thread",
      turnId: "chat-turn",
      callId: "explain-1",
      tool: "show_explanation",
      arguments: explanation,
    };
    f.send("item/tool/call", params, "callback-1");
    await until(() => f.requests.some((r) => r.id === "callback-1"));
    f.send("item/tool/call", params, "callback-2");
    await until(() => f.requests.some((r) => r.id === "callback-2"));
    expect(f.store.conversation("chat").entries.filter((entry) => entry.kind === "explanation")).toHaveLength(1);
    f.send(
      "item/tool/call",
      { ...params, callId: "invalid", arguments: { title: "bad", html: "<script>" } },
      "callback-3",
    );
    await until(() => f.requests.some((r) => r.id === "callback-3"));
    expect(f.requests.find((r) => r.id === "callback-3")?.["result"]).toMatchObject({ success: false });
    expect(
      explanationSchema.safeParse({ ...explanation, scenarios: Array(6).fill(explanation.scenarios[0]) }).success,
    ).toBe(false);
  } finally {
    await f.close();
  }
});

test("worker result preserves failure and completion identity; terminal owns its approvals", async () => {
  const f = await fixture();
  try {
    const task: Task = {
      id: "task-1",
      callId: "dispatch-1",
      conversation: "chat",
      cwd: f.root,
      title: "检查测试",
      prompt: "检查测试",
      threadId: "worker-thread",
      terminal: "t-test",
      tab: "task-tab",
      state: { kind: "running", turnId: "worker-turn" },
      reported: [],
      output: {},
    };
    f.store.state.tasks.push(task);
    f.send(
      "item/commandExecution/requestApproval",
      { threadId: "worker-thread", turnId: "worker-turn" },
      "worker-approval",
    );
    await until(() => f.store.conversation("chat").entries.length === 1);
    expect(f.requests.some((r) => r.id === "worker-approval")).toBe(false);
    const completed = {
      threadId: "worker-thread",
      turn: { id: "worker-turn", status: "failed", items: [], error: { message: "test failed" } },
    };
    f.send("turn/completed", completed);
    f.send("turn/completed", completed);
    await until(() => task.state.kind === "finished");
    expect(task.state).toMatchObject({ kind: "finished", outcome: "failed", text: "test failed" });
    expect(task.reported).toEqual(["worker-turn"]);
    expect(f.store.conversation("chat").entries.filter((entry) => entry.id === "task:task-1:worker-turn")).toHaveLength(
      1,
    );
    expect(activeTask(task)).toBe(false);
    f.send("turn/started", { threadId: "worker-thread", turn: { id: "follow-up", status: "inProgress", items: [] } });
    await until(() => task.state.kind === "running");
    expect(activeTask(task)).toBe(true);
  } finally {
    await f.close();
  }
});

test("chat refuses approvals correctly and disconnected transport cannot accept new work", async () => {
  const f = await fixture();
  try {
    f.engine.send({ conversation: "chat", requestId: "message-3", text: "读取文件" });
    await until(() => f.requests.some((r) => r.method === "turn/start"));
    f.send("item/commandExecution/requestApproval", { threadId: "chat-thread" }, "approval");
    f.send("item/permissions/requestApproval", { threadId: "chat-thread" }, "permissions");
    await until(() => f.requests.some((r) => r.id === "permissions"));
    expect(f.requests.find((r) => r.id === "approval")?.["result"]).toEqual({ decision: "decline" });
    expect(f.requests.find((r) => r.id === "permissions")?.["error"]).toMatchObject({ code: -32601 });
    f.rpc.close();
    await until(() => !f.engine.connected);
    expect((await f.request("/send", { conversation: "chat", requestId: "new", text: "继续" })).status).toBe(400);
    expect(f.store.conversation("chat").state.kind).toBe("disconnected");
  } finally {
    await f.close();
  }
});

test("recovery releases a dispatch that crashed before creating its worker thread", async () => {
  const f = await fixture();
  try {
    const task: Task = {
      id: "not-started",
      callId: "dispatch",
      conversation: "chat",
      cwd: f.root,
      title: "未启动的任务",
      prompt: "执行任务",
      threadId: null,
      terminal: null,
      tab: "unopened-tab",
      state: { kind: "launching" },
      reported: [],
      output: {},
    };
    f.store.state.tasks.push(task);
    await f.engine.tasks.recover();
    expect(task.state.kind).toBe("failed");
    expect(activeTask(task)).toBe(false);
    expect(f.requests.some((request) => request.method === "turn/start")).toBe(false);
    expect(f.store.conversation("chat").entries).toHaveLength(1);
  } finally {
    await f.close();
  }
});
