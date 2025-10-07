import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';

const TestApp9: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="p-8">
        <h1 className="text-4xl font-bold text-blue-600">TruckBo ErrorBoundary Test</h1>
        <p className="mt-4 text-lg">Testing ErrorBoundary + NotificationSystem...</p>
      </div>
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp9;