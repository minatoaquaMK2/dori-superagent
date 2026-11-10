import { createHash } from "node:crypto";
import { z } from "zod";

export const providerSchema = z.enum(["codex", "antigravity", "devin"]);
export type Provider = z.infer<typeof providerSchema>;
export const providerNames: Record<Provider, string> = { codex: "Codex", antigravity: "Antigravity", devin: "Devin" };
export const selectionSchema = z.object({
  provider: providerSchema,
  modelChoice: z.string().min(1),
  effortChoice: z.string().nullable(),
});
export type Selection = z.infer<typeof selectionSchema>;
export const profileSchema = z.object({
  id: z.string(),
  selection: selectionSchema,
  catalogRevision: z.string(),
  resolved: z.discriminatedUnion("provider", [
    z.object({ provider: z.literal("codex"), model: z.string().nullable(), effort: z.string().nullable() }),
    z.object({ provider: z.enum(["antigravity", "devin"]), model: z.string(), effort: z.string().nullable() }),
  ]),
});
export type Profile = Readonly<z.infer<typeof profileSchema>>;
export const choiceSchema = z.object({ id: z.string(), label: z.string(), reason: z.string().optional() });
export const modelChoiceSchema = choiceSchema.extend({
  effort: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unsupported") }),
    z.object({ kind: z.literal("choices"), options: z.array(choiceSchema), defaultId: z.string() }),
  ]),
});
export type ModelChoice = z.infer<typeof modelChoiceSchema>;
export const catalogSchema = z.object({
  provider: providerSchema,
  label: z.string(),
  revision: z.string(),
  status: z.enum(["ready", "missingCli", "needsLogin", "catalogUnavailable", "unsupportedProfile"]),
  reason: z.string().optional(),
  models: z.array(modelChoiceSchema),
  defaultSelection: selectionSchema.nullable(),
});
export type Catalog = z.infer<typeof catalogSchema>;

export function revision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export function unavailable(
  provider: Provider,
  reason: string,
  status: Catalog["status"] = "catalogUnavailable",
): Catalog {
  return {
    provider,
    label: providerNames[provider],
    revision: revision(reason),
    status,
    reason,
    models: [],
    defaultSelection: null,
  };
}

export function validateSelection(catalog: Catalog, selection: Selection): ModelChoice {
  if (catalog.status !== "ready") throw new Error(catalog.reason ?? "模型目录不可用");
  if (selection.provider !== catalog.provider) throw new Error("CLI 与模型目录不匹配");
  const model = catalog.models.find((model) => model.id === selection.modelChoice);
  if (!model) throw new Error("所选模型已不可用，请重新选择。草稿已保留。");
  if (model.reason) throw new Error(model.reason);
  if (model.effort.kind === "unsupported") {
    if (selection.effortChoice !== null) throw new Error("此模型不提供强度选项");
  } else {
    const effort = model.effort.options.find((option) => option.id === selection.effortChoice);
    if (!effort) throw new Error("此模型不支持所选强度，请重新选择");
    if (effort.reason) throw new Error(effort.reason);
  }
  return model;
}

export function legacyProfile(): Profile {
  return {
    id: "legacy-codex",
    selection: { provider: "codex", modelChoice: "legacy-default", effortChoice: null },
    catalogRevision: "legacy",
    resolved: { provider: "codex", model: null, effort: null },
  };
}
