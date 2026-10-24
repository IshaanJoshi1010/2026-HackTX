# Selected Camry upgrade

User requested the highest-quality free Camry available, with no year/trim restriction. Selected the best-looking candidate among those visually inspected, not a claim to have exhaustively ranked every model online.

Compared the prior ItsDiyor Camry 2020, Nieve5677's Camry XSE 2021 viewer (appeared largely unmaterialed in its source presentation), and sultan's Camry v80. Chose v80 for its completed material separation, newer body shape, grille, lamp and wheel detail. License/source attribution is in CREDIT.txt.

Source: 704,936 triangles, 24,366,484 bytes, 43 primitives, 18 materials, 1024px maximum textures. A full-detail normalized master is retained alongside the unchanged original.

Prepared runtime file: public/models/camry-v80.glb, 179,412 triangles, 2,055,980 bytes, 4.6 length along X, minimum Y approximately zero, Draco compression. BODY.001 is the separate untextured body material. Normal-aware simplification uses normal weights [1,1,1], ratio 0.25 and relative error limit 0.01. Position-only simplification was visually worse and is not the selected result.

Visual QA compared optimized and full-detail files under identical studio lighting. Body panel reflections remain much closer to the source with normal-aware simplification. Recolor check changes the body while glass, lamps, grille and wheels retain their colors. Browser reports 88 draw calls and 358,828 rendered triangles including the floor; rendering passes repeat geometry, so this differs from the GLB's 179,412 unique triangles. This passes the geometry and draw-call budgets, but target-device frame rate still needs testing in CarStage.

The preview adds studio reflections, tone mapping and the specified physical paint finish. This is QA presentation; the GLB retains source materials for the production viewer to configure. Listing paint metadata remains empty. Manifest keeps the stable target vehicle ID but labels the asset representative, with explicit newer-generation provenance.

Rebuild: node scripts/3d/prep-camry-v80.mjs
Verify: npm test --prefix scripts/3d
Preview: node scripts/3d/preview.mjs, then http://127.0.0.1:4173/?car=v80
Full-detail comparison: http://127.0.0.1:4173/?car=v80&full=1

## Enhanced preview shading

Added 2048px PCF shadows from a warm key light, cool rim light, studio environment reflections, a subtle procedural underbody occlusion plane, ACES tone mapping, and a fogged showroom floor. Refined chrome/rim roughness, tire roughness and window tint while preserving lamp materials. Render resolution is 1.5x to 2x device scale. Camera framing adapts for narrower viewports, orbit damping is enabled, and controls prevent going beneath the floor.

These are preview rendering changes, not modifications to licensed mesh geometry or sourced paint data. Visually checked original and illustrative red paint, grounded wheel shadows and framing; browser error log was empty. See studio-shading-qa.png. Earlier draw-call numbers above predate this shadow pass and should not be used as the enhanced preview's performance result. Production target-device performance remains to be measured.

### Cinematic preview pass
The standalone preview adds GTAO contact/recess shading, restrained HDR highlight bloom, SMAA edge antialiasing, and long environment softboxes. OutputPass applies ACES tone mapping and display color conversion. The Cinematic shading toggle disables AO and bloom for comparison; the detail button switches between the optimized and full source geometry. Full geometry exceeds the production triangle budget and is a preview option only. These additional GPU passes have not been benchmarked for the integrated app.

Verified optimized and full-detail loading, red paint, shading toggle, no browser console errors, and all five asset/tooling tests. Screenshot: cinematic-qa.png. Source geometry and texture limitations remain; this is a showroom improvement, not Forza rendering parity. No public exports added.

### Reference-inspired graphite finish
The preview now defaults to illustrative graphite metallic with metalness 0.78, roughness 0.30 and clearcoat roughness 0.12. Neutral softbox reflections and a darker charcoal backdrop replace the previous cool showroom lighting. Original and red paint controls remain available. The same treatment is applied to the RAV4, with a full-detail preview option for that vehicle too. Screenshot: metallic-qa.png. No production contract or exported component changed.
