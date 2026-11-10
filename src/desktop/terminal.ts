import { z } from "zod";
import { resumeThread } from "./protocol.ts";
import { Rpc } from "./rpc.ts";

const statusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notLoaded") }),
  z.object({ type: z.literal("idle") }),
  z.object({ type: z.literal("systemError") }),
  z.object({ type: z.literal("active"), activeFlags: z.array(z.enum(["waitingOnApproval", "waitingOnUserInput"])) }),
]);
const statusEventSchema = z.object({ threadId: z.string(), status: statusSchema });
type NativeStatus = "idle" | "working" | "blocked" | "error";

function nativeStatus(status: z.infer<typeof statusSchema>): NativeStatus {
  switch (status.type) {
    case "active":
      return status.activeFlags.length ? "blocked" : "working";
    case "idle":
      return "idle";
    case "notLoaded":
    case "systemError":
      return "error";
  }
}

export async function runTerminal(socket: string, threadId: string): Promise<number> {
  const rpc = new Rpc(socket);
  let lastStatus: NativeStatus | undefined;
  let notifications = 0;
  let closing = false;
  const emit = (status: NativeStatus) => {
    if (lastStatus === status) return;
    lastStatus = status;
    process.stdout.write(`\x1b]7501;state=${status}:app=codex\x1b\\`);
  };
  rpc.onEvent = (event) => {
    if (event.method !== "thread/status/changed") return;
    const { threadId: changed, status } = statusEventSchema.parse(event.params);
    if (changed !== threadId) return;
    notifications++;
    emit(nativeStatus(status));
  };
  rpc.onClose = () => {
    if (!closing) emit("error");
  };
  try {
    await rpc.initialize();
    const beforeResume = notifications;
    const thread = await resumeThread(rpc, threadId);
    if (notifications === beforeResume) emit(nativeStatus(statusSchema.parse(thread.status)));
    const child = Bun.spawn(
      ["codex", "-c", "check_for_update_on_startup=false", "resume", "--remote", `unix://${socket}`, threadId],
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
    );
    const stop = () => child.kill("SIGTERM");
    const signals = ["SIGHUP", "SIGINT", "SIGTERM"] as const;
    for (const signal of signals) process.on(signal, stop);
    try {
      return await child.exited;
    } finally {
      for (const signal of signals) process.off(signal, stop);
    }
  } catch (error) {
    emit("error");
    throw error;
  } finally {
    closing = true;
    rpc.close();
  }
}
