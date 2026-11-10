import { View, div } from "gpui-kit";
import { h_flex, v_flex, Textarea, TextareaState, TextView } from "gpui-base";
import { nextCommand, props, readTextFile, theme } from "herdr";
import { chooseProvider, chooseModel, chooseEffort, locked } from "./profile-actions.js";
import { profilePicker } from "./profile-picker.js";
import { explanationCard } from "./explanation.js";

export default class Chat extends View {
  init(_props, cx) {
    this.context = props() ?? {};
    this.entries = [];
    this.revision = -1;
    this.state = { kind: "idle" };
    this.queued = 0;
    this.selections = {};
    this.error = "";
    this.notice = "";
    this.profile = null;
    this.profileRevision = 0;
    this.catalog = [];
    this.preferences = [];
    this.configuring = false;
    this.menu = null;
    this.polling = false;
    this.sending = false;
    this.connection = null;
    this.pending = null;
    this.input = TextareaState.new({ placeholder: "派个任务，或一起解释一个问题…", rows: 3 });
    this.input.set_auto_grow(2, 6);
    this.input.on("change", (_event, cx) => cx.notify());
    this.input.on("submit", (event, cx) => {
      if (!event.shift) this.send(cx);
    });
    if (!this.context.connection) return;
    this.refresh(cx);
    cx.timer.every(900, (cx) => this.refresh(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command.startsWith("send:")) {
          try {
            this.input.set_value(decodeURIComponent(command.slice(5)));
            this.send(cx);
          } catch (error) {
            this.error = String(error);
          }
        }
        if (command === "open-cli" || command === "open-model") {
          if (!locked(this))
            this.menu =
              command === "open-cli"
                ? { id: "cli-picker" }
                : { id: "model-picker", provider: this.profile?.selection.provider };
        }
        if (command.startsWith("choose-cli:")) chooseProvider(this, command.slice(11), cx);
        if (command.startsWith("choose-model:")) chooseModel(this, command.slice(13), cx);
        if (command.startsWith("choose-effort:")) chooseEffort(this, command.slice(14), cx);
        cx.notify();
      }
    });
  }

  async request(path, body) {
    if (!this.connection) throw new Error("正在连接聊天服务…");
    const response = await fetch(`${this.connection.url}${path}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${this.connection.token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error ?? "连接失败，请重新打开聊天工作台。");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  refresh(cx) {
    if (this.polling || !this.context.connection) return;
    this.polling = true;
    cx.spawn(async (cx) => {
      try {
        const file = await readTextFile(this.context.connection);
        if (!file) throw new Error("聊天服务尚未启动。");
        const connection = JSON.parse(file);
        if (this.connection?.url !== connection.url || this.connection?.token !== connection.token) {
          this.connection = connection;
          await this.request("/open", {
            conversation: this.context.conversation,
            cwd: this.context.cwd,
            space: this.context.space,
          });
          this.revision = -1;
        }
        const data = await this.request(
          `/snapshot?conversation=${encodeURIComponent(this.context.conversation)}&after=${this.revision}`,
        );
        if (data) {
          if (!Array.isArray(data.catalog) || !data.profile || !Array.isArray(data.preferences))
            throw new Error("聊天服务版本过旧，请重新启动服务后再打开工作台。草稿已保留。");
          this.entries = data.entries;
          this.revision = data.revision;
          this.state = data.state;
          this.queued = data.queued;
          this.profile = data.profile;
          this.profileRevision = data.profileRevision;
          this.catalog = data.catalog;
          this.preferences = data.preferences;
          cx.notify();
        }
      } catch (error) {
        const message = String(error);
        if (this.error !== message) {
          this.error = message;
          cx.notify();
        }
      } finally {
        this.polling = false;
      }
    });
  }

  configure(selection, catalogRevision, cx) {
    if (this.configuring || this.sending || this.state.kind !== "idle" || this.queued || !selection) return;
    this.configuring = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.request("/configure", {
          conversation: this.context.conversation,
          requestId: `${Date.now()}-${Math.random()}`,
          expectedRevision: this.profileRevision,
          catalogRevision,
          selection,
        });
        this.menu = null;
      } catch (error) {
        this.error = String(error);
      } finally {
        this.configuring = false;
        this.revision = -1;
        cx.notify();
        this.refresh(cx);
      }
    });
  }

  send(cx) {
    const text = this.input.value().trim();
    if (!text || this.sending || this.configuring || !this.connection || !this.profile) return;
    if (!this.pending || this.pending.text !== text)
      this.pending = {
        text,
        requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        expectedProfileRevision: this.profileRevision,
      };
    const pending = this.pending;
    this.sending = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.request("/send", { conversation: this.context.conversation, ...pending });
        if (this.input.value().trim() === pending.text) this.input.set_value("");
        this.pending = null;
      } catch (error) {
        this.error = String(error);
        if (error.status >= 400) this.pending = null;
      } finally {
        this.sending = false;
        cx.notify();
        this.refresh(cx);
      }
    });
  }

  stop(cx) {
    cx.spawn(async (cx) => {
      try {
        await this.request("/interrupt", { conversation: this.context.conversation });
      } catch (error) {
        this.error = String(error);
      }
      cx.notify();
    });
  }

  entry(entry) {
    const t = theme();
    if (entry.kind === "explanation")
      return explanationCard(entry, this.selections[entry.id] ?? 0, (index, cx) => {
        this.selections[entry.id] = index;
        cx.notify();
      });
    const user = entry.role === "user";
    return v_flex()
      .w_full()
      .gap(7)
      .child(div().text_size(11).text_color(t.dim).child(entry.source))
      .child(
        div()
          .w_full()
          .when(user, (el) => el.p(14).rounded(10).bg(t.raised))
          .child(
            TextView.markdown(entry.id, entry.text || "…")
              .selectable(true)
              .text_size(14)
              .text_color(t.foreground),
          ),
      );
  }

  render() {
    const t = theme();
    const busy = this.state.kind === "running";
    const providerName =
      this.catalog.find((catalog) => catalog.provider === this.profile?.selection.provider)?.label ?? "CLI";
    const locked = busy || this.queued > 0 || this.configuring || this.sending || this.state.kind === "disconnected";
    const connected = Boolean(this.connection) && this.state.kind !== "disconnected";
    const status =
      this.error ||
      (this.state.kind === "disconnected"
        ? "连接已断开，请重新启动聊天工作台。"
        : this.queued
          ? `${this.queued} 条消息待发送`
          : busy
            ? `${providerName} 正在回复…`
            : this.notice || "Enter 发送 · Shift + Enter 换行");
    const button = (id, label, action, primary) =>
      div()
        .id(id)
        .px(14)
        .py(7)
        .rounded(7)
        .cursor_pointer()
        .bg(primary ? t.solid : t.raised)
        .text_color(primary ? t.solid_foreground : t.muted)
        .on_click(action)
        .child(label);
    const rows = this.entries.map((entry) =>
      v_flex()
        .id(`row:${entry.id}`)
        .w_full()
        .flex_none()
        .px(28)
        .py(12)
        .child(v_flex().w_full().max_w(880).mx_auto().child(this.entry(entry))),
    );
    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.background)
      .text_color(t.foreground)
      .child(
        h_flex()
          .flex_none()
          .px(24)
          .py(15)
          .items_center()
          .justify_between()
          .border_b_1()
          .border_color(t.border)
          .child(div().text_size(15).font_semibold().child("聊天工作台"))
          .child(
            h_flex()
              .gap(7)
              .items_center()
              .text_size(12)
              .text_color(t.muted)
              .child(
                div()
                  .w(6)
                  .h(6)
                  .rounded(3)
                  .bg(connected ? t.idle : t.dim),
              )
              .child(providerName),
          ),
      )
      .child(
        v_flex()
          .id("chat-transcript")
          .w_full()
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .when(!rows.length, (el) =>
            el.child(
              v_flex()
                .px(28)
                .py(50)
                .gap(12)
                .child(div().text_size(23).font_semibold().child("今天想做点什么？"))
                .child(div().text_size(14).text_color(t.muted).child("直接派任务，或一起把一个问题讲清楚。")),
            ),
          )
          .children(rows),
      )
      .child(
        v_flex()
          .flex_none()
          .px(28)
          .pt(12)
          .pb(16)
          .child(
            v_flex()
              .w_full()
              .max_w(880)
              .mx_auto()
              .gap(9)
              .child(
                Textarea.new(this.input)
                  .w_full()
                  .min_h(68)
                  .px(14)
                  .py(10)
                  .rounded(10)
                  .border_1()
                  .border_color(t.input)
                  .bg(t.surface)
                  .text_size(14)
                  .text_color(t.foreground),
              )
              .child(
                h_flex()
                  .items_center()
                  .gap(10)
                  .child(profilePicker(this, locked))
                  .child(
                    div()
                      .flex_1()
                      .text_size(11)
                      .text_color(this.error ? t.blocked : t.dim)
                      .child(status),
                  )
                  .when(busy, (el) => el.child(button("stop", "停止回复", (_event, cx) => this.stop(cx), false)))
                  .child(button("send", this.sending ? "发送中…" : "发送 ↑", (_event, cx) => this.send(cx), true)),
              ),
          ),
      );
  }
}
