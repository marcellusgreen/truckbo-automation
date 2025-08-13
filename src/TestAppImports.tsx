import React from 'react';

// Test if the issue is in a specific import by importing them all at the top level
console.log('Step 1: Starting import test...');

console.log('Step 2: Importing React hooks...');
import { useState, useEffect } from 'react';
console.log('✅ React hooks imported');

console.log('Step 3: Importing basic services...');
import { persistentFleetStorage, VehicleRecord } from './services/persistentFleetStorage';
import { fleetDataManager } from './services/fleetDataManager';
import { validateVIN, parseCSVFile, downloadSampleCSV } from './utils';
console.log('✅ Basic services imported');

console.log('Step 4: Importing types...');
import { 
  ParsedVIN, 
  ComplianceTask, 
  OnboardingMethod, 
  OnboardingPageProps,
  DashboardPageProps
} from './types';
console.log('✅ Types imported');

console.log('Step 5: Importing basic components...');
import { AddVehicleModal } from './components/AddVehicleModal';
import { BulkUploadModal } from './components/BulkUploadModal';
import { DocumentUploadModal } from './components/DocumentUploadModal';
console.log('✅ Basic components imported');

console.log('Step 6: Importing complex components...');
import { MultiBatchDocumentUploadModal } from './components/MultiBatchDocumentUploadModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { DriverManagementPage } from './components/DriverManagementPage';
import { ReportingDashboard } from './components/ReportingDashboard';
console.log('✅ Complex components imported');

console.log('Step 7: Importing advanced services...');
import { ExtractedVehicleData } from './services/documentProcessor';
import { comprehensiveComplianceService } from './services/comprehensiveComplianceApi';
import { documentDownloadService } from './services/documentDownloadService';
console.log('✅ Advanced services imported');

console.log('Step 8: Importing data input components...');
import { dataInputService, EnhancedVehicleData, ManualEntryTemplate } from './services/dataInputService';
import { BulkFileUpload, ManualDataEntry, DataSourceIndicator } from './components/DataInputComponents';
import { ComprehensiveComplianceDashboard } from './components/ComprehensiveComplianceDashboard';
console.log('✅ Data input components imported');

console.log('Step 9: All imports completed successfully!');

const TestAppImports: React.FC = () => {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">App Import Test</h1>
      <p className="text-lg">✅ All App.tsx imports successful!</p>
      <p className="text-sm text-gray-600 mt-4">
        If you see this page, all imports work fine. The issue is in component rendering, not imports.
      </p>
    </div>
  );
};

export default TestAppImports;