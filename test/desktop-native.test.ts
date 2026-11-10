import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { activeTask, type Task } from "../src/desktop/model.ts";
import { Store } from "../src/desktop/store.ts";
import { writeReport } from "../src/desktop/workers/reporter.ts";
import { fixture } from "./desktop-fixture.ts";

test("native results use real turn boundaries, survive restart and retain the open terminal lease", async () => {
  const f = await fixture();
  try {
    const conversation = f.store.conversation("chat");
    const directory = join(f.root, "worker");
    mkdirSync(join(directory, "spool"), { recursive: true });
    const profile = {
      id: "agy-profile",
      selection: { provider: "antigravity", modelChoice: "gemini", effortChoice: "low" },
      catalogRevision: "probe",
      resolved: { provider: "antigravity", model: "actual-variant-low", effort: "low" },
    } satisfies Task["origin"]["profile"];
    const task: Task = {
      id: "native",
      conversation: "chat",
      callId: "dispatch",
      cwd: f.root,
      title: "Native result",
      prompt: "Work",
      threadId: null,
      terminal: "fake-terminal",
      tab: "fake-tab",
      state: { kind: "launching" },
      reported: [],
      output: {},
      origin: { conversation: "chat", segment: "segment", run: "run", request: "request", profile },
      launch: "attached",
      runtime: { kind: "native", directory, sessionId: null, open: true, receipts: [] },
    };
    f.store.state.tasks.push(task);
    const payload = {
      conversationId: "session",
      executionNum: 0,
      fullyIdle: false,
      terminationReason: "NO_TOOL_CALL",
      transcriptPath: "/unused",
      doriResult: { boundary: 0, text: "First turn" },
    };
    writeReport(directory, "Stop", payload);
    f.engine.tasks.native.poll(task);
    expect(task.reported).toHaveLength(0);
    writeReport(directory, "Stop", { ...payload, fullyIdle: true });
    f.engine.tasks.native.poll(task);
    writeReport(directory, "Stop", { ...payload, fullyIdle: true });
    f.engine.tasks.native.poll(task);
    expect(task.reported).toEqual(["session:0"]);
    expect(activeTask(task)).toBe(true);
    writeReport(directory, "Stop", { ...payload, fullyIdle: true, doriResult: { boundary: 8, text: "Second turn" } });
    f.engine.tasks.native.poll(task);
    expect(task.reported).toEqual(["session:0", "session:8"]);
    expect(conversation.resultContext).toHaveLength(2);
    const saved = new Store(`${f.root}/state.json`);
    expect(saved.state.tasks[0]?.origin.profile).toEqual(profile);
    expect(saved.conversation("chat").entries).toHaveLength(2);
    writeReport(directory, "ProcessExit", { code: 0 });
    f.engine.tasks.native.poll(task);
    expect(activeTask(task)).toBe(false);
    expect(conversation.entries).toHaveLength(2);
  } finally {
    await f.close();
  }
});
