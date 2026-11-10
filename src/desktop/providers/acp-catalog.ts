import { join } from "node:path";
import {
  type Catalog,
  type ModelChoice,
  type Profile,
  type Selection,
  revision,
  validateSelection,
} from "../profile.ts";
import { AcpSession } from "./acp-session.ts";

export class AcpCatalog {
  private resolved = new Map<string, Map<string, string>>();
  constructor(private readonly directory: string) {}

  async read(cwd: string): Promise<Catalog> {
    const session = new AcpSession(join(this.directory, "catalogs", crypto.randomUUID()), cwd);
    try {
      const initial = await session.initialize();
      const defaultModel = initial.configOptions.find((option) => option.id === "model")?.currentValue;
      const defaultEffort = initial.configOptions.find((option) => option.id === "thought_level")?.currentValue ?? null;
      const options = initial.configOptions.find((option) => option.id === "model")?.options;
      if (!options || !defaultModel) throw new Error("CLI 未返回模型配置目录");
      const models: ModelChoice[] = [];
      const effective = new Map<string, string>();
      for (const option of options) {
        const result = await session.set("model", option.value);
        const thought = result.configOptions.find((option) => option.id === "thought_level");
        const efforts = thought?.options ?? [];
        for (const effort of efforts.length ? efforts : [{ value: "", name: "" }]) {
          if (effort.value) await session.set("thought_level", effort.value);
          const applied = await session.load();
          if (!applied.models?.currentModelId) throw new Error("CLI 未确认实际模型 ID");
          effective.set(JSON.stringify([option.value, effort.value || null]), applied.models.currentModelId);
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
        provider: "antigravity",
        label: "Antigravity",
        revision: revision({ models, effective: [...effective] }),
        status: "ready",
        models,
        defaultSelection: { provider: "antigravity", modelChoice: defaultModel, effortChoice: defaultEffort },
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
      resolved: { provider: "antigravity", model, effort: selection.effortChoice },
    };
  }
}
