// Standardized API Types and Response Formats
// Provides consistent structure for all API responses and error handling

export type ApiStatus = 'success' | 'error' | 'warning' | 'info';
export type ApiVersion = 'v1' | 'v2';

// Base API Response Structure
export interface BaseApiResponse<T = any> {
  /** Response status indicator */
  status: ApiStatus;
  /** Human-readable message describing the response */
  message: string;
  /** The actual data payload */
  data?: T;
  /** Response timestamp in ISO 8601 format */
  timestamp: string;
  /** API version used for this response */
  version: ApiVersion;
  /** Unique request ID for tracking */
  requestId: string;
  /** Additional metadata */
  meta?: {
    /** Total count for paginated responses */
    total?: number;
    /** Current page number */
    page?: number;
    /** Items per page */
    limit?: number;
    /** Processing time in milliseconds */
    processingTime?: number;
    /** Any warnings that didn't prevent success */
    warnings?: string[];
  };
}

// Success Response
export interface ApiSuccessResponse<T = any> extends BaseApiResponse<T> {
  status: 'success';
  data: T;
}

// Error Response Structure
export interface ApiErrorResponse extends BaseApiResponse<null> {
  status: 'error';
  data: null;
  error: {
    /** Error code for programmatic handling */
    code: string;
    /** Detailed error message for developers */
    message: string;
    /** User-friendly error message */
    userMessage: string;
    /** Error details and context */
    details?: {
      /** Field-specific validation errors */
      validation?: Record<string, string[]>;
      /** Stack trace (only in development) */
      stack?: string;
      /** Original error if wrapped */
      originalError?: string;
      /** Additional context data */
      context?: Record<string, any>;
    };
  };
}

// Warning Response (Success with warnings)
export interface ApiWarningResponse<T = any> extends BaseApiResponse<T> {
  status: 'warning';
  data: T;
  warnings: {
    /** Warning code */
    code: string;
    /** Warning message */
    message: string;
    /** Affected fields or data */
    context?: Record<string, any>;
  }[];
}

// Paginated Response Structure
export interface PaginatedApiResponse<T = any> extends ApiSuccessResponse<T[]> {
  pagination: {
    /** Current page number (1-based) */
    page: number;
    /** Items per page */
    limit: number;
    /** Total number of items */
    total: number;
    /** Total number of pages */
    pages: number;
    /** Whether there are more pages */
    hasNext: boolean;
    /** Whether there are previous pages */
    hasPrev: boolean;
    /** Next page number if available */
    nextPage?: number;
    /** Previous page number if available */
    prevPage?: number;
  };
}

// Standard HTTP Status Codes
export enum HttpStatus {
  // Success
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  
  // Client Errors
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  
  // Server Errors
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504
}

// Standard Error Codes
export enum ApiErrorCode {
  // Generic Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Validation Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_VALUE = 'INVALID_VALUE',
  
  // Business Logic Errors
  DUPLICATE_RECORD = 'DUPLICATE_RECORD',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  
  // Processing Errors
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  TIMEOUT = 'TIMEOUT',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  
  // Document Processing Errors
  INVALID_DOCUMENT = 'INVALID_DOCUMENT',
  DOCUMENT_PROCESSING_FAILED = 'DOCUMENT_PROCESSING_FAILED',
  UNSUPPORTED_DOCUMENT_TYPE = 'UNSUPPORTED_DOCUMENT_TYPE',
  DOCUMENT_TOO_LARGE = 'DOCUMENT_TOO_LARGE',
  OCR_FAILED = 'OCR_FAILED',
  
  // Vehicle/Fleet Errors
  VEHICLE_NOT_FOUND = 'VEHICLE_NOT_FOUND',
  VIN_ALREADY_EXISTS = 'VIN_ALREADY_EXISTS',
  INVALID_VIN = 'INVALID_VIN',
  COMPLIANCE_CHECK_FAILED = 'COMPLIANCE_CHECK_FAILED',
  
  // Driver Errors
  DRIVER_NOT_FOUND = 'DRIVER_NOT_FOUND',
  CDL_VALIDATION_FAILED = 'CDL_VALIDATION_FAILED',
  MEDICAL_CERT_EXPIRED = 'MEDICAL_CERT_EXPIRED'
}

// Request Context for Logging and Tracking
export interface RequestContext {
  /** Unique request identifier */
  requestId: string;
  /** User ID if authenticated */
  userId?: string;
  /** Company/organization context */
  companyId?: string;
  /** User agent string */
  userAgent?: string;
  /** Client IP address */
  ipAddress?: string;
  /** Request start time */
  startTime: number;
  /** API version requested */
  apiVersion: ApiVersion;
  /** Additional context data */
  metadata?: Record<string, any>;
}

// API Endpoint Configuration
export interface ApiEndpointConfig {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Endpoint path */
  path: string;
  /** API version */
  version: ApiVersion;
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Required permissions */
  permissions?: string[];
  /** Rate limit configuration */
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
  /** Cache configuration */
  cache?: {
    ttl: number;
    key?: (params: any) => string;
  };
  /** Validation schema */
  validation?: {
    query?: any;
    body?: any;
    params?: any;
  };
}

// Data Transformation Interface
export interface DataTransformer<TInput, TOutput> {
  /** Transform input data to output format */
  transform(input: TInput): TOutput;
  /** Validate input data */
  validate?(input: any): input is TInput;
  /** Transform output data back to input format */
  reverse?(output: TOutput): TInput;
}

// API Middleware Configuration
export interface ApiMiddlewareConfig {
  /** Enable request logging */
  logging?: boolean;
  /** Enable request/response compression */
  compression?: boolean;
  /** CORS configuration */
  cors?: {
    origin: string | string[] | boolean;
    credentials: boolean;
    methods: string[];
    headers: string[];
  };
  /** Security headers configuration */
  security?: {
    /** Enable helmet security headers */
    helmet?: boolean;
    /** Rate limiting configuration */
    rateLimit?: {
      windowMs: number;
      max: number;
      message?: string;
    };
  };
  /** Request body parsing limits */
  bodyParser?: {
    json?: {
      limit: string;
    };
    urlencoded?: {
      limit: string;
      extended: boolean;
    };
  };
}

// API Health Check Response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  services: {
    [serviceName: string]: {
      status: 'up' | 'down' | 'degraded';
      responseTime?: number;
      error?: string;
      lastCheck: string;
    };
  };
  metrics?: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    requestCount: number;
    errorCount: number;
  };
}

// Export type unions for easier use
export type ApiResponse<T = any> = 
  | ApiSuccessResponse<T> 
  | ApiErrorResponse 
  | ApiWarningResponse<T>;

export type PaginatedResponse<T = any> = PaginatedApiResponse<T>;