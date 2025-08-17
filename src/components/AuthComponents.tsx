// Authentication Components
// Login, registration, and company setup forms

import { useState, useEffect } from 'react';
import { authService, LoginCredentials, RegisterCompanyData } from '../services/authService';
import { ValidatedInput, FormSection, useFormValidation } from './FormValidation';
import { LoadingSpinner } from './NotificationSystem';

interface LoginFormProps {
  onLoginSuccess: () => void;
  onSwitchToRegister: () => void;
}

export function LoginForm({ onLoginSuccess, onSwitchToRegister }: LoginFormProps) {
  const [loading, setLoading] = useState(false);
  
  const {
    data,
    updateField,
    validateAll,
    isValid
  } = useFormValidation(
    { email: '', password: '' },
    (data) => {
      const emailValidation = { isValid: !!data.email, errors: [], warnings: [] };
      const passwordValidation = { 
        isValid: data.password.length >= 1, 
        errors: data.password.length < 1 ? [{ field: 'password', message: 'Password is required', value: data.password, severity: 'error' as const }] : [],
        warnings: []
      };
      
      return {
        isValid: emailValidation.isValid && passwordValidation.isValid,
        errors: [...emailValidation.errors, ...passwordValidation.errors],
        warnings: [...emailValidation.warnings, ...passwordValidation.warnings]
      };
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationResult = validateAll();
    if (!validationResult.isValid) return;
    
    setLoading(true);
    try {
      await authService.login(data as LoginCredentials);
      onLoginSuccess();
    } catch {
      // Error is handled by authService
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-2xl font-bold text-white mb-4">
            T
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Welcome to TruckBo Pro</h2>
          <p className="mt-2 text-sm text-gray-600">Fleet Compliance Management System</p>
        </div>

        {/* Demo Accounts Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Demo Accounts Available:</h3>
          <div className="text-xs text-blue-700 space-y-1">
            <div><strong>Sunbelt Trucking:</strong> admin@sunbelttrucking.com</div>
            <div><strong>Lone Star Logistics:</strong> admin@lonestarlogistics.com</div>
            <div><strong>Password:</strong> TruckBo2025!</div>
            <div className="text-xs text-amber-600 mt-1">⚠️ Demo only - Use strong passwords in production</div>
          </div>
        </div>

        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <ValidatedInput
              label="Email Address"
              type="email"
              value={data.email}
              onChange={(value) => updateField('email', value)}
              validator={(email) => ({ isValid: !!email, errors: [], warnings: [] })}
              placeholder="admin@yourcompany.com"
              required
            />

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={data.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !isValid}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <LoadingSpinner size="sm" message="" />
              ) : (
                <>
                  <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                    🔐
                  </span>
                  Sign In
                </>
              )}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              New company? Register here
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CompanyRegistrationFormProps {
  onRegistrationSuccess: () => void;
  onSwitchToLogin: () => void;
}

// Password strength validation function
const validatePasswordStrength = (password: string): { isValid: boolean; message: string } => {
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
    return { isValid: false, message: 'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)' };
  }
  return { isValid: true, message: 'Password is strong' };
};

export function CompanyRegistrationForm({ onRegistrationSuccess, onSwitchToLogin }: CompanyRegistrationFormProps) {
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  const {
    data,
    validation,
    updateField,
    validateAll
  } = useFormValidation(
    {
      // Company info
      companyName: '',
      contactEmail: '',
      contactPhone: '',
      dotNumber: '',
      mcNumber: '',
      // Address
      street: '',
      city: '',
      state: '',
      zipCode: '',
      // Admin user
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      // Subscription
      plan: 'professional'
    },
    (data) => {
      const errors: Array<{field: string; message: string; value: unknown; severity: 'error'}> = [];
      const warnings: Array<{field: string; message: string; value: unknown; severity: 'warning'}> = [];

      // Company name validation
      if (!data.companyName) {
        errors.push({ field: 'companyName', message: 'Company name is required', value: data.companyName, severity: 'error' });
      }

      // Basic email validation
      if (data.contactEmail && !data.contactEmail.includes('@')) {
        errors.push({ field: 'contactEmail', message: 'Invalid email format', value: data.contactEmail, severity: 'error' });
      }

      if (data.email && !data.email.includes('@')) {
        errors.push({ field: 'email', message: 'Invalid email format', value: data.email, severity: 'error' });
      }

      // Password validation - Strong password requirements
      if (data.password) {
        const passwordValidation = validatePasswordStrength(data.password);
        if (!passwordValidation.isValid) {
          errors.push({ field: 'password', message: passwordValidation.message, value: data.password, severity: 'error' });
        }
      }

      if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
        errors.push({ field: 'confirmPassword', message: 'Passwords do not match', value: data.confirmPassword, severity: 'error' });
      }

      // Required fields per step
      if (currentStep >= 1) {
        if (!data.companyName) errors.push({ field: 'companyName', message: 'Required', value: data.companyName, severity: 'error' });
        if (!data.contactEmail) errors.push({ field: 'contactEmail', message: 'Required', value: data.contactEmail, severity: 'error' });
        if (!data.contactPhone) errors.push({ field: 'contactPhone', message: 'Required', value: data.contactPhone, severity: 'error' });
      }

      if (currentStep >= 2) {
        if (!data.street) errors.push({ field: 'street', message: 'Required', value: data.street, severity: 'error' });
        if (!data.city) errors.push({ field: 'city', message: 'Required', value: data.city, severity: 'error' });
        if (!data.state) errors.push({ field: 'state', message: 'Required', value: data.state, severity: 'error' });
        if (!data.zipCode) errors.push({ field: 'zipCode', message: 'Required', value: data.zipCode, severity: 'error' });
      }

      if (currentStep >= 3) {
        if (!data.firstName) errors.push({ field: 'firstName', message: 'Required', value: data.firstName, severity: 'error' });
        if (!data.lastName) errors.push({ field: 'lastName', message: 'Required', value: data.lastName, severity: 'error' });
        if (!data.email) errors.push({ field: 'email', message: 'Required', value: data.email, severity: 'error' });
        if (!data.password) errors.push({ field: 'password', message: 'Required', value: data.password, severity: 'error' });
      }

      return { isValid: errors.length === 0, errors, warnings };
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      return;
    }

    const validationResult = validateAll();
    if (!validationResult.isValid) return;

    setLoading(true);
    try {
      const registrationData: RegisterCompanyData = {
        companyName: data.companyName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        dotNumber: data.dotNumber || undefined,
        mcNumber: data.mcNumber || undefined,
        address: {
          street: data.street,
          city: data.city,
          state: data.state,
          zipCode: data.zipCode
        },
        adminUser: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          password: data.password
        },
        subscription: {
          plan: data.plan as 'basic' | 'professional' | 'enterprise'
        }
      };

      await authService.registerCompany(registrationData);
      onRegistrationSuccess();
    } catch {
      // Error is handled by authService
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    const stepErrors = validation.errors.filter(error => {
      if (currentStep === 1) {
        return ['companyName', 'contactEmail', 'contactPhone'].includes(error.field);
      }
      if (currentStep === 2) {
        return ['street', 'city', 'state', 'zipCode'].includes(error.field);
      }
      if (currentStep === 3) {
        return ['firstName', 'lastName', 'email', 'password', 'confirmPassword'].includes(error.field);
      }
      return false;
    });
    return stepErrors.length === 0;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-2xl font-bold text-white mb-4">
            T
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Register Your Fleet</h2>
          <p className="mt-2 text-sm text-gray-600">Get started with TruckBo Pro compliance management</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step <= currentStep 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {step}
              </div>
              {step < 3 && (
                <div className={`w-12 h-1 ${
                  step < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {currentStep === 1 && (
            <FormSection title="Company Information">
              <div className="grid grid-cols-1 gap-4">
                <ValidatedInput
                  label="Company Name"
                  value={data.companyName}
                  onChange={(value) => updateField('companyName', value)}
                  placeholder="Sunbelt Trucking LLC"
                  required
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ValidatedInput
                    label="Contact Email"
                    type="email"
                    value={data.contactEmail}
                    onChange={(value) => updateField('contactEmail', value)}
                    placeholder="admin@yourcompany.com"
                    required
                  />
                  
                  <ValidatedInput
                    label="Contact Phone"
                    type="tel"
                    value={data.contactPhone}
                    onChange={(value) => updateField('contactPhone', value)}
                    placeholder="214-555-0123"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ValidatedInput
                    label="DOT Number (Optional)"
                    value={data.dotNumber}
                    onChange={(value) => updateField('dotNumber', value)}
                    placeholder="12345678"
                    helpText="Federal DOT registration number"
                  />
                  
                  <ValidatedInput
                    label="MC Number (Optional)"
                    value={data.mcNumber}
                    onChange={(value) => updateField('mcNumber', value)}
                    placeholder="MC-123456"
                    helpText="Motor Carrier authority number"
                  />
                </div>
              </div>
            </FormSection>
          )}

          {currentStep === 2 && (
            <FormSection title="Company Address">
              <div className="grid grid-cols-1 gap-4">
                <ValidatedInput
                  label="Street Address"
                  value={data.street}
                  onChange={(value) => updateField('street', value)}
                  placeholder="123 Industrial Blvd"
                  required
                />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ValidatedInput
                    label="City"
                    value={data.city}
                    onChange={(value) => updateField('city', value)}
                    placeholder="Dallas"
                    required
                  />
                  
                  <ValidatedInput
                    label="State"
                    value={data.state}
                    onChange={(value) => updateField('state', value)}
                    placeholder="TX"
                    required
                    helpText="2-letter state code"
                  />
                  
                  <ValidatedInput
                    label="ZIP Code"
                    value={data.zipCode}
                    onChange={(value) => updateField('zipCode', value)}
                    placeholder="75201"
                    required
                  />
                </div>
              </div>
            </FormSection>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <FormSection title="Admin User Account">
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ValidatedInput
                      label="First Name"
                      value={data.firstName}
                      onChange={(value) => updateField('firstName', value)}
                      placeholder="Sarah"
                      required
                    />
                    
                    <ValidatedInput
                      label="Last Name"
                      value={data.lastName}
                      onChange={(value) => updateField('lastName', value)}
                      placeholder="Johnson"
                      required
                    />
                  </div>

                  <ValidatedInput
                    label="Admin Email"
                    type="email"
                    value={data.email}
                    onChange={(value) => updateField('email', value)}
                    placeholder="sarah@yourcompany.com"
                    required
                    helpText="This will be your login email"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-gray-700">Password</label>
                      <input
                        type="password"
                        value={data.password}
                        onChange={(e) => updateField('password', e.target.value)}
                        placeholder="Min 12 chars, uppercase, lowercase, number, special char"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                      <input
                        type="password"
                        value={data.confirmPassword}
                        onChange={(e) => updateField('confirmPassword', e.target.value)}
                        placeholder="Confirm your password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Subscription Plan">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { id: 'basic', name: 'Basic', price: '$49/month', vehicles: '10 vehicles', drivers: '20 drivers' },
                    { id: 'professional', name: 'Professional', price: '$99/month', vehicles: '50 vehicles', drivers: '100 drivers' },
                    { id: 'enterprise', name: 'Enterprise', price: '$199/month', vehicles: '500 vehicles', drivers: '1000 drivers' }
                  ].map((plan) => (
                    <div
                      key={plan.id}
                      className={`p-4 border rounded-lg cursor-pointer ${
                        data.plan === plan.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => updateField('plan', plan.id)}
                    >
                      <div className="text-center">
                        <h3 className="font-medium">{plan.name}</h3>
                        <p className="text-2xl font-bold text-blue-600 my-2">{plan.price}</p>
                        <p className="text-sm text-gray-600">{plan.vehicles}</p>
                        <p className="text-sm text-gray-600">{plan.drivers}</p>
                        <p className="text-xs text-green-600 mt-2">30-day free trial</p>
                      </div>
                    </div>
                  ))}
                </div>
              </FormSection>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-between">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  ← Back
                </button>
              )}
            </div>

            <div className="flex space-x-4">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="px-4 py-2 text-blue-600 hover:text-blue-500"
              >
                Already have an account?
              </button>
              
              <button
                type="submit"
                disabled={loading || !canProceed()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <LoadingSpinner size="sm" message="" />
                ) : currentStep < totalSteps ? (
                  'Next →'
                ) : (
                  'Create Company'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Initialize demo data on first load
        await authService.initializeDemo();
        
        // Check if user is already authenticated
        setIsAuthenticated(authService.isAuthenticated());
      } catch (error) {
        console.error('Failed to initialize authentication:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth changes
    const unsubscribe = authService.subscribeToSession((authSession) => {
      setIsAuthenticated(!!authSession);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading TruckBo Pro..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (showRegistration) {
      return (
        <CompanyRegistrationForm
          onRegistrationSuccess={() => setIsAuthenticated(true)}
          onSwitchToLogin={() => setShowRegistration(false)}
        />
      );
    } else {
      return (
        <LoginForm
          onLoginSuccess={() => setIsAuthenticated(true)}
          onSwitchToRegister={() => setShowRegistration(true)}
        />
      );
    }
  }

  return <>{children}</>;
}