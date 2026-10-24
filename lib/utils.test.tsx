import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("scaffold smoke test", () => {
  it("merges class names", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("renders with React Testing Library", () => {
    render(<p>Fork</p>);
    expect(screen.getByText("Fork")).toBeInTheDocument();
  });
});
