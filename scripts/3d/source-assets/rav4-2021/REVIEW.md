# RAV4 asset decision

User constraint: free models only. Selected source is 2021+Toyota+RAV4+Adventure by luisandradeandrade762, downloaded from Sketchfab under the displayed CC-BY 4.0 license. See CREDIT.txt for source and attribution.

Original GLB: 45,392,808 bytes, 958,508 triangles, 44 primitive instances including seven CAD edge-line meshes. Maximum texture side 2048.

Prepared GLB: 1,350,892 bytes, 165,419 triangles, 36 surface primitive instances, maximum texture side 2048. Length 4.6 along X, minimum Y approximately zero. Draco compressed. Source normals and UVs retained; redundant CAD lines removed and surface meshes simplified with meshoptimizer permissive seam collapse at ratio 0.18 and relative error limit 0.005. An earlier cluster-based experiment had visible surface artifacts and was replaced.

Local WebGL checks: Draco decode succeeds, 37 draw calls including the floor, body-only recoloring works, side and three-quarter profiles inspected. Fine detail is reduced, especially trim and wheels; this is a representative demo asset, not a CAD reference. The body uses 2021_Toyota_RAV4_Adventure_Adventure_Rock. White roof remains a separate material and retains the source two-tone appearance.

Verdict: use as representative. The 2021 Adventure has different grille, wheels, roof, year, trim and powertrain from the target 2024 Hybrid XLE. Do not claim exactness. Original source colors are retained; no listing paint name or hex has been inferred from the model. Red shown in recolor-qa.png is illustrative QA paint only.

Reproduce with node scripts/3d/prep-rav4.mjs. Verify with npm test --prefix scripts/3d. Browser QA: node scripts/3d/preview.mjs then http://127.0.0.1:4173/?car=rav4.

### Graphite studio preview
Shared graphite metallic paint, neutral softboxes, softened shadows and dark charcoal backdrop now match the Camry preview treatment. The full-detail preview removes CAD lines but retains surface geometry; reproduce with node scripts/3d/prep-rav4-full.mjs. Its smoother panels and complete windows are preferable for close-up viewing. The optimized asset still has visible simplification artifacts under glossy lighting. Full detail is preview-only and exceeds the production mesh budget. White roof remains separate. Paint is illustrative, not a verified Toyota paint code. Screenshot: metallic-qa.png.
