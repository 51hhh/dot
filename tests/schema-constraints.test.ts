import { describe, expect, it } from "vitest";
import { MenuItemSchema } from "../src/loader/schema.js";

describe("Schema Constraints", () => {
  describe("Flow nodes", () => {
    it("should reject flow nodes without children", () => {
      const result = MenuItemSchema.safeParse({
        id: "test-flow",
        label: "Test Flow",
        mode: "flow",
        // No children
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("must have children");
      }
    });

    it("should accept flow nodes with children", () => {
      const result = MenuItemSchema.safeParse({
        id: "test-flow",
        label: "Test Flow",
        mode: "flow",
        children: [
          { id: "step1", label: "Step 1", script: "test.sh" },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Leaf nodes", () => {
    it("should reject leaf nodes without script or prompt", () => {
      const result = MenuItemSchema.safeParse({
        id: "empty-leaf",
        label: "Empty Leaf",
        // No script, no prompt, no children
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("must have a script or prompt");
      }
    });

    it("should accept leaf nodes with script", () => {
      const result = MenuItemSchema.safeParse({
        id: "action",
        label: "Action",
        script: "action.sh",
      });

      expect(result.success).toBe(true);
    });

    it("should accept leaf nodes with prompt", () => {
      const result = MenuItemSchema.safeParse({
        id: "input",
        label: "Input",
        prompt: { type: "text", var: "user_input", label: "Enter value" },
      });

      expect(result.success).toBe(true);
    });

    it("should accept hidden leaf nodes without script", () => {
      const result = MenuItemSchema.safeParse({
        id: "hidden-node",
        label: "Hidden",
        hidden: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Parent nodes", () => {
    it("should warn when parent nodes don't specify mode", () => {
      const result = MenuItemSchema.safeParse({
        id: "parent",
        label: "Parent",
        children: [
          { id: "child1", label: "Child 1", script: "test.sh" },
        ],
        // No mode specified
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("should specify a mode");
      }
    });

    it("should accept parent nodes with mode", () => {
      const result = MenuItemSchema.safeParse({
        id: "parent",
        label: "Parent",
        mode: "single",
        children: [
          { id: "child1", label: "Child 1", script: "test.sh" },
        ],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Post nodes", () => {
    it("should reject post nodes with children", () => {
      const result = MenuItemSchema.safeParse({
        id: "post-parent",
        label: "Post Parent",
        post: true,
        mode: "single",
        children: [
          { id: "child", label: "Child", script: "test.sh" },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map(i => i.message);
        expect(messages.some(msg => msg.includes("should not have children"))).toBe(true);
      }
    });

    it("should accept post leaf nodes", () => {
      const result = MenuItemSchema.safeParse({
        id: "finalize",
        label: "Finalize",
        post: true,
        script: "finalize.sh",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("endFlow", () => {
    it("should reject endFlow on flow container nodes", () => {
      const result = MenuItemSchema.safeParse({
        id: "flow-container",
        label: "Flow Container",
        mode: "flow",
        endFlow: true,
        children: [
          { id: "step", label: "Step", script: "test.sh" },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("cannot have endFlow=true when it is itself a flow");
      }
    });

    it("should accept endFlow on child nodes", () => {
      const result = MenuItemSchema.safeParse({
        id: "exit-step",
        label: "Exit Step",
        endFlow: true,
        script: "exit.sh",
      });

      expect(result.success).toBe(true);
    });
  });
});
