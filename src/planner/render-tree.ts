import { isStructureEdgeType, type InstallationPlan, type PlanEdge } from "./types.js";

export function renderPlanTree(plan: InstallationPlan): string {
  const lines: string[] = ["Installation plan", "", "Menu tree:"];
  const children = groupStructureEdgesByFrom(plan.edges);

  renderNode(plan, plan.root, children, lines, "");

  lines.push("", "Dependencies:");
  const deps = plan.edges.filter((edge) => edge.type === "dependency");
  if (deps.length === 0) {
    lines.push("  dependency: none");
  } else {
    for (const edge of deps) {
      lines.push(`  dependency: ${edge.to} depends on: ${edge.from}`);
    }
  }

  lines.push("", "Execution order:");
  plan.execution.normalSteps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${step.id} (${step.reason})`);
  });

  lines.push("", "Post steps:");
  if (plan.execution.postSteps.length === 0) {
    lines.push("  post: none");
  } else {
    plan.execution.postSteps.forEach((step, index) => {
      lines.push(`  post ${index + 1}. ${step.id}`);
    });
  }

  if (plan.diagnostics.length > 0) {
    lines.push("", "Diagnostics:");
    for (const diagnostic of plan.diagnostics) {
      lines.push(`  ${diagnostic.level}: ${diagnostic.code}: ${diagnostic.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function groupStructureEdgesByFrom(edges: PlanEdge[]): Map<string, PlanEdge[]> {
  const children = new Map<string, PlanEdge[]>();
  for (const edge of edges) {
    if (!isStructureEdgeType(edge.type)) continue;
    if (!children.has(edge.from)) children.set(edge.from, []);
    children.get(edge.from)!.push(edge);
  }

  return children;
}

function renderNode(
  plan: InstallationPlan,
  id: string,
  children: Map<string, PlanEdge[]>,
  lines: string[],
  prefix: string
): void {
  const node = plan.nodes[id];
  const suffix = [node.hidden ? "hidden" : "", node.post ? "post" : "", node.mode ? `mode:${node.mode}` : ""]
    .filter(Boolean)
    .join(", ");
  lines.push(`${prefix}${id === plan.root ? "" : "└─ "}${node.label}${suffix ? ` [${suffix}]` : ""}`);

  for (const edge of children.get(id) ?? []) {
    const relation = edge.type === "flow" ? "→" : edge.type === "single" || edge.type === "multi" || edge.type === "post" ? "•" : "↳";
    lines.push(`${prefix}  ${relation} ${edge.type}: ${edge.to}`);
    renderNode(plan, edge.to, children, lines, `${prefix}    `);
  }
}
