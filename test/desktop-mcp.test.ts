import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

test("session MCP helper preserves operation identity and split Unicode content", async () => {
  const directory = mkdtempSync("/tmp/dori-mcp-test-");
  const received: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(request.headers.get("authorization")).toBe("Bearer session-scoped-token");
      received.push(await request.json());
      return Response.json({ text: "解释已显示" });
    },
  });
  const binding = join(directory, "binding.json");
  writeFileSync(binding, JSON.stringify({ url: server.url.origin, token: "session-scoped-token" }));
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "../src/desktop/cli.ts"), "mcp-host", binding], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    const encoder = new TextEncoder();
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`);
    const call = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "show_explanation", arguments: { operationId: "run-owned-operation", title: "中文解释" } },
    };
    const bytes = encoder.encode(`${JSON.stringify(call)}\n`);
    const position = bytes.indexOf(0xe4);
    expect(position).toBeGreaterThan(0);
    child.stdin.write(bytes.subarray(0, position + 1));
    await Bun.sleep(10);
    child.stdin.write(bytes.subarray(position + 1));
    child.stdin.end();
    const [output, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const replies: { result: { tools?: { inputSchema: { required: string[] } }[]; content?: { text: string }[] } }[] =
      output
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    expect(replies[0]?.result.tools?.every((tool) => tool.inputSchema.required.includes("operationId"))).toBe(true);
    expect(received).toEqual([call.params]);
    expect(replies[1]?.result.content?.[0]?.text).toBe("解释已显示");
  } finally {
    child.kill();
    server.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }
});
