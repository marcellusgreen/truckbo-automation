// Centralized Database Connection
// Uses Neon-compatible configuration from environment variables

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let config;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL for cloud services like Neon
  config = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for most cloud databases
  };
} else {
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

const pool = new Pool(config);

export const query = (text: string, params: any[]) => pool.query(text, params);

export default pool;
