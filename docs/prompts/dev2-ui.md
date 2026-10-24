# Developer 2 Prompt Pack (Product UI and Integration)

How to use: one fresh Claude session per prompt. The root `CLAUDE.md`, `/contracts/INTERFACES.md`, and `/ui/CLAUDE.md` should already be in the repo. Paste ONE prompt at a time. When a prompt says "paste summary," paste the end-of-session summary from the session it depends on.

Every prompt ends the same way: Claude prints files created, components with props, and the run or test command.

---

## D2-00 Kickoff (run once)

```
You are helping Developer 2 on Fork, a HackTX 2026 project. Read CLAUDE.md at the repo root, /contracts/INTERFACES.md, and /ui/CLAUDE.md fully.

Confirm back in 10 lines or fewer:
1. The folders I own and the ones I must not touch.
2. The store actions and the exact call order for: start, dump, confirm, replace, break-even.
3. Which modules I import from Developers 1, 3, and 4, and the hour each real one lands.
4. My task order (B0 to B8), the merge-owner duty, and the cut line.

Then wait. Do not write code yet.
```

---

## D2-B0 Repo scaffold (hour 0 to 1)

```
Task: scaffold the Fork repo so all four developers can start.

Do:
1. Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, plus Vitest and React Testing Library. Scripts: dev, build, test, lint.
2. Create folders: /contracts, /contracts/mocks, /data, /ai, /sim, /decision, /ui, /ui/3d, /app/api, /scripts/3d, /public/models, /public/points, /docs.
3. Copy the CLAUDE.md files into place: root, /ui, /ui/3d, /data, /ai, /sim, /decision. Copy INTERFACES.md into /contracts.
4. Create /docs/HANDOFF.md with a table: developer, built, how to call, still mock.
5. Create branches dev1-3d, dev2-ui, dev3-data-ai, dev4-sim from main. Add a PR template with a checklist: builds, tests pass, only touched own folders, HANDOFF.md updated.
6. Add a GitHub Actions or simple npm script that runs build + test so main stays green.
7. Add .env.example with GEMINI_API_KEY and GEMINI_MODEL and add .env* to .gitignore.

Acceptance: fresh clone, npm i, npm run build and npm test pass. All four branches exist.
End with the summary and the exact git commands for the other three developers.
```

---

## D2-B1 Shell, theme, store with mocks (hour 1 to 4)

```
Task: build the app shell, theme, and the store, all running on mocks.

Context: read /ui/CLAUDE.md for the store shape and file map. Import CarStage from /ui/3d (the stub arrives at hour 2; until then create a throwaway local stub with the same props and delete it later). Mocks come from /contracts/mocks as they land; create a minimal local mock loader in /ui/mocks/index.ts with one USE_MOCKS constant per module (car, data, ai, sim).

Build:
1. Theme tokens (tokens.css): near-black background, dark navy surfaces, Toyota red accent, holographic cyan, silver and graphite, subtle grid overlay, elegant technical type.
2. useForkStore.ts with the exact ForkState from /ui/CLAUDE.md, localStorage persistence under "fork:v1" (versioned, safe to clear), and every action stubbed to call the mock modules.
3. Workspace layout: car center (45 to 60% of width) rendering CarStage, command box slot directly under it, collapsible left panel, collapsible right panel, bottom dock for the timeline. Panels collapse smoothly and remember their state.
4. SourceBadge component with variants: your input, estimated, demo data, listing. Used on every displayed number.
5. Reduced-motion detection (prefers-reduced-motion) and a low-performance toggle wired into store.ui.
6. A MOCK banner visible whenever any USE_MOCKS flag is true.

Rules: no decorative controls, every control reads or writes the store.
Acceptance: switching the mock vehicle and dragging the month in a temporary slider updates panels and CarStage props. Build and tests pass.
End with the summary.
```

---

## D2-B2 Landing, reveal overlay, profile confirm (hour 4 to 8)

```
Task: build the entry flow, from VIN to the first workspace.

Context: paste the D2-B1 summary. Real buildTwin lands at hour 6; code against its signature in /contracts/INTERFACES.md and keep USE_MOCKS.data = true until then.

Build:
1. VinEntry.tsx with inline validation via validateVin (show the reason: length, chars, forbidden letter). SampleCarPicker.tsx with the two sample cars. ModelYearPicker.tsx (make, model, year, trim) for the no-VIN path. Invalid input never starts a twin.
2. startFromVin, startFromSample, startFromPicker actions: validateVin, identifyVehicle, buildTwin, then phase = "reveal". Show clear states for invalid, unsupported (decoded specs plus "no exact 3D model, showing a representative model"), and ok.
3. RevealOverlay.tsx: identity text (year, make, model, trim) while particles assemble, a floating chip question "Who rides with you most?" with chips Just me, Partner, Kids, Mixed (calls answerRiders, which sets householdSize and children with source "user"), specs overlay at onRevealStage("solid"), Skip and Replay buttons wired to skipSignal and replaySignal.
4. At onRevealStage("done"): stage.phase = "interactive", phase = "workspace", and create the baseline Scenario (id "base", no events), run simulate, store the result.
5. ProfileConfirmCard.tsx: summary ("2022 Camry SE, 48,000 miles, gas, 28 mpg. Paint: as listed."), every field with a SourceBadge, "Looks right" or tap a row to edit one field.
6. PanelLeft: vehicle identity, history list from getHistory (labeled synthetic), saved scenarios list.

Acceptance (Gate 1 by hour 8): sample VIN to twin to simulate to timeline placeholder to CarStage works with mock AI. Invalid VIN creates no twin. Skip works at any moment of the reveal.
End with the summary.
```

