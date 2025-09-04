// Centralized Logging Service - Environment Agnostic
// Provides structured logging with levels, context, and error tracking

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogContext {
  userId?: string;
  sessionId?: string;
  operation?: string;
  layer?: 'frontend' | 'processor' | 'storage' | 'api' | 'server';
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
    
    console.log(`🔧 Logger initialized - Session: ${this.sessionId}, Level: ${this.logLevel}`);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getLogLevel(): LogLevel {
    // Check environment variables first
    if (typeof process !== 'undefined' && process.env) {
      return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
    }
    
    // Check if we're in a browser environment and use localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      return (localStorage.getItem('logLevel') as LogLevel) || 'info';
    }
    
    return 'info';
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    
    // Only use localStorage if in browser environment
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('logLevel', level);
    }
    
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
   * Output to console with formatting
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
      // Only set browser-specific fields if in browser environment
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location?.href : undefined,
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

  debug(message: string, context: LogContext = {}, data?: any): void {
    const entry = this.createLogEntry('debug', message, context, undefined, data);
    this.addLogEntry(entry);
  }

  info(message: string, context: LogContext = {}, data?: any): void {
    const entry = this.createLogEntry('info', message, context, undefined, data);
    this.addLogEntry(entry);
  }

  warn(message: string, context: LogContext = {}, data?: any): void {
    const entry = this.createLogEntry('warn', message, context, undefined, data);
    this.addLogEntry(entry);
  }

  error(message: string, context: LogContext = {}, error?: Error, data?: any): void {
    const entry = this.createLogEntry('error', message, context, error, data);
    this.addLogEntry(entry);
  }

  critical(message: string, context: LogContext = {}, error?: Error, data?: any): void {
    const entry = this.createLogEntry('critical', message, context, error, data);
    this.addLogEntry(entry);
  }

  // ===========================================
  // OPERATION LOGGING HELPERS
  // ===========================================

  startOperation(operation: string, context: LogContext = {}, data?: any): string {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    this.info(`Starting operation: ${operation}`, {
      ...context,
      operation,
      requestId: operationId
    }, data);
    
    return operationId;
  }

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
  // UTILITY METHODS
  // ===========================================

  addErrorReporter(reporter: (report: ErrorReport) => void): void {
    this.errorReporters.push(reporter);
    this.info('Error reporter registered', { operation: 'add_error_reporter' });
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (!level) return [...this.logs];
    return this.logs.filter(log => log.level === level);
  }

  getBreadcrumbs(): LogEntry[] {
    return [...this.breadcrumbs];
  }

  clearLogs(): void {
    this.logs = [];
    this.info('Logs cleared', { operation: 'clear_logs' });
  }

  exportLogs(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      logs: this.logs,
      breadcrumbs: this.breadcrumbs
    }, null, 2);
  }

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
      throw error;
    }
  },

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
      throw error;
    }
  }
};