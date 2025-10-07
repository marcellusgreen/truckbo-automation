import React, { useState } from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';
import { AuthWrapper } from './components/AuthComponents';
import { fleetDataManager } from './services/fleetDataManager';

// Test the exact AppContent with the real navigation and header logic
function TestRealAppContent() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'onboarding', label: 'Fleet Onboarding', icon: '📁' },
    { id: 'fleet', label: 'Fleet Management', icon: '🚛' },
    { id: 'drivers', label: 'Driver Management', icon: '👨‍💼' },
    { id: 'compliance', label: 'Compliance', icon: '📋' },
    { id: 'comprehensive-compliance', label: 'Real-time Compliance', icon: '🛡️' },
    { id: 'reports', label: 'Reports', icon: '📈' }
  ];

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Modern Sidebar */}
      <div className="w-72 bg-gradient-to-b from-slate-800 to-slate-900 text-white shadow-2xl">
        {/* Header */}
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Header Bar - THIS IS THE EXACT HEADER FROM REAL APP */}
        <header className="bg-white/80 backdrop-blur-lg px-8 py-4 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">
                {navItems.find(item => item.id === currentPage)?.label || 'Dashboard'}
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                {currentPage === 'dashboard' && 'Fleet overview and key metrics'}
                {currentPage === 'onboarding' && 'Add new vehicles to your fleet'}
                {currentPage === 'fleet' && 'Manage your fleet vehicles'}
                {currentPage === 'drivers' && 'Track medical certificates and CDL renewals'}
                {currentPage === 'compliance' && 'Track compliance tasks and deadlines'}
                {currentPage === 'comprehensive-compliance' && 'Real-time compliance monitoring'}
                {currentPage === 'reports' && 'Generate compliance reports and analytics'}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Quick Stats - THE EXACT STATS FROM REAL APP */}
              <div className="hidden md:flex items-center space-x-6 text-sm">
                <div className="text-center">
                  <div className="text-green-600 font-bold text-lg">{fleetDataManager.getFleetStats().active}</div>
                  <div className="text-slate-500">Active</div>
                </div>
                <div className="text-center">
                  <div className="text-yellow-600 font-bold text-lg">{fleetDataManager.getComplianceStats().pending}</div>
                  <div className="text-slate-500">Pending</div>
                </div>
                <div className="text-center">
                  <div className="text-red-600 font-bold text-lg">{fleetDataManager.getComplianceStats().overdue}</div>
                  <div className="text-slate-500">Overdue</div>
                </div>
              </div>
              
              {/* Action Button */}
              <button className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-2 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium">
                {currentPage === 'onboarding' ? '+ Add Vehicles' : 
                 currentPage === 'fleet' ? '+ New Vehicle' :
                 currentPage === 'compliance' ? '+ New Task' :
                 '+ Quick Action'}
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-8">
          <div className="bg-white rounded-lg p-6 shadow">
            <h3 className="text-xl font-semibold mb-4">Current Page: {currentPage}</h3>
            <p className="text-green-600">✅ Real AppContent with header stats is working!</p>
            <p className="text-sm text-gray-500 mt-2">This is the exact AppContent structure from App.tsx</p>
          </div>
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