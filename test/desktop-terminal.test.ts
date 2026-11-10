import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { until } from "./desktop-fixture.ts";

test("terminal reports authoritative status while leaving input and approval ownership to Codex", async () => {
  const root = mkdtempSync("/tmp/dori-terminal-test-");
  const socket = join(root, "codex.sock");
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "codex"),
    `#!${process.execPath}\nprocess.stdout.write("TUI_READY\\n" + JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.on("SIGTERM", () => process.exit(0));\nsetInterval(() => {}, 1000);\n`,
    { mode: 0o755 },
  );
  const requestSchema = z.object({ id: z.union([z.number(), z.string()]).optional(), method: z.string().optional() });
  const requests: z.infer<typeof requestSchema>[] = [];
  let peer: Bun.ServerWebSocket<undefined> | undefined;
  const server = Bun.serve<undefined>({
    unix: socket,
    fetch(request, server) {
      if (server.upgrade(request, { data: undefined })) return;
      return new Response("WebSocket required", { status: 400 });
    },
    websocket: {
      open(connection) {
        peer = connection;
      },
      message(connection, raw) {
        const request = requestSchema.parse(JSON.parse(String(raw)));
        requests.push(request);
        if (request.id === undefined || !request.method) return;
        const result =
          request.method === "thread/resume" ? { thread: { id: "worker", status: { type: "idle" }, turns: [] } } : {};
        connection.send(JSON.stringify({ id: request.id, result }));
      },
    },
  });
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "../src/desktop/cli.ts"), "terminal", socket, "worker"],
    {
      env: { ...process.env, PATH: `${bin}:${process.env["PATH"]}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let output = "";
  const reading = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) output += decoder.decode(chunk);
  })();
  const errors = new Response(child.stderr).text();
  const statuses = () =>
    output
      .split("\x1b]7501;state=")
      .slice(1)
      .map((part) => part.split(":app=codex\x1b\\")[0]);
  const status = (value: object, threadId = "worker") =>
    peer?.send(
      JSON.stringify({
        method: "thread/status/changed",
        params: { threadId, status: value },
      }),
    );
  try {
    await until(() => output.includes("TUI_READY"));
    expect(statuses()).toEqual(["idle"]);
    expect(output).toContain(
      JSON.stringify(["-c", "check_for_update_on_startup=false", "resume", "--remote", `unix://${socket}`, "worker"]),
    );
    status({ type: "active", activeFlags: [] }, "another-thread");
    status({ type: "active", activeFlags: [] });
    status({ type: "active", activeFlags: [] });
    status({ type: "active", activeFlags: ["waitingOnApproval"] });
    peer?.send(
      JSON.stringify({
        id: "approval",
        method: "item/commandExecution/requestApproval",
        params: { threadId: "worker" },
      }),
    );
    status({ type: "active", activeFlags: ["waitingOnUserInput"] });
    status({ type: "idle" });
    status({ type: "systemError" });
    status({ type: "notLoaded" });
    await until(() => statuses().length === 5);
    expect(statuses()).toEqual(["idle", "working", "blocked", "idle", "error"]);
    expect(requests.map((request) => request.method)).toEqual(["initialize", "initialized", "thread/resume"]);
    status({ type: "idle" });
    await until(() => statuses().at(-1) === "idle");
    peer?.close();
    await until(() => statuses().at(-1) === "error");
    expect(child.exitCode).toBeNull();
    child.kill("SIGTERM");
    expect(await child.exited).toBe(0);
    await reading;
    expect(await errors).toBe("");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
    server.stop(true);
    await reading;
    rmSync(root, { recursive: true, force: true });
  }
});
