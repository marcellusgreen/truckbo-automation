// Documents API Routes
// Standardized endpoints for document processing with Claude Vision integration

import { Router, Request, Response } from 'express';
import { ApiResponseBuilder } from '../core/ApiResponseBuilder';
import { ApiError, asyncHandler, requestContext } from '../middleware/errorHandling';
import { HttpStatus, ApiErrorCode, RequestContext } from '../types/apiTypes';
import { logger } from '../../../src/services/logger';
import { apiManager } from '../../../src/services/apiManager';
import { claudeVisionProcessor } from '../../../src/services/claudeVisionProcessor';
import multer from 'multer';
import path from 'path';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
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

      // Process each document using Claude Vision
      for (const file of files) {
        try {
          const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const fileProcessingStart = Date.now();

          // Validate file size
          if (file.size > 50 * 1024 * 1024) {
            throw ApiError.badRequest(
              `File ${file.originalname} exceeds 50MB limit`,
              'Please upload smaller files'
            );
          }

          logger.info(`Starting Claude Vision processing for ${file.originalname}`, {
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

          // Convert Express.Multer.File to File for Claude Vision processor
          const fileBlob = new File([file.buffer], file.originalname, { 
            type: file.mimetype 
          });

          // Process document with Claude Vision
          const claudeResult = await claudeVisionProcessor.processDocument(fileBlob, {
            maxRetries: 3,
            timeout: 30000,
            expectedDocumentType: undefined // Let Claude determine the type
          });

          let result: DocumentProcessingResult;

          if (claudeResult.success && claudeResult.data) {
            const claudeData = claudeResult.data;
            
            result = {
              documentId,
              fileName: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              status: 'processed',
              documentType: claudeData.documentType,
              extractedData: {
                // Vehicle Information
                vin: claudeData.extractedData?.vin,
                licensePlate: claudeData.extractedData?.licensePlate,
                make: claudeData.extractedData?.make,
                model: claudeData.extractedData?.model,
                year: claudeData.extractedData?.year,
                
                // Driver Information
                driverName: claudeData.extractedData?.driverName,
                licenseNumber: claudeData.extractedData?.licenseNumber,
                licenseClass: claudeData.extractedData?.licenseClass,
                endorsements: claudeData.extractedData?.endorsements,
                
                // Document Dates
                issueDate: claudeData.extractedData?.issueDate,
                expirationDate: claudeData.extractedData?.expirationDate,
                effectiveDate: claudeData.extractedData?.effectiveDate,
                
                // Insurance Specific
                policyNumber: claudeData.extractedData?.policyNumber,
                insuranceCompany: claudeData.extractedData?.insuranceCompany,
                coverageAmount: claudeData.extractedData?.coverageAmount,
                
                // Medical Certificate Specific
                medicalExaminerName: claudeData.extractedData?.medicalExaminerName,
                medicalCertificateNumber: claudeData.extractedData?.medicalCertificateNumber,
                restrictions: claudeData.extractedData?.restrictions,
                
                // Registration Specific
                registrationNumber: claudeData.extractedData?.registrationNumber,
                state: claudeData.extractedData?.state,
                ownerName: claudeData.extractedData?.ownerName,
                
                // General
                documentNumber: claudeData.extractedData?.documentNumber,
                authority: claudeData.extractedData?.authority,
                status: claudeData.extractedData?.status,
                
                // Raw text
                rawText: claudeData.rawText
              },
              processingTime: claudeResult.processingTime || (Date.now() - fileProcessingStart),
              confidence: claudeData.confidence,
              fieldConfidence: claudeData.fieldConfidence,
              dataQuality: claudeData.dataQuality,
              conflicts: claudeData.conflicts,
              validationResults: claudeData.validationResults,
              requiresReview: claudeData.requiresReview,
              autoApprovalRecommended: claudeData.autoApprovalRecommended,
              processingNotes: claudeData.processingNotes,
              warnings: [],
              errors: []
            };

            // Collect warnings from Claude processing
            if (claudeData.processingNotes) {
              claudeData.processingNotes.forEach(note => {
                if (note.toLowerCase().includes('warning') || note.toLowerCase().includes('suspicious')) {
                  result.warnings?.push(note);
                  warnings.push(`${file.originalname}: ${note}`);
                }
              });
            }

            // Add data quality warnings
            if (claudeData.dataQuality?.missingCriticalFields?.length > 0) {
              const missingWarning = `Missing critical fields: ${claudeData.dataQuality.missingCriticalFields.join(', ')}`;
              result.warnings?.push(missingWarning);
              warnings.push(`${file.originalname}: ${missingWarning}`);
            }

            // Add validation warnings
            if (claudeData.validationResults) {
              if (!claudeData.validationResults.vinValid) {
                const vinWarning = 'VIN validation failed';
                result.warnings?.push(vinWarning);
                warnings.push(`${file.originalname}: ${vinWarning}`);
              }
              if (claudeData.validationResults.documentsExpired) {
                const expiredWarning = 'Document appears to be expired';
                result.warnings?.push(expiredWarning);
                warnings.push(`${file.originalname}: ${expiredWarning}`);
              }
            }

          } else {
            // Claude Vision processing failed
            result = {
              documentId,
              fileName: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              status: 'failed',
              processingTime: claudeResult.processingTime || (Date.now() - fileProcessingStart),
              errors: [claudeResult.error || 'Claude Vision processing failed'],
              confidence: 0
            };
          }

          results.push(result);

          // Store the processing result for later retrieval
          storeDocumentProcessingResult(result);

          logger.info(`Claude Vision processing completed for ${file.originalname}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'processDocument',
            requestId: context.requestId,
            userId: context.userId
          }, {
            documentId,
            fileName: file.originalname,
            success: claudeResult.success,
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
            processingTime: summary.totalProcessingTime
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
            processingTime: summary.totalProcessingTime
          }
        );

        res.status(HttpStatus.OK).json(response);

      } else {
        // All failed
        throw ApiError.processing(
          'All document processing failed',
          'Unable to process any of the uploaded documents'
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
      ocrEngine: 'Claude Vision API',
      processingTime: stored.result.processingTime,
      imagePreprocessing: ['Claude Vision native preprocessing']
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