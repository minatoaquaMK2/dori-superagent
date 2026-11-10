import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

const root = resolve(import.meta.dir, "../..");
const out = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync("/tmp/herdr-formal-check-");
mkdirSync(out, { recursive: true });
const javaTool = "java@temurin-25.0.5+8.0.LTS";
const tlcTool =
  "http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88]@1.7.4";

async function command(argv: string[], cwd = root) {
  const child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, output: stdout + stderr };
}

if (Bun.version !== "1.4.4") throw new Error(`Use Bun 1.4.4; found ${Bun.version}`);
const sync = z
  .object({ commit: z.string(), files: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(join(import.meta.dir, "source-sync.json"), "utf8")));
for (const [file, hash] of Object.entries(sync.files)) {
  const actual = new Bun.CryptoHasher("sha256").update(readFileSync(join(root, file))).digest("hex");
  if (actual !== hash)
    throw new Error(`${file} changed since ${sync.commit}. Reconcile the model before updating source-sync.json.`);
}

let java = await command(["mise", "where", javaTool]);
let tlc = await command(["mise", "where", tlcTool]);
if (java.code || tlc.code) {
  const install = await command(["mise", "install", javaTool, tlcTool]);
  if (install.code) throw new Error(install.output);
  java = await command(["mise", "where", javaTool]);
  tlc = await command(["mise", "where", tlcTool]);
}
if (java.code || tlc.code) throw new Error("mise could not resolve the pinned verifier");
const javaBin = join(java.output.trim(), "bin/java");
const jar = join(tlc.output.trim(), "tla2tools.jar");
let failed = false;
for (const model of ["Dispatch", "Ledger", "Ownership"]) {
  const result = await command(
    [
      javaBin,
      "-XX:+UseParallelGC",
      "-cp",
      jar,
      "tlc2.TLC",
      "-workers",
      "1",
      "-cleanup",
      "-metadir",
      join(out, `${model}-states`),
      "-config",
      `${model}.cfg`,
      `${model}.tla`,
    ],
    join(import.meta.dir, "models"),
  );
  writeFileSync(join(out, `${model}.txt`), result.output);
  console.log(`${model}: ${result.code === 0 ? "PASS" : "FAIL"}`);
  console.log(
    result.output
      .split("\n")
      .filter((line) => /^\d+ states generated|^Error:|^Model checking completed/.test(line))
      .join("\n"),
  );
  failed ||= result.code !== 0;
}
const runtime = await command([process.execPath, "verification/herdr-chat/runtime.ts"]);
writeFileSync(join(out, "runtime.txt"), runtime.output);
console.log(runtime.output);
failed ||= runtime.code !== 0;
console.log(`Evidence: ${out}`);
console.log("Read each model result with the installed pstack /statechart skill.");
process.exit(failed ? 1 : 0);
