import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The 3D stage (ui/3d, not ours) draws a block of text at its top left corner, over our FORK wordmark. We hide it from
// the eye with one rule in our theme. These checks keep that rule from drifting away from the stage it is aimed at, and
// from ever matching the 3D canvas itself.

const root = join(__dirname, "..");
const css = readFileSync(join(root, "ui/theme/tokens.css"), "utf8");
const stage = readFileSync(join(root, "ui/3d/CarStage.tsx"), "utf8");

const RULE = /section\[aria-label="Vehicle 3D preview"\] > div\[style\*="system-ui"\]\s*\{([^}]*)\}/;

describe("the stage's top left text", () => {
  it("is hidden from the eye by a rule in our theme, and kept for screen readers", () => {
    const body = RULE.exec(css)?.[1] ?? "";
    expect(body).toContain("clip-path: inset(50%)");
    expect(body).toContain("width: 1px");
    expect(body).toContain("overflow: hidden");
    expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden/); // those would also hide it from a screen reader
  });

  it("the rule still points at the stage: its section label and the text block's font are still there", () => {
    expect(stage).toContain('aria-label="Vehicle 3D preview"');
    expect(stage).toMatch(/top: 16, left: 16[^}]*font: "12px system-ui"/);
  });

  it("matches the one text block and nothing else: no other element in the stage uses that font", () => {
    expect(stage.match(/system-ui/g)).toHaveLength(1);
    // the 3D canvas and its toolbar are styled elsewhere, so the rule cannot reach them
    expect(stage).toMatch(/<Canvas /);
    expect(stage).toContain("styles.toolbar");
  });

  it("is only one rule, so removing it is one deletion once the stage drops its text", () => {
    expect(css.match(/Vehicle 3D preview/g)).toHaveLength(1); // the selector, nothing else in the theme names the stage
  });
});
