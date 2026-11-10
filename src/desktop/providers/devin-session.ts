import { Database } from "bun:sqlite";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { optionsSchema, sessionSchema } from "./acp-session.ts";
import { hostCliInstructions, permittedHostCommand } from "./host-cli.ts";
import { mainSandboxPolicy } from "./sandbox.ts";
import { type AcpEnvelope, StdioRpc } from "./stdio.ts";

export class DevinSession {
  readonly rpc: StdioRpc;
  readonly cwd: string;
  readonly bindingFile: string;
  readonly database: string;
  id = "";
  data: z.infer<typeof sessionSchema> | undefined;
  operation: string | null = null;
  onUpdate: (message: AcpEnvelope) => void = () => {};
  onNotice: (text: string) => void = () => {};

  constructor(directory: string, runtime: string, binding?: { url: string; token: string }) {
    if (process.platform !== "darwin") throw new Error("Devin 主聊天目前需要 macOS 只读进程沙盒");
    const installed = Bun.which("devin");
    if (!installed) throw new Error("未安装 Devin CLI");
    const executable = realpathSync(installed);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const state = realpathSync(directory);
    this.cwd = join(state, "workspace");
    const configRoot = join(state, "config");
    const dataRoot = join(state, "data");
    const cache = join(state, "cache");
    const temporary = join(state, "tmp");
    for (const path of [this.cwd, configRoot, join(dataRoot, "devin"), cache, temporary])
      mkdirSync(path, { recursive: true, mode: 0o700 });
    const sourceConfig = join(process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"), "devin");
    const sourceData = join(process.env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share"), "devin");
    const credentials = join(sourceData, "credentials.toml");
    if (!existsSync(credentials)) throw new Error("Devin 尚未登录。请在原生 CLI 登录后重试。");
    copyFileSync(credentials, join(dataRoot, "devin", "credentials.toml"));
    chmodSync(join(dataRoot, "devin", "credentials.toml"), 0o600);
    let model: string | undefined;
    const userConfig = join(sourceConfig, "config.json");
    if (existsSync(userConfig))
      model = z
        .object({ agent: z.object({ model: z.string().optional() }).optional() })
        .parse(JSON.parse(readFileSync(userConfig, "utf8"))).agent?.model;
    const config = join(state, "config.json");
    writeFileSync(
      config,
      JSON.stringify({
        version: 1,
        permission_mode: "dangerous",
        auto_update: false,
        subagents_enabled: false,
        ...(model ? { agent: { model } } : {}),
      }),
      { mode: 0o600 },
    );
    this.bindingFile = join(state, "binding.json");
    if (binding) writeFileSync(this.bindingFile, JSON.stringify(binding), { mode: 0o600 });
    this.database = join(dataRoot, "devin", "cli", "sessions.db");
    const blocked = [sourceConfig, sourceData, join(homedir(), ".devin")].map((path) =>
      existsSync(path) ? realpathSync(path) : path,
    );
    const installedVersion = /\/cli\/_versions\/[^/]+\/bin\/devin$/.test(executable)
      ? dirname(dirname(executable))
      : null;
    const policy =
      mainSandboxPolicy({
        runtime: realpathSync(runtime),
        session: state,
        privateData: dataRoot,
        ...(binding ? { port: Number(new URL(binding.url).port) } : {}),
      }) +
      `\n(deny file-read* ${blocked.map((path) => `(subpath ${JSON.stringify(path)})`).join(" ")})\n${installedVersion ? `(allow file-read* (subpath ${JSON.stringify(installedVersion)}))` : ""}\n`;
    const sandbox = join(state, "readonly.sb");
    writeFileSync(sandbox, policy, { mode: 0o600 });
    this.rpc = new StdioRpc(["/usr/bin/sandbox-exec", "-f", sandbox, executable, "--config", config, "acp"], this.cwd, {
      ...process.env,
      XDG_CONFIG_HOME: configRoot,
      XDG_DATA_HOME: dataRoot,
      XDG_CACHE_HOME: cache,
      TMPDIR: temporary,
    });
    this.rpc.onMessage = (message) => {
      if (message.method === "session/request_permission" && message.id !== undefined) {
        const permission = z
          .object({
            toolCall: z.object({ _meta: z.record(z.string(), z.unknown()).optional() }),
            options: z.array(z.object({ optionId: z.string(), kind: z.string() })),
          })
          .parse(message.params);
        const command = permission.toolCall._meta?.["cognition.ai/editableCommand"];
        const allowed = typeof command === "string" && permittedHostCommand(command, this.bindingFile, this.operation);
        const option = permission.options.find((option) => option.kind === (allowed ? "allow_once" : "reject_once"));
        this.rpc.respond(message.id, {
          outcome: option ? { outcome: "selected", optionId: option.optionId } : { outcome: "cancelled" },
        });
        if (!allowed) this.onNotice("Devin 主聊天未执行此操作。主聊天只允许读取项目和调用本轮绑定的任务／解释工具。");
      } else if (message.id !== undefined) this.rpc.reject(message.id, "Unsupported main-chat client capability");
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
      await this.rpc.request("session/new", {
        cwd: this.cwd,
        mcpServers: [],
        _meta: { "cognition.ai/persistOnCreate": true },
      }),
    );
    this.id = this.data.sessionId;
    await this.set("mode", "accept-edits");
    return this.data;
  }
  async set(configId: string, value: string): Promise<z.infer<typeof optionsSchema>> {
    const result = optionsSchema.parse(
      await this.rpc.request("session/set_config_option", { sessionId: this.id, configId, value }),
    );
    if (result.configOptions.find((option) => option.id === configId)?.currentValue !== value)
      throw new Error(`Devin 没有确认 ${configId}=${value}`);
    return result;
  }
  async load(): Promise<z.infer<typeof sessionSchema>> {
    const loaded = sessionSchema
      .omit({ sessionId: true })
      .parse(await this.rpc.request("session/load", { sessionId: this.id, cwd: this.cwd, mcpServers: [] }));
    this.data = { ...loaded, sessionId: this.id };
    return this.data;
  }
  async effectiveModel(): Promise<string> {
    await this.load();
    const db = new Database(this.database, { readonly: true });
    try {
      return z.object({ model: z.string() }).parse(db.query("SELECT model FROM sessions WHERE id = ?").get(this.id))
        .model;
    } finally {
      db.close();
    }
  }
  instructions(operation: string): string {
    this.operation = operation;
    return hostCliInstructions(this.bindingFile, operation);
  }
  close(): void {
    this.rpc.close();
  }
}
