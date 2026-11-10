import { spawn } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import { command } from "./herdr.ts";
import { connectionSchema } from "./model.ts";
import { desktopPaths } from "./paths.ts";

async function connection(file: string) {
  try {
    const config = connectionSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    const response = await fetch(`${config.url}/health`, {
      headers: { authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(1000),
    });
    if (
      response.ok &&
      z.object({ protocolVersion: z.literal(2), connected: z.boolean() }).parse(await response.json()).connected
    )
      return config;
  } catch {}
  return null;
}

async function startBridge() {
  const paths = desktopPaths();
  const running = await connection(paths.connection);
  if (running) return running;
  if (existsSync(paths.lock)) {
    const pid = Number(readFileSync(paths.lock, "utf8"));
    let alive = true;
    if (!Number.isInteger(pid) || pid < 1) throw new Error(`Invalid bridge lock: ${paths.lock}`);
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") alive = false;
      else throw error;
    }
    if (alive)
      throw new Error(
        `The running chat bridge (${pid}) is disconnected or uses an older protocol. Restart that bridge before installing this chat version; inspect ${paths.bridgeLog}.`,
      );
    unlinkSync(paths.lock);
  }
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  const log = openSync(paths.bridgeLog, "a", 0o600);
  const child = spawn(process.execPath, [join(import.meta.dir, "cli.ts"), "serve"], {
    detached: true,
    stdio: ["ignore", log, log],
    env: process.env,
  });
  closeSync(log);
  child.unref();
  for (let attempt = 0; attempt < 200; attempt++) {
    const config = await connection(paths.connection);
    if (config) return config;
    await Bun.sleep(100);
  }
  throw new Error(`Bridge did not become ready; see ${paths.bridgeLog}`);
}

const spacesSchema = z.object({
  spaces: z.array(
    z
      .object({
        id: z.string(),
        folder: z.string().nullable().optional(),
        tabs: z.array(z.object({ id: z.string(), name: z.string().optional() }).passthrough()).optional(),
      })
      .passthrough(),
  ),
});

export async function install(cwd: string): Promise<void> {
  const folder = realpathSync(resolve(cwd));
  const config = await startBridge();
  const appHome = resolve(process.env["HERDR_APP_HOME"] ?? join(homedir(), ".config", "herdr-app"));
  const mod = join(appHome, "mods", "dori-chat");
  mkdirSync(mod, { recursive: true });
  cpSync(resolve(import.meta.dir, "../../herdr/mods/dori-chat"), mod, { recursive: true });
  await command(["herdr-app", "check", mod]);
  let spaces = spacesSchema.parse(JSON.parse(await command(["herdr-app", "ls"]))).spaces;
  let space = spaces.find((space) => space.folder === folder);
  if (!space) {
    await command(["herdr-app", "do", "space.new", JSON.stringify({ name: basename(folder), folder })]);
    spaces = spacesSchema.parse(JSON.parse(await command(["herdr-app", "ls"]))).spaces;
    space = spaces.find((space) => space.folder === folder);
  }
  if (!space) throw new Error("Herdr did not create the project space");
  const conversation = `herdr:${space.id}`;
  const response = await fetch(`${config.url}/open`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
    body: JSON.stringify({ conversation, cwd: folder, space: space.id }),
  });
  if (!response.ok) throw new Error(await response.text());
  await command(["herdr-app", "do", "layout.switch", JSON.stringify({ name: "main" })]);
  const existing = space.tabs?.find((tab) => tab.name === "聊天工作台");
  if (existing) await command(["herdr-app", "do", "tab.select", JSON.stringify({ id: existing.id })]);
  else
    await command([
      "herdr-app",
      "do",
      "tab.new",
      JSON.stringify({
        name: "聊天工作台",
        space: space.id,
        mod: "dori-chat",
        props: { conversation, cwd: folder, space: space.id, connection: desktopPaths().connection },
      }),
    ]);
  process.stdout.write(`聊天工作台已打开。Codex · ${folder}\n`);
}
