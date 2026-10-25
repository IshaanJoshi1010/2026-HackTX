# Showroom and motion polish

The frozen `CarStage(props: CarStageProps): JSX.Element` and `preloadCars(vehicles: VehicleConfig[]): Promise<void>` exports are unchanged.

## Motion

Morph handoff now uses Three's alpha-hashed surface coverage for opaque solid materials. This avoids transparent body shells exposing internal meshes during fades; existing glass keeps alpha blending. The fade variant is covered by the existing shader preparation step. Incoming geometry is hidden immediately when loaded, preventing a one-frame opaque destination flash. Completion restores visibility and material state synchronously, including skip. Particle ribbons follow the flanks and scale their outward arc with the distance to the destination surface. Timings and public props remain unchanged.

The cinematic refinement uses a seeded shallow orbital ribbon for reveal, with a small spatial delay across the body instead of a large random sphere. The morph uses a staggered surface wave with restrained outward arcs. Both settle with zero endpoint velocity; particle size eases during motion. A softer ice-blue glow and a lower-opacity wire overlay reduce the abrupt layered look during the solid handoff. Public timings remain 4 seconds for reveal and 1.8 seconds for morph. Skip, reduced motion and fallback are unchanged.

Reveal and morph use quintic easing with zero endpoint velocity/acceleration. Reveal particles follow a curved convergence path; the morph adds a small vertical arc. Both curves settle precisely onto the sampled surfaces, and particle positions remain entirely vertex-shader driven. Softer circular sprites and eased mesh/point opacity improve the handoff to solid geometry. The 4-second reveal and 1.8-second morph callback schedules, skip behavior and crossfade fallback are unchanged.

Morton ordering is cached in a WeakMap keyed by the cached point arrays, avoiding repeated sorting on replay without holding evicted arrays indefinitely. Rendered buffers still own their copies and are disposed normally.

## Presentation controls

`CarStage` now includes a compact toolbar with front, side and three-quarter camera presets, auto-rotate, and fullscreen/exit fullscreen. Presets pause during an actual particle morph and unlock at completion even if the parent has not yet updated its phase. Auto-rotate pauses during morphs and is disabled under reduced motion. Selecting a preset stops auto-rotate. Fullscreen uses the browser API and reports when unsupported.

The isolated preview at `/scripts/3d/stub-preview.html` is now a showroom with Toyota-inspired red accents, styled car/view selectors, four illustrative paint swatches, reveal/replacement actions and an expandable diagnostics panel. These preview controls do not alter Ishaan's shell files. Camera toolbar styles are scoped with a CSS module; showroom styles are imported only by the preview.

## Verification

- Full suite: 643 tests pass; final targeted 3D tests, TypeScript, ESLint and production build also checked.
- Ten updated reveals return to 46 geometries / 8 textures. Ten morphs alternate between 39/9 for RAV4 and 46/8 for Camry. Evidence: `scripts/3d/showroom-reveals.json`, `showroom-morphs.json`.
- Browser checked: side/three-quarter presets, rotating camera, crimson paint, fullscreen enter/exit, updated reveal and morph, reduced-motion immediate completion and disabled auto-rotate.
- The shader easing changed, not the normalized assets, credits or manifest paint provenance. Preview swatches are labeled illustrative.

Created: `animationMath.ts`, `StageToolbar.module.css`, `__tests__/animationMath.test.ts`, this handoff, `scripts/3d/showroom.css` and showroom audit files. Updated controller/shaders, Scene, CarStage, presentation-control tests and preview HTML/TSX.

New internal export: `smootherStep(value: number): number`.

Run from repo root:
```sh
npm test
npx tsc --noEmit
npx eslint ui/3d scripts/3d/stub-preview.tsx
npm run build
```

App-shell integration and the physical-projector rehearsal remain with Ishaan and the team; this change does not flip `USE_MOCKS.car`.
