/**
 * Authentication Routes for TruckBo
 * Handles user authentication, company registration, and session management
 * Uses PostgreSQL for data storage and JWT for session tokens
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const router = express.Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
});

// Constants
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
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
  require('crypto').getRandomValues(array);
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
 * Initialize demo data - POST /api/auth/initialize-demo
 */
router.post('/initialize-demo', async (req, res) => {
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
      message: 'Demo data initialized successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize demo data:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to initialize demo data',
      error: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * User login - POST /api/auth/login
 */
router.post('/login', async (req, res) => {
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
      permissions: getAllPermissions(), // You can customize this based on role
      lastLogin: new Date().toISOString(),
      isActive: userRow.is_active,
      createdAt: userRow.company_created_at,
      passwordHash: '[HIDDEN]', // Don't send password hash to client
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
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
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
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
      refreshToken
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
});

/**
 * Company registration - POST /api/auth/register
 */
router.post('/register', async (req, res) => {
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
      'SELECT id FROM organizations WHERE LOWER(name) = LOWER($1) OR contact_info->\'email\' = $2',
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
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
      refreshToken
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  } finally {
    client.release();
  }
});

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

/**
 * Middleware to authenticate JWT tokens
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    req.user = user;
    next();
  });
}

export default router;