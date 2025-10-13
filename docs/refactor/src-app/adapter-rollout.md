# Fleet Storage Adapter & Hook Rollout (Phase 2/3 Draft)

## Current Status (2025-10-12)
- `useFleetState` now re-evaluates `VITE_USE_FLEET_HOOK` per render and keeps the flag value in a ref so async refreshes stay aligned with the active path.
- `FleetPage` consumes the hook output exclusively (legacy `loadVehicles` removed); dashboard widgets fall back to the hook when the flag is enabled, but compliance widgets still read `fleetDataManager`.
- Onboarding/document flows still call the adapter, and we now re-sync via `centralizedFleetDataService.initializeData()` after each upload so centralized caches stay warm.
- Mapping utilities remain minimal; we still normalize legacy payloads but haven’t added VehicleSummary conversions or tests yet.

## Near-Term Checklist
1. Execute the smoke checklist with `VITE_REFACTOR_DEBUG=true`, archive real logs/data-shapes, and replace placeholder JSON payloads.
2. Rewire modal/document upload components to call the adapter + hook refresh helpers and remove the event bus fallback listeners.
3. Expand `vehicleMapping` to cover VehicleSummary conversions and add smoke-level unit tests to protect the new pathways.
4. Decide when compliance widgets/header stats can retire `fleetDataManager` and lean completely on hook-provided metrics.

## 2025-10-15 Update
- TypeScript diagnostics are now clean after refactoring `reportingService`, `storageManager`, and the legacy test framework to the centralized error/async patterns (see `docs/refactor/src-app/artifacts/tsc-run-20251015.log`).
- `storageManager` instantiates the API-backed `DatabaseService` via `createDatabaseService()` and no longer relies on deprecated `.query` calls or injected services; document fetches now flow through the REST search endpoint.
- `VITE_USE_FLEET_HOOK` defaults to `true` across `.env` variants, and `src/utils/featureFlags.ts` applies a baked-in fallback so the hook path is active even when the variable is omitted.
- Remaining legacy fallbacks (document modals, compliance dashboards, `fleetDataManager` subscribers) still exist but can be removed once the smoke checklist validates the hook path end-to-end.
- Next action items: run the Phase 0 smoke flows with the hook enabled by default, prune the event bus refresh scaffolding, and migrate compliance widgets away from `fleetDataManager`.
## Goals
- Provide a typed adapter layer that mirrors the current `persistentFleetStorage` surface while internally delegating to `centralizedFleetDataService` and Neon-backed workflows.
- Introduce `hooks/useFleetState.ts` to encapsulate fleet loading, filtering, and refresh side-effects currently embedded in `FleetPage`.
- Gate all changes behind `VITE_USE_FLEET_ADAPTER` and `VITE_USE_FLEET_HOOK` to preserve rollback paths while parity is validated.

## Proposed File Additions
- `src/services/fleetStorageAdapter.ts`
  - Exports `FleetStorageAdapter` singleton with methods: `initialize`, `getFleet`, `addVehicles`, `updateVehicle`, `clearFleet`, `addDrivers`, `updateDriver` (mirror of persisted API).
  - Adds narrow typing helpers drawing from upcoming `utils/vehicleMapping.ts` to translate between `VehicleRecord` and `UnifiedVehicleData`.
  - Emits telemetry via existing `refactorDebugLog` so instrumentation remains consistent.
- `src/hooks/useFleetState.ts`
  - Returns `{ vehicles, isLoading, fleetStats, refresh, addVehicles, updateVehicle, clear }` plus search/filter helpers.
  - Subscribes to centralized service once and re-exposes data as React state; internally toggles between adapter vs legacy storage based on feature flag.

## Incremental Wiring Plan
1. **Scaffold Adapter (no consumers)**
   - Implement adapter methods by wrapping centralized service calls; keep legacy fallbacks by delegating to `persistentFleetStorage` when the flag is disabled or on failure.
   - Add lightweight unit tests (if feasible) for mapping helpers once `vehicleMapping` utilities exist.
2. **Feature-flagged Consumption in FleetPage**
   - Introduce helper inside `FleetPage` that chooses between direct `persistentFleetStorage` calls and adapter.
   - Guard document upload callbacks so they call `adapter.addVehicles` when `VITE_USE_FLEET_ADAPTER === 'true'`; continue emitting events until hook migration is complete.
3. **Extract `useFleetState`**
   - Move `unifiedVehicles`, `isLoading`, `loadVehicles`, search/filter logic into the hook.
   - Hook drives `FleetPage` rendering while legacy code remains behind the flag.
   - Subscribe to centralized service inside the hook; expose an imperative `refresh` that calls `adapter.initialize()` + `centralizedFleetDataService.initializeData()`.
4. **Broaden Consumer Alignment**
   - After FleetPage stabilizes, migrate header stats, dashboard widgets, and modals to hook outputs.
   - Remove redundant `fleetDataManager` reads where centralized stats replace them.

## Feature Flag Strategy
- `isFleetAdapterEnabled()` helper in `src/utils/featureFlags.ts` reading `import.meta.env.VITE_USE_FLEET_ADAPTER`.
- `isFleetHookEnabled()` helper for `useFleetState` adoption.
- Update documentation (`docs/agents.md` + progress log) when toggles move environments.

## Compatibility & Rollback
- Adapter should catch and log centralized service errors, then fall back to `persistentFleetStorage` writes to prevent data loss while flags are enabled.
- Maintain current event bus notifications until hook removes the need; guard new emissions to avoid duplicates.
- Document cleanup tasks (`TODO(refactor-cleanup)`) near temporary shims.

## Open Questions
- Confirm whether driver-related methods need parity in the first adapter pass or can remain legacy until driver flows enter scope.
- Align compliance metrics: determine when `fleetDataManager` can defer to centralized stats vs. requiring interim mapping utilities.
- Verify Neon transaction guarantees before removing reconciliation calls from document upload flows.


