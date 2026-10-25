import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { car, data } from "@/ui/mocks";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { Landing } from "./Landing";
import { ModelYearPicker } from "./ModelYearPicker";
import { VinEntry } from "./VinEntry";

const ALEX_CAMRY_VIN = "4T1G11AK1NU900001"; // the demo Camry's made-up VIN, in the registry

const vinInput = () => screen.getByPlaceholderText("Enter your VIN") as HTMLInputElement;
const decode = () => screen.getByRole("button", { name: "Decode VIN" });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the first screen is your VIN", () => {
  it("is the name, the line, and one field. No tabs and no sample-car page.", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1, name: "Fork" })).toBeInTheDocument();
    expect(screen.getByText("The future branches. Explore yours.")).toBeInTheDocument();
    expect(vinInput()).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: /2022 Camry SE/ })).toBeNull();
    expect(screen.queryByText(/Sample cars/i)).toBeNull();
    // what is on it: the field's button, and the two ways around it
    expect(screen.getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual([
      "Decode VIN",
      "Use sample VIN",
      "No VIN? Choose your car",
    ]);
  });

  it("tells a stranger which two cars Fork knows, in one quiet line", () => {
    render(<Landing />);
    expect(screen.getByText("Fork knows two cars: a 2022 Camry SE and a 2024 RAV4 Hybrid XLE.")).toBeInTheDocument();
  });

  it("has no em dashes and no all-caps copy", () => {
    const { container } = render(<Landing />);
    expect(container.textContent).not.toContain("—");
    expect(container.querySelector(".uppercase:not(input)")).toBeNull();
  });

  it("starts loading both cars right away", () => {
    const preload = vi.spyOn(car, "preloadCars");
    render(<Landing />);
    expect(preload).toHaveBeenCalledTimes(1);
    expect(preload.mock.calls[0][0].map((v) => v.id)).toEqual(data.listSampleVehicles().map((v) => v.id));
  });
});

