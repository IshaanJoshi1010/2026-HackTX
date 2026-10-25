import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { Drawer } from "./Drawer";

/** Fixes what matchMedia answers, by query text. jsdom has no matchMedia at all. */
function mockMedia(answer: (query: string) => boolean) {
  const impl = (query: string) => ({
    matches: answer(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(impl) });
}
const MOBILE = (q: string) => /max-width/.test(q);
const REDUCED = (q: string) => /prefers-reduced-motion/.test(q);

beforeEach(() => {
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;

describe("Drawer", () => {
  it("is a labeled modal dialog with a heading, a Close button and its content when open", () => {
    render(
      <Drawer open title="Compare costs" onClose={() => {}}>
        <p>Inside</p>
      </Drawer>,
    );
    const d = screen.getByRole("dialog", { name: "Compare costs" });
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(d).not.toHaveAttribute("inert");
    expect(screen.getByRole("heading", { name: "Compare costs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByText("Inside")).toBeInTheDocument();
  });

  it("is inert, hidden from the page and empty when closed", () => {
    render(
      <Drawer open={false} title="Compare costs" onClose={() => {}}>
        <p>Inside</p>
      </Drawer>,
    );
    expect(dialog()).toHaveAttribute("inert");
    expect(dialog()).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("dialog")).toBeNull(); // not in the accessibility tree
    expect(screen.queryByText("Inside")).toBeNull(); // its content is not even mounted
    expect(screen.getByTestId("drawer-dim").className).toContain("pointer-events-none");
  });

  it("closes from the Close button and from a tap on the dim layer", () => {
    const onClose = vi.fn();
    render(
      <Drawer open title="T" onClose={onClose}>
        <p>Inside</p>
      </Drawer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("drawer-dim"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape, and nothing else on the page hears that key", () => {
    const onClose = vi.fn();
    const pageBubble = vi.fn();
    const pageDocument = vi.fn();
    window.addEventListener("keydown", pageBubble);
    document.addEventListener("keydown", pageDocument);
    render(
      <Drawer open title="T" onClose={onClose}>
        <button type="button">Inside</button>
      </Drawer>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Inside" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pageBubble).not.toHaveBeenCalled();
    expect(pageDocument).not.toHaveBeenCalled();
    window.removeEventListener("keydown", pageBubble);
    document.removeEventListener("keydown", pageDocument);
  });

  it("ignores Escape while closed", () => {
    const onClose = vi.fn();
    const page = vi.fn();
    window.addEventListener("keydown", page);
    render(
      <Drawer open={false} title="T" onClose={onClose}>
        <p>Inside</p>
      </Drawer>,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledTimes(1); // the page still gets its own key
    window.removeEventListener("keydown", page);
  });

  describe("focus", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open it
          </button>
          <button type="button">Behind</button>
          <Drawer open={open} title="Panel" onClose={() => setOpen(false)}>
            <button type="button">First</button>
            <button type="button">Last</button>
          </Drawer>
        </>
      );
    }

    it("moves into the drawer when it opens, and back to the opener when it closes", () => {
      render(<Harness />);
      const opener = screen.getByRole("button", { name: "Open it" });
      opener.focus();
      fireEvent.click(opener);
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(opener).toHaveFocus();
    });

    it("restores focus after a close with the button too", () => {
      render(<Harness />);
      const opener = screen.getByRole("button", { name: "Open it" });
      opener.focus();
      fireEvent.click(opener);
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(opener).toHaveFocus();
    });

    it("keeps Tab inside: last wraps to the first, and Shift+Tab from the first wraps to the last", () => {
      render(<Harness />);
      const opener = screen.getByRole("button", { name: "Open it" });
      opener.focus();
      fireEvent.click(opener);
      const close = screen.getByRole("button", { name: "Close" });
      const last = screen.getByRole("button", { name: "Last" });

      act(() => last.focus());
      fireEvent.keyDown(last, { key: "Tab" });
      expect(close).toHaveFocus();

      fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
      expect(last).toHaveFocus();
    });

    it("pulls focus back in if it was somewhere on the page behind", () => {
      render(<Harness />);
      const opener = screen.getByRole("button", { name: "Open it" });
      opener.focus();
      fireEvent.click(opener);
      const behind = screen.getByRole("button", { name: "Behind" });
      act(() => behind.focus());
      fireEvent.keyDown(behind, { key: "Tab" });
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });

    it("finds a place for focus when the content it was on is swapped for other content", () => {
      function Swap() {
        const [which, setWhich] = useState<"a" | "b">("a");
        return (
          <Drawer open title={which === "a" ? "One" : "Two"} onClose={() => {}}>
            {which === "a" ? (
              <button type="button" onClick={() => setWhich("b")}>
                Go to two
              </button>
            ) : (
              <p>Second</p>
            )}
          </Drawer>
        );
      }
      render(<Swap />);
      const go = screen.getByRole("button", { name: "Go to two" });
      act(() => go.focus());
      fireEvent.click(go);
      expect(screen.getByText("Second")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });
  });

  describe("layout", () => {
    it("is a panel on the right at 520px or the screen width on a wide screen", () => {
      mockMedia(() => false);
      render(
        <Drawer open title="T" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      const d = dialog();
      expect(d).toHaveAttribute("data-placement", "right");
      expect(d.className).toContain("w-[min(520px,100vw)]");
      expect(d.className).toContain("right-0");
      expect(d.className).toContain("z-40");
      expect(d.className).not.toContain("rounded-t-2xl");
    });

    it("can come from the left", () => {
      mockMedia(() => false);
      render(
        <Drawer open title="T" side="left" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      expect(dialog()).toHaveAttribute("data-placement", "left");
      expect(dialog().className).toContain("left-0");
    });

    it("is a bottom sheet under 640px: capped at 85dvh with rounded top corners", () => {
      mockMedia(MOBILE);
      render(
        <Drawer open title="T" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      const d = dialog();
      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 639px)");
      expect(d).toHaveAttribute("data-placement", "bottom");
      expect(d.className).toContain("max-h-[85dvh]");
      expect(d.className).toContain("rounded-t-2xl");
      expect(d.className).toContain("bottom-0");
      expect(d.className).not.toContain("w-[min(520px,100vw)]");
    });

    it("slides down out of sight when closed as a sheet", () => {
      mockMedia(MOBILE);
      render(
        <Drawer open={false} title="T" onClose={() => {}}>
          <p>x</p>
        </Drawer>,
      );
      expect(dialog().className).toContain("translate-y-full");
    });

    it("slides sideways out of sight when closed as a panel", () => {
      mockMedia(() => false);
      render(
        <Drawer open={false} title="T" onClose={() => {}}>
          <p>x</p>
        </Drawer>,
      );
      expect(dialog().className).toContain("translate-x-full");
    });

    it("scrolls its body", () => {
      render(
        <Drawer open title="T" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      expect(screen.getByTestId("drawer-body").className).toContain("overflow-y-auto");
    });
  });

  describe("motion", () => {
    const open = (
      <Drawer open title="T" onClose={() => {}}>
        <p>Inside</p>
      </Drawer>
    );

    it("slides for 250ms by default", () => {
      mockMedia(() => false);
      render(open);
      expect(dialog()).toHaveAttribute("data-motion", "slide");
      expect(dialog().className).toContain("duration-[250ms]");
      expect(dialog().className).toContain("transition-[transform,opacity]");
    });

    it("does not animate when the system asks for reduced motion", () => {
      mockMedia(REDUCED);
      render(open);
      expect(dialog()).toHaveAttribute("data-motion", "none");
      expect(dialog().className).toContain("transition-none");
      expect(dialog().className).not.toContain("duration-[250ms]");
      expect(screen.getByTestId("drawer-dim").className).toContain("transition-none");
    });

    it("does not animate when the app's own reduced motion setting is on", () => {
      act(() => useForkStore.getState().actions.setReducedMotion(true));
      render(open);
      expect(dialog()).toHaveAttribute("data-motion", "none");
      expect(dialog().className).toContain("transition-none");
    });
  });

  describe("closing", () => {
    it("keeps its content while it slides away, then takes it out", () => {
      vi.useFakeTimers();
      const { rerender } = render(
        <Drawer open title="T" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      rerender(
        <Drawer open={false} title="T" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      expect(screen.getByText("Inside")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByText("Inside")).toBeNull();
    });

    it("takes its content out at once with reduced motion", () => {
      act(() => useForkStore.getState().actions.setReducedMotion(true));
      const { rerender } = render(
        <Drawer open title="T" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      rerender(
        <Drawer open={false} title="T" onClose={() => {}}>
          <p>Inside</p>
        </Drawer>,
      );
      expect(screen.queryByText("Inside")).toBeNull();
    });
  });
});
