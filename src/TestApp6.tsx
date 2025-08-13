import React, { useState, useEffect } from 'react';
import { authService } from './services/authService';

const TestApp6: React.FC = () => {
  const [status, setStatus] = useState('Loading...');

  useEffect(() => {
    const testAuth = async () => {
      try {
        console.log('Testing authService.initializeDemo()...');
        await authService.initializeDemo();
        setStatus('✅ Auth service initialized successfully!');
      } catch (error) {
        console.error('Auth service error:', error);
        setStatus(`❌ Auth service failed: ${error.message}`);
      }
    };

    testAuth();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600">TruckBo Auth Test</h1>
      <p className="mt-4 text-lg">{status}</p>
    </div>
  );
};

export default TestApp6;