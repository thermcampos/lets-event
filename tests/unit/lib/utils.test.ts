import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values and supports conditional objects/arrays", () => {
    expect(cn("a", false, null, undefined, { b: true, c: false }, ["d"])).toBe(
      "a b d",
    );
  });

  it("resolves conflicting tailwind classes with the last one winning", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("keeps non-conflicting tailwind classes", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("returns an empty string with no input", () => {
    expect(cn()).toBe("");
  });
});
