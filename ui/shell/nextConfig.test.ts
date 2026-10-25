import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * A CSS Module only works if Next keeps its own handling of it. When every *.css file goes through the
 * Tailwind loader as plain CSS, a module's class names are never exported and the component loses its
 * styles (the 3D stage's toolbar did exactly that). This keeps the rule scoped.
 */
describe("next.config: the Tailwind loader and CSS Modules", () => {
  const rule = (nextConfig.turbopack?.rules as Record<string, { condition?: unknown; loaders?: unknown[] }> | undefined)?.["*.css"];

  it("still runs the Tailwind loader on the app's own stylesheet", () => {
    expect(rule?.loaders).toEqual(["@tailwindcss/turbopack"]);
  });

  it("but not on *.module.css files", () => {
    const condition = rule?.condition as { not?: { path?: RegExp } } | undefined;
    const path = condition?.not?.path;
    expect(path).toBeInstanceOf(RegExp);
    expect(path!.test("ui/3d/StageToolbar.module.css")).toBe(true); // excluded from the rule
    expect(path!.test("app/globals.css")).toBe(false); // still handled by it
  });
});

describe("next.config: headers for a public site", () => {
  it("sends the safe set on every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const sent = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(sent["X-Content-Type-Options"]).toBe("nosniff");
    expect(sent["X-Frame-Options"]).toBe("DENY");
    expect(sent["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("keeps the microphone for this site (the voice button) and turns off what the app never uses", async () => {
    const [rule] = await nextConfig.headers!();
    const policy = rule.headers.find((h) => h.key === "Permissions-Policy")!.value;
    expect(policy).toContain("microphone=(self)");
    for (const off of ["camera=()", "geolocation=()", "payment=()"]) expect(policy).toContain(off);
  });

  it("has no Content-Security-Policy, on purpose: the 3D stage needs blob workers and WebAssembly", async () => {
    const [rule] = await nextConfig.headers!();
    expect(rule.headers.some((h) => /content-security-policy/i.test(h.key))).toBe(false);
  });
});
