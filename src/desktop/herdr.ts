import { z } from "zod";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { Task } from "./model.ts";

const terminalCli = fileURLToPath(new URL("./cli.ts", import.meta.url));

export async function command(argv: string[]): Promise<string> {
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 20_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`${argv[0]} failed (${code}): ${stderr || stdout}`);
    return stdout;
  } finally {
    clearTimeout(timeout);
  }
}

export async function attachTerminal(task: Task, space: string, socket: string): Promise<string> {
  if (!task.threadId) throw new Error("Task has no Codex thread");
  const existing = z
    .object({ terminals: z.array(z.object({ address: z.string() }).passthrough()) })
    .parse(JSON.parse(await command(["hc", "ls", "--json", "--label", `dori.chat.task=${task.id}`]))).terminals[0];
  if (existing) {
    const terminal = z
      .object({ foreground: z.object({ argv: z.array(z.string()) }).nullable() })
      .parse(JSON.parse(await command(["hc", "get", existing.address, "--json"])));
    const argv = terminal.foreground?.argv ?? [];
    const codex =
      basename(argv[0] ?? "") === "codex" &&
      argv.includes(task.threadId) &&
      argv[argv.indexOf("--remote") + 1] === `unix://${socket}`;
    const adapter =
      argv[1] === terminalCli && argv[2] === "terminal" && argv[3] === socket && argv[4] === task.threadId;
    if (!codex && !adapter) {
      throw new Error(`终端 ${existing.address} 已不再连接此 Codex 会话。请在 Herdr 中检查该终端；任务没有自动重放。`);
    }
    return existing.address;
  }
  const result = await command([
    "hc",
    "run",
    "--json",
    "--bg",
    "--no-parent",
    "--no-notify",
    "--keep",
    "--cwd",
    task.cwd,
    "--label",
    `herdr.space=${space}`,
    "--label",
    `herdr.tab=${task.tab}`,
    "--label",
    `dori.chat.task=${task.id}`,
    "--name",
    `chat-${task.id.slice(0, 12)}`,
    "--",
    process.execPath,
    terminalCli,
    "terminal",
    socket,
    task.threadId,
  ]);
  const address = z.object({ address: z.string() }).parse(JSON.parse(result)).address;
  void nameTaskTab(task);
  return address;
}

async function nameTaskTab(task: Task): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const spaces = z
        .object({
          spaces: z.array(z.object({ tabs: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough()),
        })
        .parse(JSON.parse(await command(["herdr-app", "ls"])));
      if (spaces.spaces.some((space) => space.tabs.some((tab) => tab.id === task.tab))) {
        await command(["herdr-app", "do", "tab.rename", JSON.stringify({ id: task.tab, name: task.title })]);
        return;
      }
    } catch (error) {
      if (attempt === 9) process.stderr.write(`${JSON.stringify({ task: task.id, error: String(error) })}\n`);
    }
    await Bun.sleep(250);
  }
}

export async function attachNativeTerminal(task: Task, space: string, argv: string[]): Promise<string> {
  if (task.runtime.kind !== "native") throw new Error("Task has no native runtime");
  const existing = z
    .object({ terminals: z.array(z.object({ address: z.string() }).passthrough()) })
    .parse(JSON.parse(await command(["hc", "ls", "--json", "--label", `dori.chat.task=${task.id}`]))).terminals[0];
  if (existing) {
    const terminal = z
      .object({ foreground: z.object({ argv: z.array(z.string()) }).nullable() })
      .parse(JSON.parse(await command(["hc", "get", existing.address, "--json"])));
    const foreground = terminal.foreground?.argv ?? [];
    if (!foreground.includes(task.runtime.directory)) throw new Error("任务终端身份无法确认，未重新启动 CLI");
    return existing.address;
  }
  const result = await command([
    "hc",
    "run",
    "--json",
    "--bg",
    "--no-parent",
    "--no-notify",
    "--keep",
    "--cwd",
    task.cwd,
    "--label",
    `herdr.space=${space}`,
    "--label",
    `herdr.tab=${task.tab}`,
    "--label",
    `dori.chat.task=${task.id}`,
    "--name",
    `chat-${task.id.slice(0, 12)}`,
    "--",
    ...argv,
  ]);
  const address = z.object({ address: z.string() }).parse(JSON.parse(result)).address;
  const terminal = z
    .object({ labels: z.record(z.string(), z.string()).optional(), cwd: z.string().optional() })
    .passthrough()
    .parse(JSON.parse(await command(["hc", "get", address, "--json"])));
  if (
    terminal.labels?.["dori.chat.task"] !== task.id ||
    terminal.labels?.["herdr.space"] !== space ||
    terminal.labels?.["herdr.tab"] !== task.tab
  )
    throw new Error("Herdr 返回的终端归属不匹配，任务启动结果待确认");
  void nameTaskTab(task);
  return address;
}
