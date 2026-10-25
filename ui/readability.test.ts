import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The rules from the audit's contrast and focus item, kept as a test so they stay true. ui/3d is Dev 1's and left out.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "3d" || name === "node_modules" ? [] : sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const files = sources(join(__dirname)).map((path) => ({ path: path.replace(`${__dirname}/`, "ui/"), text: readFileSync(path, "utf8") }));
const offenders = (pattern: RegExp, skip: (line: string) => boolean = () => false) =>
  files.flatMap(({ path, text }) => text.split("\n").flatMap((line, i) => (pattern.test(line) && !skip(line) ? [`${path}:${i + 1}  ${line.trim().slice(0, 100)}`] : [])));

describe("readable text", () => {
  it("no text is fainter than half white, apart from disabled controls", () => {
    // 45% white on black is 4.4:1, under the 4.5:1 a reader needs. A disabled control is exempt.
    const faint = /(?<![\w:-])(?:placeholder:)?text-ink\/(?:[0-4]\d|\d)(?![\d])/;
    expect(offenders(faint, (line) => /cursor-not-allowed|"bg-ink\/10 text-ink\/30"/.test(line))).toEqual([]);
  });

  it("placeholders are at least half white", () => {
    expect(offenders(/placeholder:text-ink\/(?:[0-4]\d|\d)(?![\d])/)).toEqual([]);
  });

  it("no text is smaller than 12px", () => {
    expect(offenders(/text-\[(?:[0-9]|1[01])px\]/)).toEqual([]);
  });
});

describe("one focus ring", () => {
  it("nothing hides the outline without putting one back", () => {
    // The command bar's input hides its own because its container draws the ring (has-[:focus-visible]).
    expect(offenders(/focus:outline-none/, (line) => line.includes("placeholder:text-ink/50 focus:outline-none"))).toEqual([]);
    const bar = files.find((f) => f.path === "ui/command/CommandBox.tsx")!.text;
    expect(bar).toContain("has-[:focus-visible]:outline-2");
  });

  it("every ring sits the same distance from its control", () => {
    expect(offenders(/focus-visible:outline-offset-(?!2\b)\d/)).toEqual([]);
  });

  it("a global rule gives anything a keyboard can reach the same ring", () => {
    const css = readFileSync(join(__dirname, "theme/tokens.css"), "utf8");
    expect(css).toMatch(/:focus-visible\s*\{\s*outline: 2px solid var\(--fork-ink\);\s*outline-offset: 2px;/);
  });
});
