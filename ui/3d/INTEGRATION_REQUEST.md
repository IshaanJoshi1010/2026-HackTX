# CarStage integration prerequisites

Resolved for A1 with Kareem's authorization to import the existing shared contract and add the application dependencies.

- contracts/index.ts was copied unchanged from origin/dev3-data-ai at aadf0c36cfdb1355c3082893a15647060315b0bd. Dev 3 remains the owner; pending shared-shape review comments still apply.
- Root dependencies now include three, @react-three/fiber, @react-three/drei and @types/three. The lockfile is updated.
- CarStage now renders the A2 real viewer. CarStageStub remains available separately. See A2_HANDOFF.md for current usage and limitations; A1_HANDOFF.md is the earlier milestone record.
- Listing paint data and particle samples remain pending. Both models are representative. Full-detail showroom assets exceed the production triangle budget; the manifest uses optimized assets.

A3-A6 remain outstanding. A1/A2 are being delivered as a branch checkpoint for review, not a completed Dev 1 feature set.
