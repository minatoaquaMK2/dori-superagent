#!/usr/bin/env bun
import { runBridge } from "./bridge.ts";
import { install } from "./install.ts";
import { runTerminal } from "./terminal.ts";
import { reportHook, runNativeWorker } from "./workers/reporter.ts";
import { runMcpHelper } from "./providers/mcp-helper.ts";
import { runHostCli } from "./providers/host-cli.ts";

if (import.meta.main) {
  try {
    const command = process.argv[2] ?? "install";
    if (command === "serve") await runBridge();
    else if (command === "install") await install(process.argv[3] ?? process.cwd());
    else if (command === "terminal" && process.argv[3] && process.argv[4])
      process.exitCode = await runTerminal(process.argv[3], process.argv[4]);
    else if (command === "native-worker" && process.argv[3]) process.exitCode = await runNativeWorker(process.argv[3]);
    else if (command === "mcp-host" && process.argv[3]) await runMcpHelper(process.argv[3]);
    else if (command === "host-cli" && process.argv[3] && process.argv[4] && process.argv[5] && process.argv[6])
      await runHostCli(process.argv[3], process.argv[4], process.argv[5], process.argv[6]);
    else if (command === "worker-report" && process.argv[3] && process.argv[4])
      await reportHook(process.argv[3], process.argv[4]);
    else throw new Error("Usage: bun src/desktop/cli.ts install [directory] | serve | terminal SOCKET THREAD");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
