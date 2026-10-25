import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ai } from "@/ui/mocks";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { ForkApp } from "./ForkApp";

// The "Edit assumptions" drawer, driven through the real store and the real header button.

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

// Built from the code point so this file has none itself.
const EM_DASH = String.fromCharCode(0x2014);

const DIALOG = { name: "Edit assumptions" };
const BASE_HEADINGS = ["Vehicle", "Household", "Financing", "Priorities", "History", "Display", "Session"];
const COMPARING_HEADINGS = ["Vehicle", "Household", "Financing", "Priorities", "Replacement terms", "History", "Display", "Session"];

const dialog = () => screen.getByRole("dialog", DIALOG);
const openButton = () => screen.getByRole("button", { name: "Edit assumptions" });
/** Opens a group by its header, if it is not open, and returns queries scoped to it. */
function group(name: string) {
  const header = within(dialog()).getByRole("button", { name });
  if (header.getAttribute("aria-expanded") !== "true") fireEvent.click(header);
  return within(within(dialog()).getByRole("region", { name }));
}
const sectionTitles = () => within(dialog()).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

async function enterWorkspace() {
  await act(async () => {
    await actions().startFromSample("camry-2022-se");
    actions().onRevealStage("done");
  });
  render(<ForkApp />);
}

async function compare() {
  await act(async () => {
    await actions().openReplaceComparison();
  });
  expect(state().comparison).not.toBeNull();
}

/** Everything a person could read or hear inside the drawer: text, tooltips, labels, placeholders, alt text. */
function everythingIn(root: HTMLElement): string[] {
  const words = [root.textContent ?? ""];
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const attr of ["title", "aria-label", "placeholder", "alt", "aria-valuetext", "aria-description"]) {
      const v = el.getAttribute(attr);
      if (v) words.push(v);
    }
  }
  return words;
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

describe("opening and closing", () => {
  it("is closed and inert until you ask", async () => {
    await enterWorkspace();
    expect(dialog()).toHaveAttribute("data-open", "false");
    expect(dialog()).toHaveAttribute("inert");
    expect(state().ui.detailsOpen).toBe(false);
  });

  it("opens from the header button, which is named Edit assumptions", async () => {
    await enterWorkspace();
    const button = openButton();
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("title", "Edit assumptions");
    expect(screen.queryByRole("button", { name: "Your details" })).toBeNull();

    fireEvent.click(button);
    expect(state().ui.detailsOpen).toBe(true);
    expect(dialog()).toHaveAttribute("data-open", "true");
    expect(dialog()).not.toHaveAttribute("inert");
    expect(screen.getByRole("heading", { level: 2, name: "Edit assumptions" })).toBeInTheDocument();
  });

  it("moves focus to the close button when it opens", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    expect(within(dialog()).getByRole("button", { name: "Close details" })).toHaveFocus();
  });

  it("closes with the close button, with Escape, and by tapping the dim layer", async () => {
    await enterWorkspace();

    fireEvent.click(openButton());
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close details" }));
    expect(dialog()).toHaveAttribute("data-open", "false");
    expect(dialog()).toHaveAttribute("inert");
    expect(state().ui.detailsOpen).toBe(false);

    fireEvent.click(openButton());
    expect(state().ui.detailsOpen).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog()).toHaveAttribute("data-open", "false");
    expect(state().ui.detailsOpen).toBe(false);

    fireEvent.click(openButton());
    expect(state().ui.detailsOpen).toBe(true);
    fireEvent.click(dialog().previousElementSibling!); // the dim layer right behind it
    expect(dialog()).toHaveAttribute("data-open", "false");
    expect(state().ui.detailsOpen).toBe(false);
  });

  it("ignores Escape while it is closed", async () => {
    await enterWorkspace();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state().ui.detailsOpen).toBe(false);
  });
});

