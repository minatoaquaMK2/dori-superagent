import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const source = resolve(import.meta.dir, "../..");
const out = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync("/tmp/herdr-formal-mutations-");
mkdirSync(out, { recursive: true });
const cases = [
  {
    rule: "SelectedProfileValid",
    file: "profile.ts",
    test: "model catalog rejects unsupported effort",
    before: 'if (selection.effortChoice !== null) throw new Error("此模型不提供强度选项");',
    after: "void selection;",
  },
  {
    rule: "IntentBeforeEffect",
    file: "tasks.ts",
    test: "crash at thread/start",
    before: "this.store.state.tasks.push(task);\n    this.store.save(conversation);",
    after: "this.store.state.tasks.push(task);",
    extra: {
      before: 'task.launch = "thread-attempted";\n      this.store.save();',
      after: 'task.launch = "thread-attempted";',
    },
  },
  {
    rule: "CallStartsOnce",
    file: "tasks.ts",
    test: "a finished dispatch call",
    before: "if (previous) {",
    after: "if (false && previous) {",
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
    file: "chat-events.ts",
    test: "worker approval remains",
    before: '{ decision: "decline" }',
    after: '{ decision: "accept" }',
  },
  {
    rule: "DisconnectedRejectsNewWork",
    file: "engine.ts",
    test: "worker approval remains",
    before: 'if ((!this.connected && provider === "codex") || conversation.state.kind === "disconnected")',
    after: "if (false)",
  },
  {
    rule: "NoInventedCompletion",
    file: "tasks.ts",
    test: "terminal failure with an unconfirmed",
    before: 'task.state = task.launch !== "intent" ? { kind: "disconnected", reason } : { kind: "failed", reason };',
    after: 'task.state = { kind: "finished", turnId: "invented", outcome: "completed", text: "Invented success" };',
  },
  {
    rule: "UnknownThreadIdentityHeld",
    file: "tasks.ts",
    test: "crash at thread/start",
    before: 'if (task.launch === "intent") this.failLaunch(task);',
    after: "if (true) this.failLaunch(task);",
  },
  {
    rule: "TerminalBeforeTurn",
    file: "tasks.ts",
    test: "crash at turn/start",
    before: "task.terminal = await attachTerminal(task, conversation.space, this.socket);",
    after: "task.terminal = null;",
  },
  {
    rule: "BusyProfileFrozen",
    file: "configuration.ts",
    test: "composer profile uses CLI config",
    before: 'if (conversation.state.kind !== "idle" || conversation.pending.length || conversation.activeRun)',
    after: "if (false)",
  },
  {
    rule: "WorkerFollowsAcceptedProfile",
    file: "tasks.ts",
    test: "worker dispatch uses the accepted origin",
    before:
      "...codexSettings(origin.profile),\n        config: { model_reasoning_effort: origin.profile.resolved.effort },",
    after:
      "...codexSettings(conversation.profile),\n        config: { model_reasoning_effort: conversation.profile.resolved.effort },",
  },
  {
    rule: "StaleRunCannotCreate",
    file: "host-tools.ts",
    test: "scoped host receipts survive reload",
    before:
      'conversation.activeRun !== run.origin.run ||\n      conversation.activeSegment !== run.origin.segment ||\n      run.state !== "attempted"',
    after: "false",
  },
  {
    rule: "ReceiptPayloadBound",
    file: "host-tools.ts",
    test: "scoped host receipts survive reload",
    before: 'if (receipt.fingerprint !== fingerprint) throw new Error("此操作身份已用于不同的参数");',
    after: "void fingerprint;",
  },
  {
    rule: "UnknownRunCannotCreate",
    file: "host-tools.ts",
    test: "unknown runs and revoked bindings",
    before: 'run.state !== "attempted"',
    after: "false",
  },
  {
    rule: "UnsentAcpRunReleased",
    file: "recovery.ts",
    test: "an ACP run interrupted before session creation",
    before: "!conversation.threadId &&",
    after: "false &&",
  },
  {
    rule: "OpenTerminalRetainsProject",
    file: "model.ts",
    test: "native results use real turn boundaries",
    before: '(task.runtime.kind === "native" && task.runtime.open) ||',
    after: "",
  },
  {
    rule: "OnlyQuiescentResult",
    file: "workers/native-cli.ts",
    test: "native results use real turn boundaries",
    before: "if (!stop.fullyIdle) return;",
    after: "",
  },
  {
    rule: "NativeResultOnce",
    file: "workers/native-cli.ts",
    test: "native results use real turn boundaries",
    before: "if (task.reported.includes(turnId)) return;",
    after: "",
  },
  {
    rule: "UnknownLaunchNotReplayed",
    file: "tasks.ts",
    test: "native recovery retains an unknown launch",
    before: "this.native.poll(task);",
    after: "await this.native.launch(task, this.store.conversation(task.conversation).space);",
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
    let changed = text;
    const replacements = [mutation, ...("extra" in mutation && mutation.extra ? [mutation.extra] : [])];
    for (const replacement of replacements) {
      if (changed.split(replacement.before).length !== 2)
        throw new Error(`${mutation.rule}: mutation target changed; reconcile it with the current source`);
      changed = changed.replace(replacement.before, replacement.after);
    }
    writeFileSync(file, changed);
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
