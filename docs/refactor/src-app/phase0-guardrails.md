# Phase 0 Guardrails & Baseline Capture

This checklist prepares the refactor by locking down current behaviour before any structural changes land. Complete (and record) each item prior to touching `src/App.tsx`.

## 1. Project Snapshot
- **TypeScript:** run `npx tsc --noEmit > temp/tsc-baseline.log` and archive the log under `docs/refactor/src-app/artifacts/tsc-baseline-<date>.log`. This becomes the diff target after each refactor phase.
- **Git Status:** capture `git status --short` and `git diff --stat` into `docs/refactor/src-app/artifacts/git-baseline-<date>.log` to prove no unrelated drift was introduced during the refactor window.
- **Package Versions:** record `node -v`, `npm -v`, and the activated `.env` file (excluding secrets) so rebuilds happen under identical tooling.

## 2. UI Smoke Scripts
Record quick walkthroughs (video or scripted notes) for the flows most likely to regress:
1. **Fleet Dashboard Load**
   - Start the combined dev servers (`npm run dev:api`).
   - Log in with a seeded account.
   - Navigate to _Dashboard_ and confirm stats populate from `centralizedFleetDataService.getFleetStats()` with no console errors.
2. **Manual Add Vehicle**
   - Go to _Fleet_ ? `+ New Vehicle`.
   - Add a vehicle using `AddVehicleModal`.
   - Verify `persistentFleetStorage.addVehicles` fires (current implementation still batches under the hood) and UI refreshes without duplicate rows.
3. **Bulk CSV Upload**
   - Open `BulkUploadModal`, upload the sample from `utils/downloadSampleCSV`.
   - Validate the toast and confirm the added vehicles survive a page reload (forcing `centralizedFleetDataService.initializeData`).
4. **Document Ingestion Pipeline**
   - Use `DocumentUploadModal` or `MultiBatchDocumentUploadModal`.
   - Poll the status screen until completion.
   - Inspect Network tab for `/api/v1/documents/process-status/:jobId` responses that include `jobMetadata`, ensuring the Neon-backed flow (per `docs/agents.md`) is operational.
5. **Compliance Dashboard Refresh**
   - Visit _Comprehensive Compliance_ and verify cards reflect the API-backed `useComplianceData` results with no stale data or console errors.

Document results in `docs/refactor/src-app/artifacts/smoke-<date>.md` with timestamps, screenshots, or console snippets as proof points.

## 3. Telemetry & Logging Baseline (Retired)
The temporary refactor instrumentation (`VITE_REFACTOR_DEBUG`, event bus mirrors) has been removed. Rely on standard API/server logs when capturing baseline evidence.

## 4. Data Shape Snapshots
- Export sample payloads from:
  - `persistentFleetStorage.getFleetAsync()` (raw API response).
  - `centralizedFleetDataService.getVehicles()` (post-merge view).
  - `reconcilerAPI.getFleetDashboard()`.
- Save the JSON examples in `docs/refactor/src-app/artifacts/data-shapes/` to guide mapping utility creation.

## 5. Rollback Plan
- Note the feature flag strategy (e.g., `REFRESH_FLEET_DATA_FROM_CENTRALIZED=true`) and how to revert to legacy storage if regression occurs.
- Ensure QA knows how to re-run the smoke suite rapidly after rollback.

> Keep these artifacts synchronized; they act as the contract guaranteeing feature parity after each migration phase.
