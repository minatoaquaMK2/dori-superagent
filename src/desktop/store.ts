import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Conversation, State } from "./model.ts";
import { migrateState } from "./migration.ts";

export class Store {
  readonly state: State;
  private pendingWrite: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      this.state = migrateState(raw);
      this.save();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      this.state = { version: 2, conversations: [], tasks: [] };
    }
  }

  conversation(id: string): Conversation {
    const found = this.state.conversations.find((c) => c.conversation === id);
    if (!found) throw new Error("Conversation not found");
    return found;
  }

  save(conversation?: Conversation): void {
    clearTimeout(this.pendingWrite);
    this.pendingWrite = undefined;
    if (conversation) conversation.revision++;
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(temporary, this.file);
  }

  changed(conversation: Conversation): void {
    conversation.revision++;
    this.pendingWrite ??= setTimeout(() => this.save(), 250);
  }

  message(conversation: Conversation, text: string, source = "Codex", id: string = crypto.randomUUID()): void {
    if (conversation.entries.some((entry) => entry.id === id)) return;
    conversation.entries.push({ kind: "markdown", id, role: "assistant", text, source });
    this.save(conversation);
  }
}
