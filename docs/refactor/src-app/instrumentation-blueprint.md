# Instrumentation Blueprint (Pre-Refactor)

These notes specify where to add temporary telemetry so we can observe runtime behaviour while migrating `src/App.tsx` to modular hooks and adapters.

## Toggle Strategy
- Create a shared feature flag helper (e.g., `src/utils/refactorDebug.ts`) exposing `isRefactorDebugEnabled()`. Default to reading `import.meta.env.VITE_REFACTOR_DEBUG === 'true'`.
- All instrumentation should check this flag before emitting logs/metrics so we can disable it in production builds.

## Targeted Touchpoints

### 1. Fleet Storage Calls (`src/services/persistentFleetStorage.ts`)
- **Methods:** `addVehicles`, `updateVehicle`, `clearFleet`, `getFleetAsync`.
- **Action:** wrap existing `withErrorHandling.async` blocks with `const start = performance.now()` and log `{operation, durationMs, vehicleCount, caller}` on success; include error payloads on failure.
- **Caller Identification:** Temporarily augment `persistentFleetStorage` export with an option to pass `callerId` (e.g., via optional parameter or `AsyncLocalStorage` shim) so we know whether `App.tsx`, modals, or tests triggered the call.

### 2. Centralized Service (`src/services/centralizedFleetDataService.ts`)
- **Methods:** `addVehicles`, `initializeData`, `refreshReconciledData`, `clearAllFleetData`.
- **Action:** emit structured logs around phase boundaries (`backupCreated`, `persistentWriteComplete`, `reconcilerSyncStart`, `rollbackTriggered`).
- **Metrics:** capture counts of `result.processed` / `result.failed` before returning.

### 3. Event Bus (`src/services/eventBus.ts`)
- **Action:** add a development-only subscriber (inside a guard) that appends each dispatched event to an in-memory ring buffer. Expose a `window.__FLEET_EVENT_LOG__` inspector during debugging.

### 4. Document Pipeline (`src/services/documentProcessor.ts`, `DocumentUploadModal`)
- **Action:** log jobId lifecycle checkpoints: upload start, Vision polling success, Neon persistence, cleanup invocation. Cross-reference state with `docs/agents.md` expectations.

### 5. UI Entry Points (`src/App.tsx`)
- **Action:** before extracting hooks, insert no-op wrappers such as `recordFleetAction('bulk-upload')` near modal callbacks. Once hooks exist, migrate these calls into hook internals.

## Data Capture Format
- Use `logger.debug('refactorBaseline', { component: 'PersistentFleetStorage', operation, durationMs, caller, meta })` to keep logs greppable.
- For browser console output, prefix entries with `[%cRefactor%c]` using styling for easy filtering.
- Store representative log dumps under `docs/refactor/src-app/artifacts/logs-<date>.md` during baseline runs.

## Cleanup Reminder
- Track all temporary instrumentation via a `TODO(refactor-cleanup)` comment so they can be removed or downgraded once parity verification passes.

