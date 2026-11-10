import { homedir } from "node:os";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

export function mainSandboxPolicy({
  runtime,
  session,
  privateData,
  port,
}: {
  runtime: string;
  session: string;
  privateData: string;
  port?: number;
}): string {
  const subpath = (path: string) => `(subpath ${JSON.stringify(path)})`;
  const defaultPath = join(homedir(), ".local", "state", "dori-chat");
  const defaultRuntime = existsSync(defaultPath) ? realpathSync(defaultPath) : defaultPath;
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535))
    throw new Error("Invalid scoped bridge port");
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(deny file-read* ${subpath(join(homedir(), ".gemini", "config"))})`,
    `(deny file-read* (require-all (require-any ${subpath(runtime)} ${subpath(defaultRuntime)}) (require-not ${subpath(session)})))`,
    `(allow file-write* ${subpath(session)} ${subpath(privateData)})`,
    "(deny network-outbound (remote unix-socket))",
    '(deny network-outbound (remote ip "localhost:*"))',
    '(allow network-outbound (literal "/private/var/run/mDNSResponder"))',
    ...(port === undefined ? [] : [`(allow network-outbound (remote ip "localhost:${port}"))`]),
  ].join("\n");
}
