import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';
import { fleetDataManager } from './services/fleetDataManager';

// Test the dashboard header logic that might be crashing
const TestDashboardHeader: React.FC = () => {
  const [error, setError] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<any>(null);

  React.useEffect(() => {
    try {
      const fleetStats = fleetDataManager.getFleetStats();
      const complianceStats = fleetDataManager.getComplianceStats();
      setStats({ fleetStats, complianceStats });
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  if (error) {
    return (
      <div className="p-8 bg-red-100 text-red-800">
        <h2 className="text-xl font-bold">Dashboard Stats Error:</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Dashboard Header Test</h1>
      {stats ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-100 p-4 rounded">
            <div className="text-green-600 font-bold text-2xl">{stats.fleetStats.active}</div>
            <div className="text-gray-600">Active Vehicles</div>
          </div>
          <div className="bg-yellow-100 p-4 rounded">
            <div className="text-yellow-600 font-bold text-2xl">{stats.complianceStats.pending}</div>
            <div className="text-gray-600">Pending Tasks</div>
          </div>
          <div className="bg-red-100 p-4 rounded">
            <div className="text-red-600 font-bold text-2xl">{stats.complianceStats.overdue}</div>
            <div className="text-gray-600">Overdue Tasks</div>
          </div>
        </div>
      ) : (
        <div>Loading stats...</div>
      )}
    </div>
  );
};

const TestApp12: React.FC = () => {
  return (
    <ErrorBoundary>
      <TestDashboardHeader />
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp12;