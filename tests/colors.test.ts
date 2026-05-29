import { describe, it, expect } from "vitest";
import { banner } from "../src/utils/colors.js";

describe("banner", () => {
  it("contains name and version", () => {
    const result = banner("MyApp", "1.0");
    expect(result).toContain("MyApp");
    expect(result).toContain("v1.0");
  });

  it("contains description when provided", () => {
    const result = banner("MyApp", "1.0", "A test app");
    expect(result).toContain("A test app");
  });

  it("omits description line when not provided", () => {
    const withDesc = banner("MyApp", "1.0", "desc");
    const withoutDesc = banner("MyApp", "1.0");
    expect(withoutDesc.length).toBeLessThan(withDesc.length);
  });

  it("has box drawing characters", () => {
    const result = banner("X", "1");
    expect(result).toContain("╔");
    expect(result).toContain("╗");
    expect(result).toContain("╚");
    expect(result).toContain("╝");
  });
});
