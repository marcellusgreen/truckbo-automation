// Centralized Logging Service
// Provides structured logging with levels, context, and error tracking

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogContext {
  userId?: string;
  sessionId?: string;
  operation?: string;
  layer?: 'frontend' | 'processor' | 'storage' | 'api';
  component?: string;
  method?: string;
  requestId?: string;
  timestamp?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: Error;
  stack?: string;
  data?: any;
  timestamp: string;
}

export interface ErrorReport {
  id: string;
  level: LogLevel;
  message: string;
  error: Error;
  context: LogContext;
  timestamp: string;
  userAgent?: string;
  url?: string;
  userId?: string;
  stackTrace?: string;
  breadcrumbs: LogEntry[];
}

class Logger {
  private logs: LogEntry[] = [];
  private breadcrumbs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;
  private readonly MAX_BREADCRUMBS = 50;
  private sessionId: string;
  private logLevel: LogLevel;
  
  // Error reporting callbacks
  private errorReporters: Array<(report: ErrorReport) => void> = [];
  
  constructor() {
    this.sessionId = this.generateSessionId();
    this.logLevel = this.getLogLevel();
    
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    console.log(`🔧 Logger initialized - Session: ${this.sessionId}, Level: ${this.logLevel}`);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getLogLevel(): LogLevel {
    const envLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
    // Check if we're in a browser environment before using localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      return (localStorage.getItem('logLevel') as LogLevel) || envLevel;
    }
    return envLevel;
  }

