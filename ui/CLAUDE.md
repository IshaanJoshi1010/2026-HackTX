# Developer 2: Product UI and Integration (`/app` except `/app/api`, `/ui` except `/ui/3d`)

Read the root `CLAUDE.md` and `/contracts/INTERFACES.md` first. Copy this file to `/ui/CLAUDE.md`.

## Mission

Own everything the user touches outside the 3D canvas, plus the store that connects all four developers. You are also the merge owner: all branches land on `main` through you.

## You own / you do not own

| You own | You do not own |
| --- | --- |
| `/app` except `/app/api`, `/ui` except `/ui/3d` | Anything inside the canvas (Dev 1) |
| Repo scaffolding, theme, shell, routes, Zustand store | Simulation and decisions (Dev 4) |
| Timeline, command box, profile card, comparison, break-even visual | VIN decode, normalizer, Gemini (Dev 3) |
| Merging, `USE_MOCKS`, integration checklist | `/contracts` types (review only) |

## File map

```text
/app/page.tsx                    renders Landing | Reveal | Workspace from store.phase
/ui/store/useForkStore.ts, persistence.ts   (localStorage key "fork:v1", versioned)
/ui/theme/tokens.css
/ui/landing/Landing.tsx, VinEntry.tsx (the first screen is one VIN field), ModelYearPicker.tsx (only behind "No VIN? Choose your car")
/ui/reveal/RevealOverlay.tsx     identity text, "Who rides with you most?" chips, specs, Skip, Replay
/ui/shell/Workspace.tsx, CarView.tsx, ViewSwitch.tsx, DetailsSheet.tsx (the "Edit assumptions" sheet), AppHeader.tsx
/ui/shell/FutureView.tsx         the Future page: composes the ui/journey parts below, plus FutureSelector.tsx (only with two lives)
/ui/shell/CostsPanel.tsx, FutureDetails.tsx   the month by month breakdown inside the "Compare costs" drawer
/ui/journey/types.ts             the shared Journey contract; fixtures.ts has hand built Journeys for tests
/ui/journey/model.ts, useJourney.ts           buildJourney and the hook: the one view of the scenario every Future part reads
/ui/journey/JourneyHeader.tsx    heading = the recommendation, the difference line, the one source label, the next step line
/ui/journey/JourneyTimeline.tsx, roadGeometry.ts (pure), dates.ts      the road: both futures, events, destinations with five year costs
/ui/journey/Scrubber.tsx, playback.ts (pure), usePlayback.ts           play or pause, month slider, readout
/ui/journey/EventCard.tsx, impact.ts, useEventImpact.ts                the one compact card for the selected moment
/ui/journey/Drawer.tsx, JourneyDrawers.tsx    the one drawer (explain, costs, recommendation), one at a time
/ui/journey/ExplainContent.tsx (explain.ts), CostsContent.tsx, RecommendationContent.tsx    what each drawer holds
/ui/profile/ProfileConfirmCard.tsx, LiveProfileCard.tsx, SourceBadge.tsx, ConfidenceMeter.tsx
/ui/command/CommandBox.tsx, StarterChips.tsx, VoiceButton.tsx, ConfirmProposalCard.tsx,
  InlineQuestionCard.tsx, FinanceChips.tsx, TradeoffCards.tsx, WeightsEditor.tsx, ManualEventForm.tsx
/ui/timeline/effects.ts, layout.ts (pure), useDecisionEffects.ts, useElementSize.ts (the road measures itself with it)
/ui/compare/ComparisonSection.tsx (useComparison, TermsSection, ComparisonChange), Verdict.tsx (verdictHeadline and
  robustnessLine, pure), BreakEvenViz.tsx, WhyPanel.tsx, AssumptionsReview.tsx, CostChart.tsx, tradeoff.ts and useTradeoff.ts,
  breakEvenMath.ts, costChartMath.ts, termsMath.ts (the math files are pure)
/ui/mocks/index.ts               one switch per module: USE_MOCKS. All real; only the 3D stage is a stand-in, and only in tests
/ui/mocks/CarStageStub.tsx       DOM stand-in for the stage (jsdom has no WebGL)
```

## Store shape

