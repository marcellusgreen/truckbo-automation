// Document Processing Job Tracking Service
// Persists Vision API job metadata in Neon for reliable status and cleanup handling.

import { query } from './db';
import { logger, LogContext } from './logger';

export type JobStatus = 'processing' | 'succeeded' | 'failed';
export type CleanupStatus = 'pending' | 'completed' | 'failed';

export interface DocumentProcessingJobRecord {
  jobId: string;
  originalFilename: string;
  mimeType: string | null;
  fileSize: number | null;
  gcsInputBucket: string;
  gcsInputObject: string;
  gcsOutputBucket: string;
  gcsOutputPrefix: string;
  resultObject: string | null;
  status: JobStatus;
  errorMessage: string | null;
  cleanupStatus: CleanupStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface JobStartPayload {
  jobId: string;
  originalFilename: string;
  mimeType: string | null;
  fileSize: number | null;
  gcsInputBucket: string;
  gcsInputObject: string;
  gcsOutputBucket: string;
  gcsOutputPrefix: string;
}

class DocumentProcessingJobsService {
  private readonly context: LogContext = { layer: 'storage', component: 'DocumentProcessingJobsService' };

  async recordJobStart(payload: JobStartPayload): Promise<DocumentProcessingJobRecord> {
    const { jobId, originalFilename, mimeType, fileSize, gcsInputBucket, gcsInputObject, gcsOutputBucket, gcsOutputPrefix } = payload;

    const insertQuery = `
      INSERT INTO document_processing_jobs (
        job_id, original_filename, mime_type, file_size,
        gcs_input_bucket, gcs_input_object, gcs_output_bucket, gcs_output_prefix,
        status, cleanup_status, error_message, result_object, completed_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', 'pending', NULL, NULL, NULL, NOW())
      ON CONFLICT (job_id) DO UPDATE SET
        original_filename = EXCLUDED.original_filename,
        mime_type = EXCLUDED.mime_type,
        file_size = EXCLUDED.file_size,
        gcs_input_bucket = EXCLUDED.gcs_input_bucket,
        gcs_input_object = EXCLUDED.gcs_input_object,
        gcs_output_bucket = EXCLUDED.gcs_output_bucket,
        gcs_output_prefix = EXCLUDED.gcs_output_prefix,
        status = 'processing',
        cleanup_status = 'pending',
        error_message = NULL,
        result_object = NULL,
        completed_at = NULL,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      jobId,
      originalFilename,
      mimeType,
      fileSize,
      gcsInputBucket,
      gcsInputObject,
      gcsOutputBucket,
      gcsOutputPrefix
    ];

    const res = await query(insertQuery, values);
    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to persist document processing job record');
    }
    logger.info('Recorded processing job start', this.context, { jobId, originalFilename });
    return this.mapRow(row);
  }

  async getJob(jobId: string): Promise<DocumentProcessingJobRecord | null> {
    const { rows } = await query('SELECT * FROM document_processing_jobs WHERE job_id = $1', [jobId]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async markSucceeded(jobId: string, resultObject: string): Promise<DocumentProcessingJobRecord | null> {
    const updateQuery = `
      UPDATE document_processing_jobs
      SET status = 'succeeded', result_object = $2, error_message = NULL,
          completed_at = NOW(), updated_at = NOW()
      WHERE job_id = $1
      RETURNING *;
    `;

    const { rows } = await query(updateQuery, [jobId, resultObject]);
    if (rows.length === 0) {
      logger.warn('Attempted to mark missing job as succeeded', this.context, { jobId });
      return null;
    }

    logger.info('Marked processing job as succeeded', this.context, { jobId, resultObject });
    return this.mapRow(rows[0]);
  }

  async markFailed(jobId: string, errorMessage: string): Promise<DocumentProcessingJobRecord | null> {
    const updateQuery = `
      UPDATE document_processing_jobs
      SET status = 'failed', error_message = $2, updated_at = NOW()
      WHERE job_id = $1
      RETURNING *;
    `;

    const { rows } = await query(updateQuery, [jobId, errorMessage]);
    if (rows.length === 0) {
      logger.warn('Attempted to mark missing job as failed', this.context, { jobId, errorMessage });
      return null;
    }

    logger.error('Marked processing job as failed', this.context, new Error(errorMessage));
    return this.mapRow(rows[0]);
  }

  async markCleanupStatus(jobId: string, status: CleanupStatus, errorMessage?: string): Promise<void> {
    const updateQuery = `
      UPDATE document_processing_jobs
      SET cleanup_status = $2, error_message = CASE WHEN $3 IS NULL THEN error_message ELSE $3 END,
          updated_at = NOW()
      WHERE job_id = $1;
    `;

    await query(updateQuery, [jobId, status, errorMessage ?? null]);
    logger.info('Updated cleanup status', this.context, { jobId, status, errorMessage });
  }

  private mapRow(row: any): DocumentProcessingJobRecord {
    return {
      jobId: row.job_id,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      fileSize: row.file_size === null ? null : Number(row.file_size),
      gcsInputBucket: row.gcs_input_bucket,
      gcsInputObject: row.gcs_input_object,
      gcsOutputBucket: row.gcs_output_bucket,
      gcsOutputPrefix: row.gcs_output_prefix,
      resultObject: row.result_object,
      status: row.status,
      errorMessage: row.error_message,
      cleanupStatus: row.cleanup_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at
    };
  }
}

export const documentProcessingJobs = new DocumentProcessingJobsService();


