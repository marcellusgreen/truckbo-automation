# src/App.tsx Refactor Plan

## Objectives
- Decouple `src/App.tsx` into feature-focused modules without regressing fleet onboarding, centralized data sync, or document ingestion.
- Replace legacy `persistentFleetStorage` and event bus touchpoints with the centralized fleet data service and Neon-backed document/job workflows described in `docs/DATA_FLOW_REWORK_SUMMARY.md` and `docs/agents.md`.
- Standardize domain models (`UnifiedVehicleData`, `VehicleRecord`, `VehicleSummaryView`) through typed mapping utilities to eliminate ad-hoc casting.
- Maintain runtime parity through feature flags, incremental rollout, and repeatable regression checks.

## Phase 0 – Baseline & Guardrails
1. Capture current behavior:
   - Record smoke scripts for fleet dashboard load, vehicle add (manual + bulk), document upload ? status polling ? Neon persistence.
   - Snapshot existing `npx tsc --noEmit` output and critical UI logs (noting current garbled strings) for delta tracking.
2. Instrument guardrails:
   - Add temporary telemetry/log assertions around `persistentFleetStorage.addVehicles`, event bus subscriptions, and document upload flows to validate runtime call patterns during refactor.
   - Ensure Vision / Neon integration steps in `docs/agents.md` remain green before touching orchestrations.

## Phase 1 – Dependency Mapping
1. Audit `src/App.tsx` state and side-effects:
   - Enumerate state variables, derived selectors, and their consumers.
   - Build a matrix of service dependencies (`persistentFleetStorage`, `fleetDataManager`, `centralizedFleetDataService`, document services).
2. Document event flows:
   - Trace event bus publishers/subscribers and identify which remain required after central service migration.
3. Output artifacts: dependency map, state ownership chart, and list of removable dead states.

## Phase 2 – Storage Adapter Layer
1. Create `services/fleetStorageAdapter.ts` (or similar) exporting typed methods that wrap centralized service calls while preserving legacy signatures used in `App.tsx`.
2. Implement translation helpers that:
   - Convert legacy `VehicleRecord` payloads to `UnifiedVehicleData` inputs.
   - Provide consistent error handling/logging in line with `docs/DATA_FLOW_REWORK_SUMMARY.md` transaction guarantees.
3. Introduce feature-flagged usage in `App.tsx`, defaulting to adapter but allowing fallback to legacy storage for rollback.

## Phase 3 – Fleet State Hook
1. Extract fleet state concerns into `hooks/useFleetState.ts`:
   - Manage loading, reconciliation toggles, refresh handlers, and derived metrics.
   - Consume the new adapter + centralized service and return stable view models.
2. Migrate `FleetPage` usage incrementally:
   - Replace direct state slices in `App.tsx` with hook outputs.
   - Remove unused state variables after each successful `npx tsc --noEmit` run and UI smoke test.

## Phase 4 – Onboarding & Document Hooks
1. Build `hooks/useOnboardingFlow.ts` encapsulating document upload, VIN parsing, manual entry state, and progress tracking.
2. Integrate Neon job metadata lifecycle:
   - Align with steps in `docs/agents.md` (recordJobStart ? poll ? finalizeJob).
   - Surface job metadata to UI components without altering user-facing messaging.
3. Gate the new hook with a feature flag; run document upload regression after switch.

## Phase 5 – Type Mapping Utilities
1. Create `utils/vehicleMapping.ts` housing pure converters between `UnifiedVehicleData`, `VehicleRecord`, `VehicleSummaryView`.
2. Replace ad-hoc casts throughout `App.tsx` and dependent components, ensuring TypeScript passes after each conversion chunk.
3. Add focused unit tests (where feasible) covering conversions, informed by existing data extractor expectations.

## Phase 6 – Event & Logging Cleanup
1. Decommission event bus subscriptions that become redundant once centralized refresh logic lives in hooks.
2. Normalize logging strings and levels, removing unicode noise and aligning log context (jobId, organizationId) with the runbook.
3. Confirm telemetry still captures key lifecycle events (document processing, fleet refresh).

## Phase 7 – Consumer Alignment
1. Update `AddVehicleModal`, `BulkUploadModal`, `DocumentUploadModal`, and `MultiBatchDocumentUploadModal` to consume the adapter/hooks.
2. Ensure shared components (`ComprehensiveComplianceDashboard`, etc.) read from the standardized view models.
3. Remove deprecated service imports (`fleetDataManager`, direct storage calls) once consumers compile and pass smoke tests.

## Phase 8 – Verification & Hardening
1. Run full `npx tsc --noEmit` and targeted Jest/vitest suites (if available) until clean.
2. Execute regression matrix: onboarding (manual & document), fleet dashboard (load/refresh/reconcile), driver management, compliance metrics.
3. Document any known gaps, capture follow-up tickets (e.g., test harness cleanup per `documents/typescript-cleanup-overview.md`).

## Documentation Outputs
- Maintain this plan (`docs/refactor/src-app/refactor-plan.md`) as the source of truth; update per phase completion.
- Log phase artifacts in sibling markdown files (e.g., `dependency-map.md`, `adapter-status.md`) inside `docs/refactor/src-app/`.
- Cross-link relevant data flow docs to keep centralized service and document ingestion narratives consistent.

