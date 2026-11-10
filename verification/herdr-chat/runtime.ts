import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const commands = mkdtempSync("/tmp/herdr-formal-commands-");
let code = 1;
try {
  for (const command of ["hc", "herdr-app"])
    writeFileSync(
      `${commands}/${command}`,
      "#!/bin/sh\necho 'Formal probe blocked a real terminal command' >&2\nexit 72\n",
      { mode: 0o755 },
    );
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "verification/herdr-chat/runtime.test.ts",
      "test/desktop-recovery.test.ts",
      ...process.argv.slice(2),
    ],
    {
      cwd: resolve(import.meta.dir, "../.."),
      env: { ...process.env, PATH: `${commands}:${process.env["PATH"]}`, DORI_FORMAL_COMMANDS: commands },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  code = await child.exited;
} finally {
  rmSync(commands, { recursive: true, force: true });
}
process.exit(code);
