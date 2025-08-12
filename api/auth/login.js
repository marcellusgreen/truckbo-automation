/**
 * Vercel Serverless Function - User Login
 * Handles user authentication with PostgreSQL and JWT
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

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log(`🔐 Login attempt for: ${email}`);

    // Get user from database with organization info
    const userQuery = `
      SELECT 
        u.id, u.organization_id, u.email, u.password_hash, u.first_name, u.last_name, 
        u.role, u.is_active, u.last_login,
        o.name as company_name, o.dot_number, o.mc_number, o.address, o.contact_info,
        o.subscription_tier, o.created_at as company_created_at
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.email = $1 AND u.is_active = true AND o.created_at IS NOT NULL
    `;

    const userResult = await pool.query(userQuery, [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const userRow = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, userRow.password_hash);
    if (!isValidPassword) {
      console.log(`❌ Invalid password for user: ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userRow.id]
    );

    // Build user object
    const user = {
      id: userRow.id,
      email: userRow.email,
      firstName: userRow.first_name,
      lastName: userRow.last_name,
      role: userRow.role,
      companyId: userRow.organization_id,
      companyName: userRow.company_name,
      permissions: getAllPermissions(),
      lastLogin: new Date().toISOString(),
      isActive: userRow.is_active,
      createdAt: userRow.company_created_at,
      passwordHash: '[HIDDEN]',
      failedLoginAttempts: 0
    };

    // Build company object
    const company = {
      id: userRow.organization_id,
      name: userRow.company_name,
      dotNumber: userRow.dot_number,
      mcNumber: userRow.mc_number,
      address: userRow.address || {},
      contactEmail: userRow.contact_info?.email || userRow.email,
      contactPhone: userRow.contact_info?.phone || '',
      subscription: {
        plan: userRow.subscription_tier || 'professional',
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        maxVehicles: 50,
        maxDrivers: 100,
        maxUsers: 10
      },
      settings: {
        allowDriverSelfService: true,
        requireTwoFactor: false,
        documentRetentionDays: 2555,
        autoRenewalAlerts: true
      },
      createdAt: userRow.company_created_at,
      isActive: true
    };

    // Generate JWT tokens
    const token = generateJWT(user, company);
    const refreshToken = generateRefreshToken();

    console.log(`✅ User logged in successfully: ${email} (${company.name})`);

    res.json({
      success: true,
      user,
      company,
      token,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      refreshToken
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}