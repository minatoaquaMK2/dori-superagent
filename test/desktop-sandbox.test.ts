import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mainSandboxPolicy } from "../src/desktop/providers/sandbox.ts";

test.skipIf(process.platform !== "darwin")(
  "main sandbox denies broker secrets, other localhost ports and Unix control sockets",
  async () => {
    const directory = realpathSync(mkdtempSync("/tmp/dori-sandbox-test-"));
    const session = join(directory, "main", "own");
    const sibling = join(directory, "workers", "other");
    const privateData = join(directory, "private-data");
    for (const path of [session, sibling, privateData]) mkdirSync(path, { recursive: true });
    const secret = join(directory, "connection.json");
    writeFileSync(secret, "fake-admin-token");
    writeFileSync(join(sibling, "manifest.json"), "fake-worker-state");
    writeFileSync(join(session, "binding.json"), "scoped-token");
    symlinkSync(secret, join(session, "alias.json"));
    const own = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("scoped") });
    const other = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("admin") });
    const socket = join(directory, "hc.sock");
    const control = Bun.listen({
      unix: socket,
      socket: {
        data() {},
        open(peer) {
          peer.end();
        },
      },
    });
    const program = `import json, pathlib, socket, sqlite3, sys, urllib.request
session, root = map(pathlib.Path, sys.argv[1:3])
result = {"own": (session / "binding.json").read_text()}
database = sqlite3.connect(session / "state.db")
database.execute("CREATE TABLE owned (value TEXT)")
database.close()
result["database"] = "created"
result["ancestor_metadata"] = root.is_dir()
try:
    list(root.iterdir())
    result["ancestor_contents"] = "readable"
except PermissionError:
    result["ancestor_contents"] = "denied"
for name, path in [("admin", root / "connection.json"), ("worker", root / "workers/other/manifest.json"), ("alias", session / "alias.json")]:
    try:
        path.read_text()
        result[name] = "readable"
    except PermissionError:
        result[name] = "denied"
for name, url in [("own_tcp", sys.argv[3]), ("other_tcp", sys.argv[4])]:
    try:
        result[name] = urllib.request.urlopen(url, timeout=2).read().decode()
    except OSError:
        result[name] = "denied"
try:
    resolver = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    resolver.connect("/private/var/run/mDNSResponder")
    resolver.close()
    result["dns"] = "connected"
except OSError:
    result["dns"] = "denied"
try:
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.connect(str(root / "hc.sock"))
    result["unix"] = "connected"
except OSError:
    result["unix"] = "denied"
print(json.dumps(result))`;
    try {
      const policy = mainSandboxPolicy({ runtime: directory, session, privateData, port: Number(own.url.port) });
      const child = Bun.spawn(
        [
          "/usr/bin/sandbox-exec",
          "-p",
          policy,
          "python3",
          "-c",
          program,
          session,
          directory,
          own.url.origin,
          other.url.origin,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
      expect(JSON.parse(stdout)).toEqual({
        own: "scoped-token",
        database: "created",
        ancestor_metadata: true,
        ancestor_contents: "denied",
        admin: "denied",
        worker: "denied",
        alias: "denied",
        own_tcp: "scoped",
        other_tcp: "denied",
        unix: "denied",
        dns: "connected",
      });
    } finally {
      own.stop(true);
      other.stop(true);
      control.stop(true);
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
