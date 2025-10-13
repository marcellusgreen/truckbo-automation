# src/App.tsx Dependency Map (2025-10-08)

## Overview
- Scope covers in-file components (`OnboardingPage`, `FleetPage`, `CompliancePage`, `DashboardPage`, `AppContent`) that still reside in `src/App.tsx`.
- Centralized services coexist with legacy storage/event flows; this map highlights state ownership and touchpoints to prioritize during the hook/adapter rollout.

## OnboardingPage (`src/App.tsx`:43)
- Local state: `step`, `onboardingMethod`, `uploadedFile`, `isProcessing`, `parsedVINs`, `enhancedVehicleData`, `processingProgress`, `processingStatus`, `error`, `manualEntryData`, modal toggle (`isDocumentUploadOpen`).
- External services: VIN enrichment via `dataInputService.getVehicleData`, CSV helpers (`parseCSVFile`, `validateVIN`), document modal feeding `documentProcessor`.
- Storage writes: converts review data to `VehicleRecord` and currently calls `persistentFleetStorage.addVehicles`; also seeds `fleetDataManager.addVehicles` for legacy compatibility.
- Refactor notes: Phase 4 should migrate this logic into `useOnboardingFlow` and route writes exclusively through the adapter.

## FleetPage (`src/App.tsx`:1034)
- Local state: `unifiedVehicles`, `isLoading`, search/filter inputs, view toggles, modal toggles (`isAddModalOpen`, `isBulkUploadOpen`, `isDocumentUploadOpen`, `isMultiBatchUploadOpen`, `isTestRunnerOpen`). When `VITE_USE_FLEET_HOOK` is enabled these mirror the hook output, but the legacy state remains for rollback.
- External services: `useFleetState` powers reads/writes when the hook flag is true; the legacy path still relies on `useFleetData` plus `fleetStorageAdapter`/`persistentFleetStorage` calls for compatibility.
- Event flows: emits `FleetEvents.documentProcessed`, clears `reconcilerAPI` caches, and now invokes `refreshFleetState` when available before falling back to `loadVehicles`.
- Pending cleanup: duplicate search/filter logic exists in both the component and the hook; status filters still assume legacy compliance scoring.
- Refactor targets: retire manual `loadVehicles`/legacy subscriptions, consolidate filters inside the hook, and eliminate direct `fleetDataManager` stats once mapping utilities backfill the needed views.

## CompliancePage (`src/App.tsx`:2000)
- Local state: `tasks`, `selectedTask`, `filterStatus`, `filterPriority`, `searchTerm`.
- External services: `fleetDataManager` remains the sole source (`subscribe`, `getAllComplianceTasks`, `updateTaskStatus`).
- Refactor notes: evaluate after mapping utilities land whether `useFleetState` (or a dedicated compliance hook) can supply these aggregates.

## Document & Modal Interactions
- `DocumentUploadModal` accepts `onDocumentsProcessed`; with the adapter flag on it calls `fleetStorageAdapter.addVehicles`, otherwise falls back to `persistentFleetStorage.addVehicles`, then emits events and syncs reconciler data.
- `MultiBatchDocumentUploadModal` clears reconciler cache and rehydrates via hook/legacy refresh helpers.
- To-do: once hook coverage is stable, remove direct `persistentFleetStorage` fallbacks and rely on the adapter APIs exclusively.

## DashboardPage (`src/App.tsx`:2365)
- Local state: `fleetStats` (hook-provided when the flag is on, otherwise via `useFleetData`), `complianceStats` from `fleetDataManager`.
- Subscriptions: legacy path listens to centralized service plus `fleetDataManager`; the hook path sets stats via `useFleetState` and only keeps the legacy subscriber for rollback.
- Outstanding issues: compliance widgets still depend on `fleetDataManager` data shapes; mapping utilities are required before retiring the legacy manager.

## AppContent (`src/App.tsx`:2520)
- Local state: `currentPage`, `storageInitialized`.
- Startup: initializes `persistentFleetStorage` with rollback support regardless of centralized readiness.
- Legacy ties: header badges still pull `fleetDataManager.getComplianceStats()`; navigation remains custom state pending future router extraction.

## Shared Service Touchpoints
- `persistentFleetStorage`: adapter fronts most writes, but direct calls linger in CompliancePage/modals until the hook rollout completes.
- `centralizedFleetDataService`: primary read source; hook subscribers rely on it while legacy flows still call `initializeData`/`getVehicles` manually.
- `fleetDataManager`: still powers compliance stats/tasks; slated for replacement once mapping utilities and hook consumers stabilize.
- `eventBus` & `FleetEvents`: retained for manual refresh notifications; remove after hook-driven refresh survives smoke validation.
- `reconcilerAPI`: invoked to sync document ingestion and clear caches post-upload.
- `authService`, `documentDownloadService`, `comprehensiveComplianceService`: continue servicing specialized flows (driver docs, compliance drill-down).

## Refactor Readiness Summary
- Candidate extractables: onboarding workflow (Phase 4), fleet state/query logic (Phase 3), document ingestion handlers (Phase 4).
- Blocking issues: compliance dashboards and modals remain coupled to `fleetDataManager`; mapping utilities (Phase 5) plus validated smoke artifacts are required before removing legacy paths.

## Follow-Up Notes (2025-10-08)
- FleetPage now delegates to `useFleetState` when `VITE_USE_FLEET_HOOK` is enabled; remove mirrored local state once parity is confirmed.
- Dashboard stats read from the hook under the same flag, but compliance widgets still lean on `fleetDataManager`; plan a mapping pass before defaulting the hook.
- CompliancePage remains tied to `fleetDataManager`; reassess after mapping utilities are expanded.
- Event bus refresh calls remain for safety; trim them once hook-driven refresh survives the smoke run.
- Phase 0 smoke artifacts are placeholders—capture real logs/data-shapes to unblock wider rollout.

## 2025-10-12 Notes
- FleetPage now relies solely on useFleetState; the legacy loadVehicles workflow was removed and the hook controls refresh/add flows.
- Dashboard widgets use hook totals when the flag is enabled, but compliance widgets still hit leetDataManager until mapping utilities expand.
- AppContent no longer tracks a storageInitialized flag; startup just initializes persistentFleetStorage.
- Remaining cleanup: remove event bus refreshes once downstream dashboards migrate, and align document/modals with the adapter refresh helpers.
## 2025-10-15 Notes
- Compiler is clean (`tsc-run-20251015.log`) after updating reporting, storage, and test services; hook/adapter consumers now align with the centralized error handling.
- `storageManager` no longer accepts injected database clients; it lazily constructs the REST-backed service via `createDatabaseService()` and routes document reads through `searchDocuments('')`.
- Feature flags default to the hook path (`VITE_USE_FLEET_HOOK=true` plus a fallback inside `featureFlags.ts`), so remaining legacy UI branches can be retired once smoke tests confirm parity.
- Compliance/Dashboard widgets continue to read `fleetDataManager`; prioritize mapping utilities + artifact capture to unlock their migration and the removal of event bus refresh shims.
