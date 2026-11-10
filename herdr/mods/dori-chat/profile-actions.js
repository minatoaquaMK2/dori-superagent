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
  chat.notice = "";
  const selection = saved ?? catalog.defaultSelection;
  const model = catalog.models.find((model) => model.id === selection?.modelChoice);
  const valid =
    model &&
    !model.reason &&
    (model.effort.kind === "unsupported"
      ? selection.effortChoice === null
      : model.effort.options.some((option) => option.id === selection.effortChoice && !option.reason));
  if (valid) chat.configure(selection, catalog.revision, cx);
  else {
    chat.menu = { id: "model-picker", provider };
    cx.notify();
  }
}

export function chooseModel(chat, modelId, cx) {
  if (locked(chat)) return;
  const selection = chat.profile?.selection;
  const provider = chat.menu?.id === "model-picker" ? chat.menu.provider : selection?.provider;
  const catalog = chat.catalog.find((item) => item.provider === provider);
  const model = catalog?.models.find((model) => model.id === modelId);
  if (!model || model.reason) return;
  const previous = selection?.provider === provider ? selection.effortChoice : null;
  const effort =
    model.effort.kind === "unsupported"
      ? null
      : model.effort.options.some((option) => option.id === previous && !option.reason)
        ? previous
        : model.effort.defaultId;
  chat.configure({ provider: catalog.provider, modelChoice: model.id, effortChoice: effort }, catalog.revision, cx);
  chat.notice = previous !== effort ? (effort ? `已使用此模型默认强度 ${effort}` : "此模型不提供强度选项") : "";
}

export function chooseEffort(chat, effortId, cx) {
  if (locked(chat)) return;
  const selection = chat.profile?.selection;
  if (chat.menu?.id === "model-picker" && chat.menu.provider !== selection?.provider) return;
  const catalog = chat.catalog.find((item) => item.provider === selection?.provider);
  const model = catalog?.models.find((model) => model.id === selection?.modelChoice);
  if (
    model?.effort.kind !== "choices" ||
    !model.effort.options.some((option) => option.id === effortId && !option.reason)
  )
    return;
  chat.notice = "";
  chat.configure({ ...selection, effortChoice: effortId }, catalog.revision, cx);
}
