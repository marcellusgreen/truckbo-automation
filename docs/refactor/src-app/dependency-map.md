# src/App.tsx Dependency Map (2025-10-20)

## Overview
- Scope still covers in-file components (`OnboardingPage`, `FleetPage`, `CompliancePage`, `DashboardPage`, `AppContent`).
- The centralized adapter/hook stack is now the single source of truth; legacy `fleetDataManager` and `eventBus` shims have been removed.

## OnboardingPage (`src/App.tsx`)
- Local state: onboarding flow controls (`step`, `onboardingMethod`, uploads, errors, manual entry modal state).
- External services: VIN enrichment via `dataInputService`, CSV helpers, and the document ingestion modal feeding `documentProcessor`.
- Storage writes: routed exclusively through `centralizedFleetDataService.addVehicles` via `fleetStorageAdapter`; no legacy storage seeding.

## FleetPage (`src/App.tsx`)
- State: relies on `useFleetState` for vehicles, loading/error, search/filter outputs, and modal toggles.
- External services: hook initializes `fleetStorageAdapter`, refreshes centralized data, and handles add/update/clear operations.
- Pending cleanup: continue consolidating duplicate search/filter helpers into the hook and trimming feature-flag fallbacks once smoke evidence is captured.

## CompliancePage (`src/App.tsx`)
- State: `useComplianceData` hook supplies tasks, stats, and status updates backed by the compliance API (`createDatabaseService`).
- Legacy ties: none; `fleetDataManager` is no longer referenced.

## Document & Modal Interactions
- `DocumentUploadModal` invokes `documentProcessor`, then runs `fleetStorageAdapter.addVehicles` followed by centralized refresh; all logging is now silent/no-op.
- `MultiBatchDocumentUploadModal` reuses the adapter + centralized refresh helpers without emitting events.

## DashboardPage (`src/App.tsx`)
- State: fleet metrics come from `useFleetState`; compliance summaries come from `useComplianceData`.
- Subscriptions: hook callbacks keep page state synchronized—no manual event bus wiring remains.

## AppContent (`src/App.tsx`)
- State: `currentPage` navigation and centralized storage initialization remain; header quick stats read from `centralizedFleetDataService.getFleetStats()` and `useComplianceData`.
- Legacy ties: none—header badges no longer read `fleetDataManager`.

## Shared Service Touchpoints
- `fleetStorageAdapter` + `persistentFleetStorage` for API persistence.
- `centralizedFleetDataService` as the UI-facing cache/aggregator.
- Document pipeline (`documentProcessor`, `documentStatusPoller`, `googleVisionProcessor`) feeding the adapter.
- Compliance data fetched via `createDatabaseService().getActiveAlertsByOrganization()`.

## Refactor Readiness Summary
- Hooks/adapters now power onboarding, fleet, compliance, and dashboard flows.
- Remaining tasks: capture Phase 0 smoke artifacts, retire feature-flag scaffolding, and finish aligning archived test utilities.

## 2025-10-20 Notes
- Event bus & `fleetDataManager` removed from runtime code.
- Temporary `isRefactorDebugEnabled` instrumentation deleted; logging helpers are now simple no-ops where stubs remain.
- Compliance metrics and tasks now originate from the API-backed hook, enabling dashboard/header consolidation.
