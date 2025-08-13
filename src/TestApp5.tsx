import React from 'react';
import { AddVehicleModal } from './components/AddVehicleModal';
import { BulkUploadModal } from './components/BulkUploadModal';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { MultiBatchDocumentUploadModal } from './components/MultiBatchDocumentUploadModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { MinimalisticVehicleCard } from './components/MinimalisticVehicleCard';
import { DriverManagementPage } from './components/DriverManagementPage';
import { ReportingDashboard } from './components/ReportingDashboard';
import { NotificationSystem, ErrorBoundary } from './components/NotificationSystem';
import { AuthWrapper } from './components/AuthComponents';

const TestApp5: React.FC = () => {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold text-blue-600">TruckBo Components Test</h1>
      <p className="mt-4 text-lg">All components imported successfully!</p>
      <p className="mt-2 text-sm text-gray-600">If you see this, all component imports are working.</p>
    </div>
  );
};

export default TestApp5;