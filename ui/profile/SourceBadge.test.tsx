import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataRow } from "./DataRow";
import { SourceBadge } from "./SourceBadge";
import { Stat } from "./Stat";

describe("SourceBadge", () => {
  it.each([
    ["user", "your input"],
    ["estimated", "estimated"],
    ["synthetic", "demo data"],
    ["illustrative", "demo data"],
    ["listing", "listing"],
    ["sourced", "sourced"],
  ] as const)("shows %s as %s", (source, label) => {
    render(<SourceBadge source={source} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute("data-source", source);
  });

  it("shows a visible gap when the source is missing", () => {
    render(<SourceBadge source={undefined} />);
    expect(screen.getByText("no source")).toHaveAttribute("data-source", "none");
  });

  it("explains the exact source in the tooltip", () => {
    render(<SourceBadge source="illustrative" />);
    expect(screen.getByText("demo data")).toHaveAttribute("title", expect.stringContaining("Placeholder"));
  });
});

describe("SourceBadge compact", () => {
  it.each([
    ["user", "your input"],
    ["estimated", "estimated"],
    ["synthetic", "demo data"],
    ["sourced", "sourced"],
  ] as const)("still shows %s as a visible label", (source, label) => {
    render(<SourceBadge compact source={source} />);
    expect(screen.getByText(label)).toHaveAttribute("data-source", source);
  });

  it("still shows the gap when the source is missing", () => {
    render(<SourceBadge compact source={undefined} />);
    expect(screen.getByText("no source")).toHaveAttribute("data-source", "none");
  });
});

describe("Stat", () => {
  it("always renders a badge under the number", () => {
    render(<Stat label="Net cost" value="$1,200" source="synthetic" />);
    expect(screen.getByText("$1,200")).toBeInTheDocument();
    expect(screen.getByText("demo data")).toBeInTheDocument();
  });
});

describe("DataRow", () => {
  it("always renders a badge next to the value", () => {
    render(<DataRow label="Fuel" value="$1,200" source="estimated" />);
    expect(screen.getByText("$1,200")).toBeInTheDocument();
    expect(screen.getByText("estimated")).toBeInTheDocument();
  });

  it("still renders a badge when the source is unknown", () => {
    render(<DataRow label="Mileage" value="48,000 mi" source={undefined} />);
    expect(screen.getByText("no source")).toBeInTheDocument();
  });
});
