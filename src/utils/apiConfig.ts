// API Configuration utility
// Handles different base URLs for development vs production

const getApiBaseUrl = (): string => {
  // In development, use relative paths (Vite dev server)
  if (import.meta.env.DEV) {
    return '';
  }
  
  // In production, use the current domain
  return window.location.origin;
};

export const API_CONFIG = {
  baseUrl: getApiBaseUrl(),
  endpoints: {
    auth: {
      login: '/api/auth/login',
      register: '/api/auth/register',
      initializeDemo: '/api/auth/initialize-demo'
    },
    vehicles: '/api/fleet',
    drivers: '/api/drivers',
    documents: '/api/documents'
  }
};

export const createApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.baseUrl}${endpoint}`;
};