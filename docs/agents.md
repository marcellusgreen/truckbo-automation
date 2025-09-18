# Agent Runbook: Document Ingestion & Data Flow

## 1. High-Level Architecture
- **Client Upload** ? POST /api/v1/documents/process (Express + Multer) stores upload to OS temp, reads into memory, deletes temp file after Vision handoff.
- **Vision Job Orchestration** ? googleVisionProcessor.processDocumentAsync uploads buffer to 	ruckbo-gcs-input-documents, creates async Vision job targeting 	ruckbo-gcs-output-results, and persists job metadata (see §4).
- **Asynchronous Processing** ? Clients poll GET /api/v1/documents/process-status/:jobId; handler queries Google Vision via getAsyncResult which now returns { status, result, job }.
- **Structured Extraction** ? Full text from Vision JSON is normalized by dataExtractor (vehicle/driver heuristics) with original filename context for traceability.
- **Persistent Storage** ? On status === 'succeeded', route delegates to documentStorage.saveDocumentResult, which runs inside a single Postgres transaction (Neon) to create/update documents, ehicles, drivers.
- **Cleanup** ? After a successful commit, the route invokes googleVisionProcessor.finalizeJob, which uses persisted job metadata to delete GCS input/output objects and mark cleanup status.

`
[Client] --multipart--> [Express Upload] --buffer--> [Vision Processor]
   ¦                                             ¦
   ¦                                             +--> GCS Input Bucket (temporary)
   ¦                                             +--> Vision Async Job ? GCS Output
   ¦                                                     ¦
   ¦<---- status polling ---- [documents route] ?--------+
                                     ¦
                                     +--> documentStorage (transaction)
                                     ¦       +-- documents
                                     ¦       +-- vehicles/drivers
                                     ¦       +-- job metadata snapshot
                                     +--> finalizeJob ? cleanup GCS artifacts
`

## 2. Core Components & Responsibilities
| Component | Responsibility | Notes |
|-----------|----------------|-------|
| /server/api/routes/documents.ts | API surface for uploads and status checks | Persists job & document metadata, coordinates cleanup |
| googleVisionProcessor.ts | Vision client, GCS interactions, extraction | Tracks jobs in Neon, cleans GCS only after inalizeJob |
| documentProcessingJobs.ts | Neon persistence for job metadata | Exposes ecordJobStart, markSucceeded/Failed, markCleanupStatus |
| documentStorage.ts | Neon writes for documents/entities | Uses single pg client/transaction; helpers accept scoped executor |
| dataExtractor.ts | Text parsing into structured vehicle/driver data | Uses sourceFileName for traceability |

## 3. Data Stores & Contracts
- **Google Cloud Storage**: 	ruckbo-gcs-input-documents (raw uploads, transient) and 	ruckbo-gcs-output-results (Vision JSON, transient). Object naming uses uuid-originalFilename.
- **Google Vision**: Async DOCUMENT_TEXT_DETECTION. Operation ID is primary key for job tracking.
- **Neon PostgreSQL**:
  - document_processing_jobs.job_id = Vision operation ID.
  - documents now stores original_filename, ile_size, ile_type, s3_bucket, s3_key, s3_url, and extraction_data.jobMetadata.

## 4. Job Tracking Lifecycle
1. ecordJobStart saves metadata and resets status/cleanup fields.
2. getAsyncResult
   - Returns { status: 'processing', job } until Vision completes.
   - On success, downloads JSON, extracts text, stores esultObject, returns structured data plus job record.
   - On failure, marks status = 'failed' with error message.
3. Documents route persists Neon data; on commit success it calls inalizeJob.
4. cleanupJobArtifacts deletes input/output objects and updates cleanup_status.

## 5. Best Practices
### Schema & Migrations
- Apply document_processing_jobs creation + index before deploying new code.
- Keep migrations transactional; run in controlled order (schema first, services second).

### Code & Transactions
- Use pool.connect() with try/finally elease() when touching Neon directly.
- Pass scoped executor (DbExecutor) into helpers so all queries participate in one transaction.
- Let googleVisionProcessor.finalizeJob handle GCS cleanup; do not delete artifacts ad hoc.
- Preserve jobMetadata in document records to simplify audits and recovery.

### Error Handling & Observability
- Log Vision job errors vs Neon errors separately; include jobId, organizationId, and request context.
- Monitor document_processing_jobs for stale status = 'processing' or cleanup_status = 'failed'.
- Surface job metadata in API responses so clients can troubleshoot without direct DB access.

### Security & Compliance
- Validate upload size/type prior to Vision handoff; plan for PII or malware screening if required.
- Store service credentials (GOOGLE_APPLICATION_CREDENTIALS, DATABASE_URL) in secure secret manager; avoid committing secrets.
- Enforce auth middleware to supply real organization ID (current code still uses placeholder).
- Consider bucket lifecycle policies to auto-expire lingering objects as a safety net.

### Operational Runbook
1. **Pre-Deploy**: run schema migration; verify env vars; ensure GCS buckets exist.
2. **Smoke Test**: upload sample doc ? poll status ? confirm document row + job record; ensure GCS cleanup executed.
3. **Monitoring**: add alerts for jobs older than threshold or repeated cleanup failures.
4. **Recovery**: rerun saveProcessingResultToDatabase(jobId, job.resultObject) after fixing Neon issues; rerun googleVisionProcessor.finalizeJob(jobId) for cleanup retries.

### Testing Guidance
- Unit-test job service with mocked query to assert status transitions.
- Integration-test documentStorage using test database; ensure rollback on error.
- End-to-end tests should include actual GCS/Vision sandbox buckets to validate cleanup.

## 6. Common Pitfalls & Mitigations
| Pitfall | Symptom | Mitigation |
|---------|---------|------------|
| Schema not applied | API throws elation document_processing_jobs does not exist | Apply migration before service rollout |
| Lost job metadata after restart | Status endpoint errors “job metadata missing” | ecordJobStart now persists data; ensure service writes succeed |
| Premature GCS cleanup | Document record missing text | Only call inalizeJob after Neon commit |
| Cleanup retries log 404 | Repeated GCS deletion attempts | deleteIfExists treats 404 as no-op; monitor cleanup_status |
| Hard-coded org ID | Documents tied to sample org | TODO: integrate auth context to supply real org |

## 7. Quick Reference SQL
`
-- Inspect active jobs
SELECT job_id, status, cleanup_status, updated_at
FROM document_processing_jobs
ORDER BY updated_at DESC;

-- Jobs needing cleanup retries
SELECT job_id, error_message
FROM document_processing_jobs
WHERE cleanup_status = 'failed';
`

## 8. Open TODOs
- Replace placeholder organization ID with authenticated context.
- Automate cleanup retries for stale jobs.
- Reduce ESLint debt (current repo fails 
pm run lint).
- Consider encrypting temporary GCS objects if policy requires.

---
Last updated: 2025-09-17 11:18:35 -04:00
