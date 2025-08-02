// Authentication Service
// Handles user authentication, company isolation, and session management

import { errorHandler } from './errorHandler';
import * as bcrypt from 'bcryptjs';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'driver' | 'viewer';
  companyId: string;
  companyName: string;
  permissions: Permission[];
  lastLogin: string;
  isActive: boolean;
  createdAt: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil?: string;
}

export interface Company {
  id: string;
  name: string;
  dotNumber?: string;
  mcNumber?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  contactEmail: string;
  contactPhone: string;
  subscription: {
    plan: 'basic' | 'professional' | 'enterprise';
    status: 'active' | 'suspended' | 'cancelled';
    expiresAt: string;
    maxVehicles: number;
    maxDrivers: number;
    maxUsers: number;
  };
  settings: {
    allowDriverSelfService: boolean;
    requireTwoFactor: boolean;
    documentRetentionDays: number;
    autoRenewalAlerts: boolean;
  };
  createdAt: string;
  isActive: boolean;
}

export interface Permission {
  resource: 'vehicles' | 'drivers' | 'documents' | 'reports' | 'users' | 'settings';
  actions: ('create' | 'read' | 'update' | 'delete' | 'export')[];
}

export interface AuthSession {
  user: User;
  company: Company;
  token: string;
  expiresAt: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  companyCode?: string;
}

export interface RegisterCompanyData {
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  dotNumber?: string;
  mcNumber?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  adminUser: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  };
  subscription: {
    plan: 'basic' | 'professional' | 'enterprise';
  };
}

interface LoginAttemptRecord {
  email: string;
  attempts: number;
  lastAttempt: string;
  lockedUntil?: string;
}

class AuthenticationService {
  private readonly SESSION_KEY = 'truckbo_session';
  private readonly COMPANIES_KEY = 'truckbo_companies';
  private readonly USERS_KEY = 'truckbo_users';
  private readonly LOGIN_ATTEMPTS_KEY = 'truckbo_login_attempts';
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
  private readonly SALT_ROUNDS = 12;
  private currentSession: AuthSession | null = null;
  private sessionListeners: ((session: AuthSession | null) => void)[] = [];

  constructor() {
    this.loadSession();
  }

  /**
   * Initialize authentication system with demo data
   */
  async initializeDemo(): Promise<void> {
    // Create demo companies
    const demoCompanies: Company[] = [
      {
        id: 'company_demo1',
        name: 'Sunbelt Trucking LLC',
        dotNumber: '12345678',
        mcNumber: 'MC-987654',
        address: {
          street: '123 Industrial Blvd',
          city: 'Dallas',
          state: 'TX',
          zipCode: '75201'
        },
        contactEmail: 'admin@sunbelttrucking.com',
        contactPhone: '214-555-0123',
        subscription: {
          plan: 'professional',
          status: 'active',
          expiresAt: '2025-12-31T23:59:59Z',
          maxVehicles: 50,
          maxDrivers: 100,
          maxUsers: 10
        },
        settings: {
          allowDriverSelfService: true,
          requireTwoFactor: false,
          documentRetentionDays: 2555, // ~7 years
          autoRenewalAlerts: true
        },
        createdAt: new Date().toISOString(),
        isActive: true
      },
      {
        id: 'company_demo2',
        name: 'Lone Star Logistics',
        dotNumber: '87654321',
        mcNumber: 'MC-123456',
        address: {
          street: '456 Commerce Way',
          city: 'Houston',
          state: 'TX',
          zipCode: '77001'
        },
        contactEmail: 'admin@lonestarlogistics.com',
        contactPhone: '713-555-0456',
        subscription: {
          plan: 'basic',
          status: 'active',
          expiresAt: '2025-06-30T23:59:59Z',
          maxVehicles: 10,
          maxDrivers: 20,
          maxUsers: 3
        },
        settings: {
          allowDriverSelfService: false,
          requireTwoFactor: true,
          documentRetentionDays: 1825, // ~5 years
          autoRenewalAlerts: true
        },
        createdAt: new Date().toISOString(),
        isActive: true
      }
    ];

    // Create demo users with secure password hashes
    const demoPassword = 'TruckBo2025!';
    const passwordHash = await bcrypt.hash(demoPassword, this.SALT_ROUNDS);
    
    const demoUsers: User[] = [
      {
        id: 'user_admin1',
        email: 'admin@sunbelttrucking.com',
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'admin',
        companyId: 'company_demo1',
        companyName: 'Sunbelt Trucking LLC',
        permissions: this.getAllPermissions(),
        lastLogin: new Date().toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        passwordHash,
        failedLoginAttempts: 0
      },
      {
        id: 'user_manager1',
        email: 'manager@sunbelttrucking.com',
        firstName: 'Mike',
        lastName: 'Rodriguez',
        role: 'manager',
        companyId: 'company_demo1',
        companyName: 'Sunbelt Trucking LLC',
        permissions: this.getManagerPermissions(),
        lastLogin: new Date().toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        passwordHash,
        failedLoginAttempts: 0
      },
      {
        id: 'user_admin2',
        email: 'admin@lonestarlogistics.com',
        firstName: 'Jennifer',
        lastName: 'Davis',
        role: 'admin',
        companyId: 'company_demo2',
        companyName: 'Lone Star Logistics',
        permissions: this.getAllPermissions(),
        lastLogin: new Date().toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        passwordHash,
        failedLoginAttempts: 0
      }
    ];

    // Save to localStorage (in production, this would be a database)
    localStorage.setItem(this.COMPANIES_KEY, JSON.stringify(demoCompanies));
    localStorage.setItem(this.USERS_KEY, JSON.stringify(demoUsers));

    console.log('🏗️ Demo authentication data initialized with secure passwords');
    console.log('🔐 Demo password for all accounts: TruckBo2025!');
  }

