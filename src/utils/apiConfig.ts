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
      login: '/api/v1/auth/login',
      register: '/api/v1/auth/register',
      initializeDemo: '/api/v1/auth/initialize-demo'
    },
    vehicles: '/api/v1/vehicles',
    drivers: '/api/v1/drivers',
    documents: '/api/v1/documents'
  }
};

export const createApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.baseUrl}${endpoint}`;
};