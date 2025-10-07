import React, { useState, useEffect } from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';
import { persistentFleetStorage } from './services/persistentFleetStorage';
import { fleetDataManager } from './services/fleetDataManager';

// Test the exact DashboardPage initialization logic
const TestDashboardInit: React.FC = () => {
  const [error, setError] = React.useState<string | null>(null);
  const [fleetStats, setFleetStats] = useState<any>(null);

  React.useEffect(() => {
    try {
      console.log('Step 1: Getting persistent vehicles...');
      const persistentVehicles = persistentFleetStorage.getFleet();
      console.log('Persistent vehicles:', persistentVehicles);
      
      console.log('Step 2: Getting legacy stats...');
      const legacyStats = fleetDataManager.getFleetStats();
      console.log('Legacy stats:', legacyStats);
      
      console.log('Step 3: Calculating combined stats...');
      const stats = {
        total: persistentVehicles.length + legacyStats.total,
        active: persistentVehicles.filter(v => v.status === 'active').length + legacyStats.active,
        inactive: persistentVehicles.filter(v => v.status === 'inactive').length + legacyStats.inactive,
        complianceExpired: legacyStats.complianceExpired
      };
      
      console.log('Step 4: Combined stats:', stats);
      setFleetStats(stats);
      
    } catch (err: any) {
      console.error('Dashboard init error:', err);
      setError(err.message);
    }
  }, []);

  if (error) {
    return (
      <div className="p-8 bg-red-100 text-red-800">
        <h2 className="text-xl font-bold">Dashboard Init Error:</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Dashboard Init Test</h1>
      {fleetStats ? (
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4">Fleet Statistics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-blue-600">{fleetStats.total}</div>
              <div className="text-gray-600">Total Vehicles</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{fleetStats.active}</div>
              <div className="text-gray-600">Active Vehicles</div>
            </div>
          </div>
        </div>
      ) : (
        <div>Loading dashboard...</div>
      )}
    </div>
  );
};

const TestApp13: React.FC = () => {
  return (
    <ErrorBoundary>
      <TestDashboardInit />
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp13;