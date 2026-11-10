import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { type AcpEnvelope, StdioRpc } from "./stdio.ts";
import { mainSandboxPolicy } from "./sandbox.ts";

export const optionsSchema = z.object({
  configOptions: z.array(
    z.object({
      id: z.string(),
      currentValue: z.string(),
      options: z.array(z.object({ value: z.string(), name: z.string() })).optional(),
    }),
  ),
});
export const sessionSchema = optionsSchema.extend({
  sessionId: z.string(),
  models: z
    .object({
      currentModelId: z.string(),
      availableModels: z.array(z.object({ modelId: z.string(), name: z.string() })),
    })
    .optional(),
});
const cli = fileURLToPath(new URL("../cli.ts", import.meta.url));

export class AcpSession {
  readonly rpc: StdioRpc;
  readonly cwd: string;
  readonly mcpServers;
  id = "";
  data: z.infer<typeof sessionSchema> | undefined;
  onUpdate: (message: AcpEnvelope) => void = () => {};

  constructor(
    directory: string,
    readonly project: string,
    runtime: string,
    binding?: { url: string; token: string },
  ) {
    if (process.platform !== "darwin") throw new Error("Antigravity 主聊天目前需要 macOS 的只读进程沙盒");
    const executable = Bun.which("agy");
    if (!executable) throw new Error("未安装 Antigravity CLI (agy)");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const state = realpathSync(directory);
    this.cwd = join(state, "workspace");
    mkdirSync(this.cwd, { recursive: true, mode: 0o700 });
    const git = Bun.spawnSync(["git", "init", "-q"], { cwd: this.cwd });
    if (git.exitCode !== 0) throw new Error("无法初始化主聊天的私有工作目录");
    const dataName = `dori-chat/${crypto.randomUUID()}`;
    const privateData = join(homedir(), ".gemini", dataName);
    mkdirSync(privateData, { recursive: true, mode: 0o700 });
    const temporary = join(state, "tmp");
    mkdirSync(temporary, { recursive: true, mode: 0o700 });
    const sandbox = join(state, "readonly.sb");
    writeFileSync(
      sandbox,
      mainSandboxPolicy({
        runtime: realpathSync(runtime),
        session: state,
        privateData: realpathSync(privateData),
        ...(binding ? { port: Number(new URL(binding.url).port) } : {}),
      }),
      { mode: 0o600 },
    );
    this.mcpServers = binding
      ? [
          {
            name: "herdr_host",
            command: process.execPath,
            args: [cli, "mcp-host", join(state, "binding.json")],
            env: [],
          },
        ]
      : [];
    if (binding) writeFileSync(join(state, "binding.json"), JSON.stringify(binding), { mode: 0o600 });
    this.rpc = new StdioRpc(
      [
        "/usr/bin/sandbox-exec",
        "-f",
        sandbox,
        executable,
        "acp",
        "--disable-telemetry",
        "--log-file",
        join(state, "provider.log"),
        "--app-data-dir",
        dataName,
        "--include-default-customizations=false",
      ],
      this.cwd,
      { ...process.env, TMPDIR: temporary },
    );
    this.rpc.onMessage = (message) => {
      if (message.method === "session/request_permission" && message.id !== undefined) {
        const permission = z
          .object({
            toolCall: z.object({ name: z.string().optional() }),
            options: z.array(z.object({ optionId: z.string(), kind: z.string() })),
          })
          .parse(message.params);
        const allowed = ["mcp_herdr_host_start_task", "mcp_herdr_host_show_explanation"].includes(
          permission.toolCall.name ?? "",
        );
        const option = permission.options.find((option) => option.kind === (allowed ? "allow_once" : "reject_once"));
        this.rpc.respond(message.id, {
          outcome: option ? { outcome: "selected", optionId: option.optionId } : { outcome: "cancelled" },
        });
      } else if (message.id !== undefined)
        this.rpc.reject(message.id, "This main chat has no write or terminal capability");
      else this.onUpdate(message);
    };
  }

  async initialize(): Promise<z.infer<typeof sessionSchema>> {
    await this.rpc.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "herdr-chat", version: "1" },
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
    this.data = sessionSchema.parse(
      await this.rpc.request("session/new", { cwd: this.cwd, mcpServers: this.mcpServers }),
    );
    this.id = this.data.sessionId;
    return this.data;
  }
  async set(configId: string, value: string): Promise<z.infer<typeof optionsSchema>> {
    const result = optionsSchema.parse(
      await this.rpc.request("session/set_config_option", { sessionId: this.id, configId, value }),
    );
    if (result.configOptions.find((option) => option.id === configId)?.currentValue !== value)
      throw new Error(`CLI 没有确认 ${configId}=${value}`);
    return result;
  }
  async load(): Promise<z.infer<typeof sessionSchema>> {
    this.data = sessionSchema.parse(
      await this.rpc.request("session/load", { sessionId: this.id, cwd: this.cwd, mcpServers: this.mcpServers }),
    );
    return this.data;
  }
  close(): void {
    this.rpc.close();
  }
}
