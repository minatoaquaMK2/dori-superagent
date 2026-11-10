import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hostPrefix, permittedHostCommand } from "../src/desktop/providers/host-cli.ts";

test("local host command accepts one validated argument for the bound turn", () => {
  const binding = "/private/session/binding.json";
  const prefix = hostPrefix(binding, "current-turn", "start_task");
  const json = JSON.stringify({ title: "Write result", prompt: "Run the requested task" });
  const command = `${prefix} '${json}'`;
  expect(permittedHostCommand(command, binding, "current-turn")).toBe(true);
  expect(permittedHostCommand(`${prefix} ${Buffer.from(json).toString("base64")}`, binding, "current-turn")).toBe(true);
  for (const bad of [
    `${command}; echo unexpected`,
    `${command} | cat`,
    `${command} > output`,
    `${prefix} '${json}' extra`,
    `${prefix} "${json}"`,
    `${prefix} '$(echo bad)'`,
    `${prefix} '{"title":"x","prompt":"a'b"}'`,
    `${prefix} e30=`,
    command.replace("current-turn", "old-turn"),
    command.replace("binding.json", "another.json"),
    command.replace("start_task", "install"),
  ])
    expect(permittedHostCommand(bad, binding, "current-turn")).toBe(false);
  expect(permittedHostCommand(command, binding, null)).toBe(false);
});

test("local helper preserves JSON and operation identity without loading workspace code", async () => {
  const directory = mkdtempSync("/tmp/dori-host-cli-test-");
  const received: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(request.headers.get("authorization")).toBe("Bearer session-only");
      received.push(await request.json());
      return Response.json({ text: "任务已接收" });
    },
  });
  const binding = join(directory, "binding.json");
  const injected = join(directory, "preload-ran");
  writeFileSync(binding, JSON.stringify({ url: server.url.origin, token: "session-only" }));
  writeFileSync(join(directory, "preload.ts"), `Bun.write(${JSON.stringify(injected)}, "unexpected");`);
  writeFileSync(join(directory, "bunfig.toml"), 'preload = ["./preload.ts"]\n');
  const args = { title: "中文解释", prompt: "Keep $(touch unwanted) and `echo text` literal", operationId: "forged" };
  const command = `${hostPrefix(binding, "bound-turn", "start_task")} '${JSON.stringify(args)}'`;
  try {
    expect(permittedHostCommand(command, binding, "bound-turn")).toBe(true);
    const child = Bun.spawn(["/bin/sh", "-c", command], { cwd: directory, stdout: "pipe", stderr: "pipe" });
    const [output, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(output)).toEqual({ text: "任务已接收" });
    expect(received).toEqual([
      { name: "start_task", arguments: { title: args.title, prompt: args.prompt, operationId: "bound-turn" } },
    ]);
    expect(existsSync(injected)).toBe(false);
    expect(existsSync(join(directory, "unwanted"))).toBe(false);
  } finally {
    server.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }
});
