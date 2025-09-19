# TypeScript Cleanup Overview

## Goal
Restore a clean `npx tsc --noEmit` build by removing stale code, realigning types, and tightening the frontend typing surface.

## High-Level Scope
1. **Core Application (src/App.tsx)**
   - Remove unused imports/variables that TypeScript flags (e.g., FleetDashboard, eventBus).
   - Fix API mismatches (PersistentFleetStorage.addVehicles vs addVehicle).
   - Standardize state setters and union types (status filters, compliance filters).
   - Clean up implicit `any` usage in handlers/event callbacks.
   - Ensure mapped data matches the target view models (VehicleSummaryView, VehicleRecord).

2. **Legacy/Test Harness Files**
   - Audit src/TestApp*.tsx, TestRealApp*.tsx, TestAppImports.tsx.
   - Remove or update imports referencing deprecated services (fleetDataManager.getFleet, etc.).
   - Drop unused component imports to silence TS6133/TS6192 errors.
   - Decide whether to archive or modernize these harness files; many are no longer used.

3. **Utility/Service Alignment**
   - src/utils/fieldStandardization.ts: trim unused constants (FIELD_NAMING_STANDARDS) and parameters (source, category).
   - src/services/persistentFleetStorage.ts and centralizedFleetDataService: ensure exported interfaces match consumer expectations.
   - Check for orphaned references after removing deprecated helpers.

4. **Persistent Storage APIs**
   - Confirm the active storage layer (persistentFleetStorage vs postgresPersistentFleetStorage) and harmonize method signatures.
   - Update consumers that still reference old methods (getFleet, addVehicles) to current names.

## Suggested Order of Work
1. Disable or relocate unused test harness files to stop polluting tsc.
2. Refactor src/App.tsx: remove unused code, align types, and replace ad-hoc casting.
3. Align services so method names/types match UI usage; add missing exports or adjust imports.
4. Clean up utility modules and make sure helpers return strongly typed data.
5. Run tsc until clean, then verify critical flows (fleet load, clear fleet, document upload) still work.

## Notes
- Keep commits granular for easier review (e.g., prune harness imports, align App.tsx filters).
- If removing harness files entirely, archive them or exclude via tsconfig.
- Consider adding lightweight tests once types are stabilized.

## Desired Outcome
- `npx tsc --noEmit` succeeds with zero TypeScript errors.
- Core components rely on consistent shared types with no `any` fallbacks.
- Legacy scaffolding is either updated or removed to prevent future drift.
- Runtime behaviours remain unchanged: fleet state persists, document uploads parse VINs, etc.

