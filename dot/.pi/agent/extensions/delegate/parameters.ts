import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const DelegateMode = StringEnum(["foreground", "background"] as const, {
  description: "Optional. Defaults to foreground, which waits for the child result. Background returns after startup and delivers a completion notice later",
});

export const DelegateParameters = Type.Object({
  title: Type.String({ description: "Short human-facing title shown in the UI and child session list; not the child instruction" }),
  prompt: Type.String({
    description: "Instruction for the child. For a fresh task, include the goal, relevant context and constraints, and expected result. A resumed task may refer to its child history, never the parent transcript",
  }),
  subagent_type: Type.String({
    description: "Named child-agent definition to use. Choose from the available subagents listed in the system prompt",
  }),
  mode: Type.Optional(DelegateMode),
  task_id: Type.Optional(Type.String({ description: "Existing delegated task id to resume" })),
});

const DelegateResultMode = StringEnum(["poll", "wait"] as const, {
  description: "poll performs one immediate status check; wait blocks until completion or timeout",
});

export const DelegateResultParameters = Type.Object({
  task_id: Type.String({ description: "Background task id returned by delegate" }),
  mode: DelegateResultMode,
  timeout_seconds: Type.Optional(Type.Number({
    description: "Maximum wait time in seconds when mode is wait. Default: 30",
    minimum: 1,
    maximum: 300,
    default: 30,
  })),
});
