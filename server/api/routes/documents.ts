// Documents API Routes
// Standardized endpoints for document processing with Claude Vision integration

import { Router, Request, Response } from 'express';
import { ApiResponseBuilder } from '../core/ApiResponseBuilder';
import { ApiError, asyncHandler, requestContext } from '../middleware/errorHandling';
import { HttpStatus, ApiErrorCode, RequestContext } from '../types/apiTypes';
import { logger } from '../../../shared/services/logger';
import { apiManager } from '../../../shared/services/apiManager';
import { googleVisionProcessor } from '../../../shared/services/googleVisionProcessor';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for in-memory file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Maximum 10 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/tif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

// Apply request context middleware to all routes
router.use(requestContext);

// Document processing result interface
interface DocumentProcessingResult {
  documentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: 'processed' | 'processing' | 'failed';
  documentType?: 'registration' | 'insurance' | 'medical_certificate' | 'cdl_license' | 'inspection' | 'permit' | 'unknown';
  extractedData?: {
    // Vehicle Information
    vin?: string;
    licensePlate?: string;
    make?: string;
    model?: string;
    year?: string;
    
    // Driver Information
    driverName?: string;
    licenseNumber?: string;
    licenseClass?: string;
    endorsements?: string[];
    
    // Document Dates
    issueDate?: string;
    expirationDate?: string;
    effectiveDate?: string;
    
    // Insurance Specific
    policyNumber?: string;
    insuranceCompany?: string;
    coverageAmount?: string;
    
    // Medical Certificate Specific
    medicalExaminerName?: string;
    medicalCertificateNumber?: string;
    restrictions?: string[];
    
    // Registration Specific
    registrationNumber?: string;
    state?: string;
    ownerName?: string;
    
    // General
    documentNumber?: string;
    authority?: string;
    status?: string;
    
    // Raw extracted text
    rawText?: string;
  };
  processingTime?: number;
  confidence?: number;
  fieldConfidence?: { [key: string]: number };
  dataQuality?: {
    isComplete: boolean;
    missingCriticalFields: string[];
    invalidFields: { field: string; issue: string; }[];
    qualityScore: number;
  };
  conflicts?: {
    hasConflicts: boolean;
    conflictDetails: {
      field: string;
      values: string[];
      recommendation: string;
    }[];
  };
  validationResults?: {
    vinValid: boolean;
    datesRealistic: boolean;
    documentsExpired: boolean;
    requiresImmediateAction: boolean;
  };
  requiresReview?: boolean;
  autoApprovalRecommended?: boolean;
  processingNotes?: string[];
  warnings?: string[];
  errors?: string[];
}

/**
 * POST /api/v1/documents/process
 * Process uploaded documents for data extraction
 */
