import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "../src/desktop/model.ts";
import { manifestSchema } from "../src/desktop/workers/manifest.ts";

test("Devin worker launches an untrusted project without an approval gate and retains its exact profile", async () => {
  const root = mkdtempSync("/tmp/dori-native-manifest-");
  const directory = join(root, "worker");
  const config = join(root, ".config", "devin");
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, "config.json"), JSON.stringify({ permission_mode: "strict" }));
  const profile = {
    id: "devin-profile",
    catalogRevision: "actual",
    selection: { provider: "devin", modelChoice: "family", effortChoice: "low" },
    resolved: { provider: "devin", model: "exact-variant-low", effort: "low" },
  } satisfies Task["origin"]["profile"];
  const task: Task = {
    id: "native",
    conversation: "chat",
    callId: "dispatch",
    cwd: root,
    title: "Native task",
    prompt: "Write the requested result",
    threadId: null,
    terminal: null,
    tab: "worker-tab",
    state: { kind: "launching" },
    reported: [],
    output: {},
    origin: { conversation: "chat", segment: "segment", run: "run", request: "request", profile },
    launch: "intent",
    runtime: { kind: "native", directory, sessionId: null, open: true, receipts: [] },
  };
  const program = `import { prepareNativeWorker } from ${JSON.stringify(join(import.meta.dir, "../src/desktop/workers/manifest.ts"))}; prepareNativeWorker(JSON.parse(await Bun.stdin.text()));`;
  try {
    const child = Bun.spawn([process.execPath, "--eval", program], {
      cwd: root,
      env: { ...process.env, HOME: root },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    child.stdin.write(JSON.stringify(task));
    child.stdin.end();
    const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect({ code, error }).toEqual({ code: 0, error: "" });
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")));
    expect(
      manifest.argv.slice(manifest.argv.indexOf("--permission-mode"), manifest.argv.indexOf("--permission-mode") + 2),
    ).toEqual(["--permission-mode", "dangerous"]);
    expect(
      manifest.argv.slice(
        manifest.argv.indexOf("--respect-workspace-trust"),
        manifest.argv.indexOf("--respect-workspace-trust") + 2,
      ),
    ).toEqual(["--respect-workspace-trust", "false"]);
    expect(manifest.argv.slice(manifest.argv.indexOf("--model"), manifest.argv.indexOf("--model") + 2)).toEqual([
      "--model",
      "exact-variant-low",
    ]);
    expect(manifest.cwd).toBe(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