---

## D2-B3 Branching timeline (hour 8 to 11)

```
Task: build the interactive future timeline with React Flow.

Context: paste the D2-B2 summary. Real fork and applyEvents land at hour 8; until then use the sim mocks with the same signatures.

Build FutureTimeline.tsx in the bottom dock:
1. Nodes are real Scenario objects from store.explore.scenarios. Never draw a node that is not a Scenario. Edges go parent to child, placed at the fork month on a 60-month axis.
2. A draggable Scrubber that calls setActiveMonth (0 to 60). Show year ticks.
3. EventMarkers from each scenario's confirmed events (relocation, family change, budget, replacement) and vehicle milestones from SimulationResult.milestones.
4. When a new Scenario appears, animate it growing from its fork month.
5. Clicking a node calls setActiveScenario, and the car, panels, and metrics follow. Highlight the active branch and dim the others.
6. Auto-layout so 4 or more branches never overlap. A baseline-only empty state.
7. Edit, delete, and move event interactions call moveEvent, editEvent, deleteEvent (move is P1, cut first).
8. Metrics under the timeline come from results[activeScenarioId].points at activeMonth: mileage, fuel spend, maintenance spend, vehicle value, net economic cost, each with a SourceBadge.

Acceptance: every visible branch maps to a real Scenario. Clicking and scrubbing change real numbers. Four branches stay usable.
End with the summary.
```

---

## D2-B4 Command box, live profile card, confirm flow (hour 8 to 13)

```
Task: build the brain dump box and everything that turns it into confirmed data.

Context: paste the D2-B2 summary. interpret, gapCheck, mapTradeoffs come from Developer 3 (mocks first, real interpret at hour 13). The contract is in /contracts/INTERFACES.md: interpret returns { aiAvailable, intent, proposals: LifeEvent[] (status "proposed"), profilePatches, question?, unsupportedReason? }.

Build:
1. CommandBox.tsx directly under the car. Placeholder: "Tell me anything: commute, family, budget, plans, what you're worried about." StarterChips: "I'm moving", "Longer commute", "Growing family", "Thinking about a hybrid", "Should I just keep it?" (a chip seeds the text, it does not submit). VoiceButton using the browser SpeechRecognition API into the same text box. A processing indicator while busy = "interpreting".
2. submitDump: calls interpret. Proposals go ONLY to explore.draftChanges. If aiAvailable is false, switch to manual forms.
3. LiveProfileCard.tsx: rows fill as proposals and profilePatches arrive, each showing the value, the quoted phrase, a SourceBadge, and certainty styling: clear (solid), inferred (marked "confirm"), vague (pulsing, asks for a number).
4. ConfirmProposalCard.tsx: "Looks right" confirms all, per-row edit or reject. confirmDrafts marks events confirmed, calls fork(activeScenario, minMonth, events, name), simulate, updates the store. Unconfirmed drafts must change NOTHING.
5. InlineQuestionCard.tsx: after each interpret or confirm call gapCheck and show at most ONE question. Always an "I'm not sure" option that calls answerQuestion(field, "unsure"). FinanceChips (Paid off, Loan, Lease, Not sure) appear only when the user opens the replace comparison.
6. TradeoffCards.tsx: A vs B cards for cost_vs_cargo, longevity_vs_fuel, comfort_vs_cost calling pickTradeoff, then WeightsEditor showing the resulting weights with a nudge control (weights are re-normalized to sum 1).
7. ManualEventForm.tsx rendering the manual-form schema from Developer 3 (or a local copy until it lands) so the app works with no AI.
8. ConfidenceMeter ("Based on 5 of 9 details. Tap to improve."), last and cuttable.

Acceptance (Gate 2 by hour 13): the demo sentence becomes proposals, the card fills, one tap confirms, a new branch appears. With interpret throwing, manual forms still create events. An unconfirmed proposal changes no projection.
End with the summary.
```

---

## D2-B5 Comparison, assumptions, break-even (hour 13 to 18, demo-critical)

