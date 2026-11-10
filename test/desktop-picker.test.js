import { expect, test } from "bun:test";
import { chooseProvider, chooseModel, chooseEffort } from "../herdr/mods/dori-chat/profile-actions.js";
import { validateSelection } from "../src/desktop/profile.ts";

function fixture(saved) {
  const current = { provider: "codex", modelChoice: "codex-model", effortChoice: null };
  const chat = {
    state: { kind: "idle" },
    queued: 0,
    configuring: false,
    sending: false,
    menu: null,
    profile: { selection: current },
    preferences: saved ? [{ selection: saved }] : [],
    catalog: [
      {
        provider: "codex",
        status: "ready",
        revision: "codex",
        models: [{ id: "codex-model", effort: { kind: "unsupported" } }],
      },
      {
        provider: "devin",
        status: "ready",
        revision: "devin",
        models: [
          { id: "fusion", reason: "Extra agents are unsupported", effort: { kind: "unsupported" } },
          { id: "safe", effort: { kind: "choices", defaultId: "low", options: [{ id: "low" }, { id: "high" }] } },
        ],
        defaultSelection: { provider: "devin", modelChoice: "fusion", effortChoice: null },
      },
    ],
    calls: [],
    draft: "Keep this draft",
    error: "Existing error",
    configure(selection, revision) {
      validateSelection(
        this.catalog.find((item) => item.revision === revision),
        selection,
      );
      this.calls.push(selection);
      this.profile = { selection };
      this.menu = null;
    },
  };
  return { chat, cx: { notify() {} }, current };
}

test("disabled provider default leaves current profile until an explicit supported model choice", () => {
  const { chat, cx, current } = fixture();
  chooseProvider(chat, "devin", cx);
  expect(chat.calls).toEqual([]);
  expect(chat.profile.selection).toEqual(current);
  expect(chat.error).toBe("Existing error");
  chooseModel(chat, "safe", cx);
  expect(chat.profile.selection).toEqual({ provider: "devin", modelChoice: "safe", effortChoice: "low" });
  expect(chat.calls).toHaveLength(1);
  expect(chat.draft).toBe("Keep this draft");
});

test("disabled saved model requires explicit choice even when provider default is supported", () => {
  const { chat, cx, current } = fixture({ provider: "devin", modelChoice: "fusion", effortChoice: null });
  chat.catalog[1].defaultSelection = { provider: "devin", modelChoice: "safe", effortChoice: "low" };
  chooseProvider(chat, "devin", cx);
  expect(chat.calls).toEqual([]);
  chooseModel(chat, "fusion", cx);
  expect(chat.profile.selection).toEqual(current);
  chooseModel(chat, "safe", cx);
  expect(chat.profile.selection.provider).toBe("devin");
});

test("closing provider model choice preserves the active profile and busy state blocks changes", () => {
  const { chat, cx, current } = fixture();
  chooseProvider(chat, "devin", cx);
  chat.menu = null;
  chooseModel(chat, "safe", cx);
  expect(chat.profile.selection).toEqual(current);
  expect(chat.calls).toEqual([]);
  chat.state = { kind: "running" };
  chooseProvider(chat, "devin", cx);
  expect(chat.menu).toBeNull();
});

test("valid saved model and effort remain the explicit provider preference", () => {
  const selection = { provider: "devin", modelChoice: "safe", effortChoice: "high" };
  const { chat, cx } = fixture(selection);
  chooseProvider(chat, "devin", cx);
  expect(chat.profile.selection).toEqual(selection);
});

test("explicit effort and provider choices clear the prior default-strength notice", () => {
  const { chat, cx } = fixture();
  chooseProvider(chat, "devin", cx);
  chooseModel(chat, "safe", cx);
  expect(chat.notice).toContain("low");
  chooseEffort(chat, "high", cx);
  expect(chat.profile.selection.effortChoice).toBe("high");
  expect(chat.notice).toBe("");
  chat.notice = "Previous default strength";
  chooseProvider(chat, "devin", cx);
  expect(chat.notice).toBe("");
});
