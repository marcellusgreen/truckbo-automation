"use strict";
// Documents API Routes
// Asynchronous processing using Google Cloud Storage
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const multer_1 = __importDefault(require("multer"));
const os_1 = __importDefault(require("os"));
const ApiResponseBuilder_1 = require("../core/ApiResponseBuilder");
const errorHandling_1 = require("../middleware/errorHandling");
const apiTypes_1 = require("../types/apiTypes");
const logger_1 = require("../../../shared/services/logger");
const googleVisionProcessor_1 = require("../../../shared/services/googleVisionProcessor");
const documentStorage_1 = require("../../../shared/services/documentStorage");
const router = (0, express_1.Router)();
// Configure multer for file uploads to disk
const upload = (0, multer_1.default)({ dest: os_1.default.tmpdir() });
router.use(errorHandling_1.requestContext);
/**
 * POST /api/v1/documents/process
 * Starts asynchronous processing for an uploaded document.
 */
router.post('/v1/documents/process', upload.single('document'), // Changed to single file for simplicity
(0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const file = req.file;
    if (!file) {
        throw errorHandling_1.ApiError.badRequest('No document provided');
    }
    try {
        logger_1.logger.info(`Starting async processing for ${file.originalname}`, { ...context, operation: 'POST /documents/process' });
        const fileBuffer = await promises_1.default.readFile(file.path);
        const operationName = await googleVisionProcessor_1.googleVisionProcessor.processDocumentAsync(fileBuffer, file.originalname, file.mimetype);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success({
            jobId: operationName,
            status: 'processing',
            message: 'Document processing started.',
            statusUrl: `/api/v1/documents/process-status/${encodeURIComponent(operationName)}`
        }, 'Processing initiated');
        res.status(apiTypes_1.HttpStatus.ACCEPTED).json(response); // Return 202 Accepted
    }
    finally {
        // Clean up the uploaded file from temp directory
        await promises_1.default.unlink(file.path).catch(err => logger_1.logger.warn(`Failed to delete temp file: ${file.path}`, err));
    }
}));
/**
 * GET /api/v1/documents/process-status/:jobId
 * Checks the status of an asynchronous processing job.
 */
router.get('/v1/documents/process-status/:jobId', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const { jobId } = req.params;
    const decodedJobId = decodeURIComponent(jobId);
    const context = req.context;
    logger_1.logger.info(`Checking status for job ${decodedJobId}`, { ...context, operation: 'GET /documents/process-status' });
    const result = await googleVisionProcessor_1.googleVisionProcessor.getAsyncResult(decodedJobId);
    let response;
    switch (result.status) {
        case 'processing':
            response = ApiResponseBuilder_1.ApiResponseBuilder.success({ status: 'processing' }, 'Job is still in progress.');
            res.status(apiTypes_1.HttpStatus.OK).json(response);
            break;
        case 'succeeded':
            // Save processing results to database
            try {
                const saveResult = await saveProcessingResultToDatabase(decodedJobId, result.result, context);
                response = ApiResponseBuilder_1.ApiResponseBuilder.success({
                    status: 'succeeded',
                    ...result.result,
                    database: {
                        saved: saveResult.success,
                        documentId: saveResult.documentId,
                        vehicleId: saveResult.vehicleId,
                        driverId: saveResult.driverId,
                        warnings: saveResult.warnings,
                        errors: saveResult.errors
                    }
                }, 'Processing completed successfully.');
                res.status(apiTypes_1.HttpStatus.OK).json(response);
            }
            catch (dbError) {
                logger_1.logger.error('Failed to save processing result to database', context, dbError);
                // Still return success for the processing, but include database error
                response = ApiResponseBuilder_1.ApiResponseBuilder.success({
                    status: 'succeeded',
                    ...result.result,
                    database: {
                        saved: false,
                        error: `Database save failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
                    }
                }, 'Processing completed successfully, but database save failed.');
                res.status(apiTypes_1.HttpStatus.OK).json(response);
            }
            break;
        case 'failed':
            response = ApiResponseBuilder_1.ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.PROCESSING_FAILED, 'Document processing failed.', result.result);
            res.status(apiTypes_1.HttpStatus.OK).json(response); // Return 200 but with an error status in the body
            break;
        default:
            throw errorHandling_1.ApiError.internal('Invalid job status returned.');
    }
}));
/**
 * Helper function to save Google Vision processing results to database
 */
async function saveProcessingResultToDatabase(jobId, processingResult, context) {
    // TODO: For now, using a placeholder organization ID - this should come from auth context
    const organizationId = '550e8400-e29b-41d4-a716-446655440000'; // Sample org from schema
    // Determine document type from extracted data
    const documentType = determineDocumentType(processingResult);
    const documentCategory = documentType === 'medical_certificate' || documentType === 'cdl'
        ? 'driver_docs'
        : 'vehicle_docs';
    // Create document record
    const documentRecord = {
        organizationId,
        documentType,
        documentCategory,
        originalFilename: jobId, // Use jobId as placeholder - in real implementation, store original filename
        s3Key: jobId, // Use jobId as S3 key placeholder
        ocrText: processingResult.text,
        extractionData: processingResult,
        extractionConfidence: processingResult.extractionConfidence || 0.5,
        processingStatus: 'completed',
        processingErrors: processingResult.warnings || [],
        documentDate: processingResult.documentDate,
        expirationDate: getExpirationDate(processingResult, documentType),
        processedAt: new Date().toISOString()
    };
    // Save to database with extracted data
    return await documentStorage_1.documentStorage.saveDocumentResult(documentRecord, processingResult);
}
/**
 * Determine document type from processing result
 */
function determineDocumentType(result) {
    if (result.documentType) {
        return result.documentType;
    }
    // Try to infer from extracted data
    if (result.cdlNumber || result.cdlClass)
        return 'cdl';
    if (result.medicalCertNumber || result.examinerName)
        return 'medical_certificate';
    if (result.insuranceCarrier || result.policyNumber)
        return 'insurance';
    if (result.registrationNumber || result.registeredOwner)
        return 'registration';
    // Default fallback
    return 'registration';
}
/**
 * Extract expiration date based on document type
 */
function getExpirationDate(result, docType) {
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
exports.default = router;
