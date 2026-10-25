# A6 performance and cleanup report

Measured locally on 2026-10-24 in the Codex in-app Chromium browser using the Vite integration harness. This report stays in Dev 1's owned folder. It does not claim the app shell has been wired or tested end to end.

## Changes

The next model's opaque and transparent shaders are prepared with `WebGLRenderer.compileAsync` before the visible transition starts. The previous car remains interactive during preparation. Failed preparation and loads finishing after unmount dispose the owned clone. A regression test covers the unmount race.

High quality now caps supersampling by stage area at approximately 1920x1080 pixels, with DPR between 1 and 2. Low quality stays at DPR 1. This preserves native resolution at full HD and avoids Windows display scaling turning a 1080p stage into a 2880x1620 buffer. High-quality particle count and lighting remain unchanged. Stages larger than full HD remain at native DPR 1, so this is not a universal two-megapixel limit.

The development harness adds a performance overlay, fixed canvas sizes and a twenty-switch audit. `RendererDiagnostics(): null` emits development-only frame samples; production does not mount it. `stagePixelRatio(width: number, height: number, deviceRatio: number): number` is the new internal export. Public `CarStage` and `preloadCars` signatures are unchanged.

## Measurement method

Each resolution run switches the two preloaded vehicles twenty times, one second apart. Memory and draw calls are captured after each fade. FPS is the number of R3F frames divided by their elapsed time in approximately one-second windows. Worst-frame values are CPU-observed frame intervals, not GPU timer queries. The first window can include resize/setup; the report includes it. Browser/window scheduling and this machine affect results, so these are local diagnostic measurements, not a hardware-independent guarantee.

Sizes are the real `CarStage` CSS container sizes in the isolated harness. High quality used this display's DPR 1.5 before the area cap. Shell layout and physical projector testing remain part of Ishaan's integrated rehearsal.

## Local results

| Canvas CSS size / mode | Render buffer | Mean sampled FPS | Median window-worst frame | Largest frame |
| --- | --- | ---: | ---: | ---: |
| 1024x768 high, before warm-up | 1536x1152 | 82.0 | 86.8 ms | 113.9 ms |
| 1024x768 high, warm-up | 1536x1152 | 85.5 | 48.9 ms | 95.3 ms |
| 1280x720 high | 1920x1080 | 87.5 | 46.8 ms | 78.5 ms |
| 1920x1080 high, before pixel cap | 2880x1620 | 55.5 | 82.7 ms | 123.2 ms |
| 1920x1080 high, capped | 1920x1080 | 86.2 | 53.4 ms | 71.6 ms |
| 1920x1080 low + reduced motion | 1920x1080 | 98.5 | 42.8 ms | 68.8 ms |

Every twenty-switch run returned to Camry **46 geometries / 8 textures / 89 calls**, and RAV4 **39 geometries / 9 textures / 74 calls**. The fade can temporarily render both models and exceed the steady-state draw-call target. No growth appeared in settled counts.

These measurements show improvement, but not a guarantee that every frame meets a 60 FPS budget. Geometry uploads, driver work and scheduling still cause occasional spikes. Use low quality for the most conservative projector setup. No asset detail was removed in this pass.

## Acceptance checks

| Check | Result |
| --- | --- |
| Ten high-quality Camry reveals after warm-up change | PASS: every completion returns to 46 geometries / 8 textures (`a6-reveals.json`) |
| Ten alternating low-quality morphs | PASS: settled counts alternate 39/9 and 46/8 (`a6-morphs-low.json`) |
| Quality change during animation | PASS: incompatible point tiers use the crossfade fallback, then normal morphs resume (`a6-morph-tier-change.json`) |
| Ten alternating mount/unmount cycles | PASS: every unmount returns to empty-studio baseline 0 geometries / 3 renderer-owned textures (`a6-unmounts.json`) |
| Twenty switches at each tested size | PASS: settled counts and steady-state calls return to baseline |
| Skip reveal and skip transition | PASS: remaining callbacks complete and the car remains usable |
| Reduced-motion reveal and transition | PASS: instant reveal, short crossfade, completion callback |
| Missing GLB and recovery | PASS: clear 404 message, prior car remains visible, selecting a valid car recovers; orbit/reset still work |
| Two consecutive 3D flows in a clean session | PASS: skipped reveal/morph followed by reduced-motion reveal/morph; no console errors before the deliberate missing-GLB test |
| Frame pacing | IMPROVED: local measurements above; occasional switch-frame spikes remain |
| Tests and build | PASS: 641 tests / 52 files, TypeScript, scoped ESLint, Next production build |
| Credits | PASS: both manifest entries retain CC BY 4.0 attribution; derived samples have `public/points/CREDITS.txt` |
| Full-app VIN flow and physical projector | PENDING: requires Dev 2 wiring and team rehearsal |

The final 3D flow checks cover only the renderer contract. The deliberate missing-model request produces an expected HTTP 404; it is not counted as an unexpected console error. GPU counters measure resource counts, not total GPU bytes.

## Integration boundary

This checkout still has `USE_MOCKS.car = true` in `ui/mocks/index.ts`. Ishaan must select the real `CarStage` and `preloadCars` through his facade, then exercise the VIN-to-reveal and replacement flow. Dev 1 has not edited those UI files.

## Reproduction

```sh
node node_modules/vite/bin/vite.js --config scripts/3d/stub-vite.config.mts
npx vitest run ui/3d
npx tsc --noEmit
npx eslint ui/3d scripts/3d/stub-preview.tsx
npm run build
```

Open `/scripts/3d/stub-preview.html` on port 4174. Choose Stage size and quality, then Audit 20 switches. The other audit buttons run ten reveals, ten morphs or ten mount/unmount cycles. Raw evidence is in `scripts/3d/a6-*.json`; previous A4/A5 measurements remain available separately.
