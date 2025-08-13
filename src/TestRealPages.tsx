import React, { useState } from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';
import { AuthWrapper } from './components/AuthComponents';
import { fleetDataManager } from './services/fleetDataManager';

// Import the types we need
import { DashboardPageProps } from './types';

// Create a simple test DashboardPage component
const TestDashboardPage: React.FC<DashboardPageProps> = ({ setCurrentPage }) => {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Test Dashboard Page</h2>
      <p className="text-green-600">✅ DashboardPage component is rendering!</p>
      <button 
        onClick={() => setCurrentPage('fleet')}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Go to Fleet
      </button>
    </div>
  );
};

// Test the exact page rendering logic from App.tsx
function TestRealAppContent() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'fleet', label: 'Fleet Management', icon: '🚛' },
  ];

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Simplified Sidebar */}
      <div className="w-72 bg-gradient-to-b from-slate-800 to-slate-900 text-white shadow-2xl">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white">TruckBo Pro</h1>
        </div>
        
        <nav className="px-4 pb-6">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 mb-2 ${
                currentPage === item.id
                  ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-lg px-8 py-4 shadow-sm">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-800">
              {navItems.find(item => item.id === currentPage)?.label || 'Dashboard'}
            </h2>
            
            <div className="text-sm">
              <span className="text-green-600 font-bold">{fleetDataManager.getFleetStats().active}</span> Active
            </div>
          </div>
        </header>

        {/* Content Area - THE EXACT PAGE RENDERING LOGIC FROM APP.TSX */}
        <div className="flex-1 p-8">
          {/* Test the exact conditional rendering that might be causing the crash */}
          {currentPage === 'dashboard' && <TestDashboardPage setCurrentPage={setCurrentPage} />}
          {currentPage === 'fleet' && (
            <div className="p-8">
              <h2 className="text-2xl font-bold mb-4">Test Fleet Page</h2>
              <p className="text-green-600">✅ Fleet page rendering!</p>
              <button 
                onClick={() => setCurrentPage('dashboard')}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TestApp() {
  return (
    <ErrorBoundary>
      <AuthWrapper>
        <TestRealAppContent />
      </AuthWrapper>
      <NotificationSystem />
    </ErrorBoundary>
  );
}

export default TestApp;