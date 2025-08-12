// Authentication Service (Frontend)
// Handles user authentication, company isolation, and session management
// All authentication logic moved to server-side API endpoints

import { errorHandler } from './errorHandler';

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
  private currentSession: AuthSession | null = null;
  private sessionListeners: ((session: AuthSession | null) => void)[] = [];

  constructor() {
    this.loadSession();
  }

  /**
   * Initialize authentication system with demo data (via API)
   */
  async initializeDemo(): Promise<void> {
    try {
      const response = await fetch('/api/auth/initialize-demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Demo initialization failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('🏗️ Demo authentication data initialized via API');
      console.log('🔐 Demo password for all accounts: TruckBo2025!');
      
    } catch (error) {
      console.error('Failed to initialize demo data:', error);
      errorHandler.handleUserError(
        'Failed to initialize demo data',
        'Please check your server connection and try again'
      );
    }
  }

  /**
   * Login user with email and password (via API)
   */
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          companyCode: credentials.companyCode
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Create session from API response
      const session: AuthSession = {
        user: data.user,
        company: data.company,
        token: data.token,
        expiresAt: data.expiresAt,
        refreshToken: data.refreshToken
      };

      this.currentSession = session;
      this.saveSession(session);
      this.notifySessionListeners();

      errorHandler.showSuccess(`Welcome back, ${data.user.firstName}!`);
      console.log(`🔐 User logged in: ${data.user.email} (${data.company.name})`);

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
   * Register new company and admin user (via API)
   */
  async registerCompany(data: RegisterCompanyData): Promise<AuthSession> {
    try {
      // Validate password strength client-side first
      const passwordValidation = this.validatePasswordStrength(data.adminUser.password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || 'Registration failed');
      }

      // Create session from API response
      const session: AuthSession = {
        user: responseData.user,
        company: responseData.company,
        token: responseData.token,
        expiresAt: responseData.expiresAt,
        refreshToken: responseData.refreshToken
      };

      this.currentSession = session;
      this.saveSession(session);
      this.notifySessionListeners();

      errorHandler.showSuccess(`Welcome to TruckBo Pro, ${responseData.user.firstName}! Your company has been registered.`);
      console.log(`🏢 New company registered: ${responseData.company.name}`);

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

}

export const authService = new AuthenticationService();