import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { Engine } from "./engine.ts";
import { serve } from "./http.ts";
import { desktopPaths } from "./paths.ts";
import { Rpc } from "./rpc.ts";
import { ensureServer } from "./server.ts";
import { Store } from "./store.ts";

function acquire(file: string): void {
  try {
    const fd = openSync(file, "wx", 0o600);
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    const pid = Number(readFileSync(file, "utf8"));
    try {
      process.kill(pid, 0);
    } catch {
      unlinkSync(file);
      acquire(file);
      return;
    }
    throw new Error(`Chat bridge is already running (${pid})`);
  }
}

export async function runBridge(): Promise<void> {
  const paths = desktopPaths();
  mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  acquire(paths.lock);
  process.on("exit", () => {
    try {
      unlinkSync(paths.lock);
    } catch {}
  });
  await ensureServer(paths);
  const rpc = new Rpc(paths.socket);
  const engine = new Engine(new Store(paths.state), rpc, paths.socket);
  try {
    await engine.initialize();
  } catch (error) {
    rpc.close();
    throw error;
  }
  const token = crypto.randomUUID() + crypto.randomUUID();
  const server = serve(engine, token);
  writeFileSync(paths.connection, JSON.stringify({ url: server.url.origin, token, pid: process.pid }), { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ready: true, connection: paths.connection })}\n`);
  const stop = () => {
    server.stop(true);
    rpc.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