  /**
   * Login user with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    try {
      // Check for rate limiting
      const isRateLimited = await this.checkRateLimit(credentials.email);
      if (isRateLimited) {
        throw new Error('Too many failed login attempts. Account temporarily locked.');
      }

      const users = this.getUsers();
      const companies = this.getCompanies();

      const user = users.find(u => 
        u.email.toLowerCase() === credentials.email.toLowerCase() && 
        u.isActive
      );

      if (!user) {
        await this.recordFailedAttempt(credentials.email);
        throw new Error('Invalid email or password');
      }

      // Check if user account is locked
      if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
        throw new Error('Account is temporarily locked. Please try again later.');
      }

      // Verify password hash
      const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!isValidPassword) {
        await this.recordFailedAttempt(credentials.email);
        
        // Lock user account after max attempts
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= this.MAX_LOGIN_ATTEMPTS) {
          user.lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION).toISOString();
        }
        this.saveUsers(users);
        
        throw new Error('Invalid email or password');
      }

      // Reset failed attempts on successful login
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
      await this.clearFailedAttempts(credentials.email);

      const company = companies.find(c => c.id === user.companyId);
      if (!company || !company.isActive) {
        throw new Error('Company account is not active');
      }

      // Check subscription status
      if (company.subscription.status !== 'active') {
        throw new Error('Company subscription is not active. Please contact support.');
      }

      // Update last login
      user.lastLogin = new Date().toISOString();
      this.saveUsers(users);

      // Create session with secure token
      const session: AuthSession = {
        user,
        company,
        token: await this.generateSecureToken(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours (shorter)
        refreshToken: await this.generateSecureToken()
      };

      this.currentSession = session;
      this.saveSession(session);
      this.notifySessionListeners();

      errorHandler.showSuccess(`Welcome back, ${user.firstName}!`);
      console.log(`🔐 User logged in: ${user.email} (${company.name})`);

      return session;

    } catch (error) {
      errorHandler.handleUserError(
        error instanceof Error ? error.message : 'Login failed',
        'Please check your credentials and try again'
      );
      throw error;
    }
  }

  /**
   * Register new company and admin user
   */
  async registerCompany(data: RegisterCompanyData): Promise<AuthSession> {
    try {
      // Validate password strength
      const passwordValidation = this.validatePasswordStrength(data.adminUser.password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }

      const companies = this.getCompanies();
      const users = this.getUsers();

      // Check if company already exists
      const existingCompany = companies.find(c => 
        c.contactEmail.toLowerCase() === data.contactEmail.toLowerCase() ||
        c.name.toLowerCase() === data.companyName.toLowerCase()
      );

      if (existingCompany) {
        throw new Error('A company with this name or email already exists');
      }

      // Check if user email already exists
      const existingUser = users.find(u => 
        u.email.toLowerCase() === data.adminUser.email.toLowerCase()
      );

      if (existingUser) {
        throw new Error('A user with this email already exists');
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(data.adminUser.password, this.SALT_ROUNDS);

      // Create new company
      const companyId = `company_${Date.now()}`;
      const newCompany: Company = {
        id: companyId,
        name: data.companyName,
        dotNumber: data.dotNumber,
        mcNumber: data.mcNumber,
        address: data.address,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        subscription: {
          plan: data.subscription.plan,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 day trial
          maxVehicles: this.getSubscriptionLimits(data.subscription.plan).maxVehicles,
          maxDrivers: this.getSubscriptionLimits(data.subscription.plan).maxDrivers,
          maxUsers: this.getSubscriptionLimits(data.subscription.plan).maxUsers
        },
        settings: {
          allowDriverSelfService: data.subscription.plan !== 'basic',
          requireTwoFactor: data.subscription.plan === 'enterprise',
          documentRetentionDays: 2555, // ~7 years
          autoRenewalAlerts: true
        },
        createdAt: new Date().toISOString(),
        isActive: true
      };

      // Create admin user with secure password hash
      const userId = `user_${Date.now()}`;
      const newUser: User = {
        id: userId,
        email: data.adminUser.email,
        firstName: data.adminUser.firstName,
        lastName: data.adminUser.lastName,
        role: 'admin',
        companyId: companyId,
        companyName: data.companyName,
        permissions: this.getAllPermissions(),
        lastLogin: new Date().toISOString(),
        isActive: true,
        createdAt: new Date().toISOString(),
        passwordHash,
        failedLoginAttempts: 0
      };

      // Save to storage
      companies.push(newCompany);
      users.push(newUser);
      this.saveCompanies(companies);
      this.saveUsers(users);

      // Create session for new user
      const session: AuthSession = {
        user: newUser,
        company: newCompany,
        token: await this.generateSecureToken(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        refreshToken: await this.generateSecureToken()
      };

      this.currentSession = session;
      this.saveSession(session);
      this.notifySessionListeners();

      errorHandler.showSuccess(`Welcome to TruckBo Pro, ${newUser.firstName}! Your company has been registered.`);
      console.log(`🏢 New company registered: ${newCompany.name}`);

      return session;

    } catch (error) {
      errorHandler.handleUserError(
        error instanceof Error ? error.message : 'Registration failed',
        'Please check your information and try again'
      );
      throw error;
    }
  }

  /**
   * Logout current user
   */
  logout(): void {
    if (this.currentSession) {
      console.log(`🔐 User logged out: ${this.currentSession.user.email}`);
      errorHandler.showInfo(`Goodbye, ${this.currentSession.user.firstName}!`);
    }

    this.currentSession = null;
    localStorage.removeItem(this.SESSION_KEY);
    this.notifySessionListeners();
  }

  /**
   * Get current authenticated session
   */
  getCurrentSession(): AuthSession | null {
    return this.currentSession;
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentSession?.user || null;
  }

  /**
   * Get current company
   */
  getCurrentCompany(): Company | null {
    return this.currentSession?.company || null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    if (!this.currentSession) return false;
    
    const now = new Date();
    const expiresAt = new Date(this.currentSession.expiresAt);
    
    if (now >= expiresAt) {
      this.logout();
      return false;
    }
    
    return true;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(resource: Permission['resource'], action: Permission['actions'][0]): boolean {
    if (!this.currentSession) return false;
    
    const user = this.currentSession.user;
    return user.permissions.some(p => 
      p.resource === resource && p.actions.includes(action)
    );
  }

  /**
   * Check if user has admin role
   */
  isAdmin(): boolean {
    return this.currentSession?.user.role === 'admin';
  }

  /**
   * Check if user can manage other users
   */
  canManageUsers(): boolean {
    return this.hasPermission('users', 'create') && this.hasPermission('users', 'update');
  }

  /**
   * Subscribe to session changes
   */
  subscribeToSession(listener: (session: AuthSession | null) => void): () => void {
    this.sessionListeners.push(listener);
    return () => {
      this.sessionListeners = this.sessionListeners.filter(l => l !== listener);
    };
  }

  /**
   * Create company-scoped storage key
   */
  getCompanyScopedKey(baseKey: string): string {
    const companyId = this.getCurrentCompany()?.id;
    if (!companyId) {
      throw new Error('No authenticated company found');
    }
    return `${baseKey}_${companyId}`;
  }

  /**
   * Get subscription limits for a plan
   */
  private getSubscriptionLimits(plan: string) {
    const limits = {
      basic: { maxVehicles: 10, maxDrivers: 20, maxUsers: 3 },
      professional: { maxVehicles: 50, maxDrivers: 100, maxUsers: 10 },
      enterprise: { maxVehicles: 500, maxDrivers: 1000, maxUsers: 50 }
    };
    return limits[plan as keyof typeof limits] || limits.basic;
  }

  /**
   * Get all permissions (admin)
   */
  private getAllPermissions(): Permission[] {
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
   * Get manager permissions
   */
  private getManagerPermissions(): Permission[] {
    return [
      { resource: 'vehicles', actions: ['create', 'read', 'update', 'export'] },
      { resource: 'drivers', actions: ['create', 'read', 'update', 'export'] },
      { resource: 'documents', actions: ['create', 'read', 'update', 'export'] },
      { resource: 'reports', actions: ['create', 'read', 'export'] },
      { resource: 'users', actions: ['read'] },
      { resource: 'settings', actions: ['read'] }
    ];
  }

  /**
   * Generate secure session token using crypto
   */
  private async generateSecureToken(): Promise<string> {
    // Use Web Crypto API for secure random generation
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validate password strength
   */
  private validatePasswordStrength(password: string): { isValid: boolean; message: string } {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (password.length < minLength) {
      return { isValid: false, message: `Password must be at least ${minLength} characters long` };
    }
    if (!hasUpperCase) {
      return { isValid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!hasLowerCase) {
      return { isValid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!hasNumbers) {
      return { isValid: false, message: 'Password must contain at least one number' };
    }
    if (!hasSpecialChar) {
      return { isValid: false, message: 'Password must contain at least one special character' };
    }
    return { isValid: true, message: 'Password is strong' };
  }

  /**
   * Check rate limiting for login attempts
   */
  private async checkRateLimit(email: string): Promise<boolean> {
    const attempts = this.getLoginAttempts();
    const userAttempts = attempts.find(a => a.email.toLowerCase() === email.toLowerCase());
    
    if (!userAttempts) return false;
    
    if (userAttempts.lockedUntil && new Date() < new Date(userAttempts.lockedUntil)) {
      return true;
    }
    
    return false;
  }

  /**
   * Record failed login attempt
   */
  private async recordFailedAttempt(email: string): Promise<void> {
    const attempts = this.getLoginAttempts();
    const userAttemptIndex = attempts.findIndex(a => a.email.toLowerCase() === email.toLowerCase());
    
    if (userAttemptIndex >= 0) {
      attempts[userAttemptIndex].attempts += 1;
      attempts[userAttemptIndex].lastAttempt = new Date().toISOString();
      
      if (attempts[userAttemptIndex].attempts >= this.MAX_LOGIN_ATTEMPTS) {
        attempts[userAttemptIndex].lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION).toISOString();
      }
    } else {
      attempts.push({
        email: email.toLowerCase(),
        attempts: 1,
        lastAttempt: new Date().toISOString()
      });
    }
    
    this.saveLoginAttempts(attempts);
  }

  /**
   * Clear failed login attempts
   */
  private async clearFailedAttempts(email: string): Promise<void> {
    const attempts = this.getLoginAttempts();
    const filteredAttempts = attempts.filter(a => a.email.toLowerCase() !== email.toLowerCase());
    this.saveLoginAttempts(filteredAttempts);
  }

  /**
   * Get login attempts from storage
   */
  private getLoginAttempts(): LoginAttemptRecord[] {
    try {
      const data = localStorage.getItem(this.LOGIN_ATTEMPTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading login attempts:', error);
      return [];
    }
  }

  /**
   * Save login attempts to storage
   */
  private saveLoginAttempts(attempts: LoginAttemptRecord[]): void {
    localStorage.setItem(this.LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
  }

  /**
   * Load session from storage
   */
  private loadSession(): void {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        
        // Check if session is still valid
        const now = new Date();
        const expiresAt = new Date(session.expiresAt);
        
        if (now < expiresAt) {
          this.currentSession = session;
          console.log(`🔐 Session restored for: ${session.user.email}`);
        } else {
          localStorage.removeItem(this.SESSION_KEY);
          console.log('🔐 Session expired, removed from storage');
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
      localStorage.removeItem(this.SESSION_KEY);
    }
  }

  /**
   * Save session to storage
   */
  private saveSession(session: AuthSession): void {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
  }

  /**
   * Notify session listeners
   */
  private notifySessionListeners(): void {
    this.sessionListeners.forEach(listener => listener(this.currentSession));
  }

  /**
   * Get companies from storage
   */
  private getCompanies(): Company[] {
    try {
      const data = localStorage.getItem(this.COMPANIES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading companies:', error);
      return [];
    }
  }

  /**
   * Save companies to storage
   */
  private saveCompanies(companies: Company[]): void {
    localStorage.setItem(this.COMPANIES_KEY, JSON.stringify(companies));
  }

  /**
   * Get users from storage
   */
  private getUsers(): User[] {
    try {
      const data = localStorage.getItem(this.USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  }

  /**
   * Save users to storage
   */
  private saveUsers(users: User[]): void {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  }
}

export const authService = new AuthenticationService();