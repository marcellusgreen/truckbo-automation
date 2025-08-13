// Enhanced Error Handling System - Backward Compatible
// Integrates with new logging and error handling architecture
// Maintains existing API while adding comprehensive error handling

import { logger, LogContext } from './logger';
import { errorHandler as newErrorHandler, AppError as NewAppError, ErrorSeverity, ErrorCategory, withErrorHandling } from './errorHandlingService';

// Legacy interface for backward compatibility
export interface AppError {
  id: string;
  type: 'validation' | 'ocr' | 'storage' | 'network' | 'system' | 'user';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  userMessage: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  resolved: boolean;
  actions?: ErrorAction[];
}

export interface ErrorAction {
  label: string;
  type: 'retry' | 'dismiss' | 'redirect' | 'refresh';
  handler: () => void;
}

export interface ErrorNotification {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info' | 'success';
  duration?: number;
  actions?: ErrorAction[];
}

class LegacyErrorHandlerService {
  private errors: AppError[] = [];
  private notifications: ErrorNotification[] = [];
  private listeners: ((errors: AppError[]) => void)[] = [];
  private notificationListeners: ((notifications: ErrorNotification[]) => void)[] = [];

  constructor() {
    // Register with notification system
    newErrorHandler.onNotification((notification) => {
      this.addNotification({
        id: notification.id,
        message: notification.message,
        type: notification.type,
        duration: notification.duration,
        actions: notification.actions?.map(action => ({
          label: action.label,
          type: 'retry' as const,
          handler: action.action
        }))
      });
    });
  }

  // ===========================================
  // LEGACY API METHODS (Enhanced with new logging)
  // ===========================================

  /**
   * Handle OCR processing errors
   */
  handleOCRError(error: Error | unknown, fileName: string, retryHandler?: () => void): AppError {
    const context: LogContext = {
      layer: 'processor',
      component: 'OCRProcessor',
      operation: 'ocr_processing',
      metadata: { fileName }
    };

    // Log using new system
    const newError = newErrorHandler.createProcessingError(
      `OCR processing failed for ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      'ocr_processing',
      { fileName },
      context
    );

    newErrorHandler.handleError(newError, context, {
      showUserNotification: true
    });

    // Create legacy error for backward compatibility
    const appError: AppError = {
      id: this.generateId(),
      type: 'ocr',
      severity: 'medium',
      message: `OCR processing failed for ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      userMessage: `Unable to read text from ${fileName}. The file may be corrupted, low quality, or contain handwritten text.`,
      details: { fileName, originalError: error },
      timestamp: new Date(),
      resolved: false,
      actions: retryHandler ? [
        {
          label: 'Retry',
          type: 'retry',
          handler: () => {
            logger.info('User requested OCR retry', context);
            retryHandler();
          }
        },
        {
          label: 'Skip File',
          type: 'dismiss',
          handler: () => {
            logger.info('User skipped OCR file', context);
            this.resolveError(appError.id);
          }
        }
      ] : undefined
    };

    this.addError(appError);
    return appError;
  }

  /**
   * Handle document processing validation errors
   */
  handleValidationError(field: string, value: unknown, requirements: string[]): AppError {
    const context: LogContext = {
      layer: 'processor',
      component: 'ValidationHandler', 
      operation: 'field_validation',
      metadata: { field, requirements }
    };

    // Log using new system
    const newError = newErrorHandler.createValidationError(
      `Validation failed for ${field}: ${JSON.stringify(value)}`,
      field,
      value,
      context
    );

    newErrorHandler.handleError(newError, context, {
      showUserNotification: false // Don't spam notifications for individual field validation
    });

    // Create legacy error
    const appError: AppError = {
      id: this.generateId(),
      type: 'validation',
      severity: 'medium',
      message: `Validation failed for ${field}: ${JSON.stringify(value)}`,
      userMessage: `Invalid ${field}: ${requirements.join(', ')}`,
      details: { field, value, requirements },
      timestamp: new Date(),
      resolved: false
    };

    this.addError(appError);
    return appError;
  }

  /**
   * Handle storage errors (localStorage failures)
   */
  handleStorageError(operation: string, error: Error | unknown, retryHandler?: () => void): AppError {
    const context: LogContext = {
      layer: 'storage',
      component: 'StorageHandler',
      operation: operation,
      metadata: { storageType: 'localStorage' }
    };

    // Log using new system
    const newError = newErrorHandler.createStorageError(
      `Storage operation failed: ${operation} - ${error instanceof Error ? error.message : String(error)}`,
      operation as 'read' | 'write' | 'delete',
      undefined,
      context
    );

    newErrorHandler.handleError(newError, context, {
      showUserNotification: true,
      enableRetry: true
    });

    // Create legacy error
    const appError: AppError = {
      id: this.generateId(),
      type: 'storage',
      severity: 'high',
      message: `Storage operation failed: ${operation} - ${error instanceof Error ? error.message : String(error)}`,
      userMessage: 'Unable to save data. Your browser storage may be full or disabled.',
      details: { operation, originalError: error },
      timestamp: new Date(),
      resolved: false,
      actions: [
        {
          label: 'Clear Old Data',
          type: 'retry',
          handler: () => {
            logger.info('User requested storage cleanup', context);
            this.clearOldData();
            retryHandler?.();
          }
        },
        {
          label: 'Export Data',
          type: 'redirect',
          handler: () => {
            logger.info('User requested data export', context);
            this.exportDataForRecovery();
          }
        }
      ]
    };

    this.addError(appError);
    return appError;
  }

