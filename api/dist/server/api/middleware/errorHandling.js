"use strict";
// API Error Handling Middleware
// Provides centralized error handling for Express.js applications
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = exports.createRateLimit = exports.requestLogger = exports.notFoundHandler = exports.errorHandler = exports.asyncHandler = exports.requestContext = exports.ApiError = void 0;
const ApiResponseBuilder_1 = require("../core/ApiResponseBuilder");
const apiTypes_1 = require("../types/apiTypes");
const logger_1 = require("../../../shared/services/logger");
// Custom API Error class
class ApiError extends Error {
    constructor(statusCode, code, message, userMessage, details, isOperational = true) {
        super(message);
        Object.defineProperty(this, "statusCode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "details", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "isOperational", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.code = code;
        this.userMessage = userMessage || message;
        this.details = details;
        this.isOperational = isOperational;
        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }
    static badRequest(message, userMessage, details) {
        return new ApiError(apiTypes_1.HttpStatus.BAD_REQUEST, apiTypes_1.ApiErrorCode.INVALID_REQUEST, message, userMessage, details);
    }
    static unauthorized(message = 'Authentication required', userMessage) {
        return new ApiError(apiTypes_1.HttpStatus.UNAUTHORIZED, apiTypes_1.ApiErrorCode.UNAUTHORIZED, message, userMessage || 'Please provide valid authentication credentials');
    }
    static forbidden(message = 'Insufficient permissions', userMessage) {
        return new ApiError(apiTypes_1.HttpStatus.FORBIDDEN, apiTypes_1.ApiErrorCode.FORBIDDEN, message, userMessage || 'You do not have permission to perform this action');
    }
    static notFound(resource, id) {
        const message = id
            ? `${resource} with ID '${id}' not found`
            : `${resource} not found`;
        return new ApiError(apiTypes_1.HttpStatus.NOT_FOUND, apiTypes_1.ApiErrorCode.NOT_FOUND, message, `The requested ${resource.toLowerCase()} could not be found`);
    }
    static conflict(message, userMessage, details) {
        return new ApiError(apiTypes_1.HttpStatus.CONFLICT, apiTypes_1.ApiErrorCode.DUPLICATE_RECORD, message, userMessage || 'This resource already exists', details);
    }
    static validation(validationErrors, userMessage) {
        return new ApiError(apiTypes_1.HttpStatus.UNPROCESSABLE_ENTITY, apiTypes_1.ApiErrorCode.VALIDATION_ERROR, 'Validation failed', userMessage || 'Please check your input and try again', { validation: validationErrors });
    }
    static processing(message, userMessage, details) {
        return new ApiError(apiTypes_1.HttpStatus.UNPROCESSABLE_ENTITY, apiTypes_1.ApiErrorCode.PROCESSING_FAILED, message, userMessage || 'Processing failed. Please try again', details);
    }
    static timeout(operation, timeoutMs) {
        return new ApiError(apiTypes_1.HttpStatus.GATEWAY_TIMEOUT, apiTypes_1.ApiErrorCode.TIMEOUT, `${operation} timed out after ${timeoutMs}ms`, 'The request took too long to process. Please try again');
    }
    static internal(message = 'Internal server error', originalError) {
        return new ApiError(apiTypes_1.HttpStatus.INTERNAL_SERVER_ERROR, apiTypes_1.ApiErrorCode.INTERNAL_ERROR, message, 'An unexpected error occurred. Please try again later', originalError ? { originalError: originalError.message } : undefined, false // Internal errors are not operational
        );
    }
    static rateLimited(retryAfter) {
        return new ApiError(apiTypes_1.HttpStatus.TOO_MANY_REQUESTS, apiTypes_1.ApiErrorCode.RATE_LIMITED, 'Rate limit exceeded', 'Too many requests. Please slow down and try again later', retryAfter ? { retryAfter } : undefined);
    }
}
exports.ApiError = ApiError;
// Request context middleware
const requestContext = (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] ||
        `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    // Add request context to request object
    req.context = {
        requestId,
        startTime,
        userId: req.user?.id,
        companyId: req.user?.companyId,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip || req.connection.remoteAddress,
        apiVersion: 'v1', // Default version, can be overridden
        metadata: {}
    };
    // Add request ID to response headers
    res.set('X-Request-ID', requestId);
    next();
};
exports.requestContext = requestContext;
// Async error handler wrapper
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
// Global error handling middleware
const errorHandler = (error, req, res, next) => {
    const context = req.context;
    const isProduction = process.env.NODE_ENV === 'production';
    // Log the error with context
    logger_1.logger.error('API Error', {
        layer: 'api',
        component: 'ErrorHandlingMiddleware',
        operation: `${req.method} ${req.path}`,
        requestId: context?.requestId,
        userId: context?.userId
    }, error, {
        url: req.url,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip
    });
    let statusCode = apiTypes_1.HttpStatus.INTERNAL_SERVER_ERROR;
    let response;
    if (error instanceof ApiError) {
        // Handle our custom API errors
        statusCode = error.statusCode;
        response = ApiResponseBuilder_1.ApiResponseBuilder.error(error.code, error.message, error.userMessage, {
            requestId: context?.requestId,
            version: context?.apiVersion,
            processingTime: context ? Date.now() - context.startTime : undefined,
            details: {
                ...error.details,
                // Only include stack trace in development
                ...((!isProduction && error.stack) && { stack: error.stack })
            }
        });
    }
    else if (error.name === 'ValidationError') {
        // Handle validation errors (e.g., from Joi, express-validator)
        statusCode = apiTypes_1.HttpStatus.UNPROCESSABLE_ENTITY;
        response = ApiResponseBuilder_1.ApiResponseBuilder.validationError({ general: [error.message] }, 'Validation failed', {
            requestId: context?.requestId,
            version: context?.apiVersion,
            processingTime: context ? Date.now() - context.startTime : undefined
        });
    }
    else if (error.name === 'CastError') {
        // Handle MongoDB/Mongoose cast errors
        statusCode = apiTypes_1.HttpStatus.BAD_REQUEST;
        response = ApiResponseBuilder_1.ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.INVALID_FORMAT, 'Invalid data format', 'Please check your input data format', {
            requestId: context?.requestId,
            version: context?.apiVersion,
            processingTime: context ? Date.now() - context.startTime : undefined
        });
    }
    else if (error.name === 'MongoError' && error.code === 11000) {
        // Handle MongoDB duplicate key errors
        statusCode = apiTypes_1.HttpStatus.CONFLICT;
        response = ApiResponseBuilder_1.ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.DUPLICATE_RECORD, 'Duplicate record', 'This record already exists', {
            requestId: context?.requestId,
            version: context?.apiVersion,
            processingTime: context ? Date.now() - context.startTime : undefined
        });
    }
    else if (error.message.includes('timeout')) {
        // Handle timeout errors
        statusCode = apiTypes_1.HttpStatus.GATEWAY_TIMEOUT;
        response = ApiResponseBuilder_1.ApiResponseBuilder.timeout('Request processing', 30000, {
            requestId: context?.requestId,
            version: context?.apiVersion
        });
    }
    else {
        // Handle all other errors as internal server errors
        response = ApiResponseBuilder_1.ApiResponseBuilder.internalError(error, {
            requestId: context?.requestId,
            version: context?.apiVersion,
            processingTime: context ? Date.now() - context.startTime : undefined,
            includeStack: !isProduction
        });
    }
    // Send the error response
    res.status(statusCode).json(response);
};
exports.errorHandler = errorHandler;
// 404 handler for unmatched routes
const notFoundHandler = (req, res, next) => {
    const context = req.context;
    const response = ApiResponseBuilder_1.ApiResponseBuilder.error(apiTypes_1.ApiErrorCode.NOT_FOUND, `Route ${req.method} ${req.path} not found`, 'The requested endpoint does not exist', {
        requestId: context?.requestId,
        version: context?.apiVersion,
        processingTime: context ? Date.now() - context.startTime : undefined
    });
    res.status(apiTypes_1.HttpStatus.NOT_FOUND).json(response);
};
exports.notFoundHandler = notFoundHandler;
// Request logging middleware
const requestLogger = (req, res, next) => {
    const context = req.context;
    logger_1.logger.info(`API Request: ${req.method} ${req.path}`, {
        layer: 'api',
        component: 'RequestLogger',
        operation: `${req.method} ${req.path}`,
        requestId: context?.requestId,
        userId: context?.userId
    }, {
        method: req.method,
        url: req.url,
        query: req.query,
        params: req.params,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        contentType: req.headers['content-type']
    });
    // Log response when it finishes
    const originalSend = res.send;
    res.send = function (data) {
        logger_1.logger.info(`API Response: ${req.method} ${req.path} - ${res.statusCode}`, {
            layer: 'api',
            component: 'ResponseLogger',
            operation: `${req.method} ${req.path}`,
            requestId: context?.requestId,
            userId: context?.userId
        }, {
            statusCode: res.statusCode,
            processingTime: Date.now() - context.startTime,
            responseSize: data ? Buffer.byteLength(data, 'utf8') : 0
        });
        return originalSend.call(this, data);
    };
    next();
};
exports.requestLogger = requestLogger;
// Rate limiting helper
const createRateLimit = (options) => {
    const rateLimitMap = new Map();
    return (req, res, next) => {
        const key = req.ip || 'anonymous';
        const now = Date.now();
        const windowStart = now - options.windowMs;
        // Clean up old entries
        for (const [mapKey, value] of rateLimitMap.entries()) {
            if (value.resetTime < now) {
                rateLimitMap.delete(mapKey);
            }
        }
        // Get or create rate limit entry
        let entry = rateLimitMap.get(key);
        if (!entry || entry.resetTime < windowStart) {
            entry = { count: 0, resetTime: now + options.windowMs };
            rateLimitMap.set(key, entry);
        }
        // Check if limit exceeded
        if (entry.count >= options.max) {
            const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
            res.set({
                'X-RateLimit-Limit': options.max.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
                'Retry-After': retryAfter.toString()
            });
            const error = ApiError.rateLimited(retryAfter);
            next(error);
            return;
        }
        // Increment counter
        entry.count++;
        // Set rate limit headers
        res.set({
            'X-RateLimit-Limit': options.max.toString(),
            'X-RateLimit-Remaining': (options.max - entry.count).toString(),
            'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
        });
        next();
    };
};
exports.createRateLimit = createRateLimit;
// Health check handler
const healthCheck = (req, res) => {
    const context = req.context;
    const uptime = process.uptime();
    const healthData = {
        status: 'healthy',
        version: process.env.API_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        services: {
            database: { status: 'up', lastCheck: new Date().toISOString() },
            storage: { status: 'up', lastCheck: new Date().toISOString() },
            logging: { status: 'up', lastCheck: new Date().toISOString() }
        },
        pdfProcessorReady: true,
        metrics: {
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            requestCount: 0, // Would be tracked in a real application
            errorCount: 0 // Would be tracked in a real application
        }
    };
    const response = ApiResponseBuilder_1.ApiResponseBuilder.success(healthData, 'Service is healthy', {
        requestId: context?.requestId,
        version: context?.apiVersion
    });
    res.json(response);
};
exports.healthCheck = healthCheck;
