import type { InstallationPlan, PlanDiagnostic } from "./types.js";

export function validateInstallationPlan(plan: InstallationPlan): PlanDiagnostic[] {
  const diagnostics: PlanDiagnostic[] = [...plan.diagnostics];
  const postSeen = new Set<string>();

  for (const step of plan.execution.normalSteps) {
    if (plan.nodes[step.id]?.post) {
      diagnostics.push({
        level: "error",
        code: "post-in-normal",
        nodeId: step.id,
        message: `Post node "${step.id}" appeared in normal execution steps.`,
      });
    }
  }

  for (const step of plan.execution.postSteps) {
    if (!plan.nodes[step.id]?.post) {
      diagnostics.push({
        level: "error",
        code: "non-post-in-post",
        nodeId: step.id,
        message: `Non-post node "${step.id}" appeared in post execution steps.`,
      });
    }
    postSeen.add(step.id);
  }

  const postEdges = plan.edges.filter((edge) => edge.type === "post");
  for (const edge of postEdges) {
    if (!plan.nodes[edge.to]?.post) {
      diagnostics.push({
        level: "warn",
        code: "missing-post-flag",
        nodeId: edge.to,
        message: `Node "${edge.to}" is in a post edge but not marked post.`,
      });
    }
  }

  return diagnostics;
}
