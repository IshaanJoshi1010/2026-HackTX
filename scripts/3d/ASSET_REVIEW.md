## Current status

Camry upgrade: the user explicitly allowed any Camry generation for higher quality. The manifest now selects sultan's Camry v80 under CC-BY 4.0. Runtime: 179,412 triangles, 2,055,980 bytes. Full-detail master retained. See source-assets/camry-v80/REVIEW.md. Earlier Camry selection notes below are historical.

Both representative GLBs are now acquired and prepared under CC-BY. Free models only. The RAV4 decision supersedes the earlier unresolved search notes below; see source-assets/rav4-2021/REVIEW.md. Listing paint fields remain unknown.

# D1-A0 candidate review

Reviewed 2026-10-24. The ItsDiyor Camry original GLB is now downloaded and locally inspected; no purchases made. Other marketplace numbers below remain seller-reported. Prices can change.

## Downloaded Camry inspection

Source retained at `source-assets/camry-2020/original.glb` with `CREDIT.txt` and `inspection.json` beside it. The authorized original download was a ZIP; the embedded GLB itself is 8,978,076 bytes.

- 176,719 triangles, four mesh instances, five primitive instances.
- Eight embedded images, all at most 2048px per side.
- `Paint_Color` is assigned to its own `Paint_Color_BD` mesh, with 24,028 position vertices. It has no base-color texture, uses a constant base color, and has an occlusion map. Its bounds span the vehicle body. This supports separate recoloring; a rendered recolor test remains pending.
- Length is currently 4.888 along Z, not the required 4.6 along X. Normalize orientation, scale, center and ground placement before deployment.
- No compression extensions declared. Add Draco or meshopt during preparation and inspect the output again.
- The source viewer shows a silver sedan with horizontal grille bars. Do not claim an SE front-end match; retain representative status if accepted. Silver appearance is not verified listing paint data.

Verdict: **use as representative**. Prepared GLB is 3,359,360 bytes with 176,591 triangles, 2048px maximum textures, 4.6 length on X and minimum Y=0. Draco decode and body-only recoloring passed in the local WebGL preview; six draw calls including the floor. Manifest now references the prepared file and its license. RAV4 remains unresolved.

## Next candidate to inspect

