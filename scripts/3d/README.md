# Fork asset gate tools

Current Camry selection: sultan's Camry v80, replacing the older ItsDiyor candidate at the user's request for better visual quality regardless of generation. Runtime file `/models/camry-v80.glb`: 2,055,980 bytes, 179,412 triangles, separate `BODY.001` material, CC-BY 4.0. Full-detail master retained under `source-assets/camry-v80/full-detail.glb`. See that folder's REVIEW.md for the comparison and rendering-pass caveat. Rebuild with `node scripts/3d/prep-camry-v80.mjs`. Preview defaults to this Camry; `?car=legacy` shows the old one and `?car=rav4` shows the SUV.

This private tooling package keeps Dev 1 dependencies inside scripts/3d. Root npm ci does not install it.

```sh
npm ci --prefix scripts/3d
node scripts/3d/inspect-glb.mjs path/to/model.glb
npm test --prefix scripts/3d
```

Export: `inspectGlb(filePath: string): Promise<InspectionReport>` returns the JSON report printed by the CLI. Inspection is read-only and supports Draco and meshopt decoding. Counts cover mesh instances in the default scene, or the first scene if none is selected. Bounds include node transforms. GPU instancing is rejected explicitly; skinning and morph targets require manual pose review. Unknown texture dimensions are reported as unknown, not passed. The triangle and size checks do not approve an asset.

## Pending asset decisions

Ask Toyota reps for CAD or configurator assets first. If unavailable, check downloadable Sketchfab assets (CC-BY with credit is acceptable; reject NonCommercial and no-derivatives), then TurboSquid or CGTrader. Verify the actual license for each candidate, not just the marketplace name.

Both GLBs are prepared and marked representative with license and credit. Empty points and paint fields mean unavailable or unknown: do not fetch empty paths or apply an empty paint override. Preserve the asset's original paint until sourced paint data arrives. Never treat a license placeholder as permission or claim exact geometry from a model title.

| Target | Year | Trim | Paint name / hex | Asset / status |
| --- | --- | --- | --- | --- |
| Toyota Camry | 2022 | SE | Pending / pending | sultan Camry v80 / newer-generation representative |
| Toyota RAV4 | 2024 | Hybrid XLE | Pending / pending | 2021 RAV4 Adventure / representative |

Candidate review must cover license and attribution, generation (Camry 2018–2024; RAV4 2019–2024), GLB/glTF availability, separate recolorable body material, at most 200,000 triangles, at most 10 MB compressed, texture sides at most 2048 px, and the SE front-end match against listing photos. A usable but inexact model must be marked representative. Record model, year, trim, paint name, paint hex, and match status for Paarth after selection. Both representative geometry assets now pass inspection. Listing paint metadata remains pending; do not invent it.

## Preparation and local asset QA

`prepGlb(input: string, output: string, lengthAxis: 'x' | 'z' = 'z'): Promise<object>` handles static Y-up single-scene GLBs. It preserves the source, normalizes length to 4.6 on X, centers X/Z, grounds the minimum Y, and writes Draco compression. It rejects animations, skins, morph targets, and instancing. Inspect wheel contact visually; the minimum bound is not always a tire on arbitrary assets.

```sh
node scripts/3d/prep-glb.mjs scripts/3d/source-assets/camry-2020/original.glb public/models/camry-2022-se.glb z
node scripts/3d/inspect-glb.mjs public/models/camry-2022-se.glb
node scripts/3d/preview.mjs
```

Open http://127.0.0.1:4173 for local asset QA. This is a tooling preview, not CarStage. The red button is illustrative test paint only; it does not modify the GLB or manifest. The preview uses a scoped Three.js dependency, not a root application dependency.

Verified compressed Camry: 3,359,360 bytes, 176,591 triangles, max texture side 2048, length 4.6 on X, min Y 0. Browser verification: loads with Draco, body-only recolor works, six draw calls including one floor. Five Node tests cover inspection, compression/normalization roundtrip and both prepared assets. RAV4: 1,350,892 bytes, 165,419 triangles, 37 browser draw calls including the floor. Rebuild with node scripts/3d/prep-rav4.mjs; preview at http://127.0.0.1:4173/?car=rav4. Remaining: points sampling, listing paint data, and production viewer. See ui/3d/INTEGRATION_REQUEST.md for app dependency and canonical type prerequisites.


## Source downloads and app integration

Raw source downloads (source-assets/*/original.glb) and simplification intermediates are intentionally gitignored. To rerun the source-specific preparation scripts, download the credited source from the URL in each source folder's CREDIT.txt and place its original GLB at that path. Prepared runtime assets in public/models and compressed full-detail showroom assets are included, so viewing the demos does not require marketplace access.

The React application viewer is now implemented through A2. See ui/3d/A2_HANDOFF.md for the API, verification, memory audit, and remaining A3-A6 work. Run its harness with node node_modules/vite/bin/vite.js --config scripts/3d/stub-vite.config.mts and open http://127.0.0.1:4174/scripts/3d/stub-preview.html.
