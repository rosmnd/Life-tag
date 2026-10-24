export type OrderSteps = Record<string, boolean>;

export interface OrderStepPatch {
  status?: string;
  steps?: OrderSteps;
}

export function orderStepPatchError(
  status: string,
  currentSteps: OrderSteps,
  patch: OrderStepPatch,
): string | null {
  const updates = patch.steps ?? {};
  if (updates.encoded === true) {
    return "Encoding can only be recorded through the verified encoder result endpoint.";
  }

  const nextStatus = patch.status ?? status;
  const nextSteps = { ...currentSteps, ...updates };
  const gatedSteps = ["sanitize", "print", "laminate", "pack", "prepDone", "airplane", "tap", "text", "offline", "qc", "shipped"];
  if (nextStatus !== "paid" && gatedSteps.some((step) => updates[step] === true)) {
    return "Mark the order paid before starting production.";
  }

  if (nextSteps.prepDone && nextStatus !== "paid") {
    return "Mark the order paid before marking preparation done.";
  }
  if (nextSteps.prepDone && !["sanitize", "print", "laminate", "pack"].every((step) => nextSteps[step])) {
    return "Complete sanitize, print, laminate, and pack before marking preparation done.";
  }

  if (nextSteps.qc &&
      (!nextSteps.encoded || !["airplane", "tap", "text", "offline"].every((step) => nextSteps[step]))) {
    return "Encode the tag and complete all QC checks before approving QC.";
  }

  if (nextSteps.shipped && !nextSteps.qc) {
    return "Approve QC before marking the order shipped.";
  }

  return null;
}