```ts
interface ForkState {
  phase: "landing" | "reveal" | "workspace";
  twin: VehicleTwin | null;
  replacementVehicle: VehicleConfig | null;
  explore: ExploreState;                                // confirmedProfile, draftChanges, scenarios
  results: Record<string, SimulationResult>;            // by scenarioId
  evaluation: DecisionEvaluation | null;
  breakEven: BreakEvenResult | null;
  comparison: { keepId: string; replaceId: string } | null;   // set once you compare; the two futures on the road
  activeScenarioId: string; activeMonth: number; activeVehicleId: string;   // month 0 to 60
  selectedEventId: string | null; revision: number; lastChange: LastChange | null;   // with activeMonth, the one clock
  stage: { phase: "reveal" | "interactive" | "transition"; viewMode: "solid" | "wireframe" | "points" };
  question: Question | null;                            // at most one at a time
  ui: { reducedMotion: boolean; lowPerformance: boolean; aiAvailable: boolean;
        view: "car" | "future"; detailsOpen: boolean;          // the page, and the Edit assumptions sheet
        playing: boolean; drawer: "explain" | "costs" | "recommendation" | null;
        busy: "idle" | "interpreting" | "simulating" };      // none of ui.view, detailsOpen, playing, drawer is saved
  actions: {
    startFromVin(vin: string): Promise<void>;
    startFromSample(vehicleId: string): Promise<void>;
    startFromPicker(make: string, model: string, year: number, trim?: string): Promise<void>;
    answerRiders(choice: "solo" | "partner" | "kids" | "mixed"): void;
    submitDump(text: string): Promise<void>;
    confirmDrafts(ids: string[]): void;
    editDraft(id: string, patch: Partial<LifeEvent>): void;
    rejectDraft(id: string): void;
    answerQuestion(field: FieldKey, value: number | string | "unsure"): void;
    pickTradeoff(pick: TradeoffPick): void;
    openReplaceComparison(): void;
    setAssumption(key: string, value: number): void;
    runBreakEven(parameter: "annualMiles" | "fuelPricePerGal"): void;
    moveEvent(scenarioId: string, eventId: string, month: number): void;
    setActiveScenario(id: string): void;
    setActiveMonth(m: number): void;
    selectEvent(id: string | null): void;   // moves the month to the event; stops playback
    selectFuture(id: string): void;         // keep or switch; the month stays where it is
    play(): void; pause(): void; advanceMonth(m: number): void;   // advanceMonth is for the player only
    openDrawer(id: "explain" | "costs" | "recommendation"): void; closeDrawer(): void;
  };
}
```

## Flows (exact call order)

