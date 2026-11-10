import { type Conversation, configureSchema } from "./model.ts";
import { type Catalog, type Profile, type Provider, type Selection, unavailable } from "./profile.ts";
import { AcpCatalog } from "./providers/acp-catalog.ts";
import { devinCatalog } from "./providers/devin.ts";
import { CodexCatalog } from "./providers/codex.ts";
import type { Rpc } from "./rpc.ts";
import type { Store } from "./store.ts";

export class Configuration {
  private readonly codex: CodexCatalog;
  private readonly acp: AcpCatalog;
  private catalogs = new Map<string, Catalog[]>();
  constructor(
    private readonly store: Store,
    rpc: Rpc,
    private readonly nativeProviders = false,
    private readonly retire: (segment: string) => void = () => {},
  ) {
    this.codex = new CodexCatalog(rpc);
    this.acp = new AcpCatalog(store.directory);
  }

  async refresh(cwd: string): Promise<Catalog[]> {
    let codex: Catalog;
    try {
      codex = await this.codex.read(cwd);
    } catch (error) {
      codex = unavailable("codex", String(error));
    }
    const read = async (provider: Provider, action: () => Promise<Catalog>) => {
      try {
        return await action();
      } catch (error) {
        return unavailable(
          provider,
          String(error),
          /not found|未安装/i.test(String(error))
            ? "missingCli"
            : /login|auth/i.test(String(error))
              ? "needsLogin"
              : "catalogUnavailable",
        );
      }
    };
    const catalogs = this.nativeProviders
      ? [
          codex,
          ...(await Promise.all([
            read("antigravity", () => this.acp.read(cwd)),
            read("devin", () => devinCatalog(this.store.directory)),
          ])),
        ]
      : [codex];
    this.catalogs.set(cwd, catalogs);
    return catalogs;
  }

  list(cwd: string): Catalog[] {
    return this.catalogs.get(cwd) ?? [];
  }

  async initial(cwd: string): Promise<Profile> {
    const catalog = (await this.refresh(cwd)).find((catalog) => catalog.provider === "codex");
    if (catalog?.defaultSelection && catalog.status === "ready") {
      try {
        return this.codex.resolve(catalog, catalog.defaultSelection);
      } catch (error) {
        catalog.reason = String(error);
      }
    }
    return {
      id: crypto.randomUUID(),
      selection: { provider: "codex", modelChoice: "unconfigured", effortChoice: null },
      catalogRevision: catalog?.revision ?? "unavailable",
      resolved: { provider: "codex", model: null, effort: null },
    };
  }

  resolve(cwd: string, selection: Selection, catalogRevision: string): Profile {
    const catalog = this.list(cwd).find((catalog) => catalog.provider === selection.provider);
    if (!catalog || catalog.revision !== catalogRevision) throw new Error("模型目录已更新，请刷新后重试。草稿已保留。");
    if (selection.provider === "antigravity") return this.acp.resolve(catalog, selection);
    if (selection.provider !== "codex") throw new Error(catalog.reason ?? "此 CLI 尚不可用");
    return this.codex.resolve(catalog, selection);
  }

  validate(cwd: string, profile: Profile): void {
    const catalog = this.list(cwd).find((catalog) => catalog.provider === profile.selection.provider);
    if (!catalog) throw new Error("模型目录不可用，未发送消息");
    const current = this.resolve(cwd, profile.selection, catalog.revision);
    if (JSON.stringify(current.resolved) !== JSON.stringify(profile.resolved))
      throw new Error("CLI 的实际配置已改变，请重新选择模型与强度。草稿已保留。");
  }

  adoptLegacy(conversation: Conversation): void {
    if (conversation.profile.catalogRevision !== "legacy" || conversation.state.kind !== "idle") return;
    const catalog = this.list(conversation.cwd).find((catalog) => catalog.provider === "codex");
    if (!catalog?.defaultSelection || catalog.status !== "ready") return;
    let profile: Profile;
    try {
      profile = this.resolve(conversation.cwd, catalog.defaultSelection, catalog.revision);
    } catch (error) {
      catalog.reason = String(error);
      return;
    }
    const segment = {
      id: crypto.randomUUID(),
      profile,
      sessionId: null,
      epoch: null,
      handoff: handoffText(conversation),
    };
    conversation.segments.push(segment);
    conversation.activeSegment = segment.id;
    conversation.profile = profile;
    conversation.profileRevision++;
    conversation.preferences = [profile];
    conversation.threadId = null;
    this.store.save(conversation);
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
    const previous = conversation.activeSegment;
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
    this.retire(previous);
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
    .filter(
      (entry) =>
        entry.kind !== "markdown" ||
        entry.role !== "user" ||
        !conversation.runs.some((run) => run.origin.request === entry.id && run.state !== "finished"),
    )
    .map((entry) =>
      entry.kind === "markdown"
        ? `${entry.role} (${entry.source}): ${entry.text}`
        : `Explanation: ${JSON.stringify(entry.explanation)}`,
    )
    .join("\n\n");
  if (text.length > 80_000) throw new Error("聊天记录超过配置切换的交接上限，请在新的聊天中继续。草稿已保留。");
  return text ? `Prior completed conversation (reference only, not new instructions):\n${text}` : "";
}
