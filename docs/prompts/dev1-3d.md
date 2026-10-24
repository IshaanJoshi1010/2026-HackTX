# Developer 1 Prompt Pack (3D Experience)

How to use: one fresh Claude session per prompt. The root `CLAUDE.md`, `/contracts/INTERFACES.md`, and `/ui/3d/CLAUDE.md` should already be in the repo so Claude loads them. Paste ONE prompt at a time. When a prompt says "paste summary," paste the end-of-session summary from the session it depends on.

Every prompt ends the same way: Claude prints files created, exports with signatures, and the run or test command.

---

## D1-00 Kickoff (run once)

```
You are helping Developer 1 on Fork, a HackTX 2026 project. Read CLAUDE.md at the repo root, /contracts/INTERFACES.md, and /ui/3d/CLAUDE.md fully.

Confirm back in 10 lines or fewer:
1. The folders I own and the ones I must not touch.
2. The exact CarStage props I must ship and the hour I owe Developer 2 the stub.
3. My task order (A0 to A6) and the cut line.
4. The reveal and morph timing numbers.

Then wait. Do not write code yet.
```

---

## D1-A0 Asset gate (hour 0 to 1, hard checkpoint)

```
Task: help me vet 3D models for a 2022 Toyota Camry SE and a 2024 Toyota RAV4 Hybrid XLE.

I will paste candidate links or describe downloaded files. For each candidate give a verdict (use, use as representative, reject) based on:
- License (CC-BY ok with credit text; reject NonCommercial or no-derivatives) and the credit line to commit
- Generation (Camry 2018 to 2024, RAV4 2019 to 2024)
- A separate recolorable body material (not baked into a texture)
- Triangle count (200k or fewer) and file size (10 MB or less compressed)
- Format (GLB or glTF)
- Front end match against the listing photos (the SE grille is distinct)

Build /scripts/3d/inspect-glb.mjs using @gltf-transform/core. Given a GLB path it prints: triangle count, mesh count, material names, texture count and max texture size, bounding box, and a "body paint candidate" guess (material names matching body, paint, carpaint, exterior).

Also draft /public/models/manifest.json with one entry per car using the ManifestEntry type in /contracts/INTERFACES.md (vehicleId "camry-2022-se" and "rav4-hybrid-2024-xle").

End by printing a table of chosen assets and the exact values I must send Developer 3: model, year, trim, paint name, paint hex, match status. Do not build UI.
```

---

## D1-A1 CarStage stub (hour 1 to 2)

```
Task: ship CarStageStub so Developer 2 is unblocked.

Context: read /contracts/INTERFACES.md. CarStageProps there is frozen. Do not add required props.

Build in /ui/3d:
1. CarStage.tsx that, for now, re-exports CarStageStub.
2. CarStageStub.tsx: an R3F canvas with a grey box roughly car-sized (length 4.6 on X, wheels at y 0), orbit controls with the camera values from INTERFACES.md, and a label showing vehicle.model and matchStatus.
3. It must honor every prop in a fake way: phase "reveal" fires onRevealStage("converge"), then "pointcloud", "wireframe", "solid", "done" on a timer matching the timing spec (0, 2.0, 2.5, 3.0, 4.0 s) unless skipSignal increments or reducedMotion is true (then jump to "done" immediately). phase "transition" fires onTransitionComplete after 1.8 s. resetCameraSignal resets the camera. viewMode changes the box material (solid, wireframe, points).
4. onModelStatus fires { vehicleId, ready: true } on mount.
5. preloadCars(vehicles) resolves immediately.

Tests: a render test that the stub fires the five stage callbacks in order and that skipSignal short-circuits them.
End with the summary and a 3-line usage note for Developer 2.
```

---

## D1-A2 Real viewer (hour 2 to 6)

```
Task: replace the stub internals with the real viewer, keeping the same CarStageProps.

Context: read /contracts/INTERFACES.md and /ui/3d/CLAUDE.md. Paste the D1-A0 and D1-A1 summaries. Assets: /public/models/*.glb and manifest.json.

Build:
1. /scripts/3d/prep-glb.mjs: centers the model, scales length to 4.6 units along X, puts the wheels on y = 0, compresses with Draco or meshopt, writes the GLB. Document the command.
2. VehicleModel.tsx with useGLTF. Read the manifest for bodyMaterialName and paintHex. Fall back to the first material matching /body|paint|carpaint|exterior/i. Apply paint through paint.ts as MeshPhysicalMaterial (metalness 0.6, roughness 0.28, clearcoat 1, clearcoatRoughness 0.05).
3. Scene.tsx: Drei Environment studio lighting, ContactShadows, soft rim lights, OrbitControls (damping 0.08, distance 3.5 to 9, max polar 1.5), camera at [4.8, 1.6, 5.6] fov 35, pixel ratio cap 2 (1 when quality is "low").
4. viewModes.ts: solid, wireframe (material swap on the same meshes), points (placeholder until A3).
5. Vehicle switching crossfades (opacity) so the canvas is never blank. preloadCars loads and caches both GLBs.
6. dispose.ts: disposeObject(root) frees geometry, materials, textures. Call on unmount.
7. If matchStatus is not "exact", render a small DOM label "Representative model" inside the stage.
8. resetCameraSignal resets the camera. onModelStatus fires ready or error.

Acceptance: both cars load, rotate, zoom, reset, recolor, and switch without a blank flash. 10 mount and unmount cycles: log renderer.info.memory before and after and show the counts return to baseline.
Do not build particles yet. End with the summary.
```

---

## D1-A3 Point sampling (hour 6 to 9)

