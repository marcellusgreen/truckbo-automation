"use strict";
// Centralized Logging Service - Environment Agnostic
// Provides structured logging with levels, context, and error tracking
Object.defineProperty(exports, "__esModule", { value: true });
exports.logOperation = exports.logger = void 0;
class Logger {
    constructor() {
        Object.defineProperty(this, "logs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "breadcrumbs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "MAX_LOGS", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1000
        });
        Object.defineProperty(this, "MAX_BREADCRUMBS", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 50
        });
        Object.defineProperty(this, "sessionId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "logLevel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        // Error reporting callbacks
        Object.defineProperty(this, "errorReporters", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.sessionId = this.generateSessionId();
        this.logLevel = this.getLogLevel();
        console.log(`🔧 Logger initialized - Session: ${this.sessionId}, Level: ${this.logLevel}`);
    }
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getLogLevel() {
        // Check environment variables first
        if (typeof process !== 'undefined' && process.env) {
            return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
        }
        // Check if we're in a browser environment and use localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
            return localStorage.getItem('logLevel') || 'info';
        }
        return 'info';
    }
    /**
     * Set log level
     */
    setLogLevel(level) {
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
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error', 'critical'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }
    /**
     * Create base log entry
     */
    createLogEntry(level, message, context = {}, error, data) {
        const timestamp = new Date().toISOString();
        const entry = {
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
    addLogEntry(entry) {
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
    outputToConsole(entry) {
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
    reportError(entry) {
        if (!entry.error && entry.level !== 'critical')
            return;
        const report = {
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
            }
            catch (reportingError) {
                console.error('Error in error reporter:', reportingError);
            }
        });
    }
    // ===========================================
    // PUBLIC LOGGING METHODS
    // ===========================================
    debug(message, context = {}, data) {
        const entry = this.createLogEntry('debug', message, context, undefined, data);
        this.addLogEntry(entry);
    }
    info(message, context = {}, data) {
        const entry = this.createLogEntry('info', message, context, undefined, data);
        this.addLogEntry(entry);
    }
    warn(message, context = {}, data) {
        const entry = this.createLogEntry('warn', message, context, undefined, data);
        this.addLogEntry(entry);
    }
    error(message, context = {}, error, data) {
        const entry = this.createLogEntry('error', message, context, error, data);
        this.addLogEntry(entry);
    }
    critical(message, context = {}, error, data) {
        const entry = this.createLogEntry('critical', message, context, error, data);
        this.addLogEntry(entry);
    }
    // ===========================================
    // OPERATION LOGGING HELPERS
    // ===========================================
    startOperation(operation, context = {}, data) {
        const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.info(`Starting operation: ${operation}`, {
            ...context,
            operation,
            requestId: operationId
        }, data);
        return operationId;
    }
    endOperation(operation, operationId, context = {}, result, startTime) {
        const duration = startTime ? Date.now() - startTime : undefined;
        this.info(`Completed operation: ${operation}`, {
            ...context,
            operation,
            requestId: operationId,
            duration
        }, result);
    }
    failOperation(operation, operationId, error, context = {}, data) {
        this.error(`Failed operation: ${operation}`, {
            ...context,
            operation,
            requestId: operationId
        }, error, data);
    }
    // ===========================================
    // UTILITY METHODS
    // ===========================================
    addErrorReporter(reporter) {
        this.errorReporters.push(reporter);
        this.info('Error reporter registered', { operation: 'add_error_reporter' });
    }
    getLogs(level) {
        if (!level)
            return [...this.logs];
        return this.logs.filter(log => log.level === level);
    }
    getBreadcrumbs() {
        return [...this.breadcrumbs];
    }
    clearLogs() {
        this.logs = [];
        this.info('Logs cleared', { operation: 'clear_logs' });
    }
    exportLogs() {
        return JSON.stringify({
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            logs: this.logs,
            breadcrumbs: this.breadcrumbs
        }, null, 2);
    }
    getSessionInfo() {
        return {
            sessionId: this.sessionId,
            logLevel: this.logLevel,
            logsCount: this.logs.length,
            breadcrumbsCount: this.breadcrumbs.length
        };
    }
}
// Create and export singleton logger instance
exports.logger = new Logger();
// Export utility functions for common logging patterns
exports.logOperation = {
    async wrap(operation, context, fn, inputData) {
        const startTime = Date.now();
        const operationId = exports.logger.startOperation(operation, context, inputData);
        try {
            const result = await fn();
            exports.logger.endOperation(operation, operationId, context, result, startTime);
            return result;
        }
        catch (error) {
            exports.logger.failOperation(operation, operationId, error, context, inputData);
            throw error;
        }
    },
    wrapSync(operation, context, fn, inputData) {
        const startTime = Date.now();
        const operationId = exports.logger.startOperation(operation, context, inputData);
        try {
            const result = fn();
            exports.logger.endOperation(operation, operationId, context, result, startTime);
            return result;
        }
        catch (error) {
            exports.logger.failOperation(operation, operationId, error, context, inputData);
            throw error;
        }
    }
};
