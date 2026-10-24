import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useElementHeight } from "./useElementHeight";

let observers: FakeObserver[] = [];

class FakeObserver {
  observed: Element[] = [];
  constructor(private cb: () => void) {
    observers.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {
    this.observed = [];
  }
  fire() {
    this.cb();
  }
}

let nextHeight = 222;

function Probe() {
  const [show, setShow] = useState(false);
  const [ref, height] = useElementHeight<HTMLDivElement>(150);
  return (
    <>
      <button onClick={() => setShow(true)}>show</button>
      <span data-testid="h">{height}</span>
      {/* The element appears after the first render, like the bottom bar after the reveal. */}
      {show && <div ref={ref} />}
    </>
  );
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("ResizeObserver", FakeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ height: nextHeight, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useElementHeight", () => {
  it("keeps the fallback until the element exists", () => {
    render(<Probe />);
    expect(screen.getByTestId("h")).toHaveTextContent("150");
  });

  it("measures an element that mounts after the component did", () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("show"));
    expect(screen.getByTestId("h")).toHaveTextContent("222");
  });

  it("follows the element as it grows", () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("show"));
    nextHeight = 318;
    act(() => observers.at(-1)!.fire());
    expect(screen.getByTestId("h")).toHaveTextContent("318");
    nextHeight = 222;
  });

  it("stops observing when the element goes away", () => {
    const { unmount } = render(<Probe />);
    fireEvent.click(screen.getByText("show"));
    const observer = observers.at(-1)!;
    expect(observer.observed).toHaveLength(1);
    unmount();
    expect(observer.observed).toHaveLength(0);
  });

  it("ignores a zero height instead of collapsing the page", () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("show"));
    nextHeight = 0;
    act(() => observers.at(-1)!.fire());
    expect(screen.getByTestId("h")).toHaveTextContent("222");
    nextHeight = 222;
  });
});
