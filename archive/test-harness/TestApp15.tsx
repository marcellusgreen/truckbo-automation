import React, { useState, useEffect } from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';
import { persistentFleetStorage } from './services/persistentFleetStorage';
import { fleetDataManager } from './services/fleetDataManager';

// Test the EXACT DashboardPage JSX
const TestRealDashboardPage: React.FC = () => {
  const [fleetStats, setFleetStats] = useState(() => {
    const persistentVehicles = persistentFleetStorage.getFleet();
    const legacyStats = fleetDataManager.getFleetStats();
    return {
      total: persistentVehicles.length + legacyStats.total,
      active: persistentVehicles.filter(v => v.status === 'active').length + legacyStats.active,
      inactive: persistentVehicles.filter(v => v.status === 'inactive').length + legacyStats.inactive,
      complianceExpired: legacyStats.complianceExpired
    };
  });
  const [complianceStats, setComplianceStats] = useState(fleetDataManager.getComplianceStats());

  const setCurrentPage = (page: string) => {
    console.log('Navigate to:', page);
  };

  const updateStats = () => {
    const persistentVehicles = persistentFleetStorage.getFleet();
    const legacyStats = fleetDataManager.getFleetStats();
    setFleetStats({
      total: persistentVehicles.length + legacyStats.total,
      active: persistentVehicles.filter(v => v.status === 'active').length + legacyStats.active,
      inactive: persistentVehicles.filter(v => v.status === 'inactive').length + legacyStats.inactive,
      complianceExpired: legacyStats.complianceExpired
    });
    setComplianceStats(fleetDataManager.getComplianceStats());
  };

  useEffect(() => {
    const unsubscribe = fleetDataManager.subscribe(updateStats);
    updateStats();
    return unsubscribe;
  }, []);

  return (
    <div className="space-y-8 p-8">
      {/* Simplified Welcome Section */}
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
        
        {/* Simplified Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{fleetStats.total}</div>
            <div className="text-sm text-gray-600">Total Vehicles</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">{fleetStats.active}</div>
            <div className="text-sm text-gray-600">Active</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-amber-700">{complianceStats.pending}</div>
            <div className="text-sm text-gray-600">Alerts</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-emerald-700">--</div>
            <div className="text-sm text-gray-600">Compliance</div>
          </div>
        </div>
      </div>

      {/* Test Result */}
      <div className="bg-green-100 p-4 rounded">
        <p className="text-green-800">✅ Real DashboardPage JSX is working!</p>
      </div>
    </div>
  );
};

const TestApp15: React.FC = () => {
  return (
    <ErrorBoundary>
      <TestRealDashboardPage />
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp15;