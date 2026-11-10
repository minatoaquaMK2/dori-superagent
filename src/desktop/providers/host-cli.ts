import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dispatchSchema, explanationSchema } from "../model.ts";
import { dynamicTools } from "../tools.ts";
import { bindingSchema } from "./mcp-helper.ts";

const cli = fileURLToPath(new URL("../cli.ts", import.meta.url));
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const tools = ["start_task", "show_explanation"];

export function hostPrefix(binding: string, operation: string, tool: string): string {
  return [
    process.execPath,
    "--config=/dev/null",
    "--no-env-file",
    "--no-macros",
    "--no-install",
    cli,
    "host-cli",
    binding,
    operation,
    tool,
  ]
    .map(quote)
    .join(" ");
}

function payload(text: string): unknown {
  if (text.length > 128_000) throw new Error("Host arguments exceeded size limit");
  const json = text.startsWith("{")
    ? text
    : new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(text, "base64"));
  return JSON.parse(json);
}

export function permittedHostCommand(command: string, binding: string, operation: string | null): boolean {
  if (!operation) return false;
  for (const tool of tools) {
    const prefix = `${hostPrefix(binding, operation, tool)} `;
    if (!command.startsWith(prefix)) continue;
    const argument = command.slice(prefix.length);
    const json =
      argument.startsWith("'") && argument.endsWith("'") && !argument.slice(1, -1).includes("'")
        ? argument.slice(1, -1)
        : /^[A-Za-z0-9+/]+={0,2}$/.test(argument)
          ? argument
          : null;
    if (json === null) return false;
    try {
      (tool === "start_task" ? dispatchSchema : explanationSchema).parse(payload(json));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function hostCliInstructions(binding: string, operation: string): string {
  return `Host tools are available through a local CLI helper. This session does not use MCP. Use the exec tool only for these exact helper commands. Choose the required JSON arguments from the schemas below. Pass compact JSON in one single-quoted argument; represent any apostrophe inside JSON as \\u0027. Base64-encoded JSON is also accepted. Do not run an encoder, shell pipeline, or other command.\n${dynamicTools.map((tool) => `${hostPrefix(binding, operation, tool.name)} '<JSON ARGUMENTS>'\n${tool.name}: ${tool.description}\nSchema: ${JSON.stringify(tool.inputSchema)}`).join("\n\n")}`;
}

export async function runHostCli(file: string, operationId: string, tool: string, encoded: string): Promise<void> {
  if (!tools.includes(tool)) throw new Error("Unknown host tool");
  const binding = bindingSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const parsed = (tool === "start_task" ? dispatchSchema : explanationSchema).parse(payload(encoded));
  const response = await fetch(`${binding.url}/host-tool`, {
    method: "POST",
    headers: { authorization: `Bearer ${binding.token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: tool, arguments: { ...parsed, operationId } }),
  });
  const result: unknown = await response.json();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!response.ok) process.exitCode = 1;
}
