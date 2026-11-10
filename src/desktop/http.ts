import { z } from "zod";
import type { Engine } from "./engine.ts";

export function serve(engine: Engine, token: string) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    maxRequestBodySize: 128_000,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/host-tool") {
        try {
          const text = await engine.tools.forBinding(
            engine.acp.owner(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""),
            await request.json(),
          );
          return Response.json({ text });
        } catch (error) {
          return Response.json({ error: String(error) }, { status: 400 });
        }
      }
      if (request.headers.get("authorization") !== `Bearer ${token}`)
        return new Response("Unauthorized", { status: 401 });
      try {
        if (request.method === "GET" && url.pathname === "/health")
          return Response.json({ connected: engine.connected || engine.nativeProviders });
        if (request.method === "GET" && url.pathname === "/snapshot") {
          const conversation = engine.store.conversation(url.searchParams.get("conversation") ?? "");
          if (String(conversation.revision) === url.searchParams.get("after"))
            return new Response(null, { status: 204 });
          return Response.json({
            conversation: conversation.conversation,
            revision: conversation.revision,
            state: conversation.state,
            entries: conversation.entries.slice(-200),
            queued: conversation.pending.length,
            cwd: conversation.cwd,
            profile: conversation.profile,
            profileRevision: conversation.profileRevision,
            preferences: conversation.preferences,
            catalog: engine.configuration.list(conversation.cwd),
          });
        }
        if (request.method !== "POST") return new Response("Not found", { status: 404 });
        const body: unknown = await request.json();
        switch (url.pathname) {
          case "/open":
            await engine.open(body);
            break;
          case "/configure":
            engine.configuration.configure(body);
            break;
          case "/catalog": {
            const conversation = engine.store.conversation(
              z.object({ conversation: z.string() }).parse(body).conversation,
            );
            await engine.configuration.refresh(conversation.cwd);
            engine.store.save(conversation);
            break;
          }
          case "/send":
            engine.send(body);
            break;
          case "/interrupt":
            await engine.interrupt(z.object({ conversation: z.string() }).parse(body).conversation);
            break;
          default:
            return new Response("Not found", { status: 404 });
        }
        return Response.json({ accepted: true }, { status: 202 });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    },
  });
  engine.acp.url = server.url.origin;
  return server;
}
