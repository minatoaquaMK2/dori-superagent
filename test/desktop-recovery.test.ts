import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const scenario of ["empty", "completed"]) {
  test(`recovery releases ${scenario} tasks without replay or duplicate reporting`, async () => {
    const root = mkdtempSync("/tmp/dori-recovery-test-");
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "hc"), "#!/bin/sh\nsleep 0.1\necho simulated-terminal-unavailable >&2\nexit 1\n", {
      mode: 0o755,
    });
    try {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "desktop-recovery-case.ts"), root, scenario], {
        env: { ...process.env, PATH: `${bin}:${process.env["PATH"]}` },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "", stderr: "" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
