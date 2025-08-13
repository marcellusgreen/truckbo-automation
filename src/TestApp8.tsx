import React, { useState, useEffect } from 'react';
import { authService } from './services/authService';

// Simple AuthWrapper test
const SimpleAuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('Initializing auth...');
        await authService.initializeDemo();
        console.log('Demo initialized');
        
        const authStatus = authService.isAuthenticated();
        console.log('Auth status:', authStatus);
        setIsAuthenticated(authStatus);
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  if (loading) {
    return <div className="p-8">Loading authentication...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-4">Login Required</h2>
        <p>Not authenticated. In real app, would show login form.</p>
        <button 
          onClick={() => setIsAuthenticated(true)}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
        >
          Skip Auth (Test Mode)
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

const TestApp8: React.FC = () => {
  return (
    <SimpleAuthWrapper>
      <div className="p-8">
        <h1 className="text-4xl font-bold text-blue-600">TruckBo Auth Wrapper Test</h1>
        <p className="mt-4 text-lg">✅ Auth wrapper is working!</p>
        <p className="mt-2 text-sm text-gray-600">You should see this if auth flow completes.</p>
      </div>
    </SimpleAuthWrapper>
  );
};

export default TestApp8;