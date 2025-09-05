"use strict";
// Express API Application
// Main application file with API versioning and standardized middleware
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const errorHandling_1 = require("./middleware/errorHandling");
const logger_1 = require("../../shared/services/logger");
// Import route handlers
const vehicles_1 = __importDefault(require("./routes/vehicles"));
const documents_1 = __importDefault(require("./routes/documents"));
const compliance_1 = __importDefault(require("./routes/compliance"));
const auth_1 = __importDefault(require("./routes/auth"));
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));
// CORS configuration
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Version']
}));
// Compression middleware
app.use((0, compression_1.default)());
// Body parsing middleware
app.use(express_1.default.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        // Verify JSON payload
        try {
            JSON.parse(buf.toString());
        }
        catch (e) {
            throw new Error('Invalid JSON payload');
        }
    }
}));
app.use(express_1.default.urlencoded({
    extended: true,
    limit: '10mb'
}));
// Request context middleware (must be early in chain)
app.use(errorHandling_1.requestContext);
// Request logging middleware
app.use(errorHandling_1.requestLogger);
// Global rate limiting
const globalRateLimit = (0, errorHandling_1.createRateLimit)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window per IP
    message: 'Too many requests from this IP, please try again later'
});
app.use('/api', globalRateLimit);
// API versioning middleware
app.use('/api/:version', (req, res, next) => {
    const version = req.params.version;
    if (!['v1', 'v2'].includes(version)) {
        return res.status(400).json({
            status: 'error',
            message: `Unsupported API version: ${version}`,
            data: null,
            timestamp: new Date().toISOString(),
            version: 'v1',
            requestId: req.context?.requestId || 'unknown',
            error: {
                code: 'INVALID_API_VERSION',
                message: `API version '${version}' is not supported`,
                userMessage: 'Please use a supported API version (v1, v2)',
                details: {
                    supportedVersions: ['v1', 'v2']
                }
            }
        });
    }
    // Set API version in request context
    if (req.context) {
        req.context.apiVersion = version;
    }
    next();
});
// Health check endpoint (outside versioning)
app.get('/health', errorHandling_1.healthCheck);
app.get('/api/health', errorHandling_1.healthCheck);
// API status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'success',
        message: 'API is operational',
        data: {
            service: 'TruckBo Automation API',
            version: process.env.API_VERSION || '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            supportedVersions: ['v1', 'v2']
        },
        timestamp: new Date().toISOString(),
        version: 'v1',
        requestId: req.context?.requestId || 'status_check'
    });
});
// API Documentation endpoint
app.get('/api/docs', (req, res) => {
    res.json({
        status: 'success',
        message: 'API Documentation',
        data: {
            title: 'TruckBo Automation API',
            version: '1.0.0',
            description: 'Standardized API for vehicle fleet management and compliance',
            baseUrl: '/api/v1',
            endpoints: {
                auth: {
                    'POST /auth/initialize-demo': 'Initialize demo data for development/testing',
                    'POST /auth/login': 'User login with email and password',
                    'POST /auth/register': 'Register new company and admin user'
                },
                vehicles: {
                    'GET /vehicles': 'List all vehicles with filtering and pagination',
                    'GET /vehicles/:id': 'Get specific vehicle details',
                    'POST /vehicles': 'Create or update vehicle',
                    'PUT /vehicles/:id': 'Update specific vehicle',
                    'DELETE /vehicles/:id': 'Delete specific vehicle',
                    'GET /vehicles/:id/compliance': 'Get vehicle compliance status'
                },
                documents: {
                    'POST /documents/process': 'Process uploaded documents for data extraction',
                    'GET /documents/processing-status/:id': 'Get document processing status',
                    'GET /documents/extracted-data/:id': 'Get extracted data from processed document'
                },
                compliance: {
                    'GET /compliance/expiring': 'Get vehicles with expiring compliance',
                    'GET /compliance/summary': 'Get fleet compliance summary',
                    'GET /compliance/vehicle/:id': 'Get detailed vehicle compliance',
                    'POST /compliance/refresh/:id': 'Refresh vehicle compliance data'
                }
            },
            responseFormat: {
                success: {
                    status: 'success',
                    message: 'Human readable message',
                    data: 'Response data',
                    timestamp: 'ISO 8601 timestamp',
                    version: 'API version',
                    requestId: 'Unique request ID'
                },
                error: {
                    status: 'error',
                    message: 'Error message for developers',
                    data: null,
                    timestamp: 'ISO 8601 timestamp',
                    version: 'API version',
                    requestId: 'Unique request ID',
                    error: {
                        code: 'ERROR_CODE',
                        message: 'Detailed error message',
                        userMessage: 'User-friendly error message'
                    }
                }
            }
        },
        timestamp: new Date().toISOString(),
        version: 'v1',
        requestId: req.context?.requestId || 'docs_request'
    });
});
// Mount API route handlers with versioning
app.use('/api', auth_1.default);
app.use('/api', vehicles_1.default);
app.use('/api', documents_1.default);
app.use('/api', compliance_1.default);
// V2 API routes (future implementation)
app.use('/api/v2/*', (req, res) => {
    res.status(501).json({
        status: 'error',
        message: 'API version 2 is not yet implemented',
        data: null,
        timestamp: new Date().toISOString(),
        version: 'v2',
        requestId: req.context?.requestId || 'v2_not_implemented',
        error: {
            code: 'NOT_IMPLEMENTED',
            message: 'API v2 is under development',
            userMessage: 'This API version is not yet available. Please use v1.'
        }
    });
});
// Catch-all for unmatched API routes
app.use('/api/*', errorHandling_1.notFoundHandler);
// Error handling middleware (must be last)
app.use(errorHandling_1.errorHandler);
// Graceful shutdown handling
const gracefulShutdown = () => {
    logger_1.logger.info('Received shutdown signal, starting graceful shutdown', {
        layer: 'api',
        component: 'Application',
        operation: 'gracefulShutdown'
    });
    // Close server
    const server = app.listen();
    server?.close(() => {
        logger_1.logger.info('HTTP server closed', {
            layer: 'api',
            component: 'Application',
            operation: 'gracefulShutdown'
        });
        process.exit(0);
    });
    // Force close after 10 seconds
    setTimeout(() => {
        logger_1.logger.error('Could not close connections in time, forcefully shutting down', {
            layer: 'api',
            component: 'Application',
            operation: 'gracefulShutdown'
        });
        process.exit(1);
    }, 10000);
};
// Listen for shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception', {
        layer: 'api',
        component: 'Application',
        operation: 'uncaughtException'
    }, error);
    process.exit(1);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection', {
        layer: 'api',
        component: 'Application',
        operation: 'unhandledRejection'
    }, new Error(`Unhandled rejection at: ${promise}, reason: ${reason}`));
    process.exit(1);
});
exports.default = app;
// Start server if this file is run directly
if (require.main === module) {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        logger_1.logger.info(`API server started on port ${PORT}`, {
            layer: 'api',
            component: 'Application',
            operation: 'startup'
        }, {
            port: PORT,
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
            apiVersion: process.env.API_VERSION || '1.0.0'
        });
    });
}
