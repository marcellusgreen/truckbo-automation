# Fleet Storage Adapter & Hook Rollout (Status 2025-10-20)

## Current State
- `useFleetState` drives all fleet reads/writes; the legacy `fleetDataManager` and `eventBus` integrations have been removed.
- Onboarding and document flows push results through `fleetStorageAdapter` only, then call the centralized refresh helpers—no event emissions.
- `useComplianceData` supplies API-backed compliance tasks/stats, allowing dashboard/header widgets to rely entirely on centralized data.
- Temporary `VITE_REFACTOR_DEBUG` instrumentation has been deleted; refactor logging helpers are no-ops.

## Remaining Checklist
1. Capture Phase 0 smoke artifacts (logs, data shapes, checklist) with the hook path enabled by default.
2. Trim any lingering feature-flag scaffolding once smoke evidence is recorded.
3. Expand `vehicleMapping` coverage/tests as we wire additional consumers (e.g., VehicleSummary views).

## Feature Flags
- `isFleetAdapterEnabled` and `isFleetHookEnabled` remain for controlled rollouts, but both default to `true`; centralized paths are now the baseline.

## Compatibility & Rollback Notes
- Adapter still delegates to `persistentFleetStorage` when the flag is disabled or API calls fail, preserving write reliability.
- No event bus notifications remain; listeners should rely on hook callbacks/subscribers for refreshes.

## Open Items
- Confirm whether driver-management flows require additional adapter support in upcoming phases.
- Determine when archived test harnesses can be retired or modernized once lint debt is cleared.