describe("VinEntry", () => {
  it("auto-uppercases, enforces 17 characters, and blocks invalid characters", () => {
    render(<VinEntry />);
    expect(decode()).toBeDisabled();

    fireEvent.change(vinInput(), { target: { value: "123i" } });
    expect(screen.getByText("VINs never use the letters I, O, or Q.")).toBeInTheDocument();
    expect(decode()).toBeDisabled();

    fireEvent.change(vinInput(), { target: { value: "123-abc" } });
    expect(screen.getByText("VINs only use letters and numbers.")).toBeInTheDocument();

    fireEvent.change(vinInput(), { target: { value: "4t1b11hk5nu123456" } });
    expect(vinInput()).toHaveValue("4T1B11HK5NU123456");
    expect(screen.getByText("17/17")).toBeInTheDocument();
    expect(decode()).not.toBeDisabled();
  });

  it("shows how far along you are, one quiet line, and nothing before you type", () => {
    render(<VinEntry />);
    expect(screen.queryByText(/\/17/)).toBeNull();
    fireEvent.change(vinInput(), { target: { value: "4T1G" } });
    expect(screen.getByText("4/17")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits a valid VIN to startFromVin", async () => {
    const startFromVinSpy = vi.spyOn(useForkStore.getState().actions, "startFromVin");
    render(<VinEntry />);
    fireEvent.change(vinInput(), { target: { value: ALEX_CAMRY_VIN } });
    await act(async () => {
      fireEvent.click(decode());
    });
    expect(startFromVinSpy).toHaveBeenCalledWith(ALEX_CAMRY_VIN);
  });

  it("Enter in the field submits too", async () => {
    const startFromVinSpy = vi.spyOn(useForkStore.getState().actions, "startFromVin");
    render(<VinEntry />);
    fireEvent.change(vinInput(), { target: { value: ALEX_CAMRY_VIN } });
    await act(async () => {
      fireEvent.submit(vinInput().closest("form")!);
    });
    expect(startFromVinSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a VIN whose check digit does not add up, without making a twin", async () => {
    render(<VinEntry />);
    fireEvent.change(vinInput(), { target: { value: "4T1G11AK2NU900001" } }); // one digit off
    await act(async () => {
      fireEvent.click(decode());
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/check digit/i);
    expect(useForkStore.getState().twin).toBeNull();
  });

  it("says why when the store could not open the VIN", () => {
    render(<VinEntry />);
    act(() => useForkStore.setState({ error: "That VIN is for a car Fork doesn't know." }));
    expect(screen.getByRole("alert")).toHaveTextContent("That VIN is for a car Fork doesn't know.");
  });

  it("has a real label for a screen reader, since the placeholder is the only visible one", () => {
    render(<VinEntry />);
    expect(screen.getByLabelText("Vehicle identification number")).toBe(vinInput());
    expect(decode()).toHaveAccessibleName("Decode VIN");
  });
});

describe("the demo car by VIN", () => {
  it("Use sample VIN fills in the Camry's VIN, ready to decode, and never says exact", () => {
    render(<VinEntry />);
    expect(vinInput()).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Use sample VIN" }));
    expect(vinInput()).toHaveValue(ALEX_CAMRY_VIN);
    expect(screen.getByText("17/17")).toBeInTheDocument();
    expect(decode()).toBeEnabled();
    expect(vinInput()).toHaveFocus();
    expect(screen.queryByText(/exact/i)).toBeNull();
  });

  it("clears an earlier error, and the VIN it fills is the one the registry opens as the demo", () => {
    render(<VinEntry />);
    fireEvent.change(vinInput(), { target: { value: "123i" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use sample VIN" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(vinInput().value).toBe(data.listSampleVehicles()[0].vin);
  });

  it("typing that VIN and decoding opens the Camry with Alex, through the normal VIN path", async () => {
    vi.useRealTimers();
    render(<Landing />);
    fireEvent.change(vinInput(), { target: { value: ALEX_CAMRY_VIN } });
    await act(async () => {
      fireEvent.click(decode());
    });
    await vi.waitFor(() => expect(useForkStore.getState().phase).toBe("reveal"));
    const s = useForkStore.getState();
    expect(s.twin?.vehicle.model).toBe("Camry");
    expect(s.twin?.vehicle.vin).toBe(ALEX_CAMRY_VIN);
    expect(s.explore.confirmedProfile.location).toMatch(/Austin/); // Alex lives in Austin
    expect(Object.values(s.explore.confirmedProfile.provenance)).toContain("synthetic"); // and is labeled made up
  });

  it("only the registered demo VIN takes the Alex path: any other VIN goes the ordinary way", async () => {
    vi.useRealTimers();
    const demo = vi.spyOn(data, "buildDemoTwin");
    const ordinary = vi.spyOn(data, "buildTwin").mockResolvedValue({ ok: false, error: "stop here" });
    vi.spyOn(data, "identifyVehicle").mockResolvedValue({
      status: "ok",
      decodeState: "nhtsa",
      vehicle: { ...data.listSampleVehicles()[0], vin: "1HGCM82633A004352" },
    } as Awaited<ReturnType<typeof data.identifyVehicle>>);
    render(<VinEntry />);
    fireEvent.change(vinInput(), { target: { value: "1HGCM82633A004352" } }); // a valid VIN that is not in the registry
    await act(async () => {
      fireEvent.click(decode());
    });
    await vi.waitFor(() => expect(ordinary).toHaveBeenCalledTimes(1));
    expect(demo).not.toHaveBeenCalled(); // Alex is never applied to a VIN that is not the demo's
  });

  it("a VIN Fork cannot open stays on the first screen, with the reason, and makes no twin", async () => {
    vi.useRealTimers();
    vi.spyOn(data, "identifyVehicle").mockResolvedValue({ status: "unsupported", partial: {}, reason: "Vehicle is outside Fork's supported models" } as Awaited<ReturnType<typeof data.identifyVehicle>>);
    render(<Landing />);
    fireEvent.change(vinInput(), { target: { value: "1HGCM82633A004352" } });
    await act(async () => {
      fireEvent.click(decode());
    });
    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(useForkStore.getState().twin).toBeNull();
    expect(useForkStore.getState().phase).toBe("landing");
    expect(vinInput()).toBeInTheDocument();
  });
});

describe("no VIN to hand", () => {
  it("one quiet link opens the car picker, and Back to VIN returns", () => {
    render(<Landing />);
    fireEvent.click(screen.getByRole("button", { name: "No VIN? Choose your car" }));
    expect(screen.getByLabelText("Choose your car")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter your VIN")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to VIN" }));
    expect(vinInput()).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose your car")).toBeNull();
  });

  it("choosing a car opens it", async () => {
    render(<Landing />);
    fireEvent.click(screen.getByRole("button", { name: "No VIN? Choose your car" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /explore 2022 camry se/i }));
    });
    expect(useForkStore.getState().phase).toBe("reveal");
    expect(useForkStore.getState().twin?.vehicle.id).toBe("camry-2022-se");
  });

  it("says why a choice did not open, once", () => {
    render(<Landing />);
    fireEvent.click(screen.getByRole("button", { name: "No VIN? Choose your car" }));
    act(() => useForkStore.setState({ error: "We only model the two cars." }));
    expect(within(screen.getByRole("main")).getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("We only model the two cars.");
  });
});

describe("ModelYearPicker", () => {
  it("submits selected model to startFromPicker", async () => {
    const startFromPickerSpy = vi.spyOn(useForkStore.getState().actions, "startFromPicker");
    render(<ModelYearPicker />);

    expect(screen.getByLabelText("Choose your car")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /explore 2022 camry se/i }));
    });
    expect(startFromPickerSpy).toHaveBeenCalledWith("Toyota", "Camry", 2022, "SE");
  });
});
