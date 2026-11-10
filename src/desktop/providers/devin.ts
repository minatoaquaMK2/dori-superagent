import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { command } from "../herdr.ts";
import { type Catalog, revision, unavailable } from "../profile.ts";

const modelsSchema = z.object({
  families: z.array(
    z.object({ family_label: z.string(), variants: z.array(z.object({ model_uid: z.string(), label: z.string() })) }),
  ),
});

export async function devinCatalog(directory: string): Promise<Catalog> {
  if (!Bun.which("devin")) return unavailable("devin", "未安装 Devin CLI", "missingCli");
  const data = modelsSchema.parse(JSON.parse(await command(["devin", "models", "list", "--format", "json"])));
  const privateDirectory = join(directory, "devin-capabilities");
  mkdirSync(join(privateDirectory, ".devin"), { recursive: true, mode: 0o700 });
  const config = join(privateDirectory, "config.json");
  writeFileSync(
    config,
    JSON.stringify({ version: 1, permission_mode: "auto", auto_update: false, subagents_enabled: false }),
    { mode: 0o600 },
  );
  const cli = fileURLToPath(new URL("../cli.ts", import.meta.url));
  writeFileSync(
    join(privateDirectory, "binding.json"),
    JSON.stringify({ url: "http://127.0.0.1:1", token: "capability-probe-no-tool-access" }),
    { mode: 0o600 },
  );
  writeFileSync(
    join(privateDirectory, ".devin", "mcp_config.json"),
    JSON.stringify({
      mcpServers: {
        herdr_host: { command: process.execPath, args: [cli, "mcp-host", join(privateDirectory, "binding.json")] },
      },
    }),
    { mode: 0o600 },
  );
  const child = Bun.spawn(["devin", "--config", config, "mcp", "list"], {
    cwd: privateDirectory,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = setTimeout(() => child.kill(), 20_000);
  let policy: string;
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    policy = stdout + stderr;
    if (code !== 0) throw new Error(`Devin capability check failed (${code}): ${policy}`);
  } finally {
    clearTimeout(timeout);
  }
  const reason = /not in your organization.s allowlist/i.test(policy)
    ? "Devin 组织策略拒绝 Herdr host tools。需要管理员将 herdr_host 加入 MCP allowlist；未绕过组织策略。"
    : "Devin 的主聊天只读隔离与 host tools 尚未通过当前配置验证；未自动改用其他 CLI。";
  return {
    provider: "devin",
    label: "Devin",
    revision: revision(data),
    status: "unsupportedProfile",
    reason,
    models: data.families.flatMap((family) =>
      family.variants.map((variant) => ({
        id: variant.model_uid,
        label: variant.label,
        effort: { kind: "unsupported" },
      })),
    ),
    defaultSelection: null,
  };
}
