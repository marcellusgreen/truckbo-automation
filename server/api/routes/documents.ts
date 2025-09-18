// Documents API Routes
// Asynchronous processing using Google Cloud Storage

import { Router, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import os from 'os';

import { ApiResponseBuilder } from '../core/ApiResponseBuilder';
import { ApiError, asyncHandler, requestContext } from '../middleware/errorHandling';
import { HttpStatus, RequestContext, ApiErrorCode } from '../types/apiTypes';
import { logger } from '../../../shared/services/logger';
import { googleVisionProcessor } from '../../../shared/services/googleVisionProcessor';
import { DocumentProcessingJobRecord } from '../../../shared/services/documentProcessingJobs';
import { documentStorage, DocumentRecord } from '../../../shared/services/documentStorage';

const router = Router();

// Configure multer for file uploads to disk
const upload = multer({ dest: os.tmpdir() });

router.use(requestContext);

export interface DocumentProcessingResult {
    documentId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    status: 'processing' | 'succeeded' | 'failed';
    documentType?: string;
    extractedData?: any;
    processingTime?: number;
    confidence?: number;
    requiresReview?: boolean;
    autoApprovalRecommended?: boolean;
    processingNotes?: string[];
    warnings?: string[];
    errors?: string[];
    jobId?: string;
}

/**
 * POST /api/v1/documents/process
 * Starts asynchronous processing for an uploaded document.
 */
router.post('/v1/documents/process',
  upload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'documents', maxCount: 1 },
    { name: 'image', maxCount: 1 }
  ]), // Accept multiple possible field names from different frontend services
  asyncHandler(async (req: Request, res: Response) => {
    const context = (req as any).context as RequestContext;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    // Extract the first file from any of the possible field names
    let file: Express.Multer.File | undefined;
    if (files) {
      file = files['document']?.[0] || files['documents']?.[0] || files['image']?.[0];
    }

    if (!file) {
      throw ApiError.badRequest('No document provided');
    }

    try {
      logger.info(`Starting async processing for ${file.originalname}`, { ...context, operation: 'POST /documents/process' });
      const fileBuffer = await fs.readFile(file.path);

      const operationName = await googleVisionProcessor.processDocumentAsync(
        fileBuffer,
        file.originalname,
        file.mimetype
      );

      const response = ApiResponseBuilder.success(
        {
          jobId: operationName,
          status: 'processing',
          message: 'Document processing started.',
          statusUrl: `/api/v1/documents/process-status/${encodeURIComponent(operationName)}`
        },
        'Processing initiated',
      );

      res.status(HttpStatus.ACCEPTED).json(response); // Return 202 Accepted

    } finally {
      // Clean up the uploaded file from temp directory
      await fs.unlink(file.path).catch(err => logger.warn(`Failed to delete temp file: ${file.path}`, err));
    }
  })
);

/**
 * GET /api/v1/documents/process-status/:jobId
 * Checks the status of an asynchronous processing job.
 */
