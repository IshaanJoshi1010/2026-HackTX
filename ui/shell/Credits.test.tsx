import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import manifest from "@/public/models/manifest.json";
import { Credits } from "./Credits";
import { MODEL_CREDITS, honestyLine, parseCredit } from "./modelCredits";

afterEach(() => cleanup());

describe("credits come from the manifest", () => {
  it("every model in the manifest is credited, with its author, source and CC BY license", () => {
    expect(MODEL_CREDITS).toHaveLength(manifest.length);
    for (const [i, entry] of manifest.entries()) {
      const c = MODEL_CREDITS[i];
      expect(c.vehicleId).toBe(entry.vehicleId);
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.author).not.toBe("");
      expect(c.sourceUrl).toMatch(/^https:\/\/sketchfab\.com\/3d-models\//);
      expect(c.license).toEqual({ label: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" });
      expect(c.modified).toMatch(/simplification/);
      // the parts are the manifest's own words
      expect(entry.credit).toContain(c.author);
      expect(entry.credit).toContain(c.sourceUrl!);
      expect(entry.credit).toContain(c.modified!);
    }
  });

  it("names the Camry and the RAV4 models and their creators", () => {
    const text = MODEL_CREDITS.map((c) => `${c.title} ${c.author}`).join(" | ");
    expect(text).toContain("toyota camry v80 sultan");
    expect(text).toContain("2021 Toyota RAV4 Adventure luisandradeandrade762");
    expect(MODEL_CREDITS[0].authorUrl).toBe("https://sketchfab.com/s122");
  });

  it("falls back to the manifest's words when an entry does not split", () => {
    const c = parseCredit({ vehicleId: "x", credit: "A model somebody made. Free to use.", license: "CC BY 4.0 https://creativecommons.org/licenses/by/4.0/" });
    expect(c.title).toBe("A model somebody made");
    expect(c.author).toBe("");
    expect(c.modified).toBeNull();
    expect(c.license.label).toBe("CC BY 4.0");
  });
});

describe("the honesty line", () => {
  it("says the models are representative, and the data synthetic and illustrative", () => {
    expect(honestyLine()).toBe("Representative 3D models. Driver, finance and listing data are synthetic. Dollar figures are illustrative.");
  });

  it("does not call the models representative if the manifest says one is exact", () => {
    expect(honestyLine([{ matchStatus: "representative" }, { matchStatus: "exact" }])).toMatch(/^Some 3D models are representative stand-ins\./);
  });

  it("has no em dashes", () => {
    expect(honestyLine()).not.toContain("—");
  });
});

describe("the Credits footer", () => {
  it("shows the honesty line and keeps the credits one tap away", () => {
    render(<Credits />);
    expect(screen.getByTestId("credits")).toHaveTextContent(honestyLine());
    expect(screen.queryByTestId("credits-panel")).toBeNull();

    const toggle = screen.getByRole("button", { name: "3D model credits" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide credits" })).toHaveAttribute("aria-expanded", "true");

    const lines = screen.getAllByTestId("model-credit");
    expect(lines).toHaveLength(manifest.length);
    expect(lines[0]).toHaveTextContent("toyota camry v80 by sultan, CC BY 4.0. Modified for Fork: normal-aware mesh simplification");
    expect(lines[1]).toHaveTextContent("2021 Toyota RAV4 Adventure by luisandradeandrade762, CC BY 4.0. Modified for Fork: CAD edge removal");

    fireEvent.click(screen.getByRole("button", { name: "Hide credits" }));
    expect(screen.queryByTestId("credits-panel")).toBeNull();
  });

  it("starts open when asked (the landing)", () => {
    render(<Credits defaultOpen />);
    expect(screen.getAllByTestId("model-credit")).toHaveLength(manifest.length);
  });

  it("links to the sources and the license, safely, in a new tab", () => {
    render(<Credits defaultOpen />);
    const links = within(screen.getByTestId("credits-panel")).getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://sketchfab.com/3d-models/toyota-camry-v80-98c70e5aa53446728fea4d8f448bbf33");
    expect(hrefs).toContain("https://sketchfab.com/s122");
    expect(hrefs).toContain("https://creativecommons.org/licenses/by/4.0/");
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });
});
