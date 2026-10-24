# Smartcar feasibility review, 2026-10-24

Smartcar's official testing guide describes simulated mode, configurable permission levels and testing VIN-shaped strings. It states that responses may be simulated or randomized depending on simulator setup. Its Vehicle Test Simulator page describes selecting a compatible make/model/year and connecting the simulated vehicle through Smartcar Connect. Its signals page describes odometer and other telemetry, with availability varying by vehicle and requiring permission.

Reviewed sources:
- https://smartcar.com/docs/getting-started/test-your-integration
- https://smartcar.com/blog/introducing-vehicle-test-simulator
- https://smartcar.com/product/signals

These pages do not establish that this account can connect the exact 2022 Camry SE and 2024 RAV4 Hybrid XLE in the required region with the exact required signals. No live compatibility request, dashboard selection, credentials or Smartcar connection was performed. We therefore take the explicitly permitted local-simulation fallback instead of claiming a verified Smartcar/Toyota integration.

SimulatedSmartcarProvider is a deterministic local fixture. It imports no Smartcar SDK, makes no network calls, and has no OAuth or telemetry access. Its account and mileage values are synthetic. The common finance fields are fictional demo account data, not an assertion that Smartcar supplies loan balances or payments. Within the frozen VehicleSignals contract, only mileage and its source are returned; richer telemetry is outside this implementation.

Both local providers use the existing Source value synthetic. The shared union has no simulated member. The provider descriptor label/mode/disclosure differentiates the Smartcar-style local simulation from the default synthetic account, without relabeling invented data sourced or changing the contract.
