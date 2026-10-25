import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Landing } from "@/ui/landing/Landing";
import { resetForkStoreForTests } from "@/ui/store/useForkStore";
import { Tabs, panelId, tabId } from "./Tabs";

afterEach(() => cleanup());

const TABS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
] as const;

function Demo() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return (
    <>
      <Tabs group="demo" label="Demo tabs" tabs={TABS} value={value} onChange={setValue} tabClassName={() => "tab"} />
      <div role="tabpanel" id={panelId("demo", value)} aria-labelledby={tabId("demo", value)}>
        panel {value}
      </div>
    </>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("Tabs", () => {
  it("only the selected tab is in the tab order", () => {
    render(<Demo />);
    expect(tab("Alpha")).toHaveAttribute("tabindex", "0");
    expect(tab("Beta")).toHaveAttribute("tabindex", "-1");
    expect(tab("Gamma")).toHaveAttribute("tabindex", "-1");
  });

  it("arrow keys move to the next tab, open it and focus it, and wrap around", () => {
    render(<Demo />);
    fireEvent.keyDown(tab("Alpha"), { key: "ArrowRight" });
    expect(tab("Beta")).toHaveAttribute("aria-selected", "true");
    expect(tab("Beta")).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel b");

    fireEvent.keyDown(tab("Beta"), { key: "ArrowRight" });
    fireEvent.keyDown(tab("Gamma"), { key: "ArrowRight" });
    expect(tab("Alpha")).toHaveAttribute("aria-selected", "true"); // wrapped
    fireEvent.keyDown(tab("Alpha"), { key: "ArrowLeft" });
    expect(tab("Gamma")).toHaveAttribute("aria-selected", "true"); // wrapped back
    expect(tab("Gamma")).toHaveFocus();
  });

  it("Home and End jump to the ends; other keys do nothing", () => {
    render(<Demo />);
    fireEvent.keyDown(tab("Alpha"), { key: "End" });
    expect(tab("Gamma")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Gamma"), { key: "Home" });
    expect(tab("Alpha")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Alpha"), { key: "x" });
    fireEvent.keyDown(tab("Alpha"), { key: "ArrowDown" });
    expect(tab("Alpha")).toHaveAttribute("aria-selected", "true");
  });

  it("each tab names its panel, and the open panel is named by its tab", () => {
    render(<Demo />);
    expect(tab("Alpha")).toHaveAttribute("aria-controls", panelId("demo", "a"));
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", tab("Alpha").getAttribute("aria-controls"));
    expect(panel).toHaveAttribute("aria-labelledby", tab("Alpha").id);
    expect(screen.getByRole("tabpanel", { name: "Alpha" })).toBe(panel);
  });

  it("clicking still works", () => {
    render(<Demo />);
    fireEvent.click(tab("Gamma"));
    expect(tab("Gamma")).toHaveAttribute("aria-selected", "true");
    expect(tab("Gamma")).toHaveAttribute("tabindex", "0");
  });
});

describe("the landing tabs", () => {
  it("are in sentence case and work by keyboard, with a panel for the open one", () => {
    resetForkStoreForTests();
    render(<Landing />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Sample cars", "Enter VIN", "Select model"]);
    fireEvent.keyDown(tab("Sample cars"), { key: "ArrowRight" });
    expect(tab("Enter VIN")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Enter VIN" })).toContainElement(screen.getByPlaceholderText("17-character VIN"));
    fireEvent.keyDown(tab("Enter VIN"), { key: "End" });
    expect(screen.getByRole("tabpanel", { name: "Select model" })).toContainElement(screen.getByLabelText("Select vehicle model"));
  });
});
