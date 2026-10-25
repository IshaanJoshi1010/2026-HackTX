import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { data } from "@/ui/mocks";
import { ForkApp } from "@/ui/shell/ForkApp";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";

// Nothing on screen may say "demo" or "data", at any step, in any tooltip, label or placeholder. The app should read like
// something handed to a customer.

const BANNED = /demo|data/i;
const state = () => useForkStore.getState();

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Everything a person could read or hear at this moment: text, tooltips, labels, placeholders, alt text. */
function everythingVisible(): string[] {
  const words = [document.body.textContent ?? ""];
  for (const el of document.body.querySelectorAll("*")) {
    for (const attr of ["title", "aria-label", "placeholder", "alt", "aria-valuetext", "aria-description"]) {
      const v = el.getAttribute(attr);
      if (v) words.push(v);
    }
  }
  return words;
}

const seen: Array<{ step: string; chars: number }> = [];
function sweep(step: string) {
  const all = everythingVisible();
  seen.push({ step, chars: all.join(" ").length });
  const hits = all.filter((w) => BANNED.test(w)).map((w) => w.match(new RegExp(`.{0,40}(${BANNED.source}).{0,40}`, "i"))?.[0]);
  expect(hits, `"demo" or "data" on screen at: ${step}`).toEqual([]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  localStorage.clear();
  resetForkStoreForTests();
  seen.length = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a customer never reads the words demo or data", () => {
  it("not on the first screen, nor on the car picker behind it", async () => {
    render(<ForkApp />);
    await advance(0);
    sweep("first screen");
    fireEvent.click(screen.getByRole("button", { name: "No VIN? Choose your car" }));
    sweep("car picker");
    fireEvent.click(screen.getByRole("button", { name: "Back to VIN" }));
    fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: "123i" } });
    sweep("a VIN with a bad letter");
    fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: "4T1G11AK2NU900001" } });
    fireEvent.click(screen.getByRole("button", { name: "Decode VIN" }));
    sweep("a VIN whose check digit is wrong");
  });

  it("not while the car forms, on the car page, in the details sheet, or anywhere after", async () => {
    render(<ForkApp />);
    await advance(0);
    fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: "4T1G11AK1NU900001" } });
    fireEvent.click(screen.getByRole("button", { name: "Decode VIN" }));
    await advance(0);
    sweep("the car forming");
    await advance(4100);
    expect(state().phase).toBe("workspace");
    sweep("car page, with the specs up");

    // the details sheet: profile, finance, priorities, and the ownership history (written by another module)
    fireEvent.click(screen.getByRole("button", { name: "Edit assumptions" }));
    for (const name of ["History", "Display", "Session"]) fireEvent.click(within(screen.getByRole("dialog", { name: "Edit assumptions" })).getByRole("button", { name }));
    expect(screen.getByTestId("vehicle-history-list").querySelectorAll("li").length).toBeGreaterThan(0); // so this sweep means something
    sweep("the assumptions drawer, with the history"); 
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    // tell it something, confirm it, look at the future
    await act(async () => {
      await state().actions.submitDump(data.demo.brainDump);
    });
    expect(state().explore.draftChanges.length).toBeGreaterThan(0);
    sweep("changes waiting to be confirmed");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    });
    await advance(0);
    sweep("the future page");
    fireEvent.click(screen.getByTestId("tab-costs"));
    sweep("the future page, with the costs open");

    // compare, ask what would change it, ask why, edit the terms
    fireEvent.click(screen.getByRole("button", { name: /Explore the 2024 RAV4/ }));
    await advance(0);
    await advance(1900);
    sweep("the comparison, the verdict and the next step");
    fireEvent.click(screen.getByTestId("tab-why"));
    await advance(0);
    sweep("why this result");
    await act(async () => {
      await state().actions.submitDump("What would have to change for keeping the Camry to be the better option?");
    });
    await advance(0);
    sweep("what would change it");
    fireEvent.click(screen.getByTestId("tab-assumptions"));
    const drawer = screen.getByRole("dialog", { name: "Edit assumptions" });
    for (const h of within(drawer).getAllByRole("heading", { level: 3 })) {
      const header = within(h).getByRole("button");
      if (header.getAttribute("aria-expanded") !== "true") fireEvent.click(header);
    }
    sweep("edit assumptions, every group open, with the replacement terms");

    // it really looked: a lot of text across every step, not an empty page
    expect(seen.length).toBeGreaterThanOrEqual(8);
    expect(seen.every((s) => s.chars > 100)).toBe(true);
  });

  it("not in an error, however it was worded where it came from", async () => {
    render(<ForkApp />);
    await advance(0);
    for (const message of ["Unsupported demo vehicle", "Provider data or profile failed validation", "The saved demo vehicle could not be loaded"]) {
      act(() => useForkStore.setState({ error: message }));
      sweep(`error: ${message}`);
    }
  });
});