  private setupGlobalErrorHandlers(): void {
    // Only set up browser-specific error handlers if we're in a browser environment
    if (typeof window !== 'undefined') {
      // Handle uncaught JavaScript errors
      window.addEventListener('error', (event) => {
        this.error('Uncaught JavaScript error', {
          operation: 'global_error_handler',
          layer: 'frontend'
        }, new Error(event.message), {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
        });
      });

      // Handle unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        this.error('Unhandled promise rejection', {
          operation: 'promise_rejection_handler',
          layer: 'frontend'
        }, new Error(String(event.reason)), {
          reason: event.reason
        });
      });
    }
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    localStorage.setItem('logLevel', level);
    this.info('Log level changed', { operation: 'set_log_level' }, { newLevel: level });
  }

  /**
   * Check if we should log at this level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'critical'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Create base log entry
   */
  private createLogEntry(
    level: LogLevel, 
    message: string, 
    context: LogContext = {}, 
    error?: Error, 
    data?: any
  ): LogEntry {
    const timestamp = new Date().toISOString();
    
    const entry: LogEntry = {
      level,
      message,
      context: {
        ...context,
        sessionId: this.sessionId,
        timestamp
      },
      error,
      data,
      timestamp,
      stack: error?.stack
    };

    return entry;
  }

  /**
   * Add entry to logs and breadcrumbs
   */
  private addLogEntry(entry: LogEntry): void {
    // Add to breadcrumbs (always)
    this.breadcrumbs.push(entry);
    if (this.breadcrumbs.length > this.MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }

    // Add to main logs if we should log this level
    if (this.shouldLog(entry.level)) {
      this.logs.push(entry);
      if (this.logs.length > this.MAX_LOGS) {
        this.logs.shift();
      }

      // Console output
      this.outputToConsole(entry);

      // Error reporting for errors and critical issues
      if (entry.level === 'error' || entry.level === 'critical') {
        this.reportError(entry);
      }
    }
  }

  /**
   * Output to browser console with formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const { level, message, context, data, error } = entry;
    const prefix = `[${level.toUpperCase()}] ${context.layer || 'APP'}/${context.component || 'Unknown'}`;
    
    const logData = {
      message,
      context,
      ...(data && { data }),
      ...(error && { error: error.message, stack: error.stack })
    };

    switch (level) {
      case 'debug':
        console.debug(prefix, message, logData);
        break;
      case 'info':
        console.info(prefix, message, logData);
        break;
      case 'warn':
        console.warn(prefix, message, logData);
        break;
      case 'error':
      case 'critical':
        console.error(prefix, message, logData);
        break;
    }
  }

  /**
   * Create and send error report
   */
  private reportError(entry: LogEntry): void {
    if (!entry.error && entry.level !== 'critical') return;

    const report: ErrorReport = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level: entry.level,
      message: entry.message,
      error: entry.error || new Error(entry.message),
      context: entry.context,
      timestamp: entry.timestamp,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: entry.context.userId,
      stackTrace: entry.error?.stack || new Error().stack,
      breadcrumbs: [...this.breadcrumbs]
    };

    // Send to all registered error reporters
    this.errorReporters.forEach(reporter => {
      try {
        reporter(report);
      } catch (reportingError) {
        console.error('Error in error reporter:', reportingError);
      }
    });
  }

  // ===========================================
  // PUBLIC LOGGING METHODS
  // ===========================================

  /**
   * Debug level logging
   */
  debug(message: string, context: LogContext = {}, data?: any): void {
    const entry = this.createLogEntry('debug', message, context, undefined, data);
    this.addLogEntry(entry);
  }

  /**
   * Info level logging
   */
  info(message: string, context: LogContext = {}, data?: any): void {
    const entry = this.createLogEntry('info', message, context, undefined, data);
    this.addLogEntry(entry);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context: LogContext = {}, data?: any): void {
    const entry = this.createLogEntry('warn', message, context, undefined, data);
    this.addLogEntry(entry);
  }

  /**
   * Error level logging
   */
  error(message: string, context: LogContext = {}, error?: Error, data?: any): void {
    const entry = this.createLogEntry('error', message, context, error, data);
    this.addLogEntry(entry);
  }

  /**
   * Critical level logging
   */
  critical(message: string, context: LogContext = {}, error?: Error, data?: any): void {
    const entry = this.createLogEntry('critical', message, context, error, data);
    this.addLogEntry(entry);
  }

  // ===========================================
  // OPERATION LOGGING HELPERS
  // ===========================================

  /**
   * Log start of operation
   */
  startOperation(operation: string, context: LogContext = {}, data?: any): string {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    this.info(`Starting operation: ${operation}`, {
      ...context,
      operation,
      requestId: operationId
    }, data);
    
    return operationId;
  }

  /**
   * Log successful completion of operation
   */
  endOperation(
    operation: string, 
    operationId: string, 
    context: LogContext = {}, 
    result?: any,
    startTime?: number
  ): void {
    const duration = startTime ? Date.now() - startTime : undefined;
    
    this.info(`Completed operation: ${operation}`, {
      ...context,
      operation,
      requestId: operationId,
      duration
    }, result);
  }

  /**
   * Log failed operation
   */
  failOperation(
    operation: string, 
    operationId: string, 
    error: Error, 
    context: LogContext = {},
    data?: any
  ): void {
    this.error(`Failed operation: ${operation}`, {
      ...context,
      operation,
      requestId: operationId
    }, error, data);
  }

  // ===========================================
  // DATA OPERATION LOGGING
  // ===========================================

  /**
   * Log data input received
   */
  logInput(operation: string, context: LogContext, input: any): void {
    this.debug(`Input received for ${operation}`, {
      ...context,
      operation
    }, { 
      inputType: typeof input,
      inputSize: JSON.stringify(input).length,
      inputKeys: typeof input === 'object' ? Object.keys(input) : undefined
    });
  }

  /**
   * Log data output generated
   */
  logOutput(operation: string, context: LogContext, output: any): void {
    this.debug(`Output generated for ${operation}`, {
      ...context,
      operation
    }, {
      outputType: typeof output,
      outputSize: JSON.stringify(output).length,
      outputKeys: typeof output === 'object' ? Object.keys(output) : undefined
    });
  }

  /**
   * Log validation results
   */
  logValidation(operation: string, context: LogContext, validation: {
    isValid: boolean;
    errors?: string[];
    data?: any;
  }): void {
    if (validation.isValid) {
      this.debug(`Validation passed for ${operation}`, { ...context, operation }, validation);
    } else {
      this.warn(`Validation failed for ${operation}`, { ...context, operation }, validation);
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  /**
   * Register error reporter
   */
  addErrorReporter(reporter: (report: ErrorReport) => void): void {
    this.errorReporters.push(reporter);
    this.info('Error reporter registered', { operation: 'add_error_reporter' });
  }

  /**
   * Get all logs
   */
  getLogs(level?: LogLevel): LogEntry[] {
    if (!level) return [...this.logs];
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get breadcrumbs
   */
  getBreadcrumbs(): LogEntry[] {
    return [...this.breadcrumbs];
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
    this.info('Logs cleared', { operation: 'clear_logs' });
  }

  /**
   * Export logs for debugging
   */
  exportLogs(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      logs: this.logs,
      breadcrumbs: this.breadcrumbs
    }, null, 2);
  }

  

  /**
   * Get session info
   */
  getSessionInfo(): { sessionId: string; logLevel: LogLevel; logsCount: number; breadcrumbsCount: number } {
    return {
      sessionId: this.sessionId,
      logLevel: this.logLevel,
      logsCount: this.logs.length,
      breadcrumbsCount: this.breadcrumbs.length
    };
  }
}

// Create and export singleton logger instance
export const logger = new Logger();

// Export utility functions for common logging patterns
export const logOperation = {
  /**
   * Wrap async operation with logging
   */
  async wrap<T>(
    operation: string,
    context: LogContext,
    fn: () => Promise<T>,
    inputData?: any
  ): Promise<T> {
    const startTime = Date.now();
    const operationId = logger.startOperation(operation, context, inputData);
    
    try {
      const result = await fn();
      logger.endOperation(operation, operationId, context, result, startTime);
      return result;
    } catch (error) {
      logger.failOperation(operation, operationId, error as Error, context, inputData);
      throw error; // Re-throw to maintain error flow
    }
  },

  /**
   * Wrap sync operation with logging
   */
  wrapSync<T>(
    operation: string,
    context: LogContext,
    fn: () => T,
    inputData?: any
  ): T {
    const startTime = Date.now();
    const operationId = logger.startOperation(operation, context, inputData);
    
    try {
      const result = fn();
      logger.endOperation(operation, operationId, context, result, startTime);
      return result;
    } catch (error) {
      logger.failOperation(operation, operationId, error as Error, context, inputData);
      throw error; // Re-throw to maintain error flow
    }
  }
};