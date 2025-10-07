import React from 'react';
import { persistentFleetStorage } from './services/persistentFleetStorage';
import { fleetDataManager } from './services/fleetDataManager';

const TestApp3: React.FC = () => {
  const handleTestServices = () => {
    try {
      const fleet = persistentFleetStorage.getFleet();
      console.log('Fleet data:', fleet);
      
      const stats = fleetDataManager.getFleetStats();
      console.log('Fleet stats:', stats);
      
      alert(`Fleet: ${fleet.length} vehicles, Stats: ${JSON.stringify(stats)}`);
    } catch (error) {
      console.error('Service error:', error);
      alert(`Service error: ${error.message}`);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600">TruckBo Services Test</h1>
      <p className="mt-4 text-lg">Testing persistentFleetStorage + fleetDataManager...</p>
      <button 
        onClick={handleTestServices}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Test Services
      </button>
    </div>
  );
};

export default TestApp3;