import React from 'react';

const TestApp: React.FC = () => {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600">TruckBo Test App</h1>
      <p className="mt-4 text-lg">If you can see this, the basic React app is working!</p>
      <p className="mt-2 text-sm text-gray-600">Database services are temporarily disabled for testing.</p>
    </div>
  );
};

export default TestApp;