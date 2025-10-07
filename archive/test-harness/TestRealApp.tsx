import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';
import { AuthWrapper } from './components/AuthComponents';

// Test the exact App structure from App.tsx
function TestAppContent() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-600">TruckBo Test App</h1>
      <p className="mt-4 text-lg">✅ Real App structure is working!</p>
      <p className="text-sm text-gray-600 mt-2">This is the exact App.tsx structure but without the complex content.</p>
    </div>
  );
}

function TestRealApp() {
  return (
    <ErrorBoundary>
      <AuthWrapper>
        <TestAppContent />
      </AuthWrapper>
      <NotificationSystem />
    </ErrorBoundary>
  );
}

export default TestRealApp;