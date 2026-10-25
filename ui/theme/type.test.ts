import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const tokens = read("ui/theme/tokens.css");
const globals = read("app/globals.css");
const layout = read("app/layout.tsx");

describe("type: Helvetica Neue in three weights", () => {
  it("the sans font is Helvetica Neue first, with Helvetica and Arial behind it, and no other sans font is loaded", () => {
    expect(globals).toMatch(/--font-sans:\s*"Helvetica Neue",\s*Helvetica,\s*Arial/);
    expect(layout).not.toMatch(/Geist\(/); // only the mono font is still loaded
    expect(globals).not.toContain("geist-sans");
  });

  it("headlines are Bold, buttons and labels Medium, descriptions Regular", () => {
    expect(tokens).toMatch(/--weight-headline:\s*700/);
    expect(tokens).toMatch(/--weight-label:\s*500/);
    expect(tokens).toMatch(/--weight-body:\s*400/);
    expect(tokens).toMatch(/h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\s*\{\s*font-weight:\s*var\(--weight-headline\)/);
    expect(tokens).toMatch(/button,[\s\S]*?\[role="button"\]\s*\{\s*font-weight:\s*var\(--weight-label\)/);
    expect(tokens).toMatch(/body\s*\{\s*font-weight:\s*var\(--weight-body\)/);
  });

  it("a heading that is a button stays a headline", () => {
    expect(tokens).toMatch(/h1 button,\s*h2 button\s*\{\s*font-weight:\s*inherit/);
  });

  it("the weight rules sit outside any @layer, so they beat the utility classes", () => {
    const type = tokens.slice(tokens.indexOf("Type. Helvetica Neue"));
    expect(type).not.toContain("@layer");
  });

  it("no light or semibold weight is left in the screens", () => {
    expect(read("ui/journey/JourneyTimeline.tsx")).not.toMatch(/\bfont-light\b/);
    expect(read("ui/shell/AppHeader.tsx")).not.toMatch(/\bfont-semibold\b/);
  });
});