describe("size", () => {
  it("is a small panel: 420px wide (less on a narrow screen), and slides in from the right", async () => {
    await enterWorkspace();
    const cls = dialog().className;
    expect(cls).toContain("w-[min(420px,100vw)]");
    expect(cls).not.toContain("440px");
    expect(cls).toContain("right-0");
    expect(cls).toContain("translate-x-full"); // parked off to the right while closed
    fireEvent.click(openButton());
    expect(dialog().className).toContain("translate-x-0");
    expect(dialog().className).not.toContain("translate-x-full");
  });

  it("uses bigger text: body text-base, section titles text-base font-medium text-ink", async () => {
    await enterWorkspace();
    expect(within(dialog()).getByTestId("assumptions-scroll").className).toContain("text-base");
    for (const heading of within(dialog()).getAllByRole("heading", { level: 3 })) {
      const title = within(heading).getByRole("button");
      expect(title.className).toContain("text-base");
      expect(title.className).toContain("font-medium");
      expect(title.className).toContain("text-ink");
      expect(title.className).not.toContain("text-sm");
    }
  });
});

describe("sections", () => {
  it("are grouped by what they edit, in order, and each is a named region", async () => {
    await enterWorkspace();
    expect(sectionTitles()).toEqual(BASE_HEADINGS);
    for (const name of BASE_HEADINGS) {
      expect(within(dialog()).getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("puts the car, the household, financing and priorities under their own headings", async () => {
    await enterWorkspace();
    const within_ = (name: string) => group(name);
    const vehicle = within_("Vehicle");
    expect(vehicle.getByText("Fuel economy")).toBeInTheDocument();
    expect(vehicle.getByText("Cargo space")).toBeInTheDocument();
    expect(vehicle.getByText("Seats")).toBeInTheDocument();
    expect(within_("Household").getByTestId("profile-confirm-card")).toBeInTheDocument();
    expect(within_("Financing").getByTestId("finance-chips")).toBeInTheDocument();
    expect(within_("Priorities").getByTestId("tradeoff-cards")).toBeInTheDocument();
    expect(within_("Priorities").getByTestId("weights-editor")).toBeInTheDocument();
    expect(within_("History").getByTestId("vehicle-history-list")).toBeInTheDocument();
    expect(within_("Display").getByRole("switch", { name: /low performance/i })).toBeInTheDocument();
    expect(within_("Session").getByRole("button", { name: "Start over" })).toBeInTheDocument();
  });

  it("show Replacement terms only after you compare, between Priorities and History", async () => {
    await enterWorkspace();
    expect(within(dialog()).queryByText("Replacement terms")).toBeNull();
    expect(within(dialog()).queryByTestId("terms-review")).toBeNull();

    await compare();
    expect(sectionTitles()).toEqual(COMPARING_HEADINGS);
    const terms = group("Replacement terms");
    expect(terms.getByTestId("terms-review")).toBeInTheDocument();
    expect(terms.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("drop Replacement terms again when you start over and come back", async () => {
    await enterWorkspace();
    await compare();
    expect(within(dialog()).getByText("Replacement terms")).toBeInTheDocument();
    act(() => actions().resetAll());
    await act(async () => {
      await actions().startFromSample("camry-2022-se");
      actions().onRevealStage("done");
    });
    expect(state().comparison).toBeNull();
    expect(sectionTitles()).toEqual(BASE_HEADINGS);
  });
});

describe("history", () => {
  it("lists the car's history, each record with its source label", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    const list = within(dialog()).getByTestId("vehicle-history-list");
    const items = list.querySelectorAll("li");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBe(state().twin!.history.length);
    items.forEach((li) => expect(li.querySelector("[data-source]")).not.toBeNull());
  });
});

describe("display and session", () => {
  it("view mode, reset camera, replay reveal and low performance still change real state", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    const before = state().stage;
    group("Display");

    fireEvent.click(within(dialog()).getByRole("button", { name: "Wireframe" }));
    expect(state().stage.viewMode).toBe("wireframe");
    expect(within(dialog()).getByRole("button", { name: "Wireframe" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(dialog()).getByRole("button", { name: "Reset camera" }));
    expect(state().stage.resetCameraSignal).toBe(before.resetCameraSignal + 1);

    const low = within(dialog()).getByRole("switch", { name: /low performance/i });
    expect(low).toHaveAttribute("aria-checked", "false");
    fireEvent.click(low);
    expect(state().ui.lowPerformance).toBe(true);
    expect(low).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(dialog()).getByRole("button", { name: "Replay reveal" }));
    expect(state().stage.replaySignal).toBe(before.replaySignal + 1);
    expect(state().ui.detailsOpen).toBe(false);
  });

  it("switch car restarts on the other car and start over goes back to the landing screen", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    group("Session");
    const current = within(dialog()).getByRole("button", { name: /2022 Camry/ });
    expect(current).toHaveAttribute("aria-current", "true");

    await act(async () => {
      fireEvent.click(within(dialog()).getByRole("button", { name: /2024 RAV4/ }));
    });
    expect(state().twin?.vehicle.id).toBe("rav4-2024-hybrid-xle");

    // the reveal runs again, so the sheet comes back with the workspace
    await act(async () => {
      actions().onRevealStage("done");
    });
    fireEvent.click(openButton());
    group("Session");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Start over" }));
    expect(state().phase).toBe("landing");
  });
});

describe("words and numbers", () => {
  it("says nothing with an em dash, and never the words demo or data, closed, open or comparing", async () => {
    await enterWorkspace();
    const sweep = (step: string) => {
      const all = everythingIn(dialog());
      expect(all.join(" ").length, `something to read at: ${step}`).toBeGreaterThan(200);
      expect(all.filter((w) => w.includes(EM_DASH)), `em dash at: ${step}`).toEqual([]);
      const hits = all.filter((w) => /demo|data/i.test(w)).map((w) => w.match(/.{0,40}(demo|data).{0,40}/i)?.[0]);
      expect(hits, `"demo" or "data" at: ${step}`).toEqual([]);
    };
    sweep("closed");
    const buttonTitle = openButton().getAttribute("title") ?? "";
    expect(buttonTitle).not.toMatch(/demo|data/i);
    expect(buttonTitle).not.toContain(EM_DASH);
    fireEvent.click(openButton());
    sweep("open");
    await compare();
    sweep("comparing");
  });

  it("gives every number a source label", async () => {
    await enterWorkspace();
    await compare();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Close details" }));
    fireEvent.click(openButton());
    const root = dialog();

    // the labeled rows: the car's own numbers and the household
    const rows = root.querySelectorAll('[data-slot="data-row"]');
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach((row) => expect(row.querySelector("[data-source]"), row.textContent ?? "").not.toBeNull());

    // the weights and the financing carry their own label, and no label is the "no source" gap
    expect(within(root).getByTestId("weights-editor").querySelector("[data-source]")).not.toBeNull();
    expect(within(root).getByTestId("finance-chips").querySelector("[data-source]")).not.toBeNull();
    expect(root.querySelector('[data-source="none"]')).toBeNull();

    // the replacement terms: every "Now" figure has its label next to it
    const nows = within(within(root).getByTestId("terms-review")).getAllByText(/^Now /);
    expect(nows.length).toBeGreaterThan(0);
    nows.forEach((now) => expect(now.parentElement!.querySelector("[data-source]")).not.toBeNull());

    // the history
    root.querySelectorAll('[data-testid="vehicle-history-list"] li').forEach((li) => {
      expect(li.querySelector("[data-source]")).not.toBeNull();
    });
  });
});

describe("the sections are dropdown headers", () => {
  const headers = () => within(dialog()).getAllByRole("heading", { level: 3 }).map((h) => within(h).getByRole("button"));
  const expanded = () => headers().filter((b) => b.getAttribute("aria-expanded") === "true").map((b) => b.textContent);
  const panelOf = (button: HTMLElement) => dialog().querySelector(`#${CSS.escape(button.getAttribute("aria-controls")!)}`) as HTMLElement;
  const SHORT = ["Vehicle", "Household", "Financing", "Priorities"];
  const LONG = ["History", "Display", "Session"];

  it("opens with the short groups showing and the long ones, History first, as dropdowns", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    expect(headers().map((b) => b.textContent)).toEqual(BASE_HEADINGS);
    expect(expanded()).toEqual(SHORT);
    for (const name of LONG) expect(panelOf(within(dialog()).getByRole("button", { name }))).toHaveAttribute("hidden");
    for (const name of SHORT) expect(panelOf(within(dialog()).getByRole("button", { name }))).not.toHaveAttribute("hidden");
  });

  it("History is a dropdown: its list is hidden until you open it", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    const history = within(dialog()).getByRole("button", { name: "History" });
    expect(history).toHaveAttribute("aria-expanded", "false");
    expect(panelOf(history)).toHaveAttribute("hidden");
    fireEvent.click(history);
    expect(history).toHaveAttribute("aria-expanded", "true");
    expect(panelOf(history)).not.toHaveAttribute("hidden");
    expect(within(panelOf(history)).getByTestId("vehicle-history-list")).toBeInTheDocument();
  });

  it("each header is a compact row with a chevron that turns when it opens", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    const history = within(dialog()).getByRole("button", { name: "History" });
    expect(history.className).toContain("h-12");
    expect(history.querySelector("svg")!.getAttribute("class")).not.toContain("rotate-180");
    fireEvent.click(history);
    expect(history.querySelector("svg")!.getAttribute("class")).toContain("rotate-180");
    // and one that starts open already has it turned
    expect(within(dialog()).getByRole("button", { name: "Vehicle" }).querySelector("svg")!.getAttribute("class")).toContain("rotate-180");
  });

  it("opening one does not close the others, and tapping an open one closes just that one", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    group("History");
    expect(expanded()).toEqual([...SHORT, "History"]);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Financing" }));
    expect(expanded()).toEqual(["Vehicle", "Household", "Priorities", "History"]);
  });

  it("each header controls its own panel, inside a section the header names", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    for (const button of headers()) {
      const panel = panelOf(button);
      expect(panel).not.toBeNull();
      const section = button.closest("section")!;
      expect(section.contains(panel)).toBe(true);
      expect(section.getAttribute("aria-labelledby")).toBe(button.closest("h3")!.id);
    }
  });

  it("a closed group keeps what you typed, so closing and reopening a form does not lose it", async () => {
    await enterWorkspace();
    await compare();
    fireEvent.click(openButton());
    const terms = group("Replacement terms");
    const field = terms.getAllByRole("textbox")[0] as HTMLInputElement;
    fireEvent.change(field, { target: { value: "123" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Replacement terms" })); // close it
    expect(within(dialog()).getByRole("button", { name: "Replacement terms" })).toHaveAttribute("aria-expanded", "false");
    const again = group("Replacement terms").getAllByRole("textbox")[0] as HTMLInputElement;
    expect(again.value).toBe("123");
  });

  it("works from the keyboard: each header is a native button, so Enter and Space open it", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    const header = within(dialog()).getByRole("button", { name: "Session" });
    expect(header.tagName).toBe("BUTTON");
    header.focus();
    expect(header).toHaveFocus();
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("Replacement terms joins as a dropdown, closed, only once there is a comparison", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    expect(headers().map((b) => b.textContent)).not.toContain("Replacement terms");
    await compare();
    expect(headers().map((b) => b.textContent)).toEqual(COMPARING_HEADINGS);
    expect(within(dialog()).getByRole("button", { name: "Replacement terms" })).toHaveAttribute("aria-expanded", "false");
  });

  it("stays short: the headers plus the open groups, not every control at once", async () => {
    await enterWorkspace();
    fireEvent.click(openButton());
    // History, Display, Session are closed, so their buttons and the history list are not reachable
    expect(within(dialog()).queryByRole("switch", { name: /low performance/i })).toBeNull();
    expect(within(dialog()).queryByRole("button", { name: "Start over" })).toBeNull();
  });
});
