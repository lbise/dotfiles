export type ParentActivity = {
  isIdle(): boolean;
};

export type CompletionDeliveryOptions = {
  deliverAs: "steer" | "followUp";
  triggerTurn: true;
};

export function completionDeliveryOptions(
  parent: ParentActivity | undefined,
): CompletionDeliveryOptions {
  return {
    deliverAs: parent?.isIdle() === false ? "steer" : "followUp",
    triggerTurn: true,
  };
}
