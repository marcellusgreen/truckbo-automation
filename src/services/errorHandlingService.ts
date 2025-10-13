// Comprehensive Error Handling Service
// Provides error boundaries, graceful degradation, and centralized error management

import { logger, LogContext, ErrorReport } from './logger';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 'validation' | 'network' | 'processing' | 'storage' | 'auth' | 'unknown';

export interface AppError extends Error {
  code?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context?: LogContext;
  originalError?: Error;
  userMessage?: string;
  suggestions?: string[];
  retryable?: boolean;
  metadata?: Record<string, any>;
}

export interface ErrorHandlerConfig {
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  enableFallback?: boolean;
  showUserNotification?: boolean;
  reportToService?: boolean;
}

export interface FallbackResult<T> {
  success: boolean;
  data: T | null;
  error?: AppError;
  fallbackUsed?: boolean;
  fallbackType?: string;
}

// Error notification types
export type NotificationType = 'error' | 'warning' | 'info' | 'success';

export interface ErrorNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  actions?: Array<{
    label: string;
    action: () => void;
  }>;
}

export class ErrorHandlerService {
  private notificationCallbacks: Array<(notification: ErrorNotification) => void> = [];
  private errorCounts = new Map<string, number>();
  private recentErrors = new Set<string>();
  private readonly ERROR_COOLDOWN = 5000; // 5 seconds
  
  constructor() {
    // Register with logger for error reporting
    logger.addErrorReporter(this.handleErrorReport.bind(this));
    
    logger.info('Error handling service initialized', { 
      layer: 'frontend', 
      component: 'ErrorHandlerService' 
    });
  }

  // ===========================================
  // ERROR CREATION HELPERS
  // ===========================================

