import { readFileSync } from "node:fs";
import { z } from "zod";
import { dynamicTools } from "../tools.ts";

export const bindingSchema = z.object({ url: z.string().url(), token: z.string() });
const requestSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

export async function runMcpHelper(file: string): Promise<void> {
  const binding = bindingSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const send = (message: object) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  let buffer = "";
  for await (const chunk of Bun.stdin.stream()) {
    buffer += new TextDecoder().decode(chunk);
    if (buffer.length > 128_000) throw new Error("Host tool request exceeded limit");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) {
        const request = requestSchema.parse(JSON.parse(line));
        if (request.id !== undefined) {
          try {
            let result: unknown;
            if (request.method === "initialize")
              result = {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "herdr-chat", version: "1" },
              };
            else if (request.method === "tools/list")
              result = {
                tools: dynamicTools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: {
                    ...tool.inputSchema,
                    properties: {
                      ...tool.inputSchema.properties,
                      operationId: {
                        type: "string",
                        description: "Use the exact host operation ID provided with this user turn.",
                      },
                    },
                    required: [...(tool.inputSchema.required ?? []), "operationId"],
                  },
                })),
              };
            else if (request.method === "tools/call") {
              const call = z
                .object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) })
                .parse(request.params);
              const response = await fetch(`${binding.url}/host-tool`, {
                method: "POST",
                headers: { authorization: `Bearer ${binding.token}`, "content-type": "application/json" },
                body: JSON.stringify(call),
              });
              const reply = z
                .object({ text: z.string().optional(), error: z.string().optional() })
                .parse(await response.json());
              result = {
                content: [{ type: "text", text: reply.text ?? reply.error ?? "Unknown tool response" }],
                isError: !response.ok,
              };
            } else if (request.method === "ping") result = {};
            else throw new Error("Unsupported MCP request");
            send({ id: request.id, result });
          } catch (error) {
            send({ id: request.id, error: { code: -32603, message: String(error) } });
          }
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
}
