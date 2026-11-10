import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Engine } from "../src/desktop/engine.ts";
import { serve } from "../src/desktop/http.ts";
import { Rpc } from "../src/desktop/rpc.ts";
import { Store } from "../src/desktop/store.ts";

const requestSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
  })
  .passthrough();

export async function fixture() {
  const root = mkdtempSync("/tmp/dori-chat-test-");
  const socket = join(root, "codex.sock");
  const requests: z.infer<typeof requestSchema>[] = [];
  let peer: Bun.ServerWebSocket<undefined> | undefined;
  const protocol = Bun.serve<undefined>({
    unix: socket,
    fetch(request, server) {
      if (server.upgrade(request, { data: undefined })) return;
      return new Response("WebSocket required", { status: 400 });
    },
    websocket: {
      open(socket) {
        peer = socket;
      },
      message(socket, raw) {
        const request = requestSchema.parse(JSON.parse(String(raw)));
        requests.push(request);
        if (request.id === undefined || !request.method) return;
        let result: unknown = {};
        if (request.method === "thread/start" || request.method === "thread/resume")
          result = { thread: { id: "chat-thread", status: { type: "idle" }, turns: [] } };
        if (request.method === "turn/start") result = { turn: { id: "chat-turn", status: "inProgress", items: [] } };
        socket.send(JSON.stringify({ id: request.id, result }));
      },
    },
  });
  const store = new Store(join(root, "state.json"));
  const rpc = new Rpc(socket);
  const engine = new Engine(store, rpc, socket);
  await engine.initialize();
  engine.open({ conversation: "chat", cwd: root, space: "test-space" });
  const token = "test-token";
  const http = serve(engine, token);
  return {
    root,
    store,
    rpc,
    engine,
    requests,
    send(method: string, params: object, id?: string) {
      peer?.send(JSON.stringify({ method, params, ...(id ? { id } : {}) }));
    },
    async request(path: string, body?: object, authenticated = true) {
      return fetch(new URL(path, http.url), {
        method: body ? "POST" : "GET",
        headers: authenticated ? { authorization: `Bearer ${token}` } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    },
    async close() {
      store.save();
      rpc.close();
      http.stop(true);
      protocol.stop(true);
      await Bun.sleep(10);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for desktop event");
    await Bun.sleep(5);
  }
}
