import { describe, it, expect } from "vitest";
import { validateScript } from "../src/generator/validator.js";

describe("validateScript", () => {
  it("valid script returns null", () => {
    expect(validateScript('#!/bin/bash\necho "ok"')).toBeNull();
  });

  it("detects syntax error", () => {
    const result = validateScript('#!/bin/bash\nif [ then\necho "bad"');
    expect(result).not.toBeNull();
    expect(result).toBeTruthy();
  });

  it("handles empty script", () => {
    expect(validateScript("")).toBeNull();
  });
});
