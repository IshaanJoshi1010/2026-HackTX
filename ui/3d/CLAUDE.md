# Developer 1: 3D Experience (`/ui/3d`, `/public/models`, `/public/points`, `/scripts/3d`)

Read the root `CLAUDE.md` and `/contracts/INTERFACES.md` first. Copy this file to `/ui/3d/CLAUDE.md`.

## Mission

Own everything inside the 3D canvas: the car model, lighting, paint, the particle reveal, and the Camry to RAV4 morph. Developer 2 owns everything around the canvas and imports only `CarStage` and `preloadCars` from you.

## You own / you do not own

| You own | You do not own |
| --- | --- |
| `/ui/3d`, `/public/models`, `/public/points`, `/scripts/3d` | Shell, panels, timeline, command box, comparison (Dev 2) |
| Asset vetting, prep, compression, `manifest.json` | Registry and specs (Dev 3 reads your manifest) |
| Sampling scripts, shaders, dispose logic | Simulation, decisions, AI (Dev 3 and 4) |

Never edit outside your folders. Need something from another developer? Write it down as a request.

## File map

```text
/ui/3d/
  CarStage.tsx, CarStageStub.tsx, Scene.tsx, VehicleModel.tsx
  paint.ts            applyPaint(scene, bodyMaterialName, hex)
  viewModes.ts        solid, wireframe, points material swaps
  ParticleReveal.tsx, ParticleMorph.tsx, usePointsFile.ts, dispose.ts
  shaders/reveal.vert.glsl, reveal.frag.glsl, morph.vert.glsl
  __tests__/
/scripts/3d/inspect-glb.mjs, prep-glb.mjs, sample-points.mjs
/public/models/camry-2022-se.glb, rav4-hybrid-2024-xle.glb, manifest.json
/public/points/camry-2022-se.bin, rav4-hybrid-2024-xle.bin
```

## Your public interface

`CarStage` and `preloadCars` exactly as in `/contracts/INTERFACES.md`. Do not add required props without Dev 2 agreeing. Ship `CarStageStub` with the final props by hour 2.

## Spec you must hit

| Item | Spec |
| --- | --- |
| Triangles per car | 200,000 or fewer |
| GLB size | 10 MB or less, Draco or meshopt |
| Textures | 2048 px max side |
| Draw calls | 150 or fewer |
| Orientation | Length 4.6 units on X, centered at origin, wheels on y = 0 |
| Camera | Start [4.8, 1.6, 5.6], fov 35, damping 0.08, distance 3.5 to 9, max polar 1.5 rad |
| Pixel ratio | Capped at 2 (1 in low quality) |
| Body paint | `MeshPhysicalMaterial` metalness 0.6, roughness 0.28, clearcoat 1, clearcoatRoughness 0.05 |
| Particles | 32,768 high, 8,192 low, identical count for both cars |
| Reveal | converge 0 to 2.0 s, point cloud 2.0 to 2.5, wireframe 2.5 to 3.0, solid 3.0 to 4.0 |
| Morph | 0.3 s solid to points, 1.2 s morph, 0.3 s solid in, total 1.8 s |
| Reduced motion | Instant solid, no particles |

## Tasks

- **A0 Asset gate (hour 0 to 1, hard checkpoint).** Ask the Toyota reps for CAD first. Then Sketchfab (downloadable, CC-BY ok, avoid NonCommercial) and TurboSquid or CGTrader. Check generation (Camry 2018 to 2024, RAV4 2019 to 2024), a separate recolorable body material (not baked), triangle count, format, and the SE front end against the listing photos. No exact match by hour 1 means `representative`. Send Dev 3: model, year, trim, paint name, paint hex, match status.
- **A1 Stub (hour 1 to 2).** `CarStageStub` and `preloadCars` stub with final props.
- **A2 Viewer (hour 2 to 6).** `useGLTF`, preload both. Body material by `bodyMaterialName`, fallback first material matching `/body|paint|carpaint|exterior/i`. Drei `Environment`, contact shadows. Orbit, zoom, reset. Wireframe is a material swap. Switching vehicle crossfades, never a blank canvas. `disposeObject` on unmount. A visible "Representative model" label when `matchStatus` is not exact.
- **A3 Sampling (hour 6 to 9).** `MeshSurfaceSampler`, area weighted, seeded random, same N for both cars, same normalization as the GLB, written as Float32Array to `/public/points`. Points view mode.
- **A4 Reveal (hour 9 to 14).** All motion in the vertex shader (`aStart`, `aTarget`, `aDelay`, `uProgress`). Never move particles in JS per frame. Cyan #27E1FF, additive blending, about 2 px. Skip, replay, reduced motion, low quality. Fire `onRevealStage` at each stage.
- **A5 Morph (hour 14 to 18).** Attributes `aFrom`, `aTo`. Paint hex tweens during the morph. A `forceFallback` constant switches to a scan-line cross-fade. Fire `onTransitionComplete`.
- **A6 Performance pass (hour 18 to 21).** 10 mount and unmount cycles, record `renderer.info.memory` geometries and textures before and after. Test low quality, reduced motion, and a 1024x768 projector size.

## Rules

1. Never block interaction. Skipping or disabling the reveal leaves a fully usable app.
2. Never claim `exact` in the UI. Show the label for the `matchStatus` you are given.
3. Do not read or compute any simulation value. You render what you are told.
4. No leaks: dispose geometries, materials, textures, and render targets.
5. Casual short copy, no em dashes.

## Definition of done

- [ ] Both cars load, rotate, zoom, reset, recolor, and switch.
- [ ] Reveal completes in 4 s or less and skip works at any moment.
- [ ] Morph plays when `phase` becomes `transition` and ends on an interactive RAV4. The fallback also works.
- [ ] 10 mount and unmount cycles return geometry and texture counts to baseline.
- [ ] Manifest and licenses are committed, credits included where required.

## Cut line (cut in this order)

Wireframe mode, point-cloud mode, low-quality tuning, reveal polish. Never cut A2, a working reveal, or a morph with the cross-fade fallback.

## Hours

0 to 1 A0. 1 to 2 A1. 2 to 6 A2. 6 to 9 A3. 9 to 14 A4. 14 to 18 A5. 18 to 21 A6. 21 to 24 help Dev 2 rehearse and record the fallback video.

## Session hygiene

One task per Claude session. End each session by printing: files created, exports with signatures, and the run or test command.
