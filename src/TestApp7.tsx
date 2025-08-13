import React, { useState, useEffect } from 'react';
import { authService } from './services/authService';

const TestApp7: React.FC = () => {
  const [status, setStatus] = useState('Loading...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const testAuth = async () => {
      try {
        console.log('Step 1: Testing basic authService access...');
        console.log('AuthService:', authService);
        
        console.log('Step 2: Testing isAuthenticated...');
        const isAuth = authService.isAuthenticated();
        console.log('Is authenticated:', isAuth);
        
        console.log('Step 3: Calling initializeDemo...');
        await authService.initializeDemo();
        
        console.log('Step 4: Success!');
        setStatus('✅ Auth service initialized successfully!');
      } catch (error: any) {
        console.error('Detailed error:', error);
        console.error('Error stack:', error.stack);
        setError(error.message || 'Unknown error');
        setStatus(`❌ Auth service failed at step`);
      }
    };

    testAuth();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600">TruckBo Detailed Auth Test</h1>
      <p className="mt-4 text-lg">{status}</p>
      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-800 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
};

export default TestApp7;