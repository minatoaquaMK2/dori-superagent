import { z } from "zod";
import { attachNativeTerminal, command } from "../herdr.ts";
import type { Task } from "../model.ts";
import { providerNames } from "../profile.ts";
import type { Store } from "../store.ts";
import { prepareNativeWorker } from "./manifest.ts";
import { type NativeReport, readReports } from "./reporter.ts";

const agyStartSchema = z.object({ conversationId: z.string(), modelName: z.string().optional() });
const agyStopSchema = agyStartSchema.extend({
  executionNum: z.number().int(),
  fullyIdle: z.boolean(),
  terminationReason: z.string(),
  error: z.string().optional(),
  transcriptPath: z.string(),
});
const devinSchema = z.object({
  session_id: z.string(),
  prompt_id: z.string().optional(),
  last_assistant_message: z.string().optional(),
});

export class NativeWorkers {
  private checking = new Set<string>();
  constructor(private readonly store: Store) {}

  async launch(task: Task, space: string): Promise<string> {
    const argv = prepareNativeWorker(task);
    task.launch = "terminal-attempted";
    this.store.save();
    task.terminal = await attachNativeTerminal(task, space, argv);
    task.launch = "attached";
    this.store.save();
    this.poll(task);
    return task.terminal;
  }

  async reconcile(task: Task): Promise<void> {
    if (task.runtime.kind !== "native" || !task.runtime.open || this.checking.has(task.id)) return;
    this.checking.add(task.id);
    try {
      const terminals = z
        .object({ terminals: z.array(z.object({ address: z.string() }).passthrough()) })
        .parse(JSON.parse(await command(["hc", "ls", "--json", "--label", `dori.chat.task=${task.id}`]))).terminals;
      const found = terminals.find((terminal) => !task.terminal || terminal.address === task.terminal);
      if (!found && task.terminal) {
        this.closed(task);
        return;
      }
      if (!found) return;
      const observed = z
        .object({ state: z.string(), labels: z.record(z.string(), z.string()) })
        .parse(JSON.parse(await command(["hc", "get", found.address, "--json"])));
      if (observed.labels["dori.chat.task"] !== task.id || observed.labels["herdr.tab"] !== task.tab)
        throw new Error("Native terminal identity changed");
      task.terminal = found.address;
      if (observed.state === "finished") this.closed(task);
      else this.store.save();
    } catch (error) {
      task.state = { kind: "disconnected", reason: `无法核对原生终端：${String(error)}` };
      this.store.save();
    } finally {
      this.checking.delete(task.id);
    }
  }

  private closed(task: Task): void {
    if (task.runtime.kind !== "native") return;
    task.runtime.open = false;
    if (task.state.kind !== "finished")
      task.state = { kind: "failed", reason: "原生终端已关闭，未收到本轮结果；未重放任务。" };
    this.store.save();
  }

  poll(task: Task): void {
    if (task.runtime.kind !== "native") return;
    try {
      for (const report of readReports(task.runtime.directory)) {
        if (task.runtime.receipts.includes(report.id)) continue;
        this.apply(task, report);
        task.runtime.receipts.push(report.id);
        this.store.save(this.store.conversation(task.origin.conversation));
      }
    } catch (error) {
      if (task.runtime.open) task.state = { kind: "disconnected", reason: `终端回报待确认：${String(error)}` };
      this.store.save();
    }
  }

  private apply(task: Task, report: NativeReport): void {
    if (task.runtime.kind !== "native") return;
    if (report.event === "ProcessExit") {
      const { code } = z.object({ code: z.number().int() }).parse(report.payload);
      task.runtime.open = false;
      if (task.state.kind !== "finished")
        task.state = { kind: "failed", reason: `CLI 已退出 (${code})，未收到权威本轮结果` };
      return;
    }
    const agy = task.origin.profile.selection.provider === "antigravity";
    const session = agy
      ? agyStartSchema.parse(report.payload).conversationId
      : devinSchema.parse(report.payload).session_id;
    if (task.runtime.sessionId && task.runtime.sessionId !== session) throw new Error("回报会话与任务不匹配");
    task.runtime.sessionId = session;
    if (report.event !== "Stop") {
      if (report.event === "PreInvocation" || report.event === "UserPromptSubmit") {
        const turn = agy ? `${session}:pending` : `${session}:${devinSchema.parse(report.payload).prompt_id}`;
        task.state = { kind: "running", turnId: turn };
      }
      return;
    }
    let turnId: string;
    let text: string;
    let outcome: "completed" | "failed" | "interrupted" = "completed";
    if (agy) {
      const stop = agyStopSchema.parse(report.payload);
      if (!stop.fullyIdle) return;
      const result = z.object({ boundary: z.number().int(), text: z.string() }).parse(report.payload["doriResult"]);
      turnId = `${session}:${result.boundary}`;
      if (stop.error) outcome = "failed";
      else if (/cancel|interrupt/i.test(stop.terminationReason)) outcome = "interrupted";
      else if (stop.terminationReason !== "NO_TOOL_CALL")
        throw new Error(`尚不支持的终止原因 ${stop.terminationReason}`);
      text = result.text || stop.error || "本轮未返回文字结果。";
    } else {
      const stop = devinSchema.parse(report.payload);
      if (!stop.prompt_id) throw new Error("Devin 回报缺少 prompt_id");
      turnId = `${session}:${stop.prompt_id}`;
      text = stop.last_assistant_message || "本轮未返回文字结果。";
    }
    if (task.reported.includes(turnId)) return;
    task.state = { kind: "finished", turnId, outcome, text };
    task.reported.push(turnId);
    const conversation = this.store.conversation(task.origin.conversation);
    const status = { completed: "返回结果", failed: "运行失败", interrupted: "已中断" }[outcome];
    const summary = `**${task.title} · ${status}**\n\n${text}\n\n此终端仍保留项目执行权。可在原终端继续对话；关闭 CLI 后可派发下一项任务。`;
    conversation.resultContext.push(summary);
    this.store.message(
      conversation,
      summary,
      providerNames[task.origin.profile.selection.provider],
      `task:${task.id}:${turnId}`,
    );
  }
}
