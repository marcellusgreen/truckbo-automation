/**
 * Vercel Serverless Function - Company Registration
 * Handles company and user registration with PostgreSQL
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = '2h';

/**
 * Generate JWT token for authenticated users
 */
function generateJWT(user, company) {
  return jwt.sign(
    { 
      userId: user.id, 
      companyId: company.id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Generate secure refresh token
 */
function generateRefreshToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get subscription limits based on plan
 */
function getSubscriptionLimits(plan) {
  const limits = {
    basic: { maxVehicles: 10, maxDrivers: 20, maxUsers: 3 },
    professional: { maxVehicles: 50, maxDrivers: 100, maxUsers: 10 },
    enterprise: { maxVehicles: 500, maxDrivers: 1000, maxUsers: 50 }
  };
  return limits[plan] || limits.basic;
}

/**
 * Get all permissions (admin level)
 */
function getAllPermissions() {
  return [
    { resource: 'vehicles', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { resource: 'drivers', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { resource: 'documents', actions: ['create', 'read', 'update', 'delete', 'export'] },
    { resource: 'reports', actions: ['create', 'read', 'export'] },
    { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'settings', actions: ['read', 'update'] }
  ];
}

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

    const {
      companyName,
      contactEmail,
      contactPhone,
      dotNumber,
      mcNumber,
      address,
      adminUser,
      subscription
    } = req.body;

    // Validate required fields
    if (!companyName || !contactEmail || !adminUser?.email || !adminUser?.password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    console.log(`🏢 Company registration attempt: ${companyName}`);

    // Check if company already exists
    const existingCompanyResult = await client.query(
      'SELECT id FROM organizations WHERE LOWER(name) = LOWER($1) OR contact_info->>\'email\' = $2',
      [companyName, contactEmail.toLowerCase()]
    );

    if (existingCompanyResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A company with this name or email already exists'
      });
    }

    // Check if user email already exists
    const existingUserResult = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [adminUser.email]
    );

    if (existingUserResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(adminUser.password, SALT_ROUNDS);

    // Create organization
    const organizationId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await client.query(`
      INSERT INTO organizations (id, name, dot_number, mc_number, address, contact_info, subscription_tier)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      organizationId,
      companyName,
      dotNumber,
      mcNumber,
      JSON.stringify(address || {}),
      JSON.stringify({ email: contactEmail, phone: contactPhone }),
      subscription?.plan || 'professional'
    ]);

    // Create admin user
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await client.query(`
      INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      organizationId,
      adminUser.email,
      passwordHash,
      adminUser.firstName,
      adminUser.lastName,
      'admin'
    ]);

    await client.query('COMMIT');

    // Build response objects
    const limits = getSubscriptionLimits(subscription?.plan || 'professional');
    
    const user = {
      id: userId,
      email: adminUser.email,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      role: 'admin',
      companyId: organizationId,
      companyName: companyName,
      permissions: getAllPermissions(),
      lastLogin: new Date().toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
      passwordHash: '[HIDDEN]',
      failedLoginAttempts: 0
    };

    const company = {
      id: organizationId,
      name: companyName,
      dotNumber: dotNumber,
      mcNumber: mcNumber,
      address: address || {},
      contactEmail: contactEmail,
      contactPhone: contactPhone,
      subscription: {
        plan: subscription?.plan || 'professional',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 day trial
        maxVehicles: limits.maxVehicles,
        maxDrivers: limits.maxDrivers,
        maxUsers: limits.maxUsers
      },
      settings: {
        allowDriverSelfService: subscription?.plan !== 'basic',
        requireTwoFactor: subscription?.plan === 'enterprise',
        documentRetentionDays: 2555,
        autoRenewalAlerts: true
      },
      createdAt: new Date().toISOString(),
      isActive: true
    };

    // Generate JWT tokens
    const token = generateJWT(user, company);
    const refreshToken = generateRefreshToken();

    console.log(`✅ Company registered successfully: ${companyName}`);

    res.status(201).json({
      success: true,
      user,
      company,
      token,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      refreshToken
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
}