  /**
   * Create a standardized AppError
   */
  createError(
    message: string,
    category: ErrorCategory = 'unknown',
    severity: ErrorSeverity = 'medium',
    options: {
      code?: string;
      context?: LogContext;
      originalError?: Error;
      userMessage?: string;
      suggestions?: string[];
      retryable?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): AppError {
    const error = new Error(message) as AppError;
    
    error.code = options.code || `${category.toUpperCase()}_ERROR`;
    error.category = category;
    error.severity = severity;
    error.context = options.context;
    error.originalError = options.originalError;
    error.userMessage = options.userMessage || this.getUserFriendlyMessage(category);
    error.suggestions = options.suggestions || this.getErrorSuggestions(category);
    error.retryable = options.retryable ?? this.isRetryableError(category);
    error.metadata = options.metadata;
    
    return error;
  }

  /**
   * Create validation error
   */
  createValidationError(
    message: string,
    field?: string,
    value?: any,
    context?: LogContext
  ): AppError {
    return this.createError(message, 'validation', 'medium', {
      code: 'VALIDATION_ERROR',
      context,
      userMessage: `Please check your input: ${message}`,
      suggestions: ['Verify the data format', 'Check required fields', 'Try again with corrected data'],
      metadata: { field, value }
    });
  }

  /**
   * Create network error
   */
  createNetworkError(
    message: string,
    status?: number,
    endpoint?: string,
    context?: LogContext
  ): AppError {
    const severity: ErrorSeverity = status && status >= 500 ? 'high' : 'medium';
    
    return this.createError(message, 'network', severity, {
      code: `NETWORK_ERROR_${status || 'UNKNOWN'}`,
      context,
      userMessage: 'Unable to connect to the server. Please check your internet connection.',
      suggestions: ['Check your internet connection', 'Try refreshing the page', 'Contact support if the problem persists'],
      retryable: true,
      metadata: { status, endpoint }
    });
  }

  /**
   * Create processing error
   */
  createProcessingError(
    message: string,
    operation: string,
    data?: any,
    context?: LogContext
  ): AppError {
    return this.createError(message, 'processing', 'medium', {
      code: 'PROCESSING_ERROR',
      context,
      userMessage: 'There was a problem processing your request.',
      suggestions: ['Try again', 'Check your input data', 'Contact support if the problem continues'],
      retryable: true,
      metadata: { operation, inputData: data }
    });
  }

  /**
   * Create storage error
   */
  createStorageError(
    message: string,
    operation: 'read' | 'write' | 'delete',
    key?: string,
    context?: LogContext
  ): AppError {
    return this.createError(message, 'storage', 'medium', {
      code: 'STORAGE_ERROR',
      context,
      userMessage: 'Unable to save or retrieve data.',
      suggestions: ['Check available storage space', 'Try refreshing the page', 'Clear browser data if needed'],
      retryable: true,
      metadata: { operation, key }
    });
  }

  // ===========================================
  // ERROR HANDLING METHODS
  // ===========================================

  /**
   * Handle error with full context and options
   */
  async handleError(
    error: Error | AppError,
    context: LogContext = {},
    config: ErrorHandlerConfig = {}
  ): Promise<void> {
    const appError = this.normalizeError(error, context);
    
    // Prevent spam of duplicate errors
    if (this.isDuplicateError(appError)) {
      return;
    }

    // Log the error
    logger.error(appError.message, {
      ...context,
      ...appError.context
    }, appError, {
      category: appError.category,
      severity: appError.severity,
      code: appError.code,
      metadata: appError.metadata
    });

    // Update error tracking
    this.trackError(appError);

    // Show user notification if configured
    if (config.showUserNotification !== false) {
      this.showErrorNotification(appError);
    }

    // Report to external service if configured
    if (config.reportToService) {
      await this.reportErrorToService(appError);
    }
  }

  /**
   * Handle operation with retry logic and fallback
   */
  async handleOperationWithRetry<T>(
    operation: () => Promise<T>,
    fallback: (() => Promise<T>) | T | null,
    context: LogContext,
    config: ErrorHandlerConfig = {}
  ): Promise<FallbackResult<T>> {
    const {
      enableRetry = true,
      maxRetries = 3,
      retryDelay = 1000,
      enableFallback = true
    } = config;

    let lastError: AppError | null = null;
    
    // Try the main operation with retries
    if (enableRetry) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.debug(`Attempting operation (${attempt}/${maxRetries})`, context);
          const result = await operation();
          
          if (attempt > 1) {
            logger.info(`Operation succeeded on attempt ${attempt}`, context);
          }
          
          return { success: true, data: result };
        } catch (error) {
          lastError = this.normalizeError(error as Error, context);
          
          logger.warn(`Operation failed on attempt ${attempt}`, context, {
            attemptsRemaining: maxRetries - attempt,
            lastError
          });

          if (attempt < maxRetries && lastError.retryable) {
            await this.sleep(retryDelay * attempt); // Exponential backoff
          }
        }
      }
    } else {
      // Single attempt
      try {
        const result = await operation();
        return { success: true, data: result };
      } catch (error) {
        lastError = this.normalizeError(error as Error, context);
      }
    }

    // Operation failed, try fallback
    if (enableFallback && fallback) {
      try {
        logger.info('Attempting fallback operation', context);
        
        const fallbackResult = typeof fallback === 'function' 
          ? await (fallback as () => Promise<T>)() 
          : fallback as T;
        
        logger.info('Fallback operation succeeded', context);
        
        return { 
          success: true, 
          data: fallbackResult, 
          fallbackUsed: true,
          fallbackType: typeof fallback === 'function' ? 'function' : 'value'
        };
      } catch (fallbackError) {
        logger.error('Fallback operation also failed', context, fallbackError as Error);
      }
    }

    // Both main operation and fallback failed
    if (lastError) {
      await this.handleError(lastError, context, config);
    }

    return { 
      success: false, 
      data: null, 
      error: lastError || this.createError('Operation failed with unknown error', 'unknown', 'high', { context })
    };
  }

  /**
   * Wrap async operation with error handling
   */
  async wrapOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context: LogContext,
    config: ErrorHandlerConfig = {}
  ): Promise<T> {
    try {
      logger.debug(`Starting wrapped operation: ${operationName}`, context);
      const result = await operation();
      logger.debug(`Completed wrapped operation: ${operationName}`, context);
      return result;
    } catch (error) {
      const appError = this.createProcessingError(
        `Operation '${operationName}' failed: ${(error as Error).message}`,
        operationName,
        undefined,
        context
      );
      
      await this.handleError(appError, context, config);
      throw appError;
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  /**
   * Convert any error to AppError
   */
  private normalizeError(error: Error | AppError, context?: LogContext): AppError {
    if (this.isAppError(error)) {
      return error;
    }

    // Check for specific error types
    if (error.name === 'ValidationError') {
      return this.createValidationError(error.message, undefined, undefined, context);
    }
    
    if (error.name === 'NetworkError' || (error.message && error.message.includes('fetch'))) {
      return this.createNetworkError(error.message || 'Network error occurred', undefined, undefined, context);
    }

    // Generic error conversion
    return this.createError(error.message || 'An unknown error occurred', 'unknown', 'medium', {
      originalError: error,
      context
    });
  }

  /**
   * Check if error is AppError
   */
  private isAppError(error: Error): error is AppError {
    return typeof error === 'object' && error !== null && 
           'category' in error && 'severity' in error;
  }

  /**
   * Generate user-friendly error messages
   */
  private getUserFriendlyMessage(category: ErrorCategory): string {
    const messages: Record<ErrorCategory, string> = {
      validation: 'Please check your input and try again.',
      network: 'Unable to connect to the server. Please check your internet connection.',
      processing: 'There was a problem processing your request. Please try again.',
      storage: 'Unable to save or retrieve data. Please try again.',
      auth: 'Authentication failed. Please log in again.',
      unknown: 'An unexpected error occurred. Please try again.'
    };
    
    return messages[category] || messages.unknown;
  }

  /**
   * Get error suggestions
   */
  private getErrorSuggestions(category: ErrorCategory): string[] {
    const suggestions: Record<ErrorCategory, string[]> = {
      validation: ['Check required fields', 'Verify data format', 'Try again with corrected input'],
      network: ['Check internet connection', 'Refresh the page', 'Try again later'],
      processing: ['Try again', 'Check input data', 'Contact support if problem persists'],
      storage: ['Check available space', 'Clear browser data', 'Refresh the page'],
      auth: ['Log in again', 'Check credentials', 'Clear browser cookies'],
      unknown: ['Refresh the page', 'Try again', 'Contact support']
    };
    
    return suggestions[category] || suggestions.unknown;
  }

  /**
   * Check if error type is retryable
   */
  private isRetryableError(category: ErrorCategory): boolean {
    const retryableCategories: ErrorCategory[] = ['network', 'processing', 'storage'];
    return retryableCategories.includes(category);
  }

  /**
   * Check for duplicate errors
   */
  private isDuplicateError(error: AppError): boolean {
    const errorKey = `${error.code}_${error.message}`;
    
    if (this.recentErrors.has(errorKey)) {
      return true;
    }
    
    this.recentErrors.add(errorKey);
    setTimeout(() => {
      this.recentErrors.delete(errorKey);
    }, this.ERROR_COOLDOWN);
    
    return false;
  }

  /**
   * Track error for analytics
   */
  private trackError(error: AppError): void {
    const key = `${error.category}_${error.code}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
    
    // Log warning if error is happening frequently
    if (count > 5) {
      logger.warn(`Frequent error detected: ${key}`, {
        component: 'ErrorHandlerService',
        operation: 'track_error'
      }, {
        errorType: key,
        occurrences: count + 1
      });
    }
  }

  /**
   * Show error notification to user
   */
  private showErrorNotification(error: AppError): void {
    const notification: ErrorNotification = {
      id: `error_${Date.now()}`,
      type: this.getNotificationType(error.severity),
      title: this.getNotificationTitle(error.category),
      message: error.userMessage || error.message,
      duration: this.getNotificationDuration(error.severity),
      actions: error.retryable ? [{
        label: 'Retry',
        action: () => logger.info('User requested retry', { 
          component: 'ErrorHandlerService',
          operation: 'retry_from_notification'
        })
      }] : undefined
    };

    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (callbackError) {
        logger.error('Error in notification callback', {
          component: 'ErrorHandlerService'
        }, callbackError as Error);
      }
    });
  }

  /**
   * Handle error reports from logger
   */
  private async handleErrorReport(report: ErrorReport): Promise<void> {
    // Here you could send to external error reporting service
    logger.debug('Received error report', {
      component: 'ErrorHandlerService',
      operation: 'handle_error_report'
    }, {
      reportId: report.id,
      level: report.level,
      userId: report.userId
    });
  }

  /**
   * Report error to external service
   */
  private async reportErrorToService(error: AppError): Promise<void> {
    // Placeholder for external error reporting (e.g., Sentry, LogRocket, etc.)
    logger.info('Would report error to external service', {
      component: 'ErrorHandlerService',
      operation: 'report_error_external'
    }, {
      errorCode: error.code,
      category: error.category,
      severity: error.severity
    });
  }

  /**
   * Utility methods
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getNotificationType(severity: ErrorSeverity): NotificationType {
    const typeMap: Record<ErrorSeverity, NotificationType> = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'error'
    };
    return typeMap[severity];
  }

  private getNotificationTitle(category: ErrorCategory): string {
    const titleMap: Record<ErrorCategory, string> = {
      validation: 'Input Error',
      network: 'Connection Error',
      processing: 'Processing Error',
      storage: 'Storage Error',
      auth: 'Authentication Error',
      unknown: 'Error'
    };
    return titleMap[category];
  }

  private getNotificationDuration(severity: ErrorSeverity): number {
    const durationMap: Record<ErrorSeverity, number> = {
      low: 3000,
      medium: 5000,
      high: 8000,
      critical: 0 // Don't auto-dismiss critical errors
    };
    return durationMap[severity];
  }

  // ===========================================
  // PUBLIC METHODS
  // ===========================================

  /**
   * Register notification callback
   */
  onNotification(callback: (notification: ErrorNotification) => void): () => void {
    this.notificationCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.notificationCallbacks.indexOf(callback);
      if (index > -1) {
        this.notificationCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats(): { errorCounts: Map<string, number>; recentErrorsCount: number } {
    return {
      errorCounts: new Map(this.errorCounts),
      recentErrorsCount: this.recentErrors.size
    };
  }

  /**
   * Clear error statistics
   */
  clearErrorStats(): void {
    this.errorCounts.clear();
    this.recentErrors.clear();
    logger.info('Error statistics cleared', {
      component: 'ErrorHandlerService',
      operation: 'clear_stats'
    });
  }

  // ===========================================
  // USER NOTIFICATION METHODS
  // ===========================================

  /**
   * Show success notification
   */
  showSuccess(message: string, duration: number = 3000): void {
    const notification: ErrorNotification = {
      id: `success_${Date.now()}`,
      type: 'success',
      title: 'Success',
      message,
      duration
    };
    
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        logger.error('Error in success notification callback', {
          component: 'ErrorHandlerService'
        }, error as Error);
      }
    });
  }

  /**
   * Show info notification
   */
  showInfo(message: string, duration: number = 3000): void {
    const notification: ErrorNotification = {
      id: `info_${Date.now()}`,
      type: 'info',
      title: 'Info',
      message,
      duration
    };
    
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        logger.error('Error in info notification callback', {
          component: 'ErrorHandlerService'
        }, error as Error);
      }
    });
  }

  /**
   * Show warning notification
   */
  showWarning(message: string, duration: number = 5000): void {
    const notification: ErrorNotification = {
      id: `warning_${Date.now()}`,
      type: 'warning',
      title: 'Warning',
      message,
      duration
    };
    
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notification);
      } catch (error) {
        logger.error('Error in warning notification callback', {
          component: 'ErrorHandlerService'
        }, error as Error);
      }
    });
  }
}

// Create and export singleton instance
export const errorHandler = new ErrorHandlerService();

// Export utility functions
export const withErrorHandling = {
  /**
   * Wrap async function with error handling
   */
  async<T>(
    fn: () => Promise<T>,
    context: LogContext,
    config?: ErrorHandlerConfig
  ): Promise<T> {
    return errorHandler.wrapOperation('async-operation', fn, context, config);
  },

  /**
   * Wrap sync function with error handling
   */
  sync<T>(
    fn: () => T,
    context: LogContext
  ): T {
    try {
      return fn();
    } catch (error) {
      const appError = errorHandler.createError(
        `Sync operation failed: ${(error as Error).message}`,
        'processing',
        'medium',
        { context, originalError: error as Error }
      );
      
      // Don't await since this is sync
      errorHandler.handleError(appError, context);
      throw appError;
    }
  }
};