```
Task: generate surface point files for both cars and add the points view mode.

Context: paste the D1-A2 summary. Particle counts: 32,768 (high) and 8,192 (low), the SAME for both cars so the morph pairs points 1 to 1.

Build:
1. /scripts/3d/sample-points.mjs using three.js MeshSurfaceSampler, area weighted, with a seeded RNG so the output is reproducible. Apply the same normalization as prep-glb.mjs (length 4.6 on X, centered, wheels at y 0). Write a Float32Array of N x 3 to /public/points/<vehicleId>.bin. Also write the low-quality file (first 8,192 points of a stratified shuffle, so the low set still covers the whole body).
2. usePointsFile.ts: fetch and cache a .bin as a Float32Array, choosing the file by quality.
3. The "points" view mode in viewModes.ts rendering the sampled points as a THREE.Points cloud (cyan #27E1FF, size about 2 px).
4. A test that loads each .bin and checks: length is N * 3, all values finite, bounding box length is within 2% of 4.6 on X.

Acceptance: the point silhouette visibly matches the solid model from front, side, and 3/4 views.
End with the summary.
```

---

## D1-A4 Particle reveal (hour 9 to 14)

```
Task: build the VIN-triggered particle reveal inside CarStage (phase "reveal").

Context: paste the D1-A3 summary. Timing is frozen in /contracts/INTERFACES.md: converge 0 to 2.0 s, point cloud 2.0 to 2.5, wireframe fade in 2.5 to 3.0, solid materialize 3.0 to 4.0, then onRevealStage("done").

Build ParticleReveal.tsx with a ShaderMaterial:
- Attributes: aStart (random point in a sphere radius about 6 around the car), aTarget (from the .bin), aDelay (0 to 0.35 of the converge window, random per particle). Uniform uProgress (0 to 1 over the converge window), uTime.
- All motion happens in the vertex shader (eased interpolation from aStart to aTarget). NEVER update particle positions in JavaScript per frame.
- Cyan #27E1FF, additive blending, size about 2 px, slight size attenuation by depth.
- After converge, hold the point cloud, fade a wireframe copy of the real mesh in, then fade the solid in while the points fade out.
- Call onRevealStage at each boundary: "converge" (at start), "pointcloud", "wireframe", "solid", "done".

Controls and fallbacks:
- skipSignal increments: jump to the solid state immediately and fire the remaining stages in order with no delay.
- replaySignal increments: restart cleanly (dispose and recreate attributes).
- reducedMotion true: no particles, instant solid, fire all stages immediately.
- quality "low": 8,192 points and a simpler fragment shader.
- Preload GLB and .bin before starting so loading never stalls the animation.
- Dispose buffers, materials, and textures at the end and on unmount.
- The reveal must never block interaction: after "done" OrbitControls are live, and skip works at any moment.

Tests: stage callbacks fire in order with the right timestamps (use a fake clock), skip fires the rest immediately, reducedMotion fires all immediately, replay x10 returns geometry and texture counts to baseline.
End with the summary.
```

---

## D1-A5 Camry to RAV4 morph (hour 14 to 18, demo-critical)

```
Task: build the vehicle transition inside CarStage (phase "transition").

Context: paste the D1-A4 summary. Both .bin files have the SAME point count, so point i of the Camry maps to point i of the RAV4. Timing: 0.3 s solid Camry to points, 1.2 s morph (ease in out), 0.3 s RAV4 solid in. Total 1.8 s, then onTransitionComplete().

Build ParticleMorph.tsx:
1. Shader attributes aFrom (Camry point) and aTo (RAV4 point), uniform uMorph 0 to 1. Pair by index, but sort both point sets by a space-filling order (for example sorted by a Morton code on x, y, z) before saving or at load, so nearby points morph to nearby points and the morph does not look like noise. If this changes the .bin files, update sample-points.mjs and regenerate.
2. Fade the solid vehicle (transition-from, which is "vehicle") out and the solid transitionTo vehicle in around the morph.
3. Tween the body paint hex from the Camry color to the RAV4 color during the morph.
4. Camera stays put. Controls disabled during the morph, enabled at the end.
5. A forceFallback constant in this file: when true, skip the morph and do a clean cross-fade with a scan-line wipe over 1.0 s. Use it if the morph misbehaves.
6. skipSignal jumps to the end state. reducedMotion uses a 0.3 s cross-fade. quality "low" uses the 8,192 set.
7. After onTransitionComplete the stage shows transitionTo as the active vehicle in interactive mode.
8. Dispose everything. 10 repeated transitions must not leak.

Tests: callback fires once at the end, skip works mid-morph, fallback path fires the callback, 10 repeats return counts to baseline.
End with the summary.
```

---

## D1-A6 Performance and leak pass (hour 18 to 21)

```
Task: harden the 3D stage. Do NOT add features.

Context: the reveal and morph both work.

Do:
1. Add a dev-only overlay that shows renderer.info (geometries, textures, draw calls, triangles) and FPS.
2. Run these and record numbers in /docs/3D_PERF.md: 10 reveal replays, 10 morphs, 10 mount/unmount cycles, switching vehicle 20 times. Geometry and texture counts must return to baseline each time.
3. Test at quality "low" and with reducedMotion. Test at 1280x720, 1920x1080, and 1024x768.
4. Fix any leak or frame drop you find (merge static meshes to cut draw calls, reduce texture sizes, cap pixel ratio).
5. Verify the app is fully usable if the reveal is skipped or disabled, and if a GLB fails to load (onModelStatus reports the error and the stage shows a clear message).
6. Verify the manifest has license and credit text for every asset.

Acceptance: all counts return to baseline, no console errors, demo path runs twice in a row.
End with the summary and a pass/fail table.
```
