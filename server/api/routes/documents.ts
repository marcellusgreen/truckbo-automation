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
  upload.single('document'), // Changed to single file for simplicity
  asyncHandler(async (req: Request, res: Response) => {
    const context = (req as any).context as RequestContext;
    const file = req.file;

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

    const result = await googleVisionProcessor.getAsyncResult(decodedJobId);

    let response;
    switch (result.status) {
      case 'processing':
        response = ApiResponseBuilder.success({ status: 'processing' }, 'Job is still in progress.');
        res.status(HttpStatus.OK).json(response);
        break;
      case 'succeeded':
        response = ApiResponseBuilder.success({ status: 'succeeded', ...result.result }, 'Processing completed successfully.');
        res.status(HttpStatus.OK).json(response);
        break;
      case 'failed':
        response = ApiResponseBuilder.error(ApiErrorCode.PROCESSING_FAILED, 'Document processing failed.', result.result);
        res.status(HttpStatus.OK).json(response); // Return 200 but with an error status in the body
        break;
      default:
        throw ApiError.internal('Invalid job status returned.');
    }
  })
);

export default router;
