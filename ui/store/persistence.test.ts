import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, clearPersisted, loadPersisted, savePersisted, DEFAULT_PREFS } from "./persistence";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "./useForkStore";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;
const settle = () => new Promise((r) => setTimeout(r, 220)); // save is debounced 120ms

async function savedBlob(): Promise<Record<string, unknown>> {
  actions().hydrate();
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
  actions().setActiveMonth(24);
  actions().setLowPerformance(true);
  actions().setDetailsOpen(true);
  await settle();
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
});

describe("persistence layer", () => {
  it("returns null when nothing is saved", () => {
    expect(loadPersisted()).toBeNull();
  });

  it("round-trips prefs", () => {
    savePersisted({ prefs: { lowPerformance: true }, session: null });
    expect(loadPersisted()).toEqual({
      prefs: { lowPerformance: true },
      session: null,
    });
  });

  it("uses the versioned fork:v1 key", () => {
    savePersisted({ prefs: DEFAULT_PREFS, session: null });
    expect(STORAGE_KEY).toBe("fork:v1");
    expect(JSON.parse(localStorage.getItem("fork:v1")!).version).toBe(1);
  });

  it("treats garbage, wrong versions and non-objects as empty", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadPersisted()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, prefs: DEFAULT_PREFS }));
    expect(loadPersisted()).toBeNull();
    localStorage.setItem(STORAGE_KEY, "42");
    expect(loadPersisted()).toBeNull();
  });

  it("falls back to default prefs when prefs are malformed", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, mocks: "x", prefs: { lowPerformance: "yes" }, session: null }));
    expect(loadPersisted()?.prefs).toEqual(DEFAULT_PREFS);
  });

  it("still loads a save from before the panels went away", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, mocks: "x", prefs: { leftOpen: true, rightOpen: true, lowPerformance: true }, session: null }),
    );
    expect(loadPersisted()?.prefs).toEqual({ lowPerformance: true });
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(loadPersisted(broken)).toBeNull();
    expect(() => savePersisted({ prefs: DEFAULT_PREFS, session: null }, broken)).not.toThrow();
    expect(() => clearPersisted(broken)).not.toThrow();
    expect(loadPersisted(null)).toBeNull();
  });

  it("clear removes the key", () => {
    savePersisted({ prefs: DEFAULT_PREFS, session: null });
    clearPersisted();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("store hydration", () => {
  it("starts clean and flips hydrated when nothing is saved", () => {
    expect(state().hydrated).toBe(false);
    actions().hydrate();
    expect(state().hydrated).toBe(true);
    expect(state().phase).toBe("landing");
  });

  it("restores the session, preferences and recomputed results", async () => {
    await savedBlob();
    resetForkStoreForTests();
    expect(state().twin).toBeNull();

    actions().hydrate();
    expect(state().phase).toBe("workspace");
    expect(state().stage.phase).toBe("interactive");
    expect(state().twin?.vehicle.id).toBe("camry-2022-se");
    expect(state().activeMonth).toBe(24);
    expect(state().ui.lowPerformance).toBe(true);
    expect(state().ui.detailsOpen).toBe(false); // the sheet and the page are never saved
    expect(state().ui.view).toBe("car");
    expect(state().results[BASE_ID].points).toHaveLength(60);
  });

  it("never saves the road options: every session starts minimal", async () => {
    actions().hydrate();
    await actions().startFromSample("camry-2022-se");
    actions().onRevealStage("done");
    actions().setFutureDetails(true);
    actions().setFutureCompare(true);
    await settle();
    expect(localStorage.getItem(STORAGE_KEY)).not.toMatch(/futureDetails|futureCompare/);
    resetForkStoreForTests();
    actions().hydrate();
    expect(state().ui).toMatchObject({ futureDetails: false, futureCompare: false });
  });

  it("does not save derived data", async () => {
    const blob = await savedBlob();
    const session = blob.session as Record<string, unknown>;
    expect(session).not.toHaveProperty("results");
    expect(session).not.toHaveProperty("evaluation");
    expect(session).not.toHaveProperty("breakEven");
  });

  it("drops a session saved under a different mock mix but keeps preferences", async () => {
    const blob = await savedBlob();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...blob, mocks: "car,sim" }));
    resetForkStoreForTests();
    actions().hydrate();
    expect(state().twin).toBeNull();
    expect(state().phase).toBe("landing");
    expect(state().ui.lowPerformance).toBe(true);
  });

  it("drops a session that fails validation but keeps preferences", async () => {
    const blob = await savedBlob();
    const session = blob.session as { twin: { mileage: number } };
    session.twin.mileage = -1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    resetForkStoreForTests();
    actions().hydrate();
    expect(state().twin).toBeNull();
    expect(state().ui.lowPerformance).toBe(true);
  });

  it("start over clears the saved session", async () => {
    await savedBlob();
    actions().resetAll();
    await settle();
    const blob = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(blob.session).toBeNull();
  });

  it("never saves a draft that is not proposed", async () => {
    await savedBlob();
    resetForkStoreForTests();
    actions().hydrate();
    expect(state().explore.draftChanges.every((e) => e.status === "proposed")).toBe(true);
  });
});
