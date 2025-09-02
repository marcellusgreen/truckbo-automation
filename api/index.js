const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '2h';

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

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

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

app.post('/auth/initialize-demo', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('🏗️ Initializing demo authentication data...');

    const demoCompanies = [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
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

    const demoPassword = 'TruckBo2025!';
    const passwordHash = await bcrypt.hash(demoPassword, 12);

    const demoUsers = [
      {
        id: uuidv4(),
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'admin@sunbelttrucking.com',
        password_hash: passwordHash,
        first_name: 'Sarah',
        last_name: 'Johnson',
        role: 'admin'
      },
      {
        id: uuidv4(),
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'manager@sunbelttrucking.com',
        password_hash: passwordHash,
        first_name: 'Mike',
        last_name: 'Rodriguez',
        role: 'manager'
      },
      {
        id: uuidv4(),
        organization_id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'admin@lonestarlogistics.com',
        password_hash: passwordHash,
        first_name: 'Jennifer',
        last_name: 'Davis',
        role: 'admin'
      }
    ];

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

    res.json({
      success: true,
      message: 'Demo data initialized successfully',
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize demo data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize demo data',
    });
  } finally {
    client.release();
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

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

    const isValidPassword = await bcrypt.compare(password, userRow.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userRow.id]
    );

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

    const token = generateJWT(user, company);
    const refreshToken = generateRefreshToken();

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
    });
  }
});

app.post('/auth/register', async (req, res) => {
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

    if (!companyName || !contactEmail || !adminUser?.email || !adminUser?.password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

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

    const passwordHash = await bcrypt.hash(adminUser.password, 12);

    const organizationId = uuidv4();
    
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

    const userId = uuidv4();
    
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

    const token = generateJWT(user, company);
    const refreshToken = generateRefreshToken();

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
    });
  } finally {
    client.release();
  }
});

app.get('/fleet', async (req, res) => {
  const client = await pool.connect();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const organizationId = decoded.companyId;

    const { rows } = await client.query('SELECT * FROM vehicles WHERE organization_id = $1', [organizationId]);

    res.json({ success: true, fleet: rows });

  } catch (error) {
    console.error('Failed to fetch fleet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fleet',
    });
  } finally {
    client.release();
  }
});

// Export for Vercel serverless functions
module.exports = (req, res) => {
  return app(req, res);
};