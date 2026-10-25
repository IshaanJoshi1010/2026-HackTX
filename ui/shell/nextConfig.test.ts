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
