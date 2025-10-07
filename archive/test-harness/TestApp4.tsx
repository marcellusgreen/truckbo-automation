import React from 'react';
import { persistentFleetStorage } from './services/persistentFleetStorage';
import { fleetDataManager } from './services/fleetDataManager';
import { authService } from './services/authService';
import { comprehensiveComplianceService } from './services/comprehensiveComplianceApi';
import { documentDownloadService } from './services/documentDownloadService';

const TestApp4: React.FC = () => {
  const handleTestServices = () => {
    try {
      const fleet = persistentFleetStorage.getFleet();
      const stats = fleetDataManager.getFleetStats();
      
      // Test authService
      const isAuthenticated = authService.isAuthenticated();
      
      alert(`Fleet: ${fleet.length}, Stats: ${JSON.stringify(stats)}, Auth: ${isAuthenticated}`);
    } catch (error) {
      console.error('Service error:', error);
      alert(`Service error: ${error.message}`);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600">TruckBo All Services Test</h1>
      <p className="mt-4 text-lg">Testing all imported services...</p>
      <button 
        onClick={handleTestServices}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Test All Services
      </button>
    </div>
  );
};

export default TestApp4;