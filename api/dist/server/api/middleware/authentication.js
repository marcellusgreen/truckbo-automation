"use strict";
// Authentication middleware for verifying JWT tokens
// Ensures request context includes authenticated user and organization info
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ApiResponseBuilder_1 = require("../core/ApiResponseBuilder");
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        const response = ApiResponseBuilder_1.ApiResponseBuilder.unauthorized('Access token required', { requestId: req.context?.requestId, version: req.context?.apiVersion });
        res.status(401).json(response);
        return;
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            const response = ApiResponseBuilder_1.ApiResponseBuilder.forbidden('Invalid or expired token', undefined, { requestId: req.context?.requestId, version: req.context?.apiVersion });
            res.status(403).json(response);
            return;
        }
        req.user = user;
        const context = (req.context || {});
        context.userId = user?.userId;
        context.companyId = user?.companyId;
        req.context = context;
        next();
    });
}
