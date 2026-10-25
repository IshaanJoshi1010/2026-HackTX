# Fork: pitch kit

Tagline: **The future branches. Explore yours.**

Challenge: Toyota Financial Services, "What's Your Next Move?"

Owner: Anirudh (proposed by Ishaan). Numbers come from `sim/DEMO.md` and are pinned by `decision/__tests__/demoStory.test.ts`. If that test changes, update this file.

---

## The 90-second demo (story A)

The persona is Alex, fictional, in Austin, TX: a 2022 Camry SE with 48,000 miles. All driver and finance data is synthetic.

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 to 0:15 | Enter the Camry sample VIN. Particles assemble into the car. Rotate it. | "This is Alex's actual car, a 2022 Camry SE, built from its VIN. Fork is a digital twin for Toyota owners." |
| 0:15 to 0:25 | Camry state and the 5-year timeline. Scrub through time. | "Here's the next five years if nothing changes: mileage, fuel, service, value, loan. Every number is computed, not guessed." |
| 0:25 to 0:45 | Type the brain dump: "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029." The card fills in. One tap confirms. The timeline splits. | "Alex just talks. The AI turns that into three dated events. Nothing counts until Alex confirms, and then the future branches." |
| 0:45 to 1:00 | "Would switching to a RAV4 Hybrid make more sense?" The car morphs to a RAV4. Keep vs replace appears. | "Honestly? It's a close call. Keeping the Camry costs less over five years, about $31,300 vs $35,900. The RAV4 saves about $1,400 in fuel and has more life left. On balanced priorities, Fork won't pretend there's a winner." |
| 1:00 to 1:15 | "What would have to change for keeping the Camry to be the better option?" The break-even visual. | "Fork searched for it. Below about 14,400 miles a year, keeping the Camry wins. Alex is planning on 20,000. Type in 14,000 and you'll see the flip yourself." |
| 1:15 to 1:30 | Recommendation and next step. | "So the next move is concrete: reevaluate if your driving drops below 14,434 miles a year. That verdict held in 9 of 9 tested cases. Sometimes the best next move is keeping your car, and Fork can say that." |

Closing line, if there's time: **"The future branches. Explore yours."**

### Numbers on stage

| Claim | Value | Source |
| --- | --- | --- |
| Verdict | Close call (inconclusive, 0.50 vs 0.50, within the 0.05 margin) | `evaluate` |
| 5-year net cost | Keep about $31,300, replace about $35,900 | `simulate` |
| Fuel saved by the RAV4 | about $1,400 over 5 years | `simulate` |
| Break-even | Keeping wins below 14,434 mi/yr (Alex plans 20,000) | `findBreakEven` |
| Fuel price break-even | None between $2 and $8 per gallon | `findBreakEven` |
| Robustness | Held in 9 of 9 tested cases | `sensitivity` |
| Next step | "Reevaluate if your driving drops below 14,434 mi/yr" | `nextAction` |

Say "about" for the dollar figures. They're illustrative model outputs, not quotes.

---

## Pitch honesty (all four of us should be able to say this)

- **What scales, and what doesn't yet.** The simulation and recommendation engines take any vehicle as data: a vehicle config plus a spec sheet. VIN decode is built on NHTSA vPIC. For this hackathon we built spec sheets and 3D for two cars, the 2022 Camry SE and the 2024 RAV4 Hybrid XLE. Both 3D models are labeled **representative**, not exact. Adding more cars is a data, licensing and asset problem, not an engine rewrite.
- **Synthetic data.** Service history, loan balances, lease terms, listings and sample VINs are synthetic until Toyota or TFS provides access. The connection layer is an interface (`ConnectionProvider`), so real data replaces the synthetic provider without UI changes.
- **The AI never does the math.** Gemini turns words into structured events and explains computed results. Every number on screen comes from deterministic TypeScript, and the same inputs always give the same outputs.
- **No break-even? We say so.** A comparison may genuinely have no break-even point in the tested range. Here, no fuel price between $2 and $8 changes the verdict, and Fork says so instead of inventing one.
- **Illustrative assumptions.** Depreciation curves, maintenance costs, insurance ($130 a month by default), purchase terms (6.25% tax, $450 fees, 10% down, 6.5% APR) and trade-in values are illustrative. The full list is in `sim/README.md`.
- **No upsell bias.** The engine can and does return "keep" and "inconclusive". It never assumes a growing family means an SUV.
- **Robustness is a count.** "Held in 9 of 9 tested cases" is a count across the depreciation and fuel price combinations we tested, not a probability.
- **Live AI status.** Paarth's live Gemini evaluation is not complete (see `ai/LIVE-EVALUATION.md`). Don't claim the extraction is perfect. The full demo runs offline with seeded data, so the story doesn't depend on the network.

