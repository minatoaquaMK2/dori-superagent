import { div } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { theme } from "herdr";

export function explanationCard(entry, selected, select) {
  const t = theme();
  const data = entry.explanation;
  const scenario = data.scenarios[selected] ?? data.scenarios[0];
  const markdown = (id, text) =>
    TextView.markdown(`${entry.id}:${id}`, text).selectable(true).text_size(13).text_color(t.foreground);
  return v_flex()
    .w_full()
    .p(20)
    .gap(14)
    .rounded(12)
    .border_1()
    .border_color(t.border)
    .bg(t.surface)
    .child(div().text_size(16).font_semibold().child(data.title))
    .when(Boolean(data.intro), (el) => el.child(markdown("intro", data.intro)))
    .child(
      h_flex()
        .gap(6)
        .flex_wrap()
        .children(
          data.scenarios.map((item, index) =>
            div()
              .id(`${entry.id}:scenario:${index}`)
              .px(12)
              .py(7)
              .rounded(7)
              .cursor_pointer()
              .bg(index === selected ? t.selected : t.raised)
              .text_color(index === selected ? t.accent : t.muted)
              .on_click((_event, cx) => select(index, cx))
              .child(item.label),
          ),
        ),
    )
    .child(markdown("summary", scenario.summary))
    .child(
      v_flex()
        .gap(8)
        .children(
          scenario.steps.map((step, index) =>
            h_flex()
              .gap(12)
              .items_start()
              .child(
                div()
                  .w(24)
                  .h(24)
                  .flex_none()
                  .rounded(12)
                  .bg(t.selected)
                  .text_color(t.accent)
                  .text_center()
                  .child(String(index + 1)),
              )
              .child(
                v_flex()
                  .flex_1()
                  .min_w(0)
                  .gap(4)
                  .pb(8)
                  .child(div().font_medium().child(step.title))
                  .child(markdown(`step:${selected}:${index}`, step.body)),
              ),
          ),
        ),
    )
    .child(div().pt(10).border_t_1().border_color(t.border).child(markdown("takeaway", scenario.takeaway)));
}