router.get('/v1/documents/process-status/:jobId',
  asyncHandler(async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const decodedJobId = decodeURIComponent(jobId);
    const context = (req as any).context as RequestContext;

    logger.info(`Checking status for job ${decodedJobId}`, { ...context, operation: 'GET /documents/process-status' });

    const { status, result: processingResult, job } = await googleVisionProcessor.getAsyncResult(decodedJobId);

    let response;
    switch (status) {
      case 'processing':
        response = ApiResponseBuilder.success({ status: 'processing', job }, 'Job is still in progress.');
        res.status(HttpStatus.OK).json(response);
        break;
      case 'succeeded':
        if (!job) {
          throw ApiError.internal('Processing succeeded but job metadata is missing.');
        }

        const organizationId = context.companyId ?? (req as any).user?.companyId;
        if (!organizationId) {
          throw ApiError.unauthorized('Organization context missing for document persistence');
        }

        try {
          const saveResult = await saveProcessingResultToDatabase(decodedJobId, processingResult, job, context, organizationId);

          if (saveResult.success) {
            try {
              await googleVisionProcessor.finalizeJob(decodedJobId);
            } catch (cleanupError) {
              logger.warn('Failed to finalize job after persistence', { ...context, operation: 'cleanup' }, cleanupError as Error);
            }
          }

          response = ApiResponseBuilder.success({
            status: 'succeeded',
            ...processingResult,
            job,
            database: {
              saved: saveResult.success,
              documentId: saveResult.documentId,
              vehicleId: saveResult.vehicleId,
              driverId: saveResult.driverId,
              warnings: saveResult.warnings,
              errors: saveResult.errors
            }
          }, 'Processing completed successfully.');
          res.status(HttpStatus.OK).json(response);
        } catch (dbError) {
          logger.error('Failed to save processing result to database', context, dbError as Error);
          // Still return success for the processing, but include database error
          response = ApiResponseBuilder.success({
            status: 'succeeded',
            ...processingResult,
            job,
            database: {
              saved: false,
              error: `Database save failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
            }
          }, 'Processing completed successfully, but database save failed.');
          res.status(HttpStatus.OK).json(response);
        }
        break;
      case 'failed':
        response = ApiResponseBuilder.error(ApiErrorCode.PROCESSING_FAILED, 'Document processing failed.', { job, details: processingResult });
        res.status(HttpStatus.OK).json(response); // Return 200 but with an error status in the body
        break;
      default:
        throw ApiError.internal('Invalid job status returned.');
    }
  })
);

/**
 * Helper function to save Google Vision processing results to database
 */
async function saveProcessingResultToDatabase(
  jobId: string,
  processingResult: any,
  job: DocumentProcessingJobRecord,
  context: RequestContext,
  organizationId: string
) {

  // Determine document type from extracted data
  const documentType = determineDocumentType(processingResult);
  const documentCategory = documentType === 'medical_certificate' || documentType === 'cdl'
    ? 'driver_docs'
    : 'vehicle_docs';

  const extractionData = {
    ...processingResult,
    jobMetadata: {
      jobId,
      originalFilename: job.originalFilename,
      gcsInputBucket: job.gcsInputBucket,
      gcsInputObject: job.gcsInputObject,
      gcsOutputBucket: job.gcsOutputBucket,
      gcsOutputPrefix: job.gcsOutputPrefix,
      resultObject: job.resultObject
    }
  };

  // Create document record
  const documentRecord: DocumentRecord = {
    organizationId,
    documentType,
    documentCategory,
    originalFilename: job.originalFilename,
    fileSize: job.fileSize ?? undefined,
    fileType: job.mimeType ?? undefined,
    s3Bucket: job.gcsInputBucket,
    s3Key: job.gcsInputObject,
    s3Url: `gs://${job.gcsInputBucket}/${job.gcsInputObject}`,
    ocrText: processingResult.text,
    extractionData,
    extractionConfidence: processingResult.extractionConfidence || 0.5,
    processingStatus: 'completed',
    processingErrors: processingResult.warnings || [],
    documentDate: processingResult.documentDate,
    expirationDate: getExpirationDate(processingResult, documentType),
    processedAt: new Date().toISOString()
  };

  // Save to database with extracted data
  return await documentStorage.saveDocumentResult(documentRecord, processingResult);
}

/**
 * Determine document type from processing result
 */
function determineDocumentType(result: any): DocumentRecord['documentType'] {
  if (result.documentType) {
    return result.documentType;
  }

  // Try to infer from extracted data
  if (result.cdlNumber || result.cdlClass) return 'cdl';
  if (result.medicalCertNumber || result.examinerName) return 'medical_certificate';
  if (result.insuranceCarrier || result.policyNumber) return 'insurance';
  if (result.registrationNumber || result.registeredOwner) return 'registration';

  // Default fallback
  return 'registration';
}

/**
 * Extract expiration date based on document type
 */
function getExpirationDate(result: any, docType: string): string | undefined {
  switch (docType) {
    case 'registration':
      return result.registrationExpirationDate;
    case 'insurance':
      return result.insuranceExpirationDate;
    case 'cdl':
      return result.cdlExpirationDate;
    case 'medical_certificate':
      return result.medicalExpirationDate;
    default:
      return undefined;
  }
}

export default router;








