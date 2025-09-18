#!/usr/bin/env node

const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const targetDatabase = process.env.DB_NAME || 'truckbo';

let poolConfig;

if (hasDatabaseUrl) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
    poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: targetDatabase,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

const createTableSql = [
  'CREATE TABLE IF NOT EXISTS document_processing_jobs (',
  '    job_id TEXT PRIMARY KEY,',
  '    original_filename TEXT NOT NULL,',
  '    mime_type TEXT,',
  '    file_size BIGINT,',
  '    gcs_input_bucket TEXT NOT NULL,',
  '    gcs_input_object TEXT NOT NULL,',
  '    gcs_output_bucket TEXT NOT NULL,',
  '    gcs_output_prefix TEXT NOT NULL,',
  '    result_object TEXT,',
  "    status VARCHAR(20) DEFAULT 'processing',",
  '    error_message TEXT,',
  "    cleanup_status VARCHAR(20) DEFAULT 'pending',",
  '    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,',
  '    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,',
  '    completed_at TIMESTAMP WITH TIME ZONE',
  ');'
].join('\n');

const createIndexSql = 'CREATE INDEX IF NOT EXISTS idx_document_jobs_status ON document_processing_jobs(status);';

async function run() {
  const pool = new Pool(poolConfig);

  try {
    await pool.query(createTableSql);
    await pool.query(createIndexSql);

    const tableResult = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_processing_jobs'");
    if (tableResult.rowCount === 1) {
      console.log('document_processing_jobs table is present');
    } else {
      console.log('document_processing_jobs table not found after migration');
    }

    const indexResult = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'document_processing_jobs'");
    const indexNames = indexResult.rows.map((row) => row.indexname);
    console.log('document_processing_jobs indexes:', indexNames.length ? indexNames.join(', ') : 'none');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
