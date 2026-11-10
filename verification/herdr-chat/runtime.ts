import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const commands = mkdtempSync("/tmp/herdr-formal-commands-");
let code = 1;
try {
  for (const command of ["hc", "herdr-app", "codex", "agy", "devin"])
    writeFileSync(
      `${commands}/${command}`,
      `#!/bin/sh
if [ "$1" = "ls" ]; then
  echo '{"terminals":[],"spaces":[]}'
  exit 0
fi
if [ "$1" = "run" ]; then
  echo run >> "$DORI_FORMAL_COMMANDS/run-attempts"
fi
if [ "$DORI_FORMAL_ATTACH_MODE" = "success" ] && [ "$1" = "run" ]; then
  echo '{"address":"isolated-terminal"}'
  exit 0
fi
echo 'Formal probe blocked a real terminal command' >&2
exit 72
`,
      { mode: 0o755 },
    );
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "verification/herdr-chat/runtime.test.ts",
      "test/desktop-recovery.test.ts",
      "test/desktop-native.test.ts",
      "test/desktop-profile.test.ts",
      "test/desktop-main-recovery.test.ts",
      "verification/herdr-chat/profile-runtime.test.ts",
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
