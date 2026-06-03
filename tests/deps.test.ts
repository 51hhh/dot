import { describe, it, expect } from "vitest";
import { flattenNodes, getLeafIds, resolveDeps, topoSort, findAmbiguousSingleChoiceBranch } from "../src/utils/deps.js";
import type { MenuItem } from "../src/loader/schema.js";

const makeNode = (id: string, opts: Partial<MenuItem> = {}): MenuItem => ({
  id,
  label: id,
  ...opts,
});

describe("flattenNodes", () => {
  it("flat list", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const map = flattenNodes(nodes);
    expect(map.size).toBe(2);
    expect(map.get("a")?.id).toBe("a");
  });

  it("nested tree", () => {
    const nodes = [makeNode("parent", { children: [makeNode("child1"), makeNode("child2")] })];
    const map = flattenNodes(nodes);
    expect(map.size).toBe(3);
    expect(map.has("child1")).toBe(true);
  });

  it("empty", () => {
    expect(flattenNodes([]).size).toBe(0);
  });
});

describe("getLeafIds", () => {
  it("leaf node returns itself", () => {
    expect(getLeafIds(makeNode("a"))).toEqual(["a"]);
  });

  it("branch returns all leaves", () => {
    const node = makeNode("root", {
      children: [makeNode("a"), makeNode("b", { children: [makeNode("c")] })],
    });
    expect(getLeafIds(node)).toEqual(["a", "c"]);
  });

  it("empty children treated as leaf", () => {
    expect(getLeafIds(makeNode("a", { children: [] }))).toEqual(["a"]);
  });
});

describe("findAmbiguousSingleChoiceBranch", () => {
  it("finds explicit single branches with multiple visible children", () => {
    const node = makeNode("root", {
      mode: "flow",
      children: [
        makeNode("install", {
          mode: "single",
          children: [makeNode("apt"), makeNode("skip")],
        }),
      ],
    });

    expect(findAmbiguousSingleChoiceBranch(node)?.id).toBe("install");
  });

  it("ignores legacy branches without explicit single mode", () => {
    const node = makeNode("plugins", {
      children: [makeNode("a"), makeNode("b")],
    });

    expect(findAmbiguousSingleChoiceBranch(node)).toBeUndefined();
  });
});

describe("resolveDeps", () => {
  const nodes = new Map<string, MenuItem>();
  nodes.set("a", makeNode("a", { deps: ["b"] }));
  nodes.set("b", makeNode("b", { deps: ["c"] }));
  nodes.set("c", makeNode("c"));
  nodes.set("d", makeNode("d"));

  it("resolves transitive deps", () => {
    const result = resolveDeps(new Set(["a"]), nodes);
    expect(result).toEqual(new Set(["a", "b", "c"]));
  });

  it("no deps stays same", () => {
    const result = resolveDeps(new Set(["d"]), nodes);
    expect(result).toEqual(new Set(["d"]));
  });

  it("empty input", () => {
    expect(resolveDeps(new Set(), nodes).size).toBe(0);
  });

  it("missing dep node is skipped", () => {
    const result = resolveDeps(new Set(["a"]), new Map());
    expect(result).toEqual(new Set(["a"]));
  });
});

describe("topoSort", () => {
  it("no deps - preserves set", () => {
    const nodes = new Map<string, MenuItem>();
    nodes.set("a", makeNode("a"));
    nodes.set("b", makeNode("b"));
    const sorted = topoSort(new Set(["a", "b"]), nodes);
    expect(sorted.length).toBe(2);
    expect(sorted).toContain("a");
    expect(sorted).toContain("b");
  });

  it("dep comes before dependent", () => {
    const nodes = new Map<string, MenuItem>();
    nodes.set("a", makeNode("a", { deps: ["b"] }));
    nodes.set("b", makeNode("b"));
    const sorted = topoSort(new Set(["a", "b"]), nodes);
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("a"));
  });

  it("chain: c -> b -> a", () => {
    const nodes = new Map<string, MenuItem>();
    nodes.set("a", makeNode("a", { deps: ["b"] }));
    nodes.set("b", makeNode("b", { deps: ["c"] }));
    nodes.set("c", makeNode("c"));
    const sorted = topoSort(new Set(["a", "b", "c"]), nodes);
    expect(sorted).toEqual(["c", "b", "a"]);
  });

  it("throws on circular dependency", () => {
    const nodes = new Map<string, MenuItem>();
    nodes.set("a", makeNode("a", { deps: ["b"] }));
    nodes.set("b", makeNode("b", { deps: ["a"] }));
    expect(() => topoSort(new Set(["a", "b"]), nodes)).toThrow(/Circular/i);
  });

  it("ignores deps outside selected set", () => {
    const nodes = new Map<string, MenuItem>();
    nodes.set("a", makeNode("a", { deps: ["external"] }));
    const sorted = topoSort(new Set(["a"]), nodes);
    expect(sorted).toEqual(["a"]);
  });

  it("empty set", () => {
    expect(topoSort(new Set(), new Map())).toEqual([]);
  });
});
