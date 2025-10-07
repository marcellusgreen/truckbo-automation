import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';

// Simple mock of AppContent's main structure
const SimpleAppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = React.useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'fleet', label: 'Fleet Management', icon: '🚛' },
  ];

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Sidebar */}
      <div className="w-72 bg-gradient-to-b from-slate-800 to-slate-900 text-white shadow-2xl">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center text-xl font-bold">
              🚛
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">TruckBo Pro</h1>
              <p className="text-slate-300 text-sm">Fleet Management</p>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            {currentPage === 'dashboard' ? 'Dashboard' : 'Fleet Management'}
          </h1>
          <p className="text-lg text-gray-600">
            ✅ AppContent structure is working! Current page: {currentPage}
          </p>
        </div>
      </div>
    </div>
  );
};

const TestApp11: React.FC = () => {
  return (
    <ErrorBoundary>
      <SimpleAppContent />
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp11;