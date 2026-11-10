import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const source = resolve(import.meta.dir, "../..");
const out = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync("/tmp/herdr-formal-mutations-");
mkdirSync(out, { recursive: true });
const cases = [
  {
    rule: "IntentBeforeEffect",
    file: "tasks.ts",
    test: "crash at thread/start",
    before: "this.store.state.tasks.push(task);\n    this.store.save(conversation);",
    after: "this.store.state.tasks.push(task);",
  },
  {
    rule: "CallStartsOnce",
    file: "tasks.ts",
    test: "a finished dispatch call",
    before:
      "if (previous) return JSON.stringify({ id: previous.id, title: previous.title, state: previous.state.kind });",
    after: "void previous;",
  },
  {
    rule: "ResultReportedOnce",
    file: "tasks.ts",
    test: "recovery restores a persisted",
    before: "    if (task.reported.includes(turn.id)) {\n      this.store.save();\n      return;\n    }\n",
    after: "",
  },
  {
    rule: "RecoveredEmptyTaskReleased",
    file: "tasks.ts",
    test: "crash at turn/start",
    before: 'if (thread.status.type === "idle") this.failLaunch(task);',
    after: "void thread;",
  },
  {
    rule: "RecoveredOutcomeKnown",
    file: "tasks.ts",
    test: "recovery restores a persisted",
    before: 'if (turn.status === "inProgress") return;',
    after: 'if (turn.status === "inProgress" || task.reported.includes(turn.id)) return;',
  },
  {
    rule: "OutcomePreserved",
    file: "tasks.ts",
    test: "duplicate failed result",
    before: "outcome: turn.status",
    after: 'outcome: "completed"',
  },
  {
    rule: "TerminalOwnsWorkerApproval",
    file: "tasks.ts",
    test: "worker approval remains",
    before: 'event.method?.includes("requestApproval")) {',
    after: 'event.method?.includes("requestApproval")) { this.rpc.respond(event.id, { decision: "accept" });',
  },
  {
    rule: "ChatNeverApproves",
    file: "engine.ts",
    test: "worker approval remains",
    before: '{ decision: "decline" }',
    after: '{ decision: "accept" }',
  },
  {
    rule: "DisconnectedRejectsNewWork",
    file: "engine.ts",
    test: "worker approval remains",
    before: 'if (!this.connected || conversation.state.kind === "disconnected")',
    after: "if (false)",
  },
  {
    rule: "NoInventedCompletion",
    file: "tasks.ts",
    test: "terminal failure with an unconfirmed",
    before: 'task.state = task.threadId ? { kind: "disconnected", reason } : { kind: "failed", reason };',
    after: 'task.state = { kind: "finished", turnId: "invented", outcome: "completed", text: "Invented success" };',
  },
];
let missed = false;
for (const mutation of cases) {
  const scratch = mkdtempSync("/tmp/herdr-formal-mutant-");
  try {
    for (const directory of ["src", "test", "verification"])
      cpSync(join(source, directory), join(scratch, directory), { recursive: true });
    symlinkSync(join(source, "node_modules"), join(scratch, "node_modules"));
    const file = join(scratch, "src/desktop", mutation.file);
    const text = readFileSync(file, "utf8");
    if (text.split(mutation.before).length !== 2)
      throw new Error(`${mutation.rule}: mutation target changed; reconcile it with the current source`);
    writeFileSync(file, text.replace(mutation.before, mutation.after));
    const child = Bun.spawn(
      [process.execPath, "verification/herdr-chat/runtime.ts", "--test-name-pattern", mutation.test],
      {
        cwd: scratch,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const output = stdout + stderr;
    writeFileSync(join(out, `${mutation.rule}.txt`), output);
    const caught = code !== 0 && output.includes("expect(received)") && output.includes("1 fail");
    console.log(`${mutation.rule}: ${caught ? "CAUGHT by runtime assertion" : "MISSED or invalid probe"}`);
    missed ||= !caught;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
console.log(`Evidence: ${out}`);
process.exit(missed ? 1 : 0);
