import { describe, it, expect } from "vitest";
import { renderTemplate } from "../src/generator/template.js";

describe("renderTemplate", () => {
  it("replaces simple variable", () => {
    expect(renderTemplate("hello {{name}}", { name: "world" })).toBe("hello world");
  });

  it("uses default value when var missing", () => {
    expect(renderTemplate("{{x:fallback}}", {})).toBe("fallback");
  });

  it("var overrides default", () => {
    expect(renderTemplate("{{x:fallback}}", { x: "actual" })).toBe("actual");
  });

  it("leaves unresolved placeholder", () => {
    expect(renderTemplate("{{missing}}", {})).toBe("{{missing}}");
  });

  it("multiple variables", () => {
    const result = renderTemplate("{{a}} and {{b}}", { a: "1", b: "2" });
    expect(result).toBe("1 and 2");
  });

  it("no placeholders returns same string", () => {
    expect(renderTemplate("no vars here", { a: "1" })).toBe("no vars here");
  });

  it("empty string", () => {
    expect(renderTemplate("", {})).toBe("");
  });

  it("variable with underscores", () => {
    expect(renderTemplate("{{my_var}}", { my_var: "ok" })).toBe("ok");
  });

  it("default with colon in value", () => {
    // {{key:http://default}} — the regex captures "http://default" as default
    expect(renderTemplate("{{url:http://localhost}}", {})).toBe("http://localhost");
  });
});