```
Task: build the keep vs replace comparison and the break-even visual.

Context: paste the D2-B4 summary. Real evaluate lands at hour 11, findBreakEven and sensitivity at hour 14, nextAction at hour 15; mocks until then. Use Recharts.

Build:
1. openReplaceComparison: makeReplaceScenario(activeScenario, replacementVehicle), set stage.phase = "transition" with transitionTo = the RAV4, simulate both scenarios, evaluate, show ComparisonView. onTransitionComplete sets stage.phase = "interactive".
2. ComparisonView.tsx: keep vs replace side by side. Show the three cost views SEPARATELY (cumulative cash out, remaining assets and liabilities, net economic cost) plus fuel, maintenance, resale, passenger fit, cargo fit. RangeBar.tsx for low/base/high and the text "held in X of Y tested cases". NEVER show a probability or a confidence percent.
3. RecommendationCard.tsx: verdict (keep, replace, or inconclusive), rationale lines that cite modeled factors, the priority weights used, and the nextAction with its official link if present. NextActionCard.tsx for the concrete step.
4. AssumptionsEditor.tsx with SourceBadges. setAssumption recomputes affected scenarios and re-runs evaluate. Priority controls beside the comparison re-run evaluate.
5. BreakEvenViz.tsx: an axis for annual miles or fuel price, the computed threshold, and the user's current value marked. If found is false, show "No threshold within tested bounds (X to Y)" instead of any marker. The user can type a value to reproduce the flip.
6. CostCurves.tsx: net economic cost over 60 months per branch from SimulationResult.points.
7. A "Challenge it" input chip that calls runBreakEven for the parameter named by the intent FIND_BREAK_EVEN.

Acceptance (Gate 3 by hour 18): changing assumptions or priorities visibly changes the comparison, the preferred option can be keep, replace, or inconclusive, and break-even works end to end with at least one real calculation.
End with the summary.
```

---

## D2-B6 Swap mocks for real modules (hour 15 to 20)

```
Task: replace each mock with the real module as handoffs land.

Context: handoff hours are in /contracts/INTERFACES.md. Do ONE module at a time and run the full demo script after each swap. Do not swap two at once.

For each of: car (real CarStage), data (buildTwin, gapCheck, mapTradeoffs, getHistory, getSpecs), ai (interpret, explain), sim (simulate, fork, moveEvent, makeReplaceScenario), decision (assessSuitability, evaluate, findBreakEven, sensitivity, nextAction):
1. Flip its USE_MOCKS flag to false.
2. Fix call-site mismatches in the store only (signatures are frozen; if the real module differs from INTERFACES.md, STOP and tell me which developer owns the fix).
3. Run the 90-second demo script and note anything that broke.
4. Update /docs/HANDOFF.md: this module is now real.

Also verify: Dev 4 functions receive VehicleConfig, DriverProfile, and SpecSheet as ARGUMENTS (you pass getSpecs output in; /sim never imports /data).

Acceptance: all USE_MOCKS are false, the MOCK banner is gone, the demo runs end to end with AI on and with AI off.
End with the summary and a list of any signature mismatches found.
```

---

## D2-B7 Polish and resilience (hour 18 to 21)

```
Task: polish and harden the UI. Do NOT add features.

Do:
1. Empty, loading, and error states for every async action (interpret, decode, model load, simulate).
2. Check layouts at 1280x720, 1440x900, 1920x1080, and 1024x768. Panels collapse cleanly.
3. Audit: every control changes real state (wire or remove). Every number has a SourceBadge. No probability or confidence percentage anywhere.
4. Audit: copy is casual, short, no em dashes.
5. Remove console errors and unused code.
6. Write /docs/DEMO_SCRIPT.md with the exact clicks and text for the 90 seconds: enter the Camry sample VIN, rotate, scrub time, type "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029", confirm, ask "Would switching to a RAV4 Hybrid make more sense?", then "What would have to change for keeping the Camry to be the better option?", read the next action. Include the fallback for each step if AI, the reveal, or the morph fails.

Acceptance: the script runs twice in a row with no errors, with AI on and with AI off.
End with the summary.
```

---

## D2-B8 Deploy and submit (hour 21 to 24)

```
Task: deploy and verify.

Do:
1. Deploy to a Next.js-compatible host (Vercel preferred). Set GEMINI_API_KEY and GEMINI_MODEL as server env vars only.
2. Verify the deployed build: sample VIN, reveal, dump, confirm, replace, break-even, next action.
3. Verify the offline path: remove the key and confirm manual forms work and nothing crashes.
4. Confirm no secrets are in the repo or the client bundle.
5. With Developer 1, record the fallback demo video of the full flow.
6. Write /docs/SUBMISSION.md: repo link, live URL, one-paragraph pitch, the honest limits (two verified 3D cars, synthetic history and finance, AI never does the math), and the team split.

Acceptance: the live URL passes the demo twice, the fallback video exists, and the real submission deadline is met.
End with the summary and a pass/fail table.
```