router.post('/v1/documents/process', 
  upload.array('documents', 10),
  asyncHandler(async (req: Request, res: Response) => {
    const context = (req as any).context as RequestContext;
    const startTime = Date.now();
    const files = req.files as Express.Multer.File[];
    
    try {
      if (!files || files.length === 0) {
        throw ApiError.badRequest(
          'No documents provided',
          'Please upload at least one document file'
        );
      }

      logger.info(`Processing ${files.length} documents`, {
        layer: 'api',
        component: 'DocumentsController',
        operation: 'POST /documents/process',
        requestId: context.requestId,
        userId: context.userId
      }, {
        fileCount: files.length,
        filenames: files.map(f => f.originalname),
        totalSize: files.reduce((sum, f) => sum + f.size, 0)
      });

      const results: DocumentProcessingResult[] = [];
      const warnings: string[] = [];

      // Process each document using Google Vision
      for (const file of files) {
        const fileProcessingStart = Date.now();
        try {
          const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Validate file size
          if (file.size > 50 * 1024 * 1024) {
            throw ApiError.badRequest(
              `File ${file.originalname} exceeds 50MB limit`,
              'Please upload smaller files'
            );
          }

          logger.info(`Starting Google Vision processing for ${file.originalname}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'processDocument',
            requestId: context.requestId,
            userId: context.userId
          }, {
            documentId,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype
          });

          // Convert Express.Multer.File to File for Google Vision processor  
          // Convert Buffer to Uint8Array to ensure compatibility
          const fileBlob = new File([new Uint8Array(file.buffer)], file.originalname, { 
            type: file.mimetype 
          });

          // Process document with Google Vision
          const visionResult = await googleVisionProcessor.processDocument(fileBlob, {
            maxRetries: 3,
            timeout: 30000,
            expectedDocumentType: undefined // Let Google Vision determine the type
          });

          let result: DocumentProcessingResult;

          if (visionResult.success && visionResult.extractedData) {
            const visionData = visionResult;
            
            result = {
              documentId,
              fileName: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              status: 'processed',
              documentType: visionData.documentType,
              extractedData: {
                // Vehicle Information
                vin: visionData.extractedData?.vin,
                licensePlate: visionData.extractedData?.licensePlate,
                make: visionData.extractedData?.make,
                model: visionData.extractedData?.model,
                year: visionData.extractedData?.year,
                
                // Driver Information
                driverName: visionData.extractedData?.driverName,
                licenseNumber: visionData.extractedData?.licenseNumber,
                licenseClass: visionData.extractedData?.licenseClass,
                endorsements: visionData.extractedData?.endorsements,
                
                // Document Dates
                issueDate: visionData.extractedData?.issueDate,
                expirationDate: visionData.extractedData?.expirationDate,
                effectiveDate: visionData.extractedData?.effectiveDate,
                
                // Insurance Specific
                policyNumber: visionData.extractedData?.policyNumber,
                insuranceCompany: visionData.extractedData?.insuranceCompany,
                coverageAmount: visionData.extractedData?.coverageAmount,
                
                // Medical Certificate Specific
                medicalExaminerName: visionData.extractedData?.medicalExaminerName,
                medicalCertificateNumber: visionData.extractedData?.medicalCertificateNumber,
                restrictions: visionData.extractedData?.restrictions,
                
                // Registration Specific
                registrationNumber: visionData.extractedData?.registrationNumber,
                state: visionData.extractedData?.state,
                ownerName: visionData.extractedData?.ownerName,
                
                // General
                documentNumber: visionData.extractedData?.documentNumber,
                authority: visionData.extractedData?.authority,
                status: visionData.extractedData?.status,
                
                // Raw text
                rawText: visionData.extractedData?.rawText
              },
              processingTime: visionResult.processingTime || (Date.now() - fileProcessingStart),
              confidence: visionData.confidence,
              fieldConfidence: visionData.fieldConfidence,
              dataQuality: visionData.dataQuality,
              conflicts: visionData.conflicts,
              validationResults: visionData.validationResults,
              requiresReview: visionData.requiresReview,
              autoApprovalRecommended: visionData.autoApprovalRecommended,
              processingNotes: visionData.processingNotes,
              warnings: [],
              errors: []
            };

            // Collect warnings from Google Vision processing
            if (visionData.processingNotes) {
              visionData.processingNotes.forEach(note => {
                if (note.toLowerCase().includes('warning') || note.toLowerCase().includes('suspicious')) {
                  result.warnings?.push(note);
                  warnings.push(`${file.originalname}: ${note}`);
                }
              });
            }

            // Add data quality warnings
            if (visionData.dataQuality?.missingCriticalFields?.length && visionData.dataQuality.missingCriticalFields.length > 0) {
              const missingWarning = `Missing critical fields: ${visionData.dataQuality.missingCriticalFields.join(', ')}`;
              result.warnings?.push(missingWarning);
              warnings.push(`${file.originalname}: ${missingWarning}`);
            }

            // Add validation warnings
            if (visionData.validationResults) {
              if (!visionData.validationResults.vinValid) {
                const vinWarning = 'VIN validation failed';
                result.warnings?.push(vinWarning);
                warnings.push(`${file.originalname}: ${vinWarning}`);
              }
              if (visionData.validationResults.documentsExpired) {
                const expiredWarning = 'Document appears to be expired';
                result.warnings?.push(expiredWarning);
                warnings.push(`${file.originalname}: ${expiredWarning}`);
              }
            }

          } else {
            // Google Vision processing failed
            result = {
              documentId,
              fileName: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              status: 'failed',
              processingTime: visionResult.processingTime || (Date.now() - fileProcessingStart),
              errors: [visionResult.error || 'Google Vision processing failed'],
              confidence: 0
            };
          }

          results.push(result);

          // Store the processing result for later retrieval
          storeDocumentProcessingResult(result);

          logger.info(`Google Vision processing completed for ${file.originalname}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'processDocument',
            requestId: context.requestId,
            userId: context.userId
          }, {
            documentId,
            fileName: file.originalname,
            success: visionResult.success,
            confidence: result.confidence,
            processingTime: result.processingTime,
            requiresReview: result.requiresReview,
            autoApproval: result.autoApprovalRecommended
          });

        } catch (fileError) {
          const documentId = `doc_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          const failedResult: DocumentProcessingResult = {
            documentId,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            status: 'failed',
            errors: [fileError instanceof Error ? fileError.message : 'Unknown processing error'],
            processingTime: Date.now() - fileProcessingStart
          };
          
          results.push(failedResult);
          
          // Store the failed result
          storeDocumentProcessingResult(failedResult);

          logger.error(`Failed to process document ${file.originalname}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'processDocument',
            requestId: context.requestId,
            userId: context.userId
          }, fileError as Error, {
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype
          });
        }
      }

      // Summary statistics
      const summary = {
        totalDocuments: results.length,
        successfullyProcessed: results.filter(r => r.status === 'processed').length,
        failed: results.filter(r => r.status === 'failed').length,
        averageConfidence: results
          .filter(r => r.confidence !== undefined)
          .reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length || 0,
        totalProcessingTime: Date.now() - startTime
      };

      // Determine response type based on results
      if (summary.failed === 0 && warnings.length === 0) {
        // Complete success
        const response = ApiResponseBuilder.success(
          {
            results,
            summary
          },
          'All documents processed successfully',
          {
            requestId: context.requestId,
            version: context.apiVersion,
            meta: {
              processingTime: summary.totalProcessingTime
            }
          }
        );

        res.status(HttpStatus.OK).json(response);

      } else if (summary.successfullyProcessed > 0) {
        // Partial success with warnings
        const response = ApiResponseBuilder.warning(
          {
            results,
            summary
          },
          warnings.map(w => ({
            code: 'DOCUMENT_PROCESSING_WARNING',
            message: w
          })),
          'Documents processed with warnings',
          {
            requestId: context.requestId,
            version: context.apiVersion,
            meta: {
              processingTime: summary.totalProcessingTime
            }
          }
        );

        res.status(HttpStatus.OK).json(response);

      } else {
        // All failed
        throw ApiError.processing(
          'All document processing failed',
          'Unable to process any of the uploaded documents',
          { errors: results.map(r => r.errors).flat() }
        );
      }

    } catch (error) {
      logger.error('Document processing failed', {
        layer: 'api',
        component: 'DocumentsController',
        operation: 'POST /documents/process',
        requestId: context.requestId,
        userId: context.userId
      }, error as Error, {
        fileCount: files?.length || 0,
        processingTime: Date.now() - startTime
      });

      throw error;
    }
  })
);

