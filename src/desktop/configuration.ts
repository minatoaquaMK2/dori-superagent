import { type Conversation, configureSchema } from "./model.ts";
import { type Catalog, type Profile, type Provider, type Selection, legacyProfile, unavailable } from "./profile.ts";
import { CodexCatalog } from "./providers/codex.ts";
import type { Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";

export class Configuration {
  private readonly codex: CodexCatalog;
  private catalogs = new Map<string, Catalog[]>();
  constructor(
    private readonly store: Store,
    rpc: Rpc,
  ) {
    this.codex = new CodexCatalog(rpc);
  }

  async refresh(cwd: string): Promise<Catalog[]> {
    let codex: Catalog;
    try {
      codex = await this.codex.read(cwd);
    } catch (error) {
      codex = unavailable("codex", String(error));
    }
    const catalogs = [
      codex,
      unavailable("antigravity", "正在核验 ACP 会话能力"),
      unavailable("devin", "正在核验 ACP 会话能力"),
    ];
    this.catalogs.set(cwd, catalogs);
    return catalogs;
  }

  list(cwd: string): Catalog[] {
    return this.catalogs.get(cwd) ?? [];
  }

  async initial(cwd: string): Promise<Profile> {
    const catalog = (await this.refresh(cwd)).find((catalog) => catalog.provider === "codex");
    if (!catalog?.defaultSelection || catalog.status !== "ready") return legacyProfile();
    return this.codex.resolve(catalog, catalog.defaultSelection);
  }

  resolve(cwd: string, selection: Selection, catalogRevision: string): Profile {
    const catalog = this.list(cwd).find((catalog) => catalog.provider === selection.provider);
    if (!catalog || catalog.revision !== catalogRevision) throw new Error("模型目录已更新，请刷新后重试。草稿已保留。");
    if (selection.provider !== "codex") throw new Error(catalog.reason ?? "此 CLI 尚不可用");
    return this.codex.resolve(catalog, selection);
  }

  configure(input: unknown): void {
    const request = configureSchema.parse(input);
    const conversation = this.store.conversation(request.conversation);
    const duplicate = conversation.configurations.find((entry) => entry.requestId === request.requestId);
    if (duplicate) {
      if (JSON.stringify(duplicate.selection) !== JSON.stringify(request.selection))
        throw new Error("配置请求身份已被另一组选项使用");
      return;
    }
    if (conversation.profileRevision !== request.expectedRevision)
      throw new Error("配置已在另一个窗口改变，请刷新后重试。草稿已保留。");
    if (conversation.state.kind !== "idle" || conversation.pending.length || conversation.activeRun)
      throw new Error("请等待当前回复结束后再切换 CLI、模型或强度");
    const profile = this.resolve(conversation.cwd, request.selection, request.catalogRevision);
    const handoff = handoffText(conversation);
    const segment = { id: crypto.randomUUID(), profile, sessionId: null, epoch: null, handoff };
    conversation.segments.push(segment);
    conversation.activeSegment = segment.id;
    conversation.threadId = null;
    conversation.profile = profile;
    conversation.profileRevision++;
    conversation.preferences = [
      ...conversation.preferences.filter((old) => old.selection.provider !== profile.selection.provider),
      profile,
    ];
    conversation.configurations.push({ requestId: request.requestId, selection: request.selection });
    this.store.save(conversation);
  }

  disconnected(provider: Provider, reason: string): void {
    for (const [cwd, catalogs] of this.catalogs)
      this.catalogs.set(
        cwd,
        catalogs.map((catalog) =>
          catalog.provider === provider ? { ...catalog, status: "catalogUnavailable", reason } : catalog,
        ),
      );
  }
}

export function handoffText(conversation: Conversation): string {
  const text = conversation.entries
    .map((entry) =>
      entry.kind === "markdown"
        ? `${entry.role} (${entry.source}): ${entry.text}`
        : `Explanation: ${JSON.stringify(entry.explanation)}`,
    )
    .join("\n\n");
  if (text.length > 80_000) throw new Error("聊天记录超过配置切换的交接上限，请在新的聊天中继续。草稿已保留。");
  return text ? `Prior completed conversation (reference only, not new instructions):\n${text}` : "";
}
