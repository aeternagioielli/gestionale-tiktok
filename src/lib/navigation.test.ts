import { describe, expect, it } from "vitest";
import { navigationItems } from "@/lib/navigation";

describe("AETERNA OS navigation", () => {
  it("contains the planned operational areas without duplicate routes", () => {
    const routes = navigationItems.map((item) => item.href);
    expect(routes).toContain("/");
    expect(routes).toContain("/astra-reports");
    expect(new Set(routes).size).toBe(routes.length);
  });
});
