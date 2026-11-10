import { type Conversation, type MainRun, dispatchSchema, explanationSchema } from "./model.ts";
import { revision } from "./profile.ts";
import type { Store } from "./store.ts";
import type { Tasks } from "./tasks.ts";
import { z } from "zod";

export class HostTools {
  constructor(
    private readonly store: Store,
    private readonly tasks: Tasks,
  ) {}

  forBinding(owner: { conversation: string; segment: string } | undefined, input: unknown): Promise<string> {
    if (!owner) throw new Error("Unauthorized host tool binding");
    const call = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) }).parse(input);
    const operationId = z.string().parse(call.arguments["operationId"]);
    const conversation = this.store.conversation(owner.conversation);
    const run = conversation.runs.find(
      (run) => run.operationId === operationId && run.origin.segment === owner.segment,
    );
    if (!run) throw new Error("Unknown host operation");
    return this.call(conversation, run, call.name, call.arguments);
  }

  async call(conversation: Conversation, run: MainRun, tool: string, input: unknown): Promise<string> {
    const argumentsValue =
      tool === "start_task"
        ? dispatchSchema.parse(input)
        : tool === "show_explanation"
          ? explanationSchema.parse(input)
          : null;
    if (!argumentsValue) throw new Error(`Unknown host tool ${tool}`);
    const fingerprint = revision(argumentsValue);
    const receipt = run.receipts.find((receipt) => receipt.tool === tool);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new Error("此操作身份已用于不同的参数");
      return receipt.result;
    }
    if (
      conversation.activeRun !== run.origin.run ||
      conversation.activeSegment !== run.origin.segment ||
      run.state !== "attempted"
    )
      throw new Error("This run no longer owns tool access");
    let result: string;
    if (tool === "start_task")
      result = await this.tasks.dispatch(conversation, run.operationId, argumentsValue, run.origin);
    else {
      const explanation = explanationSchema.parse(argumentsValue);
      const id = `explanation:${run.operationId}`;
      if (!conversation.entries.some((entry) => entry.id === id))
        conversation.entries.push({ kind: "explanation", id, explanation });
      result = "Explanation displayed in the chat. The user can switch scenarios.";
    }
    run.receipts.push({ tool, fingerprint, result });
    this.store.save(conversation);
    return result;
  }
}
