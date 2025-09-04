// API Response Builder
// Provides standardized methods for building consistent API responses

import { 
  ApiResponse, 
  ApiSuccessResponse, 
  ApiErrorResponse, 
  ApiWarningResponse,
  PaginatedApiResponse,
  BaseApiResponse,
  ApiStatus,
  ApiVersion,
  ApiErrorCode,
  HttpStatus,
  RequestContext 
} from '../types/apiTypes';

export class ApiResponseBuilder {
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private static createBaseResponse<T>(
    status: ApiStatus,
    message: string,
    data?: T,
    version: ApiVersion = 'v1',
    requestId?: string,
    processingTime?: number
  ): BaseApiResponse<T> {
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
  static success<T>(
    data: T,
    message: string = 'Request completed successfully',
    options?: {
      version?: ApiVersion;
      requestId?: string;
      processingTime?: number;
      meta?: BaseApiResponse['meta'];
    }
  ): ApiSuccessResponse<T> {
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
  static warning<T>(
    data: T,
    warnings: ApiWarningResponse<T>['warnings'],
    message: string = 'Request completed with warnings',
    options?: {
      version?: ApiVersion;
      requestId?: string;
      processingTime?: number;
      meta?: BaseApiResponse['meta'];
    }
  ): ApiWarningResponse<T> {
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
  static error(
    code: ApiErrorCode | string,
    message: string,
    userMessage: string = 'An error occurred while processing your request',
    options?: {
      version?: ApiVersion;
      requestId?: string;
      processingTime?: number;
      details?: ApiErrorResponse['error']['details'];
      httpStatus?: HttpStatus;
    }
  ): ApiErrorResponse {
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
  static validationError(
    validationErrors: Record<string, string[]>,
    message: string = 'Validation failed',
    options?: {
      version?: ApiVersion;
      requestId?: string;
      processingTime?: number;
    }
  ): ApiErrorResponse {
    return this.error(
      ApiErrorCode.VALIDATION_ERROR,
      message,
      'Please check your input and try again',
      {
        ...options,
        details: {
          validation: validationErrors
        }
      }
    );
  }

  /**
   * Create a paginated response
   */
  static paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    message: string = 'Data retrieved successfully',
    options?: {
      version?: ApiVersion;
      requestId?: string;
      processingTime?: number;
    }
  ): PaginatedApiResponse<T> {
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
  static notFound(
    resource: string = 'Resource',
    id?: string | number,
    options?: {
      version?: ApiVersion;
      requestId?: string;
    }
  ): ApiErrorResponse {
    const message = id 
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    
    return this.error(
      ApiErrorCode.NOT_FOUND,
      message,
      `The requested ${resource.toLowerCase()} could not be found`,
      options
    );
  }

  /**
   * Create an unauthorized error response
   */
  static unauthorized(
    message: string = 'Authentication required',
    options?: {
      version?: ApiVersion;
      requestId?: string;
    }
  ): ApiErrorResponse {
    return this.error(
      ApiErrorCode.UNAUTHORIZED,
      message,
      'Please provide valid authentication credentials',
      options
    );
  }

  /**
   * Create a forbidden error response
   */
  static forbidden(
    message: string = 'Insufficient permissions',
    requiredPermissions?: string[],
    options?: {
      version?: ApiVersion;
      requestId?: string;
    }
  ): ApiErrorResponse {
    return this.error(
      ApiErrorCode.FORBIDDEN,
      message,
      'You do not have permission to perform this action',
      {
        ...options,
        details: {
          context: requiredPermissions ? { requiredPermissions } : undefined
        }
      }
    );
  }

  /**
   * Create a rate limit error response
   */
  static rateLimited(
    retryAfter?: number,
    options?: {
      version?: ApiVersion;
      requestId?: string;
    }
  ): ApiErrorResponse {
    return this.error(
      ApiErrorCode.RATE_LIMITED,
      'Rate limit exceeded',
      'Too many requests. Please slow down and try again later',
      {
        ...options,
        details: {
          context: retryAfter ? { retryAfter } : undefined
        }
      }
    );
  }

  /**
   * Create a conflict error response (e.g., duplicate record)
   */
  static conflict(
    resource: string,
    conflictField?: string,
    value?: any,
    options?: {
      version?: ApiVersion;
      requestId?: string;
    }
  ): ApiErrorResponse {
    const message = conflictField 
      ? `${resource} with ${conflictField} '${value}' already exists`
      : `${resource} already exists`;

    return this.error(
      ApiErrorCode.DUPLICATE_RECORD,
      message,
      `This ${resource.toLowerCase()} already exists and cannot be created again`,
      {
        ...options,
        details: {
          context: conflictField ? { field: conflictField, value } : undefined
        }
      }
    );
  }

  /**
   * Create an internal server error response
   */
  static internalError(
    error?: Error,
    options?: {
      version?: ApiVersion;
      requestId?: string;
      includeStack?: boolean;
      processingTime?: number;
    }
  ): ApiErrorResponse {
    return this.error(
      ApiErrorCode.INTERNAL_ERROR,
      error?.message || 'Internal server error',
      'An unexpected error occurred. Please try again later',
      {
        ...options,
        details: {
          ...(error && options?.includeStack && { stack: error.stack }),
          ...(error && { originalError: error.message })
        }
      }
    );
  }

  /**
   * Create a processing timeout error response
   */
  static timeout(
    operation: string,
    timeoutMs: number,
    options?: {
      version?: ApiVersion;
      requestId?: string;
    }
  ): ApiErrorResponse {
    return this.error(
      ApiErrorCode.TIMEOUT,
      `${operation} timed out after ${timeoutMs}ms`,
      'The request took too long to process. Please try again',
      {
        ...options,
        details: {
          context: { operation, timeoutMs }
        }
      }
    );
  }

  /**
   * Create a response from an existing error
   */
  static fromError(
    error: Error,
    context?: RequestContext,
    options?: {
      userMessage?: string;
      includeStack?: boolean;
    }
  ): ApiErrorResponse {
    // Map common errors to appropriate API error codes
    let code = ApiErrorCode.INTERNAL_ERROR;
    let userMessage = options?.userMessage || 'An unexpected error occurred';

    if (error.name === 'ValidationError') {
      code = ApiErrorCode.VALIDATION_ERROR;
      userMessage = 'Please check your input and try again';
    } else if (error.message.includes('timeout')) {
      code = ApiErrorCode.TIMEOUT;
      userMessage = 'The request took too long to process';
    } else if (error.message.includes('not found')) {
      code = ApiErrorCode.NOT_FOUND;
      userMessage = 'The requested resource was not found';
    }

    return this.error(
      code,
      error.message,
      userMessage,
      {
        requestId: context?.requestId,
        version: context?.apiVersion,
        processingTime: context ? Date.now() - context.startTime : undefined,
        details: {
          originalError: error.message,
          ...(options?.includeStack && { stack: error.stack })
        }
      }
    );
  }
}

// Utility functions for common response patterns
export const ApiResponses = {
  // Vehicle-related responses
  vehicleCreated: (vehicle: any) => 
    ApiResponseBuilder.success(vehicle, 'Vehicle created successfully'),
  
  vehicleUpdated: (vehicle: any) => 
    ApiResponseBuilder.success(vehicle, 'Vehicle updated successfully'),
  
  vehicleNotFound: (vin?: string) => 
    ApiResponseBuilder.notFound('Vehicle', vin),
  
  vinAlreadyExists: (vin: string) => 
    ApiResponseBuilder.conflict('Vehicle', 'VIN', vin),
  
  // Document-related responses
  documentProcessed: (result: any) => 
    ApiResponseBuilder.success(result, 'Document processed successfully'),
  
  documentProcessingFailed: (reason: string) => 
    ApiResponseBuilder.error(
      ApiErrorCode.DOCUMENT_PROCESSING_FAILED,
      reason,
      'Document could not be processed. Please try again or contact support'
    ),
  
  invalidDocument: (fileType?: string) => 
    ApiResponseBuilder.error(
      ApiErrorCode.INVALID_DOCUMENT,
      `Invalid document format${fileType ? `: ${fileType}` : ''}`,
      'Please upload a valid document file'
    ),
  
  documentTooLarge: (maxSize: string) => 
    ApiResponseBuilder.error(
      ApiErrorCode.DOCUMENT_TOO_LARGE,
      `Document exceeds maximum size of ${maxSize}`,
      `Please upload a document smaller than ${maxSize}`
    ),
  
  // Compliance-related responses
  complianceDataRetrieved: (data: any) => 
    ApiResponseBuilder.success(data, 'Compliance data retrieved successfully'),
  
  complianceCheckFailed: (reason: string) => 
    ApiResponseBuilder.error(
      ApiErrorCode.COMPLIANCE_CHECK_FAILED,
      reason,
      'Unable to verify compliance status. Please try again later'
    )
};