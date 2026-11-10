import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Task } from "../model.ts";

const cli = fileURLToPath(new URL("../cli.ts", import.meta.url));
export const manifestSchema = z.object({
  task: z.string(),
  provider: z.enum(["antigravity", "devin"]),
  cwd: z.string(),
  argv: z.array(z.string()),
});
const quote = (word: string) => `'${word.replaceAll("'", "'\\''")}'`;

export function prepareNativeWorker(task: Task): string[] {
  if (task.runtime.kind !== "native" || task.origin.profile.resolved.provider === "codex")
    throw new Error("Not a native CLI task");
  const directory = task.runtime.directory;
  mkdirSync(join(directory, "spool"), { recursive: true, mode: 0o700 });
  const settings = task.origin.profile.resolved;
  const hook = (event: string) => [process.execPath, cli, "worker-report", directory, event].map(quote).join(" ");
  const prompt = `Complete the user's task and verify your result. Use this project directory: ${task.cwd}. Do not delegate or launch other agents. Report concrete results truthfully in the user's language.\n\n${task.prompt}`;
  let argv: string[];
  if (settings.provider === "antigravity") {
    const extension = join(directory, "extension");
    mkdirSync(join(extension, ".agents"), { recursive: true, mode: 0o700 });
    const hooks = Object.fromEntries(
      ["SessionStart", "PreInvocation", "Stop"].map((event) => [event, [{ type: "command", command: hook(event) }]]),
    );
    writeFileSync(join(extension, ".agents", "hooks.json"), JSON.stringify({ "dori-worker": hooks }), { mode: 0o600 });
    argv = [
      "agy",
      "--dangerously-skip-permissions",
      "--model",
      settings.model,
      ...(settings.effort ? ["--effort", settings.effort] : []),
      "--add-dir",
      extension,
      "--prompt-interactive",
      prompt,
    ];
  } else {
    let config: Record<string, unknown> = {};
    try {
      config = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(readFileSync(join(homedir(), ".config", "devin", "config.json"), "utf8")));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const hooks = z.record(z.string(), z.array(z.unknown())).parse(config["hooks"] ?? {});
    for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"]) {
      hooks[event] = [...(hooks[event] ?? []), { matcher: "", hooks: [{ type: "command", command: hook(event) }] }];
    }
    const path = join(directory, "devin.json");
    writeFileSync(path, JSON.stringify({ ...config, hooks }), { mode: 0o600 });
    const promptFile = join(directory, "prompt.txt");
    writeFileSync(promptFile, prompt, { mode: 0o600 });
    argv = [
      "devin",
      "--config",
      path,
      "--permission-mode",
      "dangerous",
      "--respect-workspace-trust",
      "false",
      "--model",
      settings.model,
      "--export",
      join(directory, "export.json"),
      "--prompt-file",
      promptFile,
    ];
  }
  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify({ task: task.id, provider: settings.provider, cwd: task.cwd, argv }),
    { mode: 0o600 },
  );
  return [process.execPath, cli, "native-worker", directory];
}
