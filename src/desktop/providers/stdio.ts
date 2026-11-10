import { z } from "zod";

const envelopeSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).passthrough().optional(),
});
export type AcpEnvelope = z.infer<typeof envelopeSchema>;

export class StdioRpc {
  private readonly child;
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  onMessage: (message: AcpEnvelope) => void = () => {};
  onClose: (error: Error) => void = () => {};

  constructor(argv: string[], cwd: string, env: Record<string, string | undefined> = process.env) {
    this.child = Bun.spawn(argv, { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    void this.read().catch((error: unknown) => this.fail(error instanceof Error ? error : new Error(String(error))));
    void new Response(this.child.stderr).text().then(() => {});
    void this.child.exited.then((code) =>
      this.fail(new Error(`CLI connection exited (${code}); no request was replayed`)),
    );
  }

  request(method: string, params: unknown, timeout = 30_000): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("CLI connection is closed"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} response is unknown after timeout`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }
  respond(id: string | number, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }
  reject(id: string | number, message: string): void {
    this.write({ jsonrpc: "2.0", id, error: { code: -32601, message } });
  }
  close(): void {
    this.fail(new Error("CLI connection closed"));
    this.child.kill();
  }
  private write(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private async read(): Promise<void> {
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of this.child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      if (buffer.length > 16_000_000) throw new Error("ACP message exceeded size limit");
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) this.receive(envelopeSchema.parse(JSON.parse(line)));
        newline = buffer.indexOf("\n");
      }
    }
  }

  private receive(message: AcpEnvelope): void {
    const pending = typeof message.id === "number" && !message.method ? this.pending.get(message.id) : undefined;
    if (pending && typeof message.id === "number") {
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    } else this.onMessage(message);
  }
  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.onClose(error);
  }
}
