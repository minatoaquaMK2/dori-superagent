import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function desktopPaths(
  root = process.env["DORI_DESKTOP_HOME"] ?? join(homedir(), ".local", "state", "dori-chat"),
) {
  const home = resolve(root);
  return {
    home,
    socket: join(home, "codex.sock"),
    state: join(home, "state.json"),
    connection: join(home, "connection.json"),
    serverLog: join(home, "codex.log"),
    bridgeLog: join(home, "bridge.log"),
    lock: join(home, "bridge.lock"),
  };
}