[Toyota Camry 2020 by ItsDiyor](https://sketchfab.com/3d-models/toyota-camry-2020-236a5a6e2fa6420fbdf641f4800cd544) was downloaded after the user signed in. The live Sketchfab page confirms [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). See local inspection above.

Final geometry verdict: **use as representative** after successful preparation and rendered recolor checks. Year differs and SE trim is unverified. Passing the numeric limits alone does not approve deployment.

Draft credit for this candidate, to add to the manifest only after selection:

> Toyota Camry 2020 by ItsDiyor (https://sketchfab.com/ItsDiyor), https://sketchfab.com/3d-models/toyota-camry-2020-236a5a6e2fa6420fbdf641f4800cd544, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).

Append the actual modifications to that credit after conversion, optimization, normalization, or repainting. Do not claim modifications that have not happened.

## Other candidates

| Candidate | Listing evidence | Verdict |
| --- | --- | --- |
| [SQUIR Camry Hybrid SE 2021](https://www.cgtrader.com/3d-models/car/car/toyota-camry-hybrid-se-2021) | $129; royalty-free listing; 700k polygons; FBX/OBJ available | Representative candidate, not approved. Closest SE-specific lead found, but different year/powertrain and far above budget. Verify materials and applicable distribution terms before purchase. |
| [3dstarving RAV4 Hybrid 2019](https://www.cgtrader.com/3d-models/car/suv/toyota-rav4-hybrid-2019) | $149; royalty-free listing; unsmoothed 118,249 polygons; FBX/OBJ supplied at subdivision level 1 and without materials; textures up to 4096 | Representative candidate, not approved. XLE unverified. Native unsmoothed polygon count is not exported triangle count. Significant material/geometry preparation required. |
| [Nieve5677 Camry XSE 2021](https://sketchfab.com/3d-models/toyota-camry-xse-2021-48ca8b027bd04c4ba67136c4021efc8e) | CC Attribution; 1.8M triangles | Reject as delivered: wrong trim and excessive geometry. Lower priority than ItsDiyor. |
| [Ddiaz Design RAV4 Hybrid 2023](https://sketchfab.com/3d-models/2023-toyota-rav4-hybrid-ed155ad0cb7d447085a519eaff9aa2df) | CC Attribution-NonCommercial-ShareAlike; 399.2k triangles; description credits Racing Master | Reject under project license requirements. |
| [teenlin3 RAV4 2026](https://sketchfab.com/3d-models/toyota-rav4-2026-53e8ac0ac68e4d65bb1c3ed95a8a8101) | AI-generated; 499.9k triangles; model year 2026 | Reject: outside required generation/year range and over budget. |

TurboSquid was searched, but no stronger fully verified candidate emerged. No exact 2022 SE / 2024 Hybrid XLE pair has been established. Listing titles are not proof of geometric accuracy.

## File acceptance steps

### Additional RAV4 review

- [Nazh-Design 2023 RAV4 GR Sport](https://www.cgtrader.com/free-3d-models/car/suv/2023-toyota-rav4-gr-sport): reject under current requirements. The description requires permission for commercial use. Listed formats are STL and SKP; trim differs from Hybrid XLE.
- [TAURUS_X RAV4 Hybrid 2019](https://free3d.com/pl/3d-model/toyota-rav4-hybrid-2019-2349.html): reject as delivered for this viewer. The seller describes 1,780 triangles and one baked 2048px diffuse texture, not a verified separate recolorable body material. Listed at $35.
- [LOWMOD RAV4 GR Sport 2023](https://www.cgtrader.com/3d-models/car/suv/toyota-rav4-gr-sport-2023): lower-cost lead only. Lists 3,120 polygons and FBX, but body-paint separation is unverified and GR Sport is not XLE. Do not purchase on triangle count alone. The same creator's RenderHub listing specifies an editorial-use restriction, so review the selected marketplace's actual terms independently.
- [3D CAD Browser RAV4 2019](https://www.3dcadbrowser.com/3d-model/toyota-rav4-2019): download requires a paid or upload-qualified account; not an immediately free download. Lists 171,754 polygons and 3,540 objects. Triangle count after export and draw-call reduction need inspection; public-repo distribution terms remain unresolved.

No new RAV4 has been acquired. A budget preference has been requested to narrow paid candidates; this does not authorize a purchase.

1. Download through the source site's authorized download flow and retain license/attribution evidence.
2. For GLB, run `node scripts/3d/inspect-glb.mjs <downloaded-file.glb>`.
3. Inspect front, side, rear and material assignments. Verify the body can change color without recoloring glass, tires or trim. Compare the SE front end with the team's listing snapshot.
4. Verify the prepared GLB has at most 200k triangles, 10 MB compressed size, 2048px texture sides, and 150 draw calls. Validate the final artifact, not the seller's source-file numbers.
5. Record actual material name and source-backed paint data, then fill manifest paths, license and credit. Mark an inexact accepted asset `representative`.

## Current Dev 3 handoff values

| Vehicle ID | Target model | Target year | Target trim | Paint name | Paint hex | Current match status |
| --- | --- | --- | --- | --- | --- | --- |
| camry-2022-se | Toyota Camry | 2022 | SE | Unknown | Unknown | representative |
| rav4-hybrid-2024-xle | Toyota RAV4 | 2024 | Hybrid XLE | Unknown | Unknown | representative |

These are requested target identities. The acquired Camry is a 2020 model with unverified trim, used as representative. RAV4 remains unsupported. D1-A0 remains pending for RAV4; no production UI work in this task.
