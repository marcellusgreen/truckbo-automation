# src/App.tsx Cleanup Blockers

## Context
While attempting to refactor `src/App.tsx` to align with the centralized fleet data service and retire legacy storage calls, repeated efforts ran into cascading type and structural issues. The component is very large and tightly coupled to UI logic, making piecemeal edits risky without a dedicated refactor window.

## Current Pain Points
- **Stale Storage Usage:** The file still calls `persistentFleetStorage.addVehicles` in several places. Transitioning to `addVehicle` or delegating to `centralizedFleetDataService` requires broader changes across onboarding and fleet management flows.
- **Fleet Page State:** Numerous states (`isLoading`, `showReconciledView`, etc.) are unused or mismatched with the new centralized service, triggering TypeScript errors when removed naively.
- **Type Misalignments:** Conversions between `UnifiedVehicleData`, `VehicleRecord`, and `VehicleSummaryView` rely on ad-hoc casts. Cleaning these up needs a consistent mapping layer.
- **Event/Synchronization Handlers:** Legacy event bus logic remains, but the centralized service already handles refreshes. Reworking this without breaking live updates needs careful end-to-end testing.
- **Logging / Unicode Noise:** The file contains a mix of human-readable and garbled log strings, making it hard to spot functional changes.

## Recommendation
Treat `src/App.tsx` as a focused refactor project:
1. Extract onboarding helpers (document processing, completion) into dedicated hooks/services.
2. Rebuild the Fleet page around the centralized service, replacing storage calls with typed adapters.
3. Standardize type conversions (`UnifiedVehicleData` ? `VehicleSummaryView`) in utility modules.
4. Re-run `npx tsc --noEmit` after each milestone to keep the codebase buildable.
5. Once `App.tsx` is stable, update `AddVehicleModal`, `BulkUploadModal`, and other consumers to the new storage API.

A pairing or mob session might help to make large, coordinated changes without leaving the file in a broken state.
