"use strict";
// Documents API Routes
// Standardized endpoints for document processing with Claude Vision integration
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ApiResponseBuilder_1 = require("../core/ApiResponseBuilder");
const errorHandling_1 = require("../middleware/errorHandling");
const apiTypes_1 = require("../types/apiTypes");
const logger_1 = require("../../../shared/services/logger");
const googleVisionProcessor_1 = require("../../../shared/services/googleVisionProcessor");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// Configure multer for file uploads
const uploadDir = '/tmp/uploads';
fs_1.default.mkdirSync(uploadDir, { recursive: true });
const upload = (0, multer_1.default)({
    dest: uploadDir,
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
        }
        else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    }
});
// Apply request context middleware to all routes
router.use(errorHandling_1.requestContext);
/**
 * POST /api/v1/documents/process
 * Process uploaded documents for data extraction
 */
router.post('/v1/documents/process', upload.array('documents', 10), (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const startTime = Date.now();
    const files = req.files;
    try {
        if (!files || files.length === 0) {
            throw errorHandling_1.ApiError.badRequest('No documents provided', 'Please upload at least one document file');
        }
        logger_1.logger.info(`Processing ${files.length} documents`, {
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
        const results = [];
        const warnings = [];
        // Process each document using Google Vision
        for (const file of files) {
            const fileProcessingStart = Date.now();
            try {
                const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                // Validate file size
                if (file.size > 50 * 1024 * 1024) {
                    throw errorHandling_1.ApiError.badRequest(`File ${file.originalname} exceeds 50MB limit`, 'Please upload smaller files');
                }
                logger_1.logger.info(`Starting Google Vision processing for ${file.originalname}`, {
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
                const visionResult = await googleVisionProcessor_1.googleVisionProcessor.processDocument(fileBlob, {
                    maxRetries: 3,
                    timeout: 30000,
                    expectedDocumentType: undefined // Let Google Vision determine the type
                });
                let result;
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
                }
                else {
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
                logger_1.logger.info(`Google Vision processing completed for ${file.originalname}`, {
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
            }
            catch (fileError) {
                const documentId = `doc_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const failedResult = {
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
                logger_1.logger.error(`Failed to process document ${file.originalname}`, {
                    layer: 'api',
                    component: 'DocumentsController',
                    operation: 'processDocument',
                    requestId: context.requestId,
                    userId: context.userId
                }, fileError, {
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
            const response = ApiResponseBuilder_1.ApiResponseBuilder.success({
                results,
                summary
            }, 'All documents processed successfully', {
                requestId: context.requestId,
                version: context.apiVersion,
                meta: {
                    processingTime: summary.totalProcessingTime
                }
            });
            res.status(apiTypes_1.HttpStatus.OK).json(response);
        }
        else if (summary.successfullyProcessed > 0) {
            // Partial success with warnings
            const response = ApiResponseBuilder_1.ApiResponseBuilder.warning({
                results,
                summary
            }, warnings.map(w => ({
                code: 'DOCUMENT_PROCESSING_WARNING',
                message: w
            })), 'Documents processed with warnings', {
                requestId: context.requestId,
                version: context.apiVersion,
                meta: {
                    processingTime: summary.totalProcessingTime
                }
            });
            res.status(apiTypes_1.HttpStatus.OK).json(response);
        }
        else {
            // All failed
            throw errorHandling_1.ApiError.processing('All document processing failed', 'Unable to process any of the uploaded documents');
        }
    }
    catch (error) {
        logger_1.logger.error('Document processing failed', {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'POST /documents/process',
            requestId: context.requestId,
            userId: context.userId
        }, error, {
            fileCount: files?.length || 0,
            processingTime: Date.now() - startTime
        });
        throw error;
    }
}));
/**
 * GET /api/v1/documents/processing-status/:id
 * Get processing status for a specific document
 */
router.get('/v1/documents/processing-status/:id', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const { id } = req.params;
    const startTime = Date.now();
    try {
        logger_1.logger.info(`Fetching document processing status ${id}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'GET /documents/processing-status/:id',
            requestId: context.requestId,
            userId: context.userId
        }, { documentId: id });
        // Simulate fetching processing status (in real implementation, this would check a database or processing queue)
        const processingStatus = await getDocumentProcessingStatus(id);
        if (!processingStatus) {
            throw errorHandling_1.ApiError.notFound('Document processing record', id);
        }
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success(processingStatus, 'Document processing status retrieved successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        res.status(apiTypes_1.HttpStatus.OK).json(response);
    }
    catch (error) {
        logger_1.logger.error(`Failed to retrieve document processing status ${id}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'GET /documents/processing-status/:id',
            requestId: context.requestId,
            userId: context.userId
        }, error, { documentId: id });
        throw error;
    }
}));
/**
 * GET /api/v1/documents/extracted-data/:id
 * Get extracted data from a processed document
 */
router.get('/v1/documents/extracted-data/:id', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const { id } = req.params;
    const startTime = Date.now();
    try {
        logger_1.logger.info(`Fetching extracted data for document ${id}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'GET /documents/extracted-data/:id',
            requestId: context.requestId,
            userId: context.userId
        }, { documentId: id });
        // Simulate fetching extracted data
        const extractedData = await getExtractedDocumentData(id);
        if (!extractedData) {
            throw errorHandling_1.ApiError.notFound('Document or extracted data', id);
        }
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success(extractedData, 'Document extracted data retrieved successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        res.status(apiTypes_1.HttpStatus.OK).json(response);
    }
    catch (error) {
        logger_1.logger.error(`Failed to retrieve extracted data for document ${id}`, {
            layer: 'api',
            component: 'DocumentsController',
            operation: 'GET /documents/extracted-data/:id',
            requestId: context.requestId,
            userId: context.userId
        }, error, { documentId: id });
        throw error;
    }
}));
// Document processing storage - In-memory store for demo (would be database in production)
const documentProcessingStore = new Map();
// Helper functions for document tracking
async function getDocumentProcessingStatus(documentId) {
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
async function getExtractedDocumentData(documentId) {
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
function storeDocumentProcessingResult(result) {
    const now = new Date().toISOString();
    documentProcessingStore.set(result.documentId, {
        documentId: result.documentId,
        status: result.status,
        result: result,
        submittedAt: now,
        completedAt: result.status === 'processed' ? now : undefined
    });
}
exports.default = router;