1. **Start.** `startFromVin`: `validateVin`, `identifyVehicle`, `buildTwin`, then `phase = "reveal"`, `stage.phase = "reveal"`. Invalid VIN shows the reason and creates no twin.
2. **Reveal.** `onRevealStage("solid")` shows specs. `"done"` sets `stage.phase = "interactive"` and `phase = "workspace"`. Skip increments `skipSignal`.
3. **Baseline.** On entering the workspace create `Scenario` id `base` (no events), run `simulate`, store the result, render one timeline node.
4. **Dump.** `submitDump` sets `busy = "interpreting"`, calls `interpret`. If `aiAvailable` is false switch to manual forms. Proposals go to `explore.draftChanges` only.
5. **Confirm.** `confirmDrafts` marks events `confirmed`, calls `fork(activeScenario, minMonth, carryOver(...).events, name)`, then `simulate`, then updates the store. `fork` drops the parent's own future, so `ui/store/carryOver.ts` hands it the active future's later events too, except the ones a new event replaces (named in that event's assumptions). Unconfirmed drafts never touch scenarios or the profile.
6. **Question.** After each interpret or confirm call `gapCheck`. Show at most one `InlineQuestionCard`. "I'm not sure" calls `answerQuestion(field, "unsure")`, which applies the labeled default.
7. **Replace.** `openReplaceComparison`: `makeReplaceScenario`, set `stage.phase = "transition"` with `transitionTo` the RAV4, `simulate` both, `evaluate`, and the Future page prices the switch. `onTransitionComplete` sets `stage.phase = "interactive"`.
8. **Challenge.** `runBreakEven` then `BreakEvenViz`. Show "no threshold within tested bounds" plainly when `found` is false.
9. **Assumption edit.** `setAssumption` writes to the scenario assumptions, re-simulates affected scenarios, re-evaluates.

You pass data between modules: pass `getSpecs` output and `VehicleConfig` into Dev 4's functions as arguments. Dev 4 never imports `/data`.

## UI rules

- Every number renders through `SourceBadge`: your input, estimated, demo data, listing.
- Every control reads or writes the store. No decorative controls.
- Never show a probability or confidence percentage. Robustness reads "held in X of Y tested cases."
- Vague proposal rows pulse and ask for a number. Inferred rows say "confirm."
- Source labels come from the data, never hardcoded in the component.
- Layout: two pages and nothing else. **Car** (the default): the car, its name, one command bar, and a Car | Future switch at the bottom. No numbers and no timeline, and one small side panel: the rider question ("Who rides with you most?"), whose chips are a row at the bottom while the car forms and then fly up in an arc to a panel at the right edge (`ui/reveal/RiderDock.tsx`, the arc in `arc.ts`), where the answer can still be changed. Never add other side panels or HUD numbers to the Car page. The one exception is the car's own four specs (mpg, seats, cargo, price), which appear when the car forms, stay up for 30 seconds so there is time to read them and start turning the car, and then fade out slowly (`ui/reveal/SpecReadout.tsx`). Never show the same number twice.
- **Future** is your next five years as one road (`ui/shell/FutureView.tsx`, built from `ui/journey/*`), top to bottom:
  1. A header. Its heading is the engine's recommendation ("Close call" when the engine is inconclusive, never the raw word) and opens the recommendation. Under it, one sentence on the difference over five years with the one source label on the page, and one "Next:" line with the engine's next step. Before you compare, the heading is "Your next five years" and a button prices the switch. "Compare costs" sits at the right.
  2. One large road with both futures: keeping your car, and the other car (a dashed offer you tap to compare until it is priced). Each future's five year net cost sits at its destination. After comparing, the future the engine prefers is not drawn differently and a close call picks neither: the verdict lives in the header, never on the road.
  3. A scrubber with play and pause, and a readout of the month, the car and the cost through that month.
  4. One compact event card for the selected moment: its name, date and one sentence on what it changes, with "Explain this". It is the same size in every state, so nothing under it moves.
  Three things open on request, one at a time, in the one drawer (`ui.drawer`): **Explain this** (the full reasoning, in plain words, for the selected event), **Compare costs** (the five year totals and the month by month breakdown) and the **recommendation** (why the engine came out the way it did, the tradeoffs, and "What would change it", the break-even). The Edit assumptions sheet is separate: one header icon opens it, and it holds profile, finance, priorities, history, display options, switch car, start over, and the purchase and insurance terms once you compare. Do not add a fifth way to open anything. The chat composer sits below the page and never covers the road.
  Typed questions still work on this page: "would a RAV4 make more sense?" compares, and "what would have to change for keeping the Camry to be better?" runs the break-even, which then shows in the recommendation drawer. Confirming "Branch timeline" jumps to the Future page. The 3D stage stays mounted on both pages and only fades out behind the road.
- **The one clock.** Every part of the Future page reads the same three store fields, `activeMonth`, `selectedEventId` and `activeScenarioId` (with `comparison` for keep and switch), through one `Journey` from `useJourney()`. No part keeps its own month or selection, and no part reads the store for these around it. Time is a straight line: an event sits at its modeled month, the split sits at the modeled swap month, and the bends of the road are decoration, so up or down means nothing. The car follows the month through `vehicleAtMonth` (the car you own until the swap month, the replacement from it on). The five year totals at the destinations never depend on the month; only the readout says "through this month", and it says so. Scrubbing, playing and looking at the other future never change the engine's call. A late answer never replaces a newer one: anything that finishes later checks `revision` first.
- Words: it reads like a product handed to a customer. No screen, tooltip, label or placeholder says "demo" or "data" (`ui/customerWords.test.tsx` walks the whole app and fails if one does). Source badges say "illustrative" for made-up and illustrative figures. Text that comes from another module goes through `customerText` before it is shown.
- Style: black and white only; every gray is white at some opacity. No neon, no glow, no grid, no colored accents. Clean sentence-case type, big light numerals, round icon buttons, solid white primary buttons, like a dark car-maker product page. The one accent is `--fork-accent` in `tokens.css` and it is white today. Source labels differ by shape (dot, hollow dot, dotted dot, square, diamond), and a missing source is an inverted white chip. Casual short copy, no em dashes.

## Tasks

- **B0 Scaffold (hour 0 to 1).** Next.js App Router, TypeScript, Tailwind, shadcn/ui. Folders, copy all `CLAUDE.md` files, add `/contracts` placeholder, `npm test` script, `/docs/HANDOFF.md`.
- **B1 Shell and store (hour 1 to 4).** Theme, layout zones, collapsible panels, store with mocks, `CarStageStub` in place, `SourceBadge`, reduced-motion and low-performance flags.
- **B2 Entry and reveal (hour 4 to 8).** Landing, VIN entry with inline validation (the first screen is your VIN and nothing else; the demo Camry's made-up VIN is one tap, and a car picker sits behind one quiet link), model and year picker, reveal overlay with the rider chips, profile confirm card, left panel. Gate 1.
- **B3 Timeline (hour 8 to 11).** Done, and rebuilt: the Future page is the interactive road in `ui/journey` (custom SVG, no React Flow). `JourneyTimeline` draws both futures on a straight month axis with every event at its modeled month and the five year cost at each destination; `Scrubber` and `usePlayback` move the one clock; `EventCard` and the drawers explain it. `roadGeometry.ts` is pure and tested. `ui/timeline/effects.ts` re-runs a future without each decision to say what it changed (it feeds the breakdown inside "Compare costs"). Moving an event is still a store action (`moveEvent`) but the page has no control for it. Still open: the browser layout check at 1440, 1280, 1024 and 390 wide.
- **B4 Command box (hour 8 to 13).** One command bar (voice, manual entry behind a plus), one suggestion that seeds the box without submitting, offline fallback that only extracts what the user wrote (`command/extract.ts`, to move into Dev 3's interpret), live profile card with quoted phrases and certainty styling, confirm flow, inline questions, tradeoff cards, weights editor, manual forms. Gate 2.
- **B5 Comparison (hour 13 to 18).** Done for the demo path: the verdict is the Future page heading, the recommendation drawer holds the tradeoffs, "held in X of Y", the engine's reasons and the break-even, and the header shows the next step as one line. The next step's longer detail and official link are not on the page (the old `NextStep` card was removed with the old page; it is in git at `01b8aaa:ui/compare/NextStep.tsx` if the recommendation drawer should show it). Still open: cost curves.
  Original scope: Keep vs replace, three separate cost views, range display, recommendation and next action cards, assumptions editor, `BreakEvenViz`, cost curves. Gate 3.
- **B6 Integration swap (hour 15 to 20).** Done. Data, sim, decision, AI and the real CarStage are all wired, one flag at a time, each with the demo run after it. The store follows Dev 4's order (evaluate, withSensitivity, nextAction with results). The offline rules (`command/extract.ts`) read a sentence when the AI is not available, and the manual form needs no AI.
- **B7 Polish (hour 18 to 21).** Empty, loading, and error states, layout checks at 1280x720, 1440x900, 1920x1080, 1024x768, `DEMO_SCRIPT.md`.
- **B8 Submit (hour 21 to 24).** Deploy, verify deployed build, fallback video with Dev 1.

## Definition of done

- [ ] A new user reaches a comparison in under 60 seconds.
- [ ] Skipping every optional question still gives a valid comparison with labeled estimates.
- [ ] An unconfirmed proposal changes nothing.
- [ ] Every timeline branch is a real `Scenario` and clicking it changes numbers.
- [ ] With the Gemini key removed, manual forms work and everything else works.
- [ ] Every number has a source badge.

## Cut line (cut in this order)

Confidence meter, event dragging, voice button, cost curves. Never cut the timeline, the confirm flow, the comparison, or the break-even visual.

## Session hygiene

One task per Claude session. End each session by printing: files created, components with props, and the run or test command.
