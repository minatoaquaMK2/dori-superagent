import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { manifestSchema } from "./manifest.ts";

export const reportSchema = z.object({ id: z.string(), event: z.string(), payload: z.record(z.string(), z.unknown()) });
export type NativeReport = z.infer<typeof reportSchema>;

export function writeReport(directory: string, event: string, payload: Record<string, unknown>): void {
  const id = crypto.randomUUID();
  const file = join(directory, "spool", `${Date.now()}-${id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify({ id, event, payload }), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

export async function reportHook(directory: string, event: string): Promise<void> {
  const payload = z.record(z.string(), z.unknown()).parse(JSON.parse(await Bun.stdin.text()));
  if (event === "Stop" && typeof payload["transcriptPath"] === "string") {
    const record = z.object({
      step_index: z.number().int(),
      source: z.string(),
      type: z.string(),
      status: z.string(),
      content: z.string().optional(),
    });
    const transcript = readFileSync(payload["transcriptPath"], "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => record.parse(JSON.parse(line)));
    const boundary = transcript.findLastIndex((entry) => entry.type === "USER_INPUT");
    const user = transcript[boundary];
    if (!user) throw new Error("Transcript has no user turn boundary");
    payload["doriResult"] = {
      boundary: user.step_index,
      text:
        transcript
          .slice(boundary + 1)
          .filter((entry) => entry.source === "MODEL" && entry.type === "PLANNER_RESPONSE" && entry.status === "DONE")
          .at(-1)?.content ?? "",
    };
  }
  writeReport(directory, event, payload);
}

export function readReports(directory: string): NativeReport[] {
  return readdirSync(join(directory, "spool"))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => reportSchema.parse(JSON.parse(readFileSync(join(directory, "spool", file), "utf8"))));
}

export async function runNativeWorker(directory: string): Promise<number> {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")));
  const child = Bun.spawn(manifest.argv, { cwd: manifest.cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const stop = () => child.kill("SIGTERM");
  for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) process.on(signal, stop);
  try {
    const code = await child.exited;
    writeReport(directory, "ProcessExit", { code });
    return code;
  } finally {
    for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) process.off(signal, stop);
  }
}
