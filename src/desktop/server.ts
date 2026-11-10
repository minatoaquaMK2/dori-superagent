import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { createConnection } from "node:net";
import type { desktopPaths } from "./paths.ts";

async function listening(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const connection = createConnection(socket);
    connection.once("connect", () => {
      connection.destroy();
      resolve(true);
    });
    connection.once("error", () => resolve(false));
    connection.setTimeout(1000, () => {
      connection.destroy();
      resolve(false);
    });
  });
}

export async function ensureServer(paths: ReturnType<typeof desktopPaths>): Promise<void> {
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  if (await listening(paths.socket)) return;
  if (existsSync(paths.socket)) unlinkSync(paths.socket);
  const log = openSync(paths.serverLog, "a", 0o600);
  const child = spawn("codex", ["app-server", "--listen", `unix://${paths.socket}`], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  let error: Error | undefined;
  child.on("error", (value) => {
    error = value;
  });
  child.unref();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (error) throw error;
    if (await listening(paths.socket)) return;
    await Bun.sleep(100);
  }
  throw new Error(`Codex app-server did not start; see ${paths.serverLog}`);
}
