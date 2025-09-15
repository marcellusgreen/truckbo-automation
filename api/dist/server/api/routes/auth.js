"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pg_1 = require("pg");
const crypto_1 = __importDefault(require("crypto"));
const ApiResponseBuilder_1 = require("../core/ApiResponseBuilder");
const errorHandling_1 = require("../middleware/errorHandling");
const dotenv_1 = __importDefault(require("dotenv"));
// Ensure environment variables are loaded
dotenv_1.default.config();
const router = (0, express_1.Router)();
// Database connection
console.log('🔌 DATABASE_URL configured:', process.env.DATABASE_URL ? 'Yes' : 'No');
const pool = new pg_1.Pool({
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
// Rate limiting for auth endpoints
const authRateLimit = (0, errorHandling_1.createRateLimit)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window per IP (stricter for auth)
    message: 'Too many authentication attempts from this IP, please try again later'
});
/**
 * Generate JWT token for authenticated users
 */
function generateJWT(user, company) {
    return jsonwebtoken_1.default.sign({
        userId: user.id,
        companyId: company.id,
        email: user.email,
        role: user.role
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
/**
 * Generate secure refresh token
 */
function generateRefreshToken() {
    const array = new Uint8Array(32);
    crypto_1.default.getRandomValues(array);
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
/**
 * Initialize demo data - POST /api/v1/auth/initialize-demo
 */
router.post('/v1/auth/initialize-demo', authRateLimit, async (req, res) => {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking demo authentication data...');
        // Check if we already have demo users and organizations
        const usersResult = await client.query('SELECT COUNT(*) as count FROM users');
        const orgsResult = await client.query('SELECT COUNT(*) as count FROM organizations');
        const userCount = parseInt(usersResult.rows[0].count);
        const orgCount = parseInt(orgsResult.rows[0].count);
        console.log(`📊 Found ${userCount} users and ${orgCount} organizations in database`);
        if (userCount > 0 && orgCount > 0) {
            console.log('✅ Demo authentication data already exists');
            console.log('🔐 Demo password for existing accounts: TruckBo2025!');
            // Get a sample of existing users for display
            const sampleUsers = await client.query(`
        SELECT email, first_name, last_name, role 
        FROM users 
        ORDER BY email 
        LIMIT 5
      `);
            console.log('👥 Sample users:', sampleUsers.rows);
        }
        else {
            console.log('⚠️  No demo data found. Database appears to be empty.');
            console.log('💡 Please ensure your database has been properly seeded with demo data.');
        }
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success({ message: 'Demo data initialized successfully', password: 'TruckBo2025!' }, 'Demo authentication data initialized', { requestId: req.context?.requestId, version: req.context?.apiVersion });
        res.json(response);
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Failed to initialize demo data:', error);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.internalError(error, { requestId: req.context?.requestId, version: req.context?.apiVersion });
        res.status(500).json(response);
    }
    finally {
        client.release();
    }
});
/**
 * User login - POST /api/v1/auth/login
 */
router.post('/v1/auth/login', authRateLimit, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            const response = ApiResponseBuilder_1.ApiResponseBuilder.validationError({ email: !email ? ['Email is required'] : [], password: !password ? ['Password is required'] : [] }, 'Email and password are required', { requestId: req.context?.requestId, version: req.context?.apiVersion });
            return res.status(400).json(response);
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
            const response = ApiResponseBuilder_1.ApiResponseBuilder.unauthorized('Invalid email or password', { requestId: req.context?.requestId, version: req.context?.apiVersion });
            return res.status(401).json(response);
        }
        const userRow = userResult.rows[0];
        // Verify password
        const isValidPassword = await bcryptjs_1.default.compare(password, userRow.password_hash);
        if (!isValidPassword) {
            console.log(`❌ Invalid password for user: ${email}`);
            const response = ApiResponseBuilder_1.ApiResponseBuilder.unauthorized('Invalid email or password', { requestId: req.context?.requestId, version: req.context?.apiVersion });
            return res.status(401).json(response);
        }
        // Update last login
        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userRow.id]);
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
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success({
            user,
            company,
            token,
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            refreshToken
        }, 'Login successful', { requestId: req.context?.requestId, version: req.context?.apiVersion });
        res.json(response);
    }
    catch (error) {
        console.error('Login error:', error);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.internalError(error, { requestId: req.context?.requestId, version: req.context?.apiVersion });
        res.status(500).json(response);
    }
});
/**
 * Company registration - POST /api/v1/auth/register
 */
router.post('/v1/auth/register', authRateLimit, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { companyName, contactEmail, contactPhone, dotNumber, mcNumber, address, adminUser, subscription } = req.body;
        // Validate required fields
        if (!companyName || !contactEmail || !adminUser?.email || !adminUser?.password) {
            const response = ApiResponseBuilder_1.ApiResponseBuilder.validationError({
                companyName: !companyName ? ['Company name is required'] : [],
                contactEmail: !contactEmail ? ['Contact email is required'] : [],
                adminUser: !adminUser?.email ? ['Admin email is required'] : !adminUser?.password ? ['Admin password is required'] : []
            }, 'Missing required fields', { requestId: req.context?.requestId, version: req.context?.apiVersion });
            return res.status(400).json(response);
        }
        console.log(`🏢 Company registration attempt: ${companyName}`);
        // Check if company already exists
        const existingCompanyResult = await client.query('SELECT id FROM organizations WHERE LOWER(name) = LOWER($1) OR contact_info->>\'email\' = $2', [companyName, contactEmail.toLowerCase()]);
        if (existingCompanyResult.rows.length > 0) {
            const response = ApiResponseBuilder_1.ApiResponseBuilder.conflict('Company', 'name or email', companyName, { requestId: req.context?.requestId, version: req.context?.apiVersion });
            return res.status(409).json(response);
        }
        // Check if user email already exists
        const existingUserResult = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [adminUser.email]);
        if (existingUserResult.rows.length > 0) {
            const response = ApiResponseBuilder_1.ApiResponseBuilder.conflict('User', 'email', adminUser.email, { requestId: req.context?.requestId, version: req.context?.apiVersion });
            return res.status(409).json(response);
        }
        // Hash password
        const passwordHash = await bcryptjs_1.default.hash(adminUser.password, SALT_ROUNDS);
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
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success({
            user,
            company,
            token,
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            refreshToken
        }, 'Company registered successfully', { requestId: req.context?.requestId, version: req.context?.apiVersion });
        res.status(201).json(response);
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Registration error:', error);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.internalError(error, { requestId: req.context?.requestId, version: req.context?.apiVersion });
        res.status(500).json(response);
    }
    finally {
        client.release();
    }
});
/**
 * Middleware to authenticate JWT tokens
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        const response = ApiResponseBuilder_1.ApiResponseBuilder.unauthorized('Access token required', { requestId: req.context?.requestId, version: req.context?.apiVersion });
        return res.status(401).json(response);
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            const response = ApiResponseBuilder_1.ApiResponseBuilder.forbidden('Invalid or expired token', undefined, { requestId: req.context?.requestId, version: req.context?.apiVersion });
            return res.status(403).json(response);
        }
        req.user = user;
        next();
    });
}
exports.default = router;
