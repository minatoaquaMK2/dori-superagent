#!/usr/bin/env bun
import { runBridge } from "./bridge.ts";
import { install } from "./install.ts";
import { runTerminal } from "./terminal.ts";

try {
  const command = process.argv[2] ?? "install";
  if (command === "serve") await runBridge();
  else if (command === "install") await install(process.argv[3] ?? process.cwd());
  else if (command === "terminal" && process.argv[3] && process.argv[4])
    process.exitCode = await runTerminal(process.argv[3], process.argv[4]);
  else throw new Error("Usage: bun src/desktop/cli.ts install [directory] | serve | terminal SOCKET THREAD");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