/**
 * GET /api/v1/documents/processing-status/:id
 * Get processing status for a specific document
 */
router.get('/v1/documents/processing-status/:id', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    logger.info(`Fetching document processing status ${id}`, {
      layer: 'api',
      component: 'DocumentsController',
      operation: 'GET /documents/processing-status/:id',
      requestId: context.requestId,
      userId: context.userId
    }, { documentId: id });

    // Simulate fetching processing status (in real implementation, this would check a database or processing queue)
    const processingStatus = await getDocumentProcessingStatus(id);
    
    if (!processingStatus) {
      throw ApiError.notFound('Document processing record', id);
    }

    const response = ApiResponseBuilder.success(
      processingStatus,
      'Document processing status retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to retrieve document processing status ${id}`, {
      layer: 'api',
      component: 'DocumentsController',
      operation: 'GET /documents/processing-status/:id',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { documentId: id });

    throw error;
  }
}));

/**
 * GET /api/v1/documents/extracted-data/:id
 * Get extracted data from a processed document
 */
router.get('/v1/documents/extracted-data/:id', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    logger.info(`Fetching extracted data for document ${id}`, {
      layer: 'api',
      component: 'DocumentsController',
      operation: 'GET /documents/extracted-data/:id',
      requestId: context.requestId,
      userId: context.userId
    }, { documentId: id });

    // Simulate fetching extracted data
    const extractedData = await getExtractedDocumentData(id);
    
    if (!extractedData) {
      throw ApiError.notFound('Document or extracted data', id);
    }

    const response = ApiResponseBuilder.success(
      extractedData,
      'Document extracted data retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to retrieve extracted data for document ${id}`, {
      layer: 'api',
      component: 'DocumentsController',
      operation: 'GET /documents/extracted-data/:id',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { documentId: id });

    throw error;
  }
}));

// Document processing storage - In-memory store for demo (would be database in production)
const documentProcessingStore = new Map<string, {
  documentId: string;
  status: 'processing' | 'processed' | 'failed';
  result: DocumentProcessingResult;
  submittedAt: string;
  completedAt?: string;
}>();

// Helper functions for document tracking

async function getDocumentProcessingStatus(documentId: string): Promise<any | null> {
  const stored = documentProcessingStore.get(documentId);
  
  if (!stored) {
    return null;
  }

  return {
    documentId: stored.documentId,
    status: stored.status,
    submittedAt: stored.submittedAt,
    completedAt: stored.completedAt,
    processingTime: stored.result.processingTime,
    confidence: stored.result.confidence,
    requiresReview: stored.result.requiresReview,
    autoApprovalRecommended: stored.result.autoApprovalRecommended
  };
}

async function getExtractedDocumentData(documentId: string): Promise<any | null> {
  const stored = documentProcessingStore.get(documentId);
  
  if (!stored || stored.status !== 'processed') {
    return null;
  }

  return {
    documentId: stored.documentId,
    extractedAt: stored.completedAt,
    documentType: stored.result.documentType,
    extractedData: stored.result.extractedData,
    confidence: stored.result.confidence,
    fieldConfidence: stored.result.fieldConfidence,
    dataQuality: stored.result.dataQuality,
    conflicts: stored.result.conflicts,
    validationResults: stored.result.validationResults,
    processingNotes: stored.result.processingNotes,
    requiresReview: stored.result.requiresReview,
    autoApprovalRecommended: stored.result.autoApprovalRecommended,
    processingMetadata: {
      ocrEngine: 'Google Vision API',
      processingTime: stored.result.processingTime,
      imagePreprocessing: ['Google Vision native preprocessing']
    }
  };
}

// Store document processing result
function storeDocumentProcessingResult(result: DocumentProcessingResult): void {
  const now = new Date().toISOString();
  
  documentProcessingStore.set(result.documentId, {
    documentId: result.documentId,
    status: result.status,
    result: result,
    submittedAt: now,
    completedAt: result.status === 'processed' ? now : undefined
  });
}

export default router;