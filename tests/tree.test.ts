import { describe, it, expect } from "vitest";
import { findNode, isLeaf, getBreadcrumb, printTree } from "../src/menu/tree.js";
import type { MenuItem } from "../src/loader/schema.js";

const makeNode = (id: string, opts: Partial<MenuItem> = {}): MenuItem => ({
  id,
  label: id,
  ...opts,
});

const tree: MenuItem[] = [
  makeNode("a", {
    label: "A",
    children: [
      makeNode("a1", { label: "A1" }),
      makeNode("a2", { label: "A2", children: [makeNode("a2x", { label: "A2X" })] }),
    ],
  }),
  makeNode("b", { label: "B" }),
];

describe("findNode", () => {
  it("finds root level", () => {
    expect(findNode(tree, "b")?.id).toBe("b");
  });

  it("finds nested", () => {
    expect(findNode(tree, "a2x")?.id).toBe("a2x");
  });

  it("returns undefined for missing", () => {
    expect(findNode(tree, "missing")).toBeUndefined();
  });
});

describe("isLeaf", () => {
  it("node without children", () => expect(isLeaf(makeNode("x"))).toBe(true));
  it("node with empty children", () => expect(isLeaf(makeNode("x", { children: [] }))).toBe(true));
  it("node with children", () => expect(isLeaf(makeNode("x", { children: [makeNode("y")] }))).toBe(false));
});

describe("getBreadcrumb", () => {
  it("root node", () => {
    expect(getBreadcrumb(tree, "b")).toEqual(["B"]);
  });

  it("nested node", () => {
    expect(getBreadcrumb(tree, "a2x")).toEqual(["A", "A2", "A2X"]);
  });

  it("missing returns null", () => {
    expect(getBreadcrumb(tree, "missing")).toBeNull();
  });
});

describe("printTree", () => {
  it("produces output", () => {
    const output = printTree(tree);
    expect(output).toContain("A");
    expect(output).toContain("B");
    expect(output).toContain("A2X");
  });
});
