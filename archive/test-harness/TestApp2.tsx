import React from 'react';
import { persistentFleetStorage } from './services/persistentFleetStorage';

const TestApp2: React.FC = () => {
  const handleTestStorage = () => {
    try {
      const fleet = persistentFleetStorage.getFleet();
      console.log('Fleet data:', fleet);
      alert(`Fleet has ${fleet.length} vehicles`);
    } catch (error) {
      console.error('Storage error:', error);
      alert(`Storage error: ${error.message}`);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600">TruckBo Storage Test</h1>
      <p className="mt-4 text-lg">Testing persistentFleetStorage service...</p>
      <button 
        onClick={handleTestStorage}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Test Storage
      </button>
    </div>
  );
};

export default TestApp2;