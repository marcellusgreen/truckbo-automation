// Comprehensive Error Handling System
// Provides user-friendly error messages and proper error reporting

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
  duration?: number; // Auto-dismiss after ms, undefined = manual dismiss
  actions?: ErrorAction[];
}

class ErrorHandlerService {
  private errors: AppError[] = [];
  private notifications: ErrorNotification[] = [];
  private listeners: ((errors: AppError[]) => void)[] = [];
  private notificationListeners: ((notifications: ErrorNotification[]) => void)[] = [];

  /**
   * Handle OCR processing errors
   */
  handleOCRError(error: Error | unknown, fileName: string, retryHandler?: () => void): AppError {
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
          handler: retryHandler
        },
        {
          label: 'Skip File',
          type: 'dismiss',
          handler: () => this.resolveError(appError.id)
        }
      ] : undefined
    };

    this.addError(appError);
    
    this.addNotification({
      id: this.generateId(),
      message: `Failed to process ${fileName}. Using fallback data.`,
      type: 'warning',
      duration: 5000
    });

    return appError;
  }

  /**
   * Handle document processing validation errors
   */
  handleValidationError(field: string, value: unknown, requirements: string[]): AppError {
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
            this.clearOldData();
            retryHandler?.();
          }
        },
        {
          label: 'Export Data',
          type: 'redirect',
          handler: () => this.exportDataForRecovery()
        }
      ]
    };

    this.addError(appError);
    
    this.addNotification({
      id: this.generateId(),
      message: 'Storage error: Unable to save changes',
      type: 'error',
      actions: appError.actions
    });

    return appError;
  }

  /**
   * Handle critical system errors
   */
  handleCriticalError(error: Error | unknown, context: string): AppError {
    const appError: AppError = {
      id: this.generateId(),
      type: 'system',
      severity: 'critical',
      message: `Critical error in ${context}: ${error instanceof Error ? error.message : String(error)}`,
      userMessage: 'A critical error occurred. Please refresh the page or contact support.',
      details: { context, originalError: error, stack: error instanceof Error ? error.stack : undefined },
      timestamp: new Date(),
      resolved: false,
      actions: [
        {
          label: 'Refresh Page',
          type: 'refresh',
          handler: () => window.location.reload()
        }
      ]
    };

    this.addError(appError);
    
    this.addNotification({
      id: this.generateId(),
      message: 'Critical error occurred - please refresh the page',
      type: 'error',
      actions: appError.actions
    });

    // Log to console for debugging
    console.error('Critical Error:', appError);

    return appError;
  }

  /**
   * Handle user input errors
   */
  handleUserError(message: string, suggestion?: string): AppError {
    const appError: AppError = {
      id: this.generateId(),
      type: 'user',
      severity: 'low',
      message: message,
      userMessage: suggestion || message,
      timestamp: new Date(),
      resolved: false
    };

    this.addError(appError);
    
    this.addNotification({
      id: this.generateId(),
      message: appError.userMessage,
      type: 'info',
      duration: 3000
    });

    return appError;
  }

  /**
   * Show success notification
   */
  showSuccess(message: string, duration: number = 3000): void {
    this.addNotification({
      id: this.generateId(),
      message,
      type: 'success',
      duration
    });
  }

  /**
   * Show info notification
   */
  showInfo(message: string, duration?: number): void {
    this.addNotification({
      id: this.generateId(),
      message,
      type: 'info',
      duration
    });
  }

  /**
   * Add error to the system
   */
  private addError(error: AppError): void {
    this.errors.unshift(error); // Add to beginning
    
    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(0, 50);
    }
    
    this.notifyListeners();
  }

  /**
   * Add notification
   */
  private addNotification(notification: ErrorNotification): void {
    this.notifications.unshift(notification);
    
    // Auto-dismiss if duration is set
    if (notification.duration) {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, notification.duration);
    }
    
    this.notifyNotificationListeners();
  }

  /**
   * Resolve an error
   */
  resolveError(errorId: string): void {
    const error = this.errors.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      this.notifyListeners();
    }
  }

  /**
   * Dismiss a notification
   */
  dismissNotification(notificationId: string): void {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.notifyNotificationListeners();
  }

  /**
   * Get current errors
   */
  getErrors(): AppError[] {
    return [...this.errors];
  }

  /**
   * Get current notifications
   */
  getNotifications(): ErrorNotification[] {
    return [...this.notifications];
  }

  /**
   * Get unresolved errors
   */
  getUnresolvedErrors(): AppError[] {
    return this.errors.filter(e => !e.resolved);
  }

  /**
   * Subscribe to error updates
   */
  subscribe(listener: (errors: AppError[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Subscribe to notification updates
   */
  subscribeToNotifications(listener: (notifications: ErrorNotification[]) => void): () => void {
    this.notificationListeners.push(listener);
    return () => {
      this.notificationListeners = this.notificationListeners.filter(l => l !== listener);
    };
  }

  /**
   * Clear all errors
   */
  clearAll(): void {
    this.errors = [];
    this.notifications = [];
    this.notifyListeners();
    this.notifyNotificationListeners();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Notify error listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.errors));
  }

  /**
   * Notify notification listeners
   */
  private notifyNotificationListeners(): void {
    this.notificationListeners.forEach(listener => listener(this.notifications));
  }

  /**
   * Clear old data to free storage space
   */
  private clearOldData(): void {
    try {
      // Clear old processed documents, keep only recent ones
      const keys = Object.keys(localStorage);
      const oldKeys = keys.filter(key => 
        key.startsWith('truckbo_') && 
        !key.includes('drivers_data') && 
        !key.includes('fleet_data')
      );
      
      oldKeys.forEach(key => localStorage.removeItem(key));
      
      this.showSuccess('Cleared old data to free up storage space');
    } catch (error) {
      console.error('Failed to clear old data:', error);
    }
  }

  /**
   * Export data for recovery
   */
  private exportDataForRecovery(): void {
    try {
      const data = {
        drivers: JSON.parse(localStorage.getItem('truckbo_drivers_data') || '[]'),
        fleet: JSON.parse(localStorage.getItem('truckbo_fleet_data') || '[]'),
        timestamp: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `truckbo-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.showSuccess('Data exported successfully');
    } catch (error) {
      console.error('Failed to export data:', error);
      this.handleCriticalError(error, 'data export');
    }
  }
}

export const errorHandler = new ErrorHandlerService();