### Hard questions, short answers

- **"Why no winner?"** The RAV4 saves fuel and has more life left, but costs more to own over five years. On balanced priorities those cancel out within our margin. Change the priorities or the miles and the verdict moves, and you can watch it happen.
- **"Doesn't a second kid mean an SUV?"** Only if the family needs more cargo space or car seats, and Alex has to say so. Fork extracts, it never invents.
- **"Are these real prices?"** No. They're illustrative and synthetic, and labeled that way on screen.
- **"How would TFS use this?"** It's a customer-first next-move tool: plug in real account and vehicle data through `ConnectionProvider` and the same engine produces a TFS next step. That next step can honestly be "keep your car".

---

## Devpost description

### Inspiration

Car decisions are life decisions. A move, a new job or a new kid changes what car makes sense, but most tools either sell you the next car or bury you in spreadsheets. We wanted something that starts from your life, shows you the futures honestly, and is allowed to say "keep your car."

### What it does

Fork is an AI digital twin for Toyota owners. Enter a VIN and a 3D model of your car assembles from particles. Type what's changing in your life in plain words. Fork extracts structured, dated events, and you confirm them. Your timeline then splits into branches, and deterministic code simulates five years of ownership for each one: mileage, fuel, maintenance, depreciation, loan balance and net cost. Ask "would a RAV4 Hybrid make more sense?" and Fork compares keep vs replace with a transparent weighted score. Ask "what would have to change?" and it searches for the exact break-even. It ends with one concrete next step, and that step can be "keep your car."

### How we built it

- **Frontend:** Next.js, React, TypeScript, Tailwind, shadcn/ui and Zustand for state. The 3D is Three.js with React Three Fiber and Drei, with a particle reveal and a Camry-to-RAV4 morph.
- **Data and AI:** NHTSA vPIC VIN decode, EPA fuel economy data, synthetic listing snapshots, and Gemini (server-side only) for extraction and explanation, with an offline fallback.
- **Simulation and decisions:** plain TypeScript pure functions. The accounting identity keeps cash, assets and net cost separate, so nothing is double counted. Event branching is immutable. Suitability, hard constraints, normalized weighted scoring with an inconclusive margin, bisection break-even, and sensitivity reported as "held in X of Y."
- **Contracts:** shared TypeScript types plus Zod schemas, frozen at hour one, so four developers could build in parallel against mocks.

### Challenges we ran into

- Keeping the AI out of the math. Every displayed number had to trace to deterministic code. An automated audit checks that each dollar figure in the rationale is a simulated value.
- Avoiding upsell bias. With only two options, plain min-max scoring made the newer car win every small difference. We added a transparent "meaningful difference" floor so a $50 fuel gap can't swing a whole priority.
- Being honest when there's no answer: inconclusive verdicts, "no break-even within the tested range," and "needs verification" for car seat fit instead of a guess.

### Accomplishments we're proud of

- The same inputs give byte-identical outputs, checked over 100 reruns of the full pipeline.
- A branch never rewrites its parent's history, and moving an event leaves earlier months identical.
- The whole demo runs offline.

### What we learned

Honest uncertainty is a feature. "It's a close call, and here's exactly what would change it" is more useful, and more trustworthy, than a confident wrong answer.

### What's next

Real TFS account and vehicle data through `ConnectionProvider`, more Toyota models (spec sheets and licensed 3D assets), verified car seat and cargo fit data, and real local fuel prices.

### Built with

typescript, nextjs, react, tailwindcss, shadcn-ui, zustand, three.js, react-three-fiber, drei, zod, gemini, nhtsa-vpic, epa-fuel-economy, vitest

---

## Before we present

- [ ] `npx vitest run decision/__tests__/demoStory.test.ts` passes (the numbers above are still true).
- [ ] The UI shows "Close call", the break-even and the next step (see the wiring notes sent to Ishaan).
- [ ] The demo entry loads Alex through Paarth's `buildDemoTwin` (cargo need low, priorities equal, no trade-off picks).
- [ ] Offline run-through with Wi-Fi off.
- [ ] Fallback video recorded.
