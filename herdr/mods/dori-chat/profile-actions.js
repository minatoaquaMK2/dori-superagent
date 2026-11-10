export function locked(chat) {
  return chat.state.kind !== "idle" || chat.queued > 0 || chat.configuring || chat.sending;
}

export function chooseProvider(chat, provider, cx) {
  if (locked(chat)) return;
  const catalog = chat.catalog.find((item) => item.provider === provider);
  if (!catalog) return;
  if (catalog.status !== "ready") {
    chat.error = catalog.reason;
    cx.notify();
    return;
  }
  const saved = chat.preferences.find((profile) => profile.selection.provider === provider)?.selection;
  const model = catalog.models.find((model) => model.id === saved?.modelChoice);
  const valid =
    model &&
    (model.effort.kind === "unsupported"
      ? saved.effortChoice === null
      : model.effort.options.some((option) => option.id === saved.effortChoice && !option.reason));
  chat.configure(valid ? saved : catalog.defaultSelection, catalog.revision, cx);
}

export function chooseModel(chat, modelId, cx) {
  if (locked(chat)) return;
  const selection = chat.profile?.selection;
  const catalog = chat.catalog.find((item) => item.provider === selection?.provider);
  const model = catalog?.models.find((model) => model.id === modelId);
  if (!model || model.reason) return;
  const previous = selection.effortChoice;
  const effort =
    model.effort.kind === "unsupported"
      ? null
      : model.effort.options.some((option) => option.id === previous && !option.reason)
        ? previous
        : model.effort.defaultId;
  chat.configure({ provider: catalog.provider, modelChoice: model.id, effortChoice: effort }, catalog.revision, cx);
  if (previous !== effort) chat.notice = effort ? `已使用此模型默认强度 ${effort}` : "此模型不提供强度选项";
}

export function chooseEffort(chat, effortId, cx) {
  if (locked(chat)) return;
  const selection = chat.profile?.selection;
  const catalog = chat.catalog.find((item) => item.provider === selection?.provider);
  const model = catalog?.models.find((model) => model.id === selection?.modelChoice);
  if (
    model?.effort.kind !== "choices" ||
    !model.effort.options.some((option) => option.id === effortId && !option.reason)
  )
    return;
  chat.configure({ ...selection, effortChoice: effortId }, catalog.revision, cx);
}
