import { chooseProvider, chooseModel, chooseEffort } from "./profile-actions.js";
import { div } from "gpui-kit";
import { h_flex, v_flex, Popover } from "gpui-base";
import { theme } from "herdr";

const trigger = (label, locked) =>
  div()
    .px(10)
    .py(7)
    .rounded(7)
    .bg(theme().raised)
    .text_size(12)
    .text_color(locked ? theme().dim : theme().foreground)
    .child(`${label} ▾`);
const row = (id, label, selected, reason, action) =>
  v_flex()
    .id(id)
    .px(10)
    .py(8)
    .gap(3)
    .rounded(6)
    .cursor_pointer()
    .hover((el) => el.bg(theme().hover))
    .on_click(action)
    .child(
      div()
        .text_size(12)
        .text_color(reason ? theme().dim : theme().foreground)
        .child(`${selected ? "✓ " : ""}${label}`),
    )
    .when(Boolean(reason), (el) => el.child(div().text_size(11).text_color(theme().muted).child(reason)));

export function profilePicker(chat, locked) {
  const selected = chat.profile?.selection;
  const catalog = chat.catalog.find((catalog) => catalog.provider === selected?.provider);
  const model = catalog?.models.find((model) => model.id === selected?.modelChoice);
  const modelLabel = model?.label ?? selected?.modelChoice ?? "正在读取模型…";
  const surface = () =>
    v_flex()
      .w(320)
      .max_h(420)
      .overflow_y_scrollbar()
      .p(8)
      .gap(3)
      .rounded(10)
      .bg(theme().popover)
      .border_1()
      .border_color(theme().border);
  const popup = (id, label, content) =>
    Popover.new(id)
      .anchor("top_left")
      .open(chat.menu === id && !locked)
      .on_open_change((open, cx) => {
        chat.menu = open && !locked ? id : null;
        cx.notify();
      })
      .trigger(trigger(label, locked))
      .content(content);
  const providers = surface().children(
    chat.catalog.map((item) =>
      row(`provider-${item.provider}`, item.label, item.provider === selected?.provider, item.reason, (_event, cx) => {
        chooseProvider(chat, item.provider, cx);
      }),
    ),
  );
  const models = surface()
    .child(div().px(10).py(5).text_size(11).text_color(theme().dim).child("模型"))
    .children(
      (catalog?.models ?? []).map((item) =>
        row(`model-${item.id}`, item.label, item.id === selected?.modelChoice, item.reason, (_event, cx) => {
          chooseModel(chat, item.id, cx);
        }),
      ),
    )
    .child(
      div()
        .mt(6)
        .px(10)
        .py(5)
        .border_t_1()
        .border_color(theme().border)
        .text_size(11)
        .text_color(theme().dim)
        .child("Reasoning effort"),
    )
    .when(model?.effort.kind === "choices", (el) =>
      el.children(
        model.effort.options.map((option) =>
          row(
            `effort-${option.id}`,
            option.label,
            option.id === selected?.effortChoice,
            option.reason,
            (_event, cx) => {
              chooseEffort(chat, option.id, cx);
            },
          ),
        ),
      ),
    )
    .when(model?.effort.kind !== "choices", (el) =>
      el.child(div().px(10).py(8).text_size(11).text_color(theme().dim).child("此模型不提供强度选项")),
    );
  return h_flex()
    .items_center()
    .gap(6)
    .child(popup("cli-picker", catalog?.label ?? "CLI", providers))
    .child(
      popup("model-picker", `${modelLabel}${selected?.effortChoice ? ` · ${selected.effortChoice}` : ""}`, models),
    );
}
