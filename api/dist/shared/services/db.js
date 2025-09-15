"use strict";
// Centralized Database Connection
// Uses Neon-compatible configuration from environment variables
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
let config;
if (process.env.DATABASE_URL) {
    // Use DATABASE_URL for cloud services like Neon
    config = {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for most cloud databases
    };
}
else {
    // Fallback to individual environment variables for local development
    config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'truckbo',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
}
const pool = new pg_1.Pool(config);
const query = (text, params) => pool.query(text, params);
exports.query = query;
exports.default = pool;
