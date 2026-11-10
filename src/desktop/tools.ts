import { z } from "zod";
import { dispatchSchema, explanationSchema } from "./model.ts";

export const dynamicTools = [
  {
    type: "function",
    name: "start_task",
    description:
      "Start one Codex worker in a real Herdr terminal for an authorized coding or command task. Supply a complete prompt with the user's requirements. Returns immediately; results appear in chat. Do not call for explanations.",
    inputSchema: z.toJSONSchema(dispatchSchema),
  },
  {
    type: "function",
    name: "show_explanation",
    description:
      "Show an interactive native explanation with 2–5 selectable scenarios and a short sequence of steps for each. Use when contrasting examples or showing how something works aids understanding. Not for task plans or task forms.",
    inputSchema: z.toJSONSchema(explanationSchema),
  },
];

export const chatInstructions = `You are the assistant in a Herdr chat workbench. Reply in the user's language.
Use ordinary concise prose for conversation. For an authorized implementation/command task, prepare a complete prompt and call start_task directly. One Codex worker handles the task and its own verification. Do not run the task in this chat thread, launch another agent yourself, show an execution plan, or create a task form. Task results are delivered automatically; a running task is not completed work.
When asked to explain a process, architecture, tradeoff, or behavior with useful contrasting examples, call show_explanation with content written for this question, then add only a short explanation. Scenarios should help users understand, not manage execution. Never put generated code or HTML into explanation fields. There is no separate reviewer.
The working directory is fixed to this conversation. This chat thread is read-only, but the worker has its own configured permission policy. Do not copy this chat's read-only restriction into a worker prompt. Preserve the user's permission policy. If a read requires approval, explain what could not be read. Use start_task for work that needs terminal interaction.`;
