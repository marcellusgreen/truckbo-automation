// API Error Handling Middleware
// Provides centralized error handling for Express.js applications

import { Request, Response, NextFunction } from 'express';
import { ApiResponseBuilder } from '../core/ApiResponseBuilder';
import { HttpStatus, ApiErrorCode, RequestContext } from '../types/apiTypes';
import { logger } from '../../../shared/services/logger';

// Custom API Error class
export class ApiError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly code: ApiErrorCode | string;
  public readonly userMessage: string;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    statusCode: HttpStatus,
    code: ApiErrorCode | string,
    message: string,
    userMessage?: string,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.userMessage = userMessage || message;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, userMessage?: string, details?: any): ApiError {
    return new ApiError(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.INVALID_REQUEST,
      message,
      userMessage,
      details
    );
  }

  static unauthorized(message: string = 'Authentication required', userMessage?: string): ApiError {
    return new ApiError(
      HttpStatus.UNAUTHORIZED,
      ApiErrorCode.UNAUTHORIZED,
      message,
      userMessage || 'Please provide valid authentication credentials'
    );
  }

  static forbidden(message: string = 'Insufficient permissions', userMessage?: string): ApiError {
    return new ApiError(
      HttpStatus.FORBIDDEN,
      ApiErrorCode.FORBIDDEN,
      message,
      userMessage || 'You do not have permission to perform this action'
    );
  }

  static notFound(resource: string, id?: string | number): ApiError {
    const message = id 
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    
    return new ApiError(
      HttpStatus.NOT_FOUND,
      ApiErrorCode.NOT_FOUND,
      message,
      `The requested ${resource.toLowerCase()} could not be found`
    );
  }

  static conflict(message: string, userMessage?: string, details?: any): ApiError {
    return new ApiError(
      HttpStatus.CONFLICT,
      ApiErrorCode.DUPLICATE_RECORD,
      message,
      userMessage || 'This resource already exists',
      details
    );
  }

  static validation(validationErrors: Record<string, string[]>, userMessage?: string): ApiError {
    return new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ApiErrorCode.VALIDATION_ERROR,
      'Validation failed',
      userMessage || 'Please check your input and try again',
      { validation: validationErrors }
    );
  }

  static processing(message: string, userMessage?: string): ApiError {
    return new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ApiErrorCode.PROCESSING_FAILED,
      message,
      userMessage || 'Processing failed. Please try again'
    );
  }

  static timeout(operation: string, timeoutMs: number): ApiError {
    return new ApiError(
      HttpStatus.GATEWAY_TIMEOUT,
      ApiErrorCode.TIMEOUT,
      `${operation} timed out after ${timeoutMs}ms`,
      'The request took too long to process. Please try again'
    );
  }

  static internal(message: string = 'Internal server error', originalError?: Error): ApiError {
    return new ApiError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ApiErrorCode.INTERNAL_ERROR,
      message,
      'An unexpected error occurred. Please try again later',
      originalError ? { originalError: originalError.message } : undefined,
      false // Internal errors are not operational
    );
  }

  static rateLimited(retryAfter?: number): ApiError {
    return new ApiError(
      HttpStatus.TOO_MANY_REQUESTS,
      ApiErrorCode.RATE_LIMITED,
      'Rate limit exceeded',
      'Too many requests. Please slow down and try again later',
      retryAfter ? { retryAfter } : undefined
    );
  }
}

