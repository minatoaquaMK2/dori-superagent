import { z } from "zod";
import { type Catalog, type Profile, type Selection, revision, validateSelection } from "../profile.ts";
import type { Rpc } from "../rpc.ts";

const modelSchema = z.object({
  id: z.string(),
  model: z.string(),
  displayName: z.string(),
  isDefault: z.boolean(),
  supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string(), description: z.string() })),
  defaultReasoningEffort: z.string(),
});
const listSchema = z.object({ data: z.array(modelSchema), nextCursor: z.string().nullable() });
const configSchema = z.object({
  config: z
    .object({ model: z.string().nullable().optional(), model_reasoning_effort: z.string().nullable().optional() })
    .passthrough(),
});

export class CodexCatalog {
  private models: z.infer<typeof modelSchema>[] = [];
  constructor(private readonly rpc: Rpc) {}

  async read(cwd: string): Promise<Catalog> {
    const models: z.infer<typeof modelSchema>[] = [];
    let cursor: string | null = null;
    do {
      const page = listSchema.parse(await this.rpc.request("model/list", { limit: 100, cursor, includeHidden: false }));
      models.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    this.models = models;
    const { config } = configSchema.parse(await this.rpc.request("config/read", { cwd, includeLayers: false }));
    const current = config.model
      ? models.find((model) => model.model === config.model)
      : models.find((model) => model.isDefault);
    if (!current) throw new Error("Codex 当前配置的模型不在可用目录中，请在 CLI 中检查配置");
    const catalog: Catalog = {
      provider: "codex",
      label: "Codex",
      revision: revision({ models, config }),
      status: "ready",
      models: models.map((model) => ({
        id: model.id,
        label: model.displayName,
        effort: model.supportedReasoningEfforts.length
          ? {
              kind: "choices",
              defaultId: model.defaultReasoningEffort,
              options: model.supportedReasoningEfforts.map((effort) => ({
                id: effort.reasoningEffort,
                label: effort.reasoningEffort,
                ...(effort.reasoningEffort === "ultra"
                  ? { reason: "此强度会自动委派任务，与单执行终端约定不兼容" }
                  : {}),
              })),
            }
          : { kind: "unsupported" },
      })),
      defaultSelection: {
        provider: "codex",
        modelChoice: current.id,
        effortChoice: current.supportedReasoningEfforts.length
          ? (config.model_reasoning_effort ?? current.defaultReasoningEffort)
          : null,
      },
    };
    validateSelection(catalog, catalog.defaultSelection!);
    return catalog;
  }

  resolve(catalog: Catalog, selection: Selection): Profile {
    validateSelection(catalog, selection);
    const model = this.models.find((model) => model.id === selection.modelChoice);
    if (!model) throw new Error("模型目录已改变，请刷新");
    return {
      id: crypto.randomUUID(),
      selection,
      catalogRevision: catalog.revision,
      resolved: { provider: "codex", model: model.model, effort: selection.effortChoice },
    };
  }
}

export function codexSettings(profile: Profile): { model?: string; effort?: string } {
  if (profile.resolved.provider !== "codex") throw new Error("此会话不属于 Codex");
  return {
    ...(profile.resolved.model ? { model: profile.resolved.model } : {}),
    ...(profile.resolved.effort ? { effort: profile.resolved.effort } : {}),
  };
}
