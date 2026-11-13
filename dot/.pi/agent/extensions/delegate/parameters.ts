import { Type } from "typebox";

export const DelegateParameters = Type.Object({
  title: Type.String({ description: "Short (3-5 words) human-facing title shown in the UI and child session list; not the child instruction" }),
  prompt: Type.String({
    description: "Instruction for the child. For a fresh task, include the goal, relevant context and constraints, and expected result. A resumed task may refer to its child history, never the parent transcript",
  }),
  subagent_type: Type.String({
    description: "Named child-agent definition to use. Choose from the available subagents listed in the system prompt",
  }),
  run_in_background: Type.Optional(Type.Boolean({
    description: "Defaults to true: the call returns at once and you are notified when the subagent completes. Pass false only when your very next action depends on the result and nothing else could usefully happen while it runs",
  })),
  task_id: Type.Optional(Type.String({ description: "Existing delegated task id to continue with its context intact" })),
});
