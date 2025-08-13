import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';
import { AuthWrapper } from './components/AuthComponents';

const TestApp10: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthWrapper>
        <div className="p-8">
          <h1 className="text-4xl font-bold text-blue-600">TruckBo Real AuthWrapper Test</h1>
          <p className="mt-4 text-lg">If you see this, AuthWrapper is working!</p>
        </div>
      </AuthWrapper>
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp10;