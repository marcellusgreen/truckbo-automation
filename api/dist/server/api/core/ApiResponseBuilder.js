"use strict";
// API Response Builder
// Provides standardized methods for building consistent API responses
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResponses = exports.ApiResponseBuilder = void 0;
const apiTypes_1 = require("../types/apiTypes");
class ApiResponseBuilder {
    static generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    static createBaseResponse(status, message, data, version = 'v1', requestId, processingTime) {
        return {
            status,
            message,
            data,
            timestamp: new Date().toISOString(),
            version,
            requestId: requestId || this.generateRequestId(),
            ...(processingTime && {
                meta: {
                    processingTime
                }
            })
        };
    }
    /**
     * Create a successful response
     */
    static success(data, message = 'Request completed successfully', options) {
        return {
            ...this.createBaseResponse('success', message, data, options?.version, options?.requestId, options?.processingTime),
            status: 'success',
            data,
            ...(options?.meta && { meta: { ...options.meta, processingTime: options?.processingTime } })
        };
    }
    /**
     * Create a success response with warnings
     */
    static warning(data, warnings, message = 'Request completed with warnings', options) {
        return {
            ...this.createBaseResponse('warning', message, data, options?.version, options?.requestId, options?.processingTime),
            status: 'warning',
            data,
            warnings,
            meta: {
                processingTime: options?.processingTime,
                warnings: warnings.map(w => w.message),
                ...options?.meta
            }
        };
    }
    /**
     * Create an error response
     */
    static error(code, message, userMessage = 'An error occurred while processing your request', options) {
        return {
            ...this.createBaseResponse('error', message, null, options?.version, options?.requestId, options?.processingTime),
            status: 'error',
            data: null,
            error: {
                code,
                message,
                userMessage,
                ...(options?.details && { details: options.details })
            }
        };
    }
    /**
     * Create a validation error response
     */
    static validationError(validationErrors, message = 'Validation failed', options) {
        return this.error(apiTypes_1.ApiErrorCode.VALIDATION_ERROR, message, 'Please check your input and try again', {
            ...options,
            details: {
                validation: validationErrors
            }
        });
    }
    /**
     * Create a paginated response
     */
    static paginated(data, page, limit, total, message = 'Data retrieved successfully', options) {
        const pages = Math.ceil(total / limit);
        const hasNext = page < pages;
        const hasPrev = page > 1;
        return {
            ...this.success(data, message, options),
            pagination: {
                page,
                limit,
                total,
                pages,
                hasNext,
                hasPrev,
                ...(hasNext && { nextPage: page + 1 }),
                ...(hasPrev && { prevPage: page - 1 })
            },
            meta: {
                total,
                page,
                limit,
                processingTime: options?.processingTime
            }
        };
    }
    /**
     * Create a "not found" error response
     */
    static notFound(resource = 'Resource', id, options) {
        const message = id
            ? `${resource} with ID '${id}' not found`
            : `${resource} not found`;
        return this.error(apiTypes_1.ApiErrorCode.NOT_FOUND, message, `The requested ${resource.toLowerCase()} could not be found`, options);
    }
    /**
     * Create an unauthorized error response
     */
    static unauthorized(message = 'Authentication required', options) {
        return this.error(apiTypes_1.ApiErrorCode.UNAUTHORIZED, message, 'Please provide valid authentication credentials', options);
    }
    /**
     * Create a forbidden error response
     */
    static forbidden(message = 'Insufficient permissions', requiredPermissions, options) {
        return this.error(apiTypes_1.ApiErrorCode.FORBIDDEN, message, 'You do not have permission to perform this action', {
            ...options,
            details: {
                context: requiredPermissions ? { requiredPermissions } : undefined
            }
        });
    }
    /**
     * Create a rate limit error response
     */
    static rateLimited(retryAfter, options) {
        return this.error(apiTypes_1.ApiErrorCode.RATE_LIMITED, 'Rate limit exceeded', 'Too many requests. Please slow down and try again later', {
            ...options,
            details: {
                context: retryAfter ? { retryAfter } : undefined
            }
        });
    }
    /**
     * Create a conflict error response (e.g., duplicate record)
     */
    static conflict(resource, conflictField, value, options) {
        const message = conflictField
            ? `${resource} with ${conflictField} '${value}' already exists`
            : `${resource} already exists`;
        return this.error(apiTypes_1.ApiErrorCode.DUPLICATE_RECORD, message, `This ${resource.toLowerCase()} already exists and cannot be created again`, {
            ...options,
            details: {
                context: conflictField ? { field: conflictField, value } : undefined
            }
        });
    }
    /**
     * Create an internal server error response
     */
    static internalError(error, options) {
        return this.error(apiTypes_1.ApiErrorCode.INTERNAL_ERROR, error?.message || 'Internal server error', 'An unexpected error occurred. Please try again later', {
            ...options,
            details: {
                ...(error && options?.includeStack && { stack: error.stack }),
                ...(error && { originalError: error.message })
            }
        });
    }
    /**
     * Create a processing timeout error response
     */
    static timeout(operation, timeoutMs, options) {
        return this.error(apiTypes_1.ApiErrorCode.TIMEOUT, `${operation} timed out after ${timeoutMs}ms`, 'The request took too long to process. Please try again', {
            ...options,
            details: {
                context: { operation, timeoutMs }
            }
        });
    }
    /**
     * Create a response from an existing error
     */
    static fromError(error, context, options) {
        // Map common errors to appropriate API error codes
        let code = apiTypes_1.ApiErrorCode.INTERNAL_ERROR;
        let userMessage = options?.userMessage || 'An unexpected error occurred';
        if (error.name === 'ValidationError') {
            code = apiTypes_1.ApiErrorCode.VALIDATION_ERROR;
            userMessage = 'Please check your input and try again';
        }
        else if (error.message.includes('timeout')) {
            code = apiTypes_1.ApiErrorCode.TIMEOUT;
            userMessage = 'The request took too long to process';
        }
        else if (error.message.includes('not found')) {
            code = apiTypes_1.ApiErrorCode.NOT_FOUND;
            userMessage = 'The requested resource was not found';
        }
        return this.error(code, error.message, userMessage, {
            requestId: context?.requestId,
            version: context?.apiVersion,
            processingTime: context ? Date.now() - context.startTime : undefined,
            details: {
                originalError: error.message,
                ...(options?.includeStack && { stack: error.stack })
            }
        });
    }
}
exports.ApiResponseBuilder = ApiResponseBuilder;
// Utility functions for common response patterns
exports.ApiResponses = {
    // Vehicle-related responses
    vehicleCreated: (vehicle) => ApiResponseBuilder.success(vehicle, 'Vehicle created successfully'),
    vehicleUpdated: (vehicle) => ApiResponseBuilder.success(vehicle, 'Vehicle updated successfully'),
    vehicleNotFound: (vin) => ApiResponseBuilder.notFound('Vehicle', vin),
    vinAlreadyExists: (vin) => ApiResponseBuilder.conflict('Vehicle', 'VIN', vin),
    // Document-related responses
    documentProcessed: (result) => ApiResponseBuilder.success(result, 'Document processed successfully'),
    documentProcessingFailed: (reason) => ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.DOCUMENT_PROCESSING_FAILED, reason, 'Document could not be processed. Please try again or contact support'),
    invalidDocument: (fileType) => ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.INVALID_DOCUMENT, `Invalid document format${fileType ? `: ${fileType}` : ''}`, 'Please upload a valid document file'),
    documentTooLarge: (maxSize) => ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.DOCUMENT_TOO_LARGE, `Document exceeds maximum size of ${maxSize}`, `Please upload a document smaller than ${maxSize}`),
    // Compliance-related responses
    complianceDataRetrieved: (data) => ApiResponseBuilder.success(data, 'Compliance data retrieved successfully'),
    complianceCheckFailed: (reason) => ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.COMPLIANCE_CHECK_FAILED, reason, 'Unable to verify compliance status. Please try again later')
};