  /**
   * Handle network/API errors with retry logic
   */
  async handleNetworkError(
    endpoint: string, 
    error: Error | unknown, 
    retryFunction?: () => Promise<any>
  ): Promise<AppError> {
    const context: LogContext = {
      layer: 'api',
      component: 'NetworkHandler',
      operation: 'api_request',
      metadata: { endpoint }
    };

    // Extract status code if available
    const status = (error as any)?.status || (error as any)?.response?.status;

    // Create enhanced network error
    const newError = newErrorHandler.createNetworkError(
      `Network request failed for ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
      status,
      endpoint,
      context
    );

    // Use retry logic from new system if retry function provided
    if (retryFunction) {
      const result = await newErrorHandler.handleOperationWithRetry(
        retryFunction,
        null, // no fallback
        context,
        {
          enableRetry: true,
          maxRetries: 3,
          retryDelay: 1000,
          showUserNotification: true
        }
      );

      if (result.success) {
        logger.info('Network retry succeeded', context);
        return this.createResolvedError('network', 'Request succeeded after retry');
      }
    } else {
      newErrorHandler.handleError(newError, context, {
        showUserNotification: true
      });
    }

    // Create legacy error
    const appError: AppError = {
      id: this.generateId(),
      type: 'network',
      severity: status >= 500 ? 'high' : 'medium',
      message: `Network request failed: ${endpoint}`,
      userMessage: status >= 500 
        ? 'Server error occurred. Please try again later.'
        : 'Network connection issue. Check your internet connection.',
      details: { endpoint, originalError: error, status },
      timestamp: new Date(),
      resolved: false,
      actions: retryFunction ? [{
        label: 'Retry',
        type: 'retry',
        handler: () => {
          logger.info('User requested network retry', context);
          retryFunction();
        }
      }] : undefined
    };

    this.addError(appError);
    return appError;
  }

  /**
   * Handle critical system errors
   */
  handleCriticalError(error: Error | unknown, operation: string): AppError {
    const context: LogContext = {
      layer: 'frontend',
      component: 'CriticalErrorHandler',
      operation: operation,
      metadata: { critical: true }
    };

    // Log critical error
    const newError = newErrorHandler.createError(
      `Critical error in ${operation}: ${error instanceof Error ? error.message : String(error)}`,
      'unknown',
      'critical',
      {
        context,
        originalError: error as Error,
        userMessage: 'A critical error occurred. The application may not function properly.',
        suggestions: ['Refresh the page', 'Clear browser data', 'Contact support immediately']
      }
    );

    newErrorHandler.handleError(newError, context, {
      showUserNotification: true,
      reportToService: true
    });

    // Create legacy error
    const appError: AppError = {
      id: this.generateId(),
      type: 'system',
      severity: 'critical',
      message: `Critical error: ${operation}`,
      userMessage: 'A critical error occurred. Please refresh the page or contact support.',
      details: { operation, originalError: error },
      timestamp: new Date(),
      resolved: false,
      actions: [
        {
          label: 'Refresh Page',
          type: 'refresh',
          handler: () => {
            logger.info('User requested page refresh after critical error', context);
            window.location.reload();
          }
        }
      ]
    };

    this.addError(appError);
    return appError;
  }

  // ===========================================
  // ENHANCED METHODS WITH NEW CAPABILITIES
  // ===========================================

  /**
   * Handle errors with automatic retry and fallback
   */
  async handleOperationWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    context: LogContext,
    operationName: string
  ): Promise<T> {
    const result = await newErrorHandler.handleOperationWithRetry(
      operation,
      fallback,
      context,
      {
        enableRetry: true,
        enableFallback: true,
        showUserNotification: true
      }
    );

    if (!result.success && result.error) {
      // Create legacy error for tracking
      const appError: AppError = {
        id: this.generateId(),
        type: 'system',
        severity: 'high',
        message: `Operation failed: ${operationName}`,
        userMessage: result.error.userMessage || 'Operation failed, using fallback data',
        details: { operationName, fallbackUsed: result.fallbackUsed },
        timestamp: new Date(),
        resolved: result.fallbackUsed // Resolved if fallback worked
      };

      this.addError(appError);
    }

    return result.data!;
  }

  /**
   * Show user-friendly error notification
   */
  showInfo(message: string, duration: number = 3000): void {
    logger.info('Showing info notification', {
      layer: 'frontend',
      component: 'ErrorHandler',
      operation: 'show_info'
    }, { message });

    this.addNotification({
      id: this.generateId(),
      message,
      type: 'info',
      duration
    });
  }

  /**
   * Show success notification  
   */
  showSuccess(message: string, duration: number = 3000): void {
    logger.info('Showing success notification', {
      layer: 'frontend', 
      component: 'ErrorHandler',
      operation: 'show_success'
    }, { message });

    this.addNotification({
      id: this.generateId(),
      message,
      type: 'success',
      duration
    });
  }

  /**
   * Show warning notification
   */
  showWarning(message: string, duration: number = 5000): void {
    logger.warn('Showing warning notification', {
      layer: 'frontend',
      component: 'ErrorHandler', 
      operation: 'show_warning'
    }, undefined, { message });

    this.addNotification({
      id: this.generateId(),
      message,
      type: 'warning',
      duration
    });
  }

  // ===========================================
  // LEGACY SUPPORT METHODS
  // ===========================================

  private generateId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createResolvedError(type: AppError['type'], message: string): AppError {
    return {
      id: this.generateId(),
      type,
      severity: 'low',
      message,
      userMessage: message,
      timestamp: new Date(),
      resolved: true
    };
  }

  private addError(error: AppError): void {
    this.errors.push(error);
    this.notifyListeners();
    
    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }
  }

  private addNotification(notification: ErrorNotification): void {
    this.notifications.push(notification);
    this.notifyNotificationListeners();

    // Auto-remove notification after duration
    if (notification.duration) {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, notification.duration);
    }
  }

  private removeNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifyNotificationListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener([...this.errors]);
      } catch (error) {
        logger.error('Error in error listener', {
          layer: 'frontend',
          component: 'ErrorHandler'
        }, error as Error);
      }
    });
  }

  private notifyNotificationListeners(): void {
    this.notificationListeners.forEach(listener => {
      try {
        listener([...this.notifications]);
      } catch (error) {
        logger.error('Error in notification listener', {
          layer: 'frontend',
          component: 'ErrorHandler'
        }, error as Error);
      }
    });
  }

  private clearOldData(): void {
    try {
      // Clear old localStorage data
      const keys = Object.keys(localStorage);
      const oldKeys = keys.filter(key => {
        try {
          const item = localStorage.getItem(key);
          if (!item) return false;
          const data = JSON.parse(item);
          if (data.timestamp) {
            const age = Date.now() - new Date(data.timestamp).getTime();
            return age > 30 * 24 * 60 * 60 * 1000; // 30 days
          }
          return false;
        } catch {
          return false;
        }
      });

      oldKeys.forEach(key => localStorage.removeItem(key));
      
      logger.info('Cleared old storage data', {
        layer: 'storage',
        component: 'ErrorHandler',
        operation: 'clear_old_data'
      }, { clearedKeys: oldKeys.length });

    } catch (error) {
      logger.error('Failed to clear old data', {
        layer: 'storage',
        component: 'ErrorHandler'
      }, error as Error);
    }
  }

  private exportDataForRecovery(): void {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        localStorage: Object.fromEntries(
          Object.entries(localStorage).filter(([key]) => key.startsWith('truckbo_'))
        ),
        errors: this.errors.slice(-10) // Last 10 errors
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `truckbo_recovery_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      logger.info('Data exported for recovery', {
        layer: 'frontend',
        component: 'ErrorHandler',
        operation: 'export_data'
      });

    } catch (error) {
      logger.error('Failed to export data', {
        layer: 'frontend',
        component: 'ErrorHandler'
      }, error as Error);
    }
  }

