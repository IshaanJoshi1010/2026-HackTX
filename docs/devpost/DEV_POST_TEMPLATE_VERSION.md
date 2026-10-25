---
title: "Fork: Making a car decision feel like exploring a future"
published: false
description: "How we built a Toyota ownership explorer with particle reveals, branching futures, and AI that never does the math."
tags: mlhacks, devchallenge, hackathon
---

<!-- CONFIRM: In the DEV editor, set the AI Disclosure honestly. This post was drafted with AI help from the repo draft. -->
<!-- CONFIRM: Publish from the DEV account linked to your MLH hackathon registration. One account only. This draft stays in "we" voice so you can post it. Kareem's original is first person and would have to be posted by Kareem. -->
<!-- CONFIRM: Read the rest of the DEV editor below Partner Technologies. If it asks for more sections, send them back before you publish. -->

_This is a submission for the [MLH x DEV Writing Challenge](https://dev.to/mlh-hackathon)_

# Fork: Making a car decision feel like exploring a future

A car decision usually starts with something that has nothing to do with cars. A move. A longer commute. A growing family. Then you open a calculator and try to turn your life into a spreadsheet.

We built **Fork** at HackTX 2026 for the Toyota Financial Services "What's Your Next Move?" challenge. You describe what is changing, explore different ownership futures, and ask what would make one choice better than another.

The answer is allowed to be "keep your car." It is also allowed to be "it's a close call."

## What I Built

Fork is a digital twin for one Toyota. You enter a VIN, a 3D model assembles from particles, and you type a plain-language brain dump. The app turns that into dated events. Nothing counts until you confirm them. The timeline then splits, and deterministic TypeScript simulates five years on each branch: mileage, fuel, maintenance, depreciation, loan balance, and net cost.

Ask whether a 2024 RAV4 Hybrid XLE makes more sense than a 2022 Camry SE, and Fork compares keep and replace. Ask what would have to change, and it searches for a break-even. It ends on one next step. That step can be to keep the car.

**The AI never does the math.** Gemini turns words into structured events and explains numbers it was handed. The same inputs always produce the same simulation. VIN decode uses NHTSA vPIC. Fuel economy comes from EPA data. The demo also runs with Gemini and the network unavailable, on seeded data and a rules parser. We do not claim perfect extraction.

Kareem built the viewer in Three.js, React Three Fiber, and Drei. Particles are sampled from the mesh into binary files, with matching point counts on both cars. The reveal gathers them into the body, then a wireframe, then solid paint. The morph pairs nearby surface regions with Morton ordering, a spatial approximation rather than a mapping of doors to doors. Motion runs in the vertex shader, with skip, reduced motion, a lower quality tier, and a crossfade fallback.

One bug only showed up in the picture. After a morph, the RAV4 windows looked broken because imported glass was opaque and no longer wrote depth, so the cabin could draw over it. Restoring depth writes fixed the windows. Tests and GPU counts had missed it. Comparing a fresh load with the frame after a morph caught it.

**Both models are representative, not exact.** The Camry asset is a newer generation than the 2022 Camry SE. The RAV4 asset is a 2021 Adventure, not a 2024 Hybrid XLE. A VIN does not give paint, mileage, history, or anything about the driver.

**Driver and finance data are synthetic.** That includes the demo persona, service history, loan balances, listings, and sample VINs. Depreciation, maintenance, insurance, purchase terms, and trade-in values are illustrative assumptions. The dollar figures below are model outputs, not quotes.

## Demo

<!-- CONFIRM: Open https://fork-hacktx.vercel.app in a private window and confirm it is this app before you publish. Leave this link out if it does not load. -->
<!-- CONFIRM: Paste Paarth's unlisted YouTube demo URL here. Do not publish a missing or private-broken video link. -->
<!-- CONFIRM: Add a .tech domain here only after it loads this same app over HTTPS. Until then, keep the Vercel URL. -->

Try it: [fork-hacktx.vercel.app](https://fork-hacktx.vercel.app)

The demo follows Alex, a fictional driver in Austin with a 2022 Camry SE and 48,000 miles. The sample VIN is `4T1G11AK1NU900001`. Alex is moving to Denver next year, planning to drive 20,000 miles a year, and expecting a second child in 2029.

Confirm those events and the timeline branches. Ask whether a RAV4 Hybrid makes more sense. On balanced priorities the verdict is **Close call**. Keeping the Camry costs **$31,287** over five years. Replacing it costs **$35,862**. The RAV4 spends about **$1,400** less on fuel over that period, and fuel savings alone do not settle the decision.

Ask what would make keeping the Camry the better option. Keeping wins below **14,434 miles a year**. Alex is planning on 20,000. No fuel price between **$2 and $8** a gallon flips this scenario, and Fork says so instead of inventing a threshold. The close-call verdict held in **9 of 9 tested cases** across the depreciation and fuel-price combinations we ran. That is a count, not a probability.

The next step is specific: reevaluate if driving drops below 14,434 miles a year.

## Partner Technologies

**Gemini.** Server-side only. It turns a brain dump into proposed events, each with a quote and a certainty, and it explains a decision and a simulation it was given. Zod checks the extraction. A number check rejects any figure in an explanation that was not in that input, and the route then uses a deterministic template. The configured model is `gemini-3.1-flash-lite`. Calls are time-bounded and pass through a per-process rate gate. If the key is missing or the call fails, the demo still runs on the offline reader and still shows the computed verdict. This draft does not claim that a live generation succeeded on the deployed site.

<!-- CONFIRM: On the live site, open a comparison and trigger Why. Inspect the /api/explain response. Say live Gemini is working only if x-fork-ai-status is ready and the body has usedFallback false. If it fell back, leave the paragraph above unchanged. -->

**Snowflake.** Public facts for the two supported cars are stored for explanations: model identity, seats, cargo, combined MPG, and an illustrative MSRP, each with a source. The hosting setup names the table `FORK.VEHICLES.VEHICLE_KNOWLEDGE`, read server-side with the read-only role `FORK_READ`. Gemini does not write SQL. If Snowflake is unconfigured or unreachable, the route uses a seeded local fixture and labels that path. A local check retrieved the records. This draft does not claim the production site is reading Snowflake.

<!-- CONFIRM: The live /api/explain headers should be x-fork-data-source snowflake, x-fork-data-status ready, and x-fork-ai-status ready. Do not say production Snowflake is live until those three say so. -->

**SerpApi.** `GET /api/dealers` looks up Toyota dealers through SerpApi's Google Maps engine when a key is set, with a 3 second timeout. Austin and Denver also have saved snapshots. No key, a timeout, a quota error, or a bad response returns the snapshot and says the details may have changed. The route returns names, addresses, ratings, phones, and links. It does not claim inventory, prices, or a booking. This draft does not claim the deployed site is returning live dealer results.

<!-- CONFIRM: Call /api/dealers?city=Austin,%20TX on the live site. Keep any "live results" wording only if the JSON source is "live". If source is "snapshot", describe the snapshot fallback or delete this paragraph. -->

## Built with

Next.js, React, TypeScript, Tailwind, shadcn/ui, Zustand, Three.js, React Three Fiber, Drei, Zod, Gemini, Snowflake, SerpApi, NHTSA vPIC, and EPA fuel economy.

<!-- CONFIRM: Team line. Delete any name someone does not want on a public post. -->

Kareem built the 3D, Ishaan the product UI, Paarth the data and AI, and Anirudh the simulation.

## Credits

The vehicle models are other creators' work, adapted for Fork. Their use does not imply endorsement by the creators or by Toyota.

- **Camry:** ["toyota camry v80"](https://sketchfab.com/3d-models/toyota-camry-v80-98c70e5aa53446728fea4d8f448bbf33) by [sultan](https://sketchfab.com/s122), licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Modified for Fork: normal-aware mesh simplification, scale, centering, grounding, and Draco compression. This is a newer-generation representative model, not an exact 2022 Camry SE. The paint name and hex are synthetic demo choices from our listing snapshots, not a verified vehicle paint match.
- **RAV4:** ["2021+Toyota+RAV4+Adventure"](https://sketchfab.com/3d-models/2021toyotarav4adventure-366c46f72db64da2ac09777458506092) by [luisandradeandrade762](https://sketchfab.com/luisandradeandrade762), licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Modified for Fork: CAD edge removal, mesh simplification, orientation, scale, grounding, and Draco compression. The source is a 2021 Adventure, not a 2024 Hybrid XLE. The paint name and hex are synthetic demo choices from our listing snapshots, not a verified vehicle paint match.

## What we are taking away

The 3D work makes a question visible. The more important product decision is leaving room for uncertainty. A polished animation should help someone understand a comparison, not make an inconclusive result feel like a sales pitch.

Fork can show a different future without insisting that you buy it.

**The future branches. Explore yours.**
