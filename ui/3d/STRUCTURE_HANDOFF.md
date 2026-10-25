# Structure view

The existing `viewMode="wireframe"` now displays a lightweight illustrative component layout. It hides dense exterior topology and shows powertrain, battery, brakes and tires with a sparse body outline. These are schematic shapes, not verified internal CAD. Only one component callout is open at a time. Click a part or its button to inspect it.

The mechanical assembly now includes sills, crossmembers, pillars, roof rails, cast housings, intake runners, radiator, battery casing, struts, machined rotors, calipers and alloy spokes. Rubber and metal use separate material roughness. The hybrid layout has a taller frame and wider battery enclosure. These details remain illustrative. `StructureAssembly({ hybrid, accent, onSelect })` is an internal component, not a change to the CarStage API. Transforms use numeric tuples to remain compatible with the preview's separate Three bundles. Owned rounded housing geometries are explicitly disposed on unmount.

## Maintenance input

`MaintenanceProvider({ findings, children })` is exported from `@/ui/3d/CarStage`. Wrap CarStage with it to supply findings. CarStage props remain unchanged.

```tsx
<MaintenanceProvider findings={[{
  vehicleId: vehicle.id,
  component: "brakes",
  severity: "warning",
  label: "Brake inspection requested",
  source: "User-reported concern",
}]}>
  <CarStage {...stageProps} />
</MaintenanceProvider>
```

`MaintenanceFinding` accepts vehicleId, component (`engine | battery | brakes | tires`), severity (`notice | warning`), label and source. Matching parts and their selector buttons turn amber. The selected component has a pointer and sourced message. Empty input does not infer good health or invent faults. The app must supply real findings; the preview checkbox supplies a clearly labeled synthetic brake warning only.

The layout uses declarative R3F geometry and materials, disposed on unmount. Asset credits remain unchanged. Replay and morph controls in the preview return to Studio mode.

For integrations that retain `viewMode="wireframe"` during a reveal or transition, VehicleModel renders the solid animation destination. The schematic returns when the parent sets `phase="interactive"`. Switching between Studio and Structure reuses the loaded exterior without loading another asset.

Validation: `npx vitest run ui/3d`, `npx eslint ui/3d scripts/3d/stub-preview.tsx`, `npx tsc --noEmit`.