  // ===========================================
  // PUBLIC API
  // ===========================================

  resolveError(id: string): void {
    const error = this.errors.find(e => e.id === id);
    if (error) {
      error.resolved = true;
      this.notifyListeners();
    }
  }

  dismissNotification(id: string): void {
    this.removeNotification(id);
  }

  getErrors(): AppError[] {
    return [...this.errors];
  }

  getUnresolvedErrors(): AppError[] {
    return this.errors.filter(e => !e.resolved);
  }

  getNotifications(): ErrorNotification[] {
    return [...this.notifications];
  }

  onErrorsChange(listener: (errors: AppError[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  onNotificationsChange(listener: (notifications: ErrorNotification[]) => void): () => void {
    this.notificationListeners.push(listener);
    return () => {
      const index = this.notificationListeners.indexOf(listener);
      if (index > -1) {
        this.notificationListeners.splice(index, 1);
      }
    };
  }

  clearAllErrors(): void {
    this.errors = [];
    this.notifyListeners();
    logger.info('All errors cleared', {
      layer: 'frontend',
      component: 'ErrorHandler',
      operation: 'clear_all_errors'
    });
  }

  clearAllNotifications(): void {
    this.notifications = [];
    this.notifyNotificationListeners();
  }

  // Access to new error handling capabilities
  get enhanced() {
    return {
      withErrorHandling,
      createError: newErrorHandler.createError.bind(newErrorHandler),
      handleError: newErrorHandler.handleError.bind(newErrorHandler),
      handleOperationWithRetry: newErrorHandler.handleOperationWithRetry.bind(newErrorHandler)
    };
  }
}

// Export singleton instance
export const errorHandler = new LegacyErrorHandlerService();

// Export new capabilities for direct access
export { withErrorHandling } from './errorHandlingService';
export { logger } from './logger';

// Default export for backward compatibility
export default errorHandler;