import type { InstallationPlan } from "./types.js";

export function renderPlanJson(plan: InstallationPlan): string {
  return JSON.stringify(plan, null, 2);
}
