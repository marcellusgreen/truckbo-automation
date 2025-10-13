// Authentication Service (Frontend)
// Handles user authentication, company isolation, and session management
// All authentication logic moved to server-side API endpoints

import { ErrorHandlerService } from './errorHandlingService';
import { createApiUrl, API_CONFIG } from '../utils/apiConfig';

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

class AuthenticationService {
  private readonly errorHandler = new ErrorHandlerService();
  private readonly SESSION_KEY = 'truckbo_session';
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
      const response = await fetch(createApiUrl(API_CONFIG.endpoints.auth.initializeDemo), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Demo initialization failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[auth] Demo authentication data initialized via API', { result });
      console.log('[auth] Demo password for all accounts: TruckBo2025!');
    } catch (error) {
      console.error('Failed to initialize demo data:', error);
      const context = {
        layer: 'frontend' as const,
        component: 'AuthenticationService',
        operation: 'initializeDemo'
      };
      const appError = this.errorHandler.createError(
        'Failed to initialize demo data',
        'auth',
        'medium',
        {
          originalError: error as Error,
          userMessage: 'Unable to prepare demo accounts. Please check the server connection and try again.',
          context
        }
      );
      void this.errorHandler.handleError(appError, context);
    }
  }

  /**
   * Login user with email and password (via API)
   */
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    try {
      const response = await fetch(createApiUrl(API_CONFIG.endpoints.auth.login), {
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

      const apiPayload = await response.json();
      console.log('[auth] Login API response', apiPayload);

      if (!response.ok) {
        throw new Error(apiPayload?.message ?? 'Login failed');
      }

      const data = apiPayload.data;
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

      this.errorHandler.showSuccess(`Welcome back, ${data.user?.firstName ?? 'User'}!`);
      console.log('[auth] User logged in', {
        email: data.user?.email ?? 'unknown',
        company: data.company?.name ?? 'unknown'
      });

      return session;
    } catch (error) {
      console.error('Login failed:', error);
      const context = {
        layer: 'frontend' as const,
        component: 'AuthenticationService',
        operation: 'login'
      };
      const authError = this.errorHandler.createError(
        error instanceof Error ? error.message : 'Login failed',
        'auth',
        'medium',
        {
          originalError: error as Error,
          userMessage: 'Please check your credentials and try again.',
          context
        }
      );
      void this.errorHandler.handleError(authError, context);
      throw error;
    }
  }

  /**
   * Register new company and admin user (via API)
   */
  async registerCompany(data: RegisterCompanyData): Promise<AuthSession> {
    try {
      const passwordValidation = this.validatePasswordStrength(data.adminUser.password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.message);
      }

      const response = await fetch(createApiUrl(API_CONFIG.endpoints.auth.register), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const apiPayload = await response.json();

      if (!response.ok) {
        throw new Error(apiPayload?.message ?? 'Registration failed');
      }

      const payload = apiPayload.data;
      const session: AuthSession = {
        user: payload.user,
        company: payload.company,
        token: payload.token,
        expiresAt: payload.expiresAt,
        refreshToken: payload.refreshToken
      };

      this.currentSession = session;
      this.saveSession(session);
      this.notifySessionListeners();

      this.errorHandler.showSuccess(
        `Welcome to TruckBo Pro, ${payload.user?.firstName ?? 'User'}! Your company has been registered.`
      );
      console.log('[auth] Company registered', {
        company: payload.company?.name ?? 'unknown',
        email: payload.user?.email ?? 'unknown'
      });

      return session;
    } catch (error) {
      console.error('Company registration failed:', error);
      const context = {
        layer: 'frontend' as const,
        component: 'AuthenticationService',
        operation: 'registerCompany'
      };
      const authError = this.errorHandler.createError(
        error instanceof Error ? error.message : 'Registration failed',
        'auth',
        'medium',
        {
          originalError: error as Error,
          userMessage: 'Please check your information and try again.',
          context
        }
      );
      void this.errorHandler.handleError(authError, context);
      throw error;
    }
  }

  /**
   * Logout current user
   */
  logout(): void {
    if (this.currentSession) {
      console.log('[auth] User logged out', {
        email: this.currentSession.user?.email ?? 'unknown'
      });
      this.errorHandler.showInfo(`Goodbye, ${this.currentSession.user?.firstName ?? 'User'}!`);
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
    return this.currentSession?.user ?? null;
  }

  /**
   * Get current company
   */
  getCurrentCompany(): Company | null {
    return this.currentSession?.company ?? null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    if (!this.currentSession) {
      return false;
    }

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
    if (!this.currentSession) {
      return false;
    }

    const user = this.currentSession.user;
    return user.permissions.some(permission => permission.resource === resource && permission.actions.includes(action));
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
      this.sessionListeners = this.sessionListeners.filter(existing => existing !== listener);
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
        const session = JSON.parse(sessionData) as AuthSession;

        const now = new Date();
        const expiresAt = new Date(session.expiresAt);

        if (now < expiresAt) {
          this.currentSession = session;
          console.log(`[auth] Session restored for: ${session.user?.email ?? 'unknown'}`);
        } else {
          localStorage.removeItem(this.SESSION_KEY);
          console.log('[auth] Session expired, removed from storage');
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
