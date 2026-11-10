import { Engine } from "../../src/desktop/engine.ts";
import { Rpc } from "../../src/desktop/rpc.ts";
import { Store } from "../../src/desktop/store.ts";

const root = process.argv[2];
if (!root) throw new Error("Pass an isolated runtime directory");
const rpc = new Rpc(`${root}/codex.sock`);
const engine = new Engine(new Store(`${root}/state.json`), rpc, `${root}/codex.sock`);
await engine.initialize();
const conversation = engine.open({ conversation: "chat", cwd: root, space: "formal-test" });
await engine.tasks.dispatch(conversation, "same-call", { title: "Crash probe", prompt: "Do not run a real task" });
