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
/ui/shell/Workspace.tsx, CarView.tsx, FutureView.tsx, FutureDetails.tsx, ViewSwitch.tsx, DetailsSheet.tsx, AppHeader.tsx
/ui/profile/ProfileConfirmCard.tsx, LiveProfileCard.tsx, SourceBadge.tsx, ConfidenceMeter.tsx
/ui/command/CommandBox.tsx, StarterChips.tsx, VoiceButton.tsx, ConfirmProposalCard.tsx,
  InlineQuestionCard.tsx, FinanceChips.tsx, TradeoffCards.tsx, WeightsEditor.tsx, ManualEventForm.tsx
/ui/timeline/Road.tsx, EventMarkers.tsx, roadMath.ts, effects.ts, layout.ts (the last three are pure)
/ui/compare/ComparisonSection.tsx (ComparisonVerdict, ComparisonNextStep, ComparisonToggles, ComparisonMore),
  Verdict.tsx, NextStep.tsx, BreakEvenViz.tsx, WhyPanel.tsx, Toggle.tsx, breakEvenMath.ts (pure)
  (not built: AssumptionsEditor, CostCurves. setAssumption exists in the store with no UI yet)
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
  activeScenarioId: string; activeMonth: number; activeVehicleId: string;   // month 0 to 60
  stage: { phase: "reveal" | "interactive" | "transition"; viewMode: "solid" | "wireframe" | "points" };
  question: Question | null;                            // at most one at a time
  ui: { reducedMotion: boolean; lowPerformance: boolean; aiAvailable: boolean;
        leftOpen: boolean; rightOpen: boolean; busy: "idle" | "interpreting" | "simulating" };
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
  };
}
```

## Flows (exact call order)

1. **Start.** `startFromVin`: `validateVin`, `identifyVehicle`, `buildTwin`, then `phase = "reveal"`, `stage.phase = "reveal"`. Invalid VIN shows the reason and creates no twin.
2. **Reveal.** `onRevealStage("solid")` shows specs. `"done"` sets `stage.phase = "interactive"` and `phase = "workspace"`. Skip increments `skipSignal`.
3. **Baseline.** On entering the workspace create `Scenario` id `base` (no events), run `simulate`, store the result, render one timeline node.
4. **Dump.** `submitDump` sets `busy = "interpreting"`, calls `interpret`. If `aiAvailable` is false switch to manual forms. Proposals go to `explore.draftChanges` only.
5. **Confirm.** `confirmDrafts` marks events `confirmed`, calls `fork(activeScenario, minMonth, events, name)`, then `simulate`, then updates the store. Unconfirmed drafts never touch scenarios or the profile.
6. **Question.** After each interpret or confirm call `gapCheck`. Show at most one `InlineQuestionCard`. "I'm not sure" calls `answerQuestion(field, "unsure")`, which applies the labeled default.
7. **Replace.** `openReplaceComparison`: `makeReplaceScenario`, set `stage.phase = "transition"` with `transitionTo` the RAV4, `simulate` both, `evaluate`, show `ComparisonView`. `onTransitionComplete` sets `stage.phase = "interactive"`.
8. **Challenge.** `runBreakEven` then `BreakEvenViz`. Show "no threshold within tested bounds" plainly when `found` is false.
9. **Assumption edit.** `setAssumption` writes to the scenario assumptions, re-simulates affected scenarios, re-evaluates.

You pass data between modules: pass `getSpecs` output and `VehicleConfig` into Dev 4's functions as arguments. Dev 4 never imports `/data`.

## UI rules

- Every number renders through `SourceBadge`: your input, estimated, demo data, listing.
- Every control reads or writes the store. No decorative controls.
- Never show a probability or confidence percentage. Robustness reads "held in X of Y tested cases."
- Vague proposal rows pulse and ask for a number. Inferred rows say "confirm."
- Source labels come from the data, never hardcoded in the component.
- Layout: two pages and nothing else. **Car** (the default): the car, its name, one command bar, and a Car | Future switch at the bottom. No panels, no numbers, no timeline. **Future** is your road: one headline number, one big road, and three quiet text options (Details, Other futures, Compare with a car). The road is the future you are looking at. The straight line is "if nothing changes"; the road bends away from it by how much your decisions changed your net cost (down costs more, up saves money). Each decision is a draggable signpost. The effect ("+$3,763 vs. if nothing changes") is read at the playhead. Other futures only appear on the same road when asked for. Details (what each decision changed, plus the four supporting numbers) only when asked for. Never go back to stacked lanes: separate rows say nothing about what decisions did. The command bar and the switch float on both pages. Everything else (profile, finance, priorities, history, display options, switch car, start over) lives in one "Your details" sheet opened from one header icon. Once you compare with a car the headline becomes the engine's verdict ("Close call" when it is inconclusive, never the raw word), the road tightens, and one next step follows it, all above the command bar. "What would change it" (the break-even bar plus the engine's reruns just below and above the threshold) and "Why" are two more quiet options in the same row as Details and Other futures. A typed question opens them: "would a RAV4 make more sense?" compares, "what would have to change…" runs the break-even. Confirming "Branch timeline" jumps to the Future page. The 3D stage stays mounted on both pages and only fades out behind the road. Never add side panels or HUD numbers to the Car page. The one exception is the car's own four specs (mpg, seats, cargo, price), which appear when the car forms, stay up for 30 seconds so there is time to read them and start turning the car, and then fade out slowly (`ui/reveal/SpecReadout.tsx`). Never show the same number twice.
- Style: black and white only; every gray is white at some opacity. No neon, no glow, no grid, no colored accents. Clean sentence-case type, big light numerals, round icon buttons, solid white primary buttons, like a dark car-maker product page. The one accent is `--fork-accent` in `tokens.css` and it is white today. Source labels differ by shape (dot, hollow dot, dotted dot, square, diamond), and a missing source is an inverted white chip. Casual short copy, no em dashes.

## Tasks

- **B0 Scaffold (hour 0 to 1).** Next.js App Router, TypeScript, Tailwind, shadcn/ui. Folders, copy all `CLAUDE.md` files, add `/contracts` placeholder, `npm test` script, `/docs/HANDOFF.md`.
- **B1 Shell and store (hour 1 to 4).** Theme, layout zones, collapsible panels, store with mocks, `CarStageStub` in place, `SourceBadge`, reduced-motion and low-performance flags.
- **B2 Entry and reveal (hour 4 to 8).** Landing, VIN entry with inline validation (the first screen is your VIN and nothing else; the demo Camry's made-up VIN is one tap, and a car picker sits behind one quiet link), model and year picker, reveal overlay with the rider chips, profile confirm card, left panel. Gate 1.
- **B3 Timeline (hour 8 to 11).** Built early as "the road" (custom SVG, no React Flow): `ui/timeline/Road.tsx` draws the active future as its net cost drift from the baseline (`roadMath.ts`, pure and tested), signposts for every decision (drag or arrow keys, inherited ones read-only), milestone marks, playhead readout, other futures on request. `effects.ts` re-runs a future without each decision to say what it changed (Details). Still to do: edit and delete controls on signposts, the break-even overlay.
- **B4 Command box (hour 8 to 13).** One command bar (voice, manual entry behind a plus), one suggestion that seeds the box without submitting, offline fallback that only extracts what the user wrote (`command/extract.ts`, to move into Dev 3's interpret), live profile card with quoted phrases and certainty styling, confirm flow, inline questions, tradeoff cards, weights editor, manual forms. Gate 2.
- **B5 Comparison (hour 13 to 18).** Done for the demo path (verdict, next step, break-even, why, held in X of Y). Still open: the assumptions editor and cost curves.
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
