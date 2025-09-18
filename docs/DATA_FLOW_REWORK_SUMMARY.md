# Data Flow Hardening Summary

## Context
- Unified document processing pipeline now records Google Cloud Vision long-running jobs in Neon via new `document_processing_jobs` table and service layer.
- Async status polling returns both processing status and persisted job metadata so API consumers can trace artifacts and retry safely.
- Neon persistence for extracted data now runs inside a single transaction to prevent partial writes and correctly associates each document with its original file metadata.
- GCS cleanup is deferred until after successful database commits, eliminating premature deletion when persistence fails.

## Key Changes
1. **Database Schema**
   - Added `document_processing_jobs` table with fields for original filename, MIME type, file size, GCS bucket/object paths, job status, cleanup status, timestamps, and optional error/details.
   - Created supporting index `idx_document_jobs_status` for monitoring in-flight jobs.

2. **Shared Services**
   - Introduced `shared/services/documentProcessingJobs.ts` to wrap CRUD operations on the new table, encapsulate logging, and expose helpers for transitions between processing/success/cleanup states.
   - Updated `shared/services/googleVisionProcessor.ts` to:
     - Persist job start metadata immediately after uploading to GCS.
     - Return `{ status, result, job }` payloads, including structured extraction results and job record.
     - Delay cleanup, expose `finalizeJob` to delete input/output artifacts only when the caller confirms persistence.
     - Pass original filename into `dataExtractor` for improved traceability.

3. **API Layer**
   - `server/api/routes/documents.ts` now consumes the richer Vision response, stores job metadata with the document record, and invokes `finalizeJob` after a successful commit.
   - Helper `saveProcessingResultToDatabase` now:
     - Accepts `DocumentProcessingJobRecord` and stores accurate `originalFilename`, `fileSize`, `fileType`, `s3Bucket`, `s3Key`, and `s3Url`.
     - Embeds `jobMetadata` inside `extractionData` for downstream debugging.
   - Status responses include job metadata for clients to observe processing progress or errors.

4. **Document Storage Transaction Handling**
   - `shared/services/documentStorage.ts` acquires a dedicated client with `pool.connect()`, executes all inserts/updates through a scoped executor, and rolls back on failure.
   - All helper methods (`handleVehicleData`, `handleDriverData`, etc.) accept the executor so they participate in the same transaction.

## Outstanding Work / Next Steps
1. **Apply Schema Migration**
   - Run the SQL changes from `database/schema.sql` (creation of `document_processing_jobs` table and index) against the Neon database.
2. **Environment Updates**
   - Ensure application environments have the new code deployed alongside the schema update.
   - Confirm Google Cloud Storage buckets referenced in `googleVisionProcessor` exist (`truckbo-gcs-input-documents`, `truckbo-gcs-output-results`).
3. **Operational Tasks**
   - Monitor `document_processing_jobs` for lingering entries with `cleanup_status = 'failed'` or old `status = 'processing'`; investigate/retry as needed.
   - Decide whether to backfill existing document records with `jobMetadata` (optional).
4. **Testing**
   - Execute end-to-end upload -> status polling -> Neon persistence to validate job tracking and cleanup.
   - No automated lint/test run succeeded yet; `npm run lint` still fails due to pre-existing repository-wide violations (˜500 errors).
5. **Follow-up Enhancements (Optional)**
   - Add retry logic for failed Neon writes to rehydrate Vision output from GCS if needed.
   - Implement periodic cleanup job that prunes stale `document_processing_jobs` or retries cleanup failures.
   - Extend API responses/tests to cover new `job` metadata contract.

## Validation Status
- Manual inspection of affected files.
- No automated lint/tests run clean (existing lint debt remains).

## Artifacts
- Schema change: `database/schema.sql`
- New service: `shared/services/documentProcessingJobs.ts`
- Updated services/routes:
  - `shared/services/googleVisionProcessor.ts`
  - `shared/services/documentStorage.ts`
  - `server/api/routes/documents.ts`
