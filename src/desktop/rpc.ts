import { z } from "zod";

const envelopeSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).passthrough().optional(),
});
export type Envelope = z.infer<typeof envelopeSchema>;
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class Rpc {
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private readonly socket: WebSocket;
  private readonly ready: Promise<void>;
  private closed = false;
  onEvent: (message: Envelope) => void = () => {};
  onClose: (error: Error) => void = () => {};

  constructor(socket: string) {
    this.socket = new WebSocket(`ws+unix://${socket}:`);
    this.ready = new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => {
        const error = new Error("Cannot connect to Codex app-server");
        reject(error);
        this.fail(error);
      };
    });
    this.socket.onmessage = (event) => {
      try {
        if (typeof event.data !== "string" || event.data.length > 16_000_000) throw new Error("Invalid Codex message");
        this.receive(envelopeSchema.parse(JSON.parse(event.data)));
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    };
    this.socket.onclose = () => this.fail(new Error("Codex connection closed; no turns were replayed"));
  }

  async initialize(): Promise<void> {
    await this.ready;
    await this.request("initialize", {
      clientInfo: { name: "dori_herdr_chat", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.write({ method: "initialized", params: {} });
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Codex connection closed"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }

  respond(id: string | number, result: unknown): void {
    this.write({ id, result });
  }
  reject(id: string | number, message: string): void {
    this.write({ id, error: { code: -32601, message } });
  }

  private write(value: unknown): void {
    this.socket.send(JSON.stringify(value));
  }

  private receive(message: Envelope): void {
    const pending = typeof message.id === "number" && !message.method ? this.pending.get(message.id) : undefined;
    if (pending && typeof message.id === "number") {
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    } else this.onEvent(message);
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

  close(): void {
    this.socket.close();
  }
}
