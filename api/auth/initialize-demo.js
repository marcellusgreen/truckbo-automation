/**
 * Vercel Serverless Function - Initialize Demo Data
 * Sets up demo organizations and users for testing
 */

import bcrypt from 'bcrypt';
import { Pool } from 'pg';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
});

const SALT_ROUNDS = 12;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('🏗️ Initializing demo authentication data...');

    // Create demo organizations if they don't exist
    const demoCompanies = [
      {
        id: '550e8400-e29b-41d4-a716-446655440000', // Use the sample org ID from schema
        name: 'Sunbelt Trucking LLC',
        dot_number: '12345678',
        mc_number: 'MC-987654',
        address: {
          street: '123 Industrial Blvd',
          city: 'Dallas',
          state: 'TX',
          zipCode: '75201'
        },
        contact_info: {
          email: 'admin@sunbelttrucking.com',
          phone: '214-555-0123'
        }
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Lone Star Logistics',
        dot_number: '87654321',
        mc_number: 'MC-123456',
        address: {
          street: '456 Commerce Way',
          city: 'Houston',
          state: 'TX',
          zipCode: '77001'
        },
        contact_info: {
          email: 'admin@lonestarlogistics.com',
          phone: '713-555-0456'
        }
      }
    ];

    // Insert organizations
    for (const company of demoCompanies) {
      await client.query(`
        INSERT INTO organizations (id, name, dot_number, mc_number, address, contact_info)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, [
        company.id,
        company.name,
        company.dot_number,
        company.mc_number,
        JSON.stringify(company.address),
        JSON.stringify(company.contact_info)
      ]);
    }

    // Create demo users with hashed passwords
    const demoPassword = 'TruckBo2025!';
    const passwordHash = await bcrypt.hash(demoPassword, SALT_ROUNDS);

    const demoUsers = [
      {
        id: 'user_admin1',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'admin@sunbelttrucking.com',
        password_hash: passwordHash,
        first_name: 'Sarah',
        last_name: 'Johnson',
        role: 'admin'
      },
      {
        id: 'user_manager1',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'manager@sunbelttrucking.com',
        password_hash: passwordHash,
        first_name: 'Mike',
        last_name: 'Rodriguez',
        role: 'manager'
      },
      {
        id: 'user_admin2',
        organization_id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'admin@lonestarlogistics.com',
        password_hash: passwordHash,
        first_name: 'Jennifer',
        last_name: 'Davis',
        role: 'admin'
      }
    ];

    // Insert users
    for (const user of demoUsers) {
      await client.query(`
        INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO NOTHING
      `, [
        user.id,
        user.organization_id,
        user.email,
        user.password_hash,
        user.first_name,
        user.last_name,
        user.role
      ]);
    }

    await client.query('COMMIT');

    console.log('✅ Demo authentication data initialized');
    console.log('🔐 Demo password for all accounts: TruckBo2025!');

    res.json({
      success: true,
      message: 'Demo data initialized successfully',
      accounts: [
        { email: 'admin@sunbelttrucking.com', company: 'Sunbelt Trucking LLC', role: 'admin' },
        { email: 'manager@sunbelttrucking.com', company: 'Sunbelt Trucking LLC', role: 'manager' },
        { email: 'admin@lonestarlogistics.com', company: 'Lone Star Logistics', role: 'admin' }
      ],
      password: 'TruckBo2025!'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize demo data:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to initialize demo data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
}