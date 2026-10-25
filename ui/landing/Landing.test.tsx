import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { Landing } from "./Landing";
import { ModelYearPicker } from "./ModelYearPicker";
import { SampleCarPicker } from "./SampleCarPicker";
import { VinEntry } from "./VinEntry";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Landing", () => {
  it("renders header and switches between tabs", async () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1, name: "Fork" })).toBeInTheDocument();
    expect(screen.getByText("The future branches. Explore yours.")).toBeInTheDocument();

    // Default tab is Sample cars
    expect(screen.getByRole("tab", { name: "Sample cars" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /2022 Camry SE/ })).toBeInTheDocument();

    // Switch to Enter VIN tab
    fireEvent.click(screen.getByRole("tab", { name: "Enter VIN" }));
    expect(screen.getByPlaceholderText("17-character VIN")).toBeInTheDocument();

    // Switch to Select model tab
    fireEvent.click(screen.getByRole("tab", { name: "Select model" }));
    expect(screen.getByLabelText("Select vehicle model")).toBeInTheDocument();
  });
});

describe("Landing explainer", () => {
  it("says what Fork does and that the numbers come from code, before anything is entered", () => {
    render(<Landing />);
    const text = screen.getByTestId("landing-explainer").textContent!;
    expect(text).toContain("digital twin of your Toyota");
    expect(text).toContain("The numbers come from code, not the AI");
    expect(text).not.toContain("\u2014");
  });

  it("names Alex on the sample cars tab, and says Alex is made up", () => {
    render(<Landing />);
    expect(screen.getByTestId("alex-note")).toHaveTextContent("Alex, a made-up driver in Austin");
    expect(screen.getByTestId("alex-note")).toHaveTextContent("synthetic");
    fireEvent.click(screen.getByRole("tab", { name: "Enter VIN" }));
    expect(screen.queryByTestId("alex-note")).toBeNull();
  });
});

describe("VinEntry", () => {
  it("auto-uppercases, enforces 17 characters, and blocks invalid characters", async () => {
    render(<VinEntry />);
    const input = screen.getByPlaceholderText("17-character VIN");
    const submitBtn = screen.getByRole("button", { name: /decode vin/i });

    expect(submitBtn).toBeDisabled();

    // Enter forbidden letter 'I'
    fireEvent.change(input, { target: { value: "123i" } });
    expect(screen.getByText("VINs never use the letters I, O, or Q.")).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Enter special char
    fireEvent.change(input, { target: { value: "123-abc" } });
    expect(screen.getByText("VINs only use letters and numbers.")).toBeInTheDocument();

    // Enter valid 17 chars
    fireEvent.change(input, { target: { value: "4t1b11hk5nu123456" } });
    expect(input).toHaveValue("4T1B11HK5NU123456");
    expect(screen.getByText("17/17")).toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();
  });

  it("submits valid VIN to startFromVin", async () => {
    const startFromVinSpy = vi.spyOn(useForkStore.getState().actions, "startFromVin");
    render(<VinEntry />);
    const input = screen.getByPlaceholderText("17-character VIN");

    // The sample Camry VIN from the registry: valid characters and a valid check digit.
    fireEvent.change(input, { target: { value: "4T1G11AK1NU900001" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /decode vin/i }));
    });

    expect(startFromVinSpy).toHaveBeenCalledWith("4T1G11AK1NU900001");
  });

  it("rejects a VIN whose check digit does not add up, without making a twin", async () => {
    render(<VinEntry />);
    const input = screen.getByPlaceholderText("17-character VIN");

    fireEvent.change(input, { target: { value: "4T1G11AK2NU900001" } }); // one digit off
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /decode vin/i }));
    });

    expect(screen.getByText(/check digit/i)).toBeInTheDocument();
    expect(useForkStore.getState().twin).toBeNull();
  });
});

describe("SampleCarPicker", () => {
  it("renders sample vehicles with badges and handles selection", async () => {
    render(<SampleCarPicker />);

    const camryBtn = screen.getByRole("button", { name: /select 2022 camry se/i });
    const rav4Btn = screen.getByRole("button", { name: /select 2024 rav4 hybrid xle/i });

    expect(camryBtn).toBeInTheDocument();
    expect(rav4Btn).toBeInTheDocument();

    // Check spec numbers are accompanied by source badges
    expect(screen.getAllByText("mpg")).toHaveLength(2);
    expect(screen.getAllByText("cu ft")).toHaveLength(2);

    // Click sample car
    await act(async () => {
      fireEvent.click(camryBtn);
    });
    expect(useForkStore.getState().phase).toBe("reveal");
    expect(useForkStore.getState().twin?.vehicle.id).toBe("camry-2022-se");
  });
});

describe("ModelYearPicker", () => {
  it("submits selected model to startFromPicker", async () => {
    const startFromPickerSpy = vi.spyOn(useForkStore.getState().actions, "startFromPicker");
    render(<ModelYearPicker />);

    const select = screen.getByLabelText("Select vehicle model");
    expect(select).toBeInTheDocument();

    // Submit default Camry
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /explore 2022 camry se/i }));
    });
    expect(startFromPickerSpy).toHaveBeenCalledWith("Toyota", "Camry", 2022, "SE");
  });
});

describe("VinEntry sample VIN", () => {
  it("fills in the demo Camry's VIN, ready to decode, and never says exact", async () => {
    render(<VinEntry />);
    const input = screen.getByPlaceholderText("17-character VIN");
    expect(input).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Use sample VIN" }));
    expect((input as HTMLInputElement).value).toMatch(/^[A-HJ-NPR-Z0-9]{17}$/);
    expect(screen.getByText("17/17")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decode vin/i })).toBeEnabled();
    expect(screen.queryByText(/exact/i)).toBeNull();
  });

  it("clears an earlier error, and the VIN it fills is the one the sample Camry card uses", async () => {
    render(<VinEntry />);
    const input = screen.getByPlaceholderText("17-character VIN");
    fireEvent.change(input, { target: { value: "123i" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use sample VIN" }));
    expect(screen.queryByRole("alert")).toBeNull();
    const { data } = await import("@/ui/mocks");
    expect((input as HTMLInputElement).value).toBe(data.listSampleVehicles()[0].vin);
  });

  it("tells a stranger which two cars Fork knows, and that the sample VIN is made up", () => {
    render(<VinEntry />);
    const note = screen.getByText(/No VIN handy\?/).closest("p")!;
    expect(note).toHaveTextContent("made up for the demo");
    expect(note).toHaveTextContent("2022 Camry SE");
    expect(note).toHaveTextContent("2024 RAV4 Hybrid XLE");
  });

  it("decodes the sample VIN through the normal path and opens the demo", async () => {
    vi.useRealTimers();
    render(<VinEntry />);
    fireEvent.click(screen.getByRole("button", { name: "Use sample VIN" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /decode vin/i }));
    });
    await vi.waitFor(() => expect(useForkStore.getState().phase).toBe("reveal"));
    expect(useForkStore.getState().twin?.vehicle.model).toBe("Camry");
  });
});
