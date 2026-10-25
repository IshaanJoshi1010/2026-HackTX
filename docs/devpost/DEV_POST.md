---
title: "Fork: Making a car decision feel like exploring a future"
published: false
description: "How we built a Toyota ownership explorer with particle reveals, branching futures, and AI that never does the math."
tags: hackathon, webdev, threejs, ai
---

<!-- Review draft for Ishaan. Do not publish automatically. Pitch claims and demo numbers sourced from docs/PITCH.md at origin/main commit 36d0299. -->

# Fork: Making a car decision feel like exploring a future

A car decision usually starts with something that has nothing to do with cars. A move. A longer commute. A growing family. Then you open a calculator and try to translate your life into a spreadsheet.

We built **Fork** at HackTX 2026 for the Toyota Financial Services “What's Your Next Move?” challenge. It lets you describe what is changing, explore different ownership futures, and ask what would make one choice better than another.

The answer is allowed to be “keep your car.” It is also allowed to be “it's a close call.”

I'm Kareem, and I worked on the 3D experience. My part was making that decision visible: a VIN-led entry, a car assembling from particles, and a Camry transforming into a RAV4 when you explore replacing it.

## Start with a car, then branch the future

Our demo follows Alex, a fictional driver in Austin with a 2022 Camry SE and 48,000 miles. Alex plans to move to Denver, drive 20,000 miles annually, and welcome another child.

The sample VIN starts the vehicle flow. A particle cloud gathers into a recognizable car, resolves through a wireframe, and becomes a solid model you can rotate. Fork then shows an ownership timeline. Describe a life change, review the extracted events, and confirm them before they affect a branch.

Ask whether switching to a RAV4 Hybrid makes more sense, and the visual changes with the question. The Camry becomes a particle silhouette, flows toward the RAV4's shape, and settles into the replacement vehicle.

That animation is there to connect the comparison to something tangible. The decision still comes from the ownership model.

## The result is intentionally a close call

In the pitch scenario, keeping the Camry costs **about $31,300 over five years**, compared with **about $35,900** for replacing it. The RAV4 saves **about $1,400 in fuel** over that period, but fuel savings alone do not settle the decision.

With balanced priorities, Fork reports **Close call**. When Alex asks what would change that answer, the engine searches for a break-even: keeping wins below **14,434 miles per year**, while Alex plans to drive **20,000**.

The next step is specific: reevaluate if your driving drops below that threshold. The verdict held in **9 of 9 tested cases** across the tested depreciation and fuel-price combinations. That is a count, not a probability or a promise about the future.

There is also no fuel-price break-even between **$2 and $8 per gallon** in this scenario. Fork says so instead of inventing one.

These dollar figures are illustrative model outputs, not quotes.

## The AI never does the math

This boundary shaped the whole project: **the AI never does the math**.

Gemini turns natural language into structured events and explains results it receives. The user confirms the events. Deterministic TypeScript computes the ownership costs, comparisons, break-even searches, and sensitivity results. The same inputs produce the same outputs.

The frontend uses Next.js, React, TypeScript, Tailwind, shadcn/ui, and Zustand. Shared TypeScript contracts and Zod schemas let the team work against stable interfaces while the individual pieces came together. VIN decoding uses NHTSA vPIC, and fuel-economy data comes from the EPA.

Live AI evaluation is still incomplete. We do not claim perfect extraction. The demo also has an offline path with seeded data and a fallback, so the story does not depend on a live AI response.

## Building the particle transition

I built the viewer with Three.js, React Three Fiber, and Drei. The rendering work started before the animation: preparing licensed GLB assets, removing redundant geometry, aligning their orientation and scale, grounding them, and compressing them with Draco.

The particles come from sampled mesh surfaces. A seeded random generator makes the samples reproducible, and both cars use matching point counts within each quality tier. The samples are stored as binary files, so the browser can load them without resampling the models during a transition.

For the reveal, particles gather along an orbital ribbon around the vehicle. A spatial delay makes the assembly travel across the body. Easing slows the movement as the particles settle, then the wireframe and solid paint take over.

For the morph, I use Morton ordering to pair nearby regions of the sampled surfaces. It is a spatial approximation, not a semantic mapping of doors to doors or wheels to wheels. The vertex shader moves the particles along curved paths between the silhouettes. Larger shape changes take wider arcs, while closer matches stay near the body.

All particle motion runs in the vertex shader. The CPU updates progress uniforms instead of rewriting particle positions each frame. Opaque bodywork dissolves through alpha-hashed surface coverage, avoiding the look of overlapping transparent shells.

The viewer also has skip controls, reduced-motion behavior, a lower-cost quality tier, and a crossfade fallback when a particle morph is unavailable. Temporary geometry and materials are disposed when the effect finishes or the viewer unmounts.

## The bug that changed how I checked the result

One lesson came after the morph looked finished. The RAV4's windows appeared broken because cabin geometry could draw over them. I had made imported glass opaque without restoring depth writing. Fixing that setting restored the windows' ability to hide the interior behind them.

The RAV4 also exposed a separate asset-preparation problem: aggressive simplification made glossy surfaces look fractured. I rebuilt it with normal-aware simplification, preserved the windows, gave visible bodywork and wheels more detail, and regenerated its particle samples.

Passing tests and stable GPU resource counts were useful, but they had not caught those visual defects. Comparing a fresh model load with the final frame after a morph was essential. I added a regression test for the glass state after transition completion.

## What the demo represents

**Both car models are representative.** The Camry asset depicts a newer generation than the demo's 2022 Camry SE. The RAV4 asset depicts a 2021 Adventure, rather than the demo's 2024 Hybrid XLE. A VIN does not reconstruct a particular owner's bodywork, paint, condition, or cabin.

**All driver and finance data is synthetic.** That includes the demo persona, service history, loan balances, lease terms, listings, and sample VINs. Paint choices are illustrative, not verified against an owner's vehicle. Depreciation, maintenance, insurance, purchase terms, and trade-in values also rely on illustrative assumptions.

The project is an ownership exploration prototype. Connecting real account and vehicle data is future work through the `ConnectionProvider` interface. Expanding the vehicle catalog also requires suitable specifications and licensed assets.

## Credits for the cars

The vehicle models are other creators' work, adapted for Fork:

- **Camry:** [“toyota camry v80”](https://sketchfab.com/3d-models/toyota-camry-v80-98c70e5aa53446728fea4d8f448bbf33) by [sultan](https://sketchfab.com/s122), licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). We modified it with normal-aware mesh simplification, scaling, centering, grounding, and Draco compression, and derived surface samples for the particle effects.
- **RAV4:** [“2021+Toyota+RAV4+Adventure”](https://sketchfab.com/3d-models/2021toyotarav4adventure-366c46f72db64da2ac09777458506092) by [luisandradeandrade762](https://sketchfab.com/luisandradeandrade762), licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). We removed CAD edge lines, applied normal-aware mesh simplification while preserving window geometry, adjusted orientation and scale, centered and grounded the model, applied Draco compression, and derived surface samples for the particle effects.

Both assets also receive material and paint adjustments in the viewer. Their use does not imply endorsement by the creators or Toyota.

## What I am taking away

The satisfying part of the 3D work was making the transition feel connected to the user's question. But the more important product decision was leaving room for uncertainty. A polished animation should help someone understand a comparison, not make an inconclusive result feel like a sales pitch.

Fork can show a different future without insisting that you buy it.

**The future branches. Explore yours.**
