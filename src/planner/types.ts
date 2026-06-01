import type { MenuItem } from "../loader/schema.js";

export type PlanNodeKind = "root" | "group" | "choice" | "action" | "prompt";
export type PlanEdgeType = "child" | "single" | "multi" | "dependency" | "flow" | "post";
export type PlanStructureEdgeType = Extract<PlanEdgeType, "single" | "multi" | "flow" | "post">;

export function isStructureEdgeType(type: PlanEdgeType): type is PlanStructureEdgeType {
  return type === "single" || type === "multi" || type === "flow" || type === "post";
}

export interface PlanNode {
  id: string;
  label: string;
  description?: string;
  kind: PlanNodeKind;
  hidden?: boolean;
  post?: boolean;
  mode?: MenuItem["mode"] | "root";
  prompt?: MenuItem["prompt"];
  script?: string;
  position?: { x: number; y: number };
}

export interface PlanEdge {
  from: string;
  to: string;
  type: PlanEdgeType;
}

export interface PlanExecutionStep {
  id: string;
  label: string;
  reason: "selected" | "dependency" | "post";
  script?: string;
}

export interface PlanDiagnostic {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  nodeId?: string;
}

export interface InstallationPlan {
  version: 1;
  root: string;
  nodes: Record<string, PlanNode>;
  edges: PlanEdge[];
  execution: {
    normalSteps: PlanExecutionStep[];
    postSteps: PlanExecutionStep[];
  };
  diagnostics: PlanDiagnostic[];
}
