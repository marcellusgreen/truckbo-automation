#!/usr/bin/env node

// Database Setup Script
// Initializes PostgreSQL database with TruckBo schema

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Parse DATABASE_URL or use individual environment variables
let config;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL (Neon, Heroku, etc.)
  config = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for cloud databases
  };
} else {
  // Use individual environment variables (local development)
  config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to default DB first
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const targetDatabase = process.env.DB_NAME || 'truckbo';

async function createDatabase() {
  // Skip database creation for cloud services (Neon, Supabase, etc.)
  if (process.env.DATABASE_URL) {
    console.log('🌐 Using cloud database - skipping database creation');
    console.log('📦 Database should already exist in your cloud provider');
    return;
  }

  const pool = new Pool(config);
  
  try {
    console.log('🔌 Connecting to local PostgreSQL...');
    
    // Check if database exists
    const checkResult = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase]
    );
    
    if (checkResult.rows.length === 0) {
      console.log(`📦 Creating database: ${targetDatabase}`);
      await pool.query(`CREATE DATABASE ${targetDatabase}`);
      console.log('✅ Database created successfully');
    } else {
      console.log(`📦 Database ${targetDatabase} already exists`);
    }
    
  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function runMigrations() {
  let poolConfig;
  
  if (process.env.DATABASE_URL) {
    // For cloud databases, use the connection string directly
    poolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
  } else {
    // For local databases, connect to the target database
    poolConfig = {
      ...config,
      database: targetDatabase
    };
  }
  
  const pool = new Pool(poolConfig);
  
  try {
    console.log('🏗️  Running database migrations...');
    
    // Read and execute schema file
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    await pool.query(schemaSQL);
    console.log('✅ Schema applied successfully');
    
    // Verify tables were created
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`📋 Created ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Verify views were created
    const viewsResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`👁️  Created ${viewsResult.rows.length} views:`);
    viewsResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Error running migrations:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function seedSampleData() {
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  Skipping sample data in production environment');
    return;
  }
  
  const pool = new Pool({
    ...config,
    database: targetDatabase,
  });
  
  try {
    console.log('🌱 Seeding sample data...');
    
    // Insert sample organization (already in schema, but let's verify)
    const orgResult = await pool.query(
      'SELECT id FROM organizations WHERE name = $1',
      ['Sample Trucking LLC']
    );
    
    if (orgResult.rows.length === 0) {
      await pool.query(`
        INSERT INTO organizations (id, name, dot_number, mc_number, address, contact_info) 
        VALUES (
          '550e8400-e29b-41d4-a716-446655440000',
          'Sample Trucking LLC',
          'DOT123456',
          'MC987654',
          '{"street": "123 Fleet Ave", "city": "Houston", "state": "TX", "zip": "77001"}',
          '{"phone": "(555) 123-4567", "email": "fleet@sampletrucking.com"}'
        )
      `);
      console.log('  ✅ Sample organization created');
    }
    
    // Insert sample user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      ['admin@sampletrucking.com']
    );
    
    if (userResult.rows.length === 0) {
      await pool.query(`
        INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role) 
        VALUES (
          '550e8400-e29b-41d4-a716-446655440000',
          'admin@sampletrucking.com',
          '$2b$10$dummy_hash_for_development_only',
          'John',
          'Admin',
          'admin'
        )
      `);
      console.log('  ✅ Sample user created');
    }
    
    // Insert sample vehicles
    const vehicleCount = await pool.query(
      'SELECT COUNT(*) FROM vehicles WHERE organization_id = $1',
      ['550e8400-e29b-41d4-a716-446655440000']
    );
    
    if (parseInt(vehicleCount.rows[0].count) === 0) {
      const sampleVehicles = [
        {
          vin: '1HGBH41JXMN109186',
          make: 'Freightliner',
          model: 'Cascadia',
          year: 2022,
          licensePlate: 'TX-FLT-001',
          truckNumber: 'Truck #001'
        },
        {
          vin: '2HGBH41JXMN109187',
          make: 'Peterbilt',
          model: '579',
          year: 2021,
          licensePlate: 'TX-FLT-002',
          truckNumber: 'Truck #002'
        }
      ];
      
      for (const vehicle of sampleVehicles) {
        await pool.query(`
          INSERT INTO vehicles (
            organization_id, vin, make, model, year, license_plate, truck_number,
            status, compliance_status, registration_expiry, insurance_expiry
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          '550e8400-e29b-41d4-a716-446655440000',
          vehicle.vin, vehicle.make, vehicle.model, vehicle.year,
          vehicle.licensePlate, vehicle.truckNumber, 'active', 'compliant',
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)  // 6 months from now
        ]);
      }
      console.log(`  ✅ ${sampleVehicles.length} sample vehicles created`);
    }
    
    // Insert sample drivers
    const driverCount = await pool.query(
      'SELECT COUNT(*) FROM drivers WHERE organization_id = $1',
      ['550e8400-e29b-41d4-a716-446655440000']
    );
    
    if (parseInt(driverCount.rows[0].count) === 0) {
      const sampleDrivers = [
        {
          employeeId: 'EMP001',
          firstName: 'John',
          lastName: 'Smith',
          cdlNumber: 'TX-CDL-45678912',
          cdlClass: 'A',
          medicalCertNumber: 'MED-TX-2024-001-4578'
        },
        {
          employeeId: 'EMP002',
          firstName: 'Maria',
          lastName: 'Rodriguez',
          cdlNumber: 'CA-CDL-78945612',
          cdlClass: 'A',
          medicalCertNumber: 'MED-CA-2025-002-9876'
        }
      ];
      
      for (const driver of sampleDrivers) {
        await pool.query(`
          INSERT INTO drivers (
            organization_id, employee_id, first_name, last_name, status,
            cdl_number, cdl_class, cdl_status, medical_cert_number, medical_cert_status,
            cdl_expiration_date, medical_cert_expiration_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          '550e8400-e29b-41d4-a716-446655440000',
          driver.employeeId, driver.firstName, driver.lastName, 'active',
          driver.cdlNumber, driver.cdlClass, 'valid', driver.medicalCertNumber, 'valid',
          new Date(Date.now() + 1000 * 24 * 60 * 60 * 1000), // ~3 years
          new Date(Date.now() + 400 * 24 * 60 * 60 * 1000)   // ~1 year
        ]);
      }
      console.log(`  ✅ ${sampleDrivers.length} sample drivers created`);
    }
    
    console.log('🌟 Sample data seeded successfully');
    
  } catch (error) {
    console.error('❌ Error seeding sample data:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('🚛 TruckBo Database Setup');
  console.log('========================\n');
  
  try {
    await createDatabase();
    await runMigrations();
    await seedSampleData();
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Update your .env file with database credentials');
    console.log('2. Configure AWS S3 settings');
    console.log('3. Run: npm run dev');
    console.log('\nDatabase URL: postgresql://' + config.user + '@' + config.host + ':' + config.port + '/' + targetDatabase);
    
  } catch (error) {
    console.error('\n💥 Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createDatabase, runMigrations, seedSampleData };