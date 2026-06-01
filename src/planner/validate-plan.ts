import type { InstallationPlan, PlanDiagnostic } from "./types.js";

export function validateInstallationPlan(plan: InstallationPlan): PlanDiagnostic[] {
  return dedupeDiagnostics([...plan.diagnostics, ...collectPlanValidationDiagnostics(plan)]);
}

export function withPlanValidationDiagnostics(plan: InstallationPlan): InstallationPlan {
  return {
    ...plan,
    diagnostics: validateInstallationPlan(plan),
  };
}

export function hasPlanValidationErrors(diagnostics: readonly PlanDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === "error");
}

export function formatPlanDiagnostics(diagnostics: readonly PlanDiagnostic[]): string {
  return diagnostics.map(formatPlanDiagnostic).join("\n");
}

export function formatPlanDiagnostic(diagnostic: PlanDiagnostic): string {
  const node = diagnostic.nodeId ? ` (${diagnostic.nodeId})` : "";
  return `${diagnostic.level}: ${diagnostic.code}${node}: ${diagnostic.message}`;
}

function collectPlanValidationDiagnostics(plan: InstallationPlan): PlanDiagnostic[] {
  const diagnostics: PlanDiagnostic[] = [];

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

function dedupeDiagnostics(diagnostics: PlanDiagnostic[]): PlanDiagnostic[] {
  const seen = new Set<string>();
  const deduped: PlanDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.level,
      diagnostic.code,
      diagnostic.nodeId ?? "",
      diagnostic.message,
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(diagnostic);
  }

  return deduped;
}
