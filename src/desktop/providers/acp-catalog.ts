import { join } from "node:path";
import {
  type Catalog,
  type ModelChoice,
  type Profile,
  type Selection,
  providerNames,
  revision,
  validateSelection,
} from "../profile.ts";
import { AcpSession } from "./acp-session.ts";
import { DevinSession } from "./devin-session.ts";

export class AcpCatalog {
  private resolved = new Map<string, Map<string, string>>();
  constructor(
    private readonly directory: string,
    private readonly provider: "antigravity" | "devin",
  ) {}

  async read(cwd: string): Promise<Catalog> {
    const directory = join(this.directory, "catalogs", crypto.randomUUID());
    const session =
      this.provider === "devin"
        ? new DevinSession(directory, this.directory)
        : new AcpSession(directory, cwd, this.directory);
    try {
      const initial = await session.initialize();
      const defaultModel = initial.configOptions.find((option) => option.id === "model")?.currentValue;
      const defaultEffort = initial.configOptions.find((option) => option.id === "thought_level")?.currentValue ?? null;
      const options = initial.configOptions.find((option) => option.id === "model")?.options;
      if (!options || !defaultModel) throw new Error("CLI 未返回模型配置目录");
      const models: ModelChoice[] = [];
      const effective = new Map<string, string>();
      for (const option of options) {
        if (this.provider === "devin" && option.value.startsWith("fusion-")) {
          models.push({
            id: option.value,
            label: option.name,
            effort: { kind: "unsupported" },
            reason: "Fusion 会启动额外代理，目前不符合单会话任务所有权约束",
          });
          continue;
        }
        const result = await session.set("model", option.value);
        const thought = result.configOptions.find((option) => option.id === "thought_level");
        const efforts = thought?.options ?? [];
        for (const effort of efforts.length ? efforts : [{ value: "", name: "" }]) {
          if (effort.value) await session.set("thought_level", effort.value);
          effective.set(JSON.stringify([option.value, effort.value || null]), await session.effectiveModel());
        }
        models.push({
          id: option.value,
          label: option.name,
          effort:
            thought && efforts.length
              ? {
                  kind: "choices",
                  options: efforts.map((effort) => ({ id: effort.value, label: effort.name })),
                  defaultId: thought.currentValue,
                }
              : { kind: "unsupported" },
        });
      }
      const catalog: Catalog = {
        provider: this.provider,
        label: providerNames[this.provider],
        revision: revision({ models, effective: [...effective] }),
        status: "ready",
        models,
        defaultSelection: { provider: this.provider, modelChoice: defaultModel, effortChoice: defaultEffort },
      };
      this.resolved.set(catalog.revision, effective);
      return catalog;
    } finally {
      session.close();
    }
  }

  resolve(catalog: Catalog, selection: Selection): Profile {
    validateSelection(catalog, selection);
    const model = this.resolved
      .get(catalog.revision)
      ?.get(JSON.stringify([selection.modelChoice, selection.effortChoice]));
    if (!model) throw new Error("CLI 未确认所选模型与强度组合");
    return {
      id: crypto.randomUUID(),
      selection,
      catalogRevision: catalog.revision,
      resolved: { provider: this.provider, model, effort: selection.effortChoice },
    };
  }
}