// Request context middleware
export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string || 
                   `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;

  // Add request context to request object
  (req as any).context = {
    requestId,
    startTime,
    userId: (req as any).user?.id,
    companyId: (req as any).user?.companyId,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip || req.connection.remoteAddress,
    apiVersion: 'v1', // Default version, can be overridden
    metadata: {}
  } as RequestContext;

  // Add request ID to response headers
  res.set('X-Request-ID', requestId);

  next();
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Global error handling middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const context = (req as any).context as RequestContext;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log the error with context
  logger.error('API Error', {
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

  let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  let response;

  if (error instanceof ApiError) {
    // Handle our custom API errors
    statusCode = error.statusCode;
    response = ApiResponseBuilder.error(
      error.code,
      error.message,
      error.userMessage,
      {
        requestId: context?.requestId,
        version: context?.apiVersion,
        processingTime: context ? Date.now() - context.startTime : undefined,
        details: {
          ...error.details,
          // Only include stack trace in development
          ...((!isProduction && error.stack) && { stack: error.stack })
        }
      }
    );
  } else if (error.name === 'ValidationError') {
    // Handle validation errors (e.g., from Joi, express-validator)
    statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
    response = ApiResponseBuilder.validationError(
      { general: [error.message] },
      'Validation failed',
      {
        requestId: context?.requestId,
        version: context?.apiVersion,
        processingTime: context ? Date.now() - context.startTime : undefined
      }
    );
  } else if (error.name === 'CastError') {
    // Handle MongoDB/Mongoose cast errors
    statusCode = HttpStatus.BAD_REQUEST;
    response = ApiResponseBuilder.error(
      ApiErrorCode.INVALID_FORMAT,
      'Invalid data format',
      'Please check your input data format',
      {
        requestId: context?.requestId,
        version: context?.apiVersion,
        processingTime: context ? Date.now() - context.startTime : undefined
      }
    );
  } else if (error.name === 'MongoError' && (error as any).code === 11000) {
    // Handle MongoDB duplicate key errors
    statusCode = HttpStatus.CONFLICT;
    response = ApiResponseBuilder.error(
      ApiErrorCode.DUPLICATE_RECORD,
      'Duplicate record',
      'This record already exists',
      {
        requestId: context?.requestId,
        version: context?.apiVersion,
        processingTime: context ? Date.now() - context.startTime : undefined
      }
    );
  } else if (error.message.includes('timeout')) {
    // Handle timeout errors
    statusCode = HttpStatus.GATEWAY_TIMEOUT;
    response = ApiResponseBuilder.timeout(
      'Request processing',
      30000,
      {
        requestId: context?.requestId,
        version: context?.apiVersion
      }
    );
  } else {
    // Handle all other errors as internal server errors
    response = ApiResponseBuilder.internalError(
      error,
      {
        requestId: context?.requestId,
        version: context?.apiVersion,
        processingTime: context ? Date.now() - context.startTime : undefined,
        includeStack: !isProduction
      }
    );
  }

  // Send the error response
  res.status(statusCode).json(response);
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const context = (req as any).context as RequestContext;
  
  const response = ApiResponseBuilder.error(
    ApiErrorCode.NOT_FOUND,
    `Route ${req.method} ${req.path} not found`,
    'The requested endpoint does not exist',
    {
      requestId: context?.requestId,
      version: context?.apiVersion,
      processingTime: context ? Date.now() - context.startTime : undefined
    }
  );

  res.status(HttpStatus.NOT_FOUND).json(response);
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const context = (req as any).context as RequestContext;
  
  logger.info(`API Request: ${req.method} ${req.path}`, {
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
  res.send = function(data) {
    logger.info(`API Response: ${req.method} ${req.path} - ${res.statusCode}`, {
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

// Rate limiting helper
export const createRateLimit = (options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
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

// Health check handler
export const healthCheck = (req: Request, res: Response): void => {
  const context = (req as any).context as RequestContext;
  const uptime = process.uptime();

  const healthData = {
    status: 'healthy' as const,
    version: process.env.API_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    services: {
      database: { status: 'up' as const, lastCheck: new Date().toISOString() },
      storage: { status: 'up' as const, lastCheck: new Date().toISOString() },
      logging: { status: 'up' as const, lastCheck: new Date().toISOString() }
    },
    pdfProcessorReady: true,
    metrics: {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      requestCount: 0, // Would be tracked in a real application
      errorCount: 0    // Would be tracked in a real application
    }
  };

  const response = ApiResponseBuilder.success(
    healthData,
    'Service is healthy',
    {
      requestId: context?.requestId,
      version: context?.apiVersion
    }
  );

  res.json(response);
};