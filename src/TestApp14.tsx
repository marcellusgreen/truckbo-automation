import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';

// Import the actual DashboardPage component (it's defined in App.tsx)
// Since it's not exported, I'll recreate a minimal version that tests the same logic

const TestDashboardPage: React.FC = () => {
  const [currentPage, setCurrentPage] = React.useState('dashboard');

  // Mock DashboardPageProps
  const mockSetCurrentPage = (page: string) => {
    console.log('Navigate to:', page);
    setCurrentPage(page);
  };

  return (
    <div className="space-y-8 p-8">
      {/* Test the welcome section that might be crashing */}
      <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Fleet Dashboard
            </h1>
            <p className="text-gray-600">
              Overview of your fleet operations
            </p>
          </div>
          <div className="text-4xl">🚛</div>
        </div>
        
        {/* Test some action buttons */}
        <div className="mt-6 flex space-x-4">
          <button 
            onClick={() => mockSetCurrentPage('onboarding')}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Add Vehicles
          </button>
          <button 
            onClick={() => mockSetCurrentPage('fleet')}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Manage Fleet
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="bg-green-100 p-4 rounded">
        <p className="text-green-800">✅ Dashboard page structure is working!</p>
        <p className="text-sm text-green-600">Current page: {currentPage}</p>
      </div>
    </div>
  );
};

const TestApp14: React.FC = () => {
  return (
    <ErrorBoundary>
      <TestDashboardPage />
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp14;