import React, { useState, useEffect } from 'react';
import { persistentFleetStorage, VehicleRecord } from './services/persistentFleetStorage';
import { fleetDataManager } from './services/fleetDataManager';
import { validateVIN, parseCSVFile, downloadSampleCSV } from './utils';
import { 
  ParsedVIN, 
  ComplianceTask, 
  OnboardingMethod, 
  OnboardingPageProps,
  DashboardPageProps
} from './types';
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
import { authService } from './services/authService';
import { ExtractedVehicleData } from './services/documentProcessor';
import { comprehensiveComplianceService } from './services/comprehensiveComplianceApi';
import { documentDownloadService } from './services/documentDownloadService';
import { reconcilerAPI, type VehicleSummaryView, type FleetDashboard } from './services/reconcilerAPI';
import { mapComplianceToVehicleStatus, mapComplianceToDisplayStatus } from './utils/statusMapping';
import { safeString, safeReconciledVehicleData, safeVehicleData } from './utils/safeDataAccess';

// Types and interfaces are now imported from ./types

// FleetDataManager is now imported from ./services/fleetDataManager

// Utility functions are now imported from ./utils

// Enhanced Onboarding Component with API Integration
import { dataInputService, EnhancedVehicleData, ManualEntryTemplate } from './services/dataInputService';
import { BulkFileUpload, ManualDataEntry, DataSourceIndicator } from './components/DataInputComponents';
import { ComprehensiveComplianceDashboard } from './components/ComprehensiveComplianceDashboard';

// OnboardingPageProps and OnboardingMethod are now imported from ./types

const OnboardingPage: React.FC<OnboardingPageProps> = ({ setCurrentPage }) => {
  const [step, setStep] = useState(1);
  const [onboardingMethod, setOnboardingMethod] = useState<OnboardingMethod>('document_processing');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedVINs, setParsedVINs] = useState<ParsedVIN[]>([]);
  const [enhancedVehicleData, setEnhancedVehicleData] = useState<EnhancedVehicleData[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  // const [currentVinIndex, setCurrentVinIndex] = useState(0); // Unused for now
  const [manualEntryData, setManualEntryData] = useState<{
    vin: string;
    template: ManualEntryTemplate;
    existingData?: EnhancedVehicleData;
  } | null>(null);
  
  // Document processing states
  const [isDocumentUploadOpen, setIsDocumentUploadOpen] = useState(false);
  
  const handleDocumentProcessingComplete = (vehicleData: ExtractedVehicleData[]) => {
    console.log('📄 OnboardingPage: Document processing complete', vehicleData);
    
    // Convert document processing results to enhanced vehicle data format for onboarding review
    const convertedData: EnhancedVehicleData[] = vehicleData.map(vehicle => ({
      vin: vehicle.vin || 'UNKNOWN',
      year: vehicle.year || new Date().getFullYear(),
      make: vehicle.make || 'Unknown',
      model: vehicle.model || 'Unknown',
      fuelType: 'Diesel', // Default
      maxWeight: 80000, // Default
      vehicleClass: 'Class 8', // Default
      status: 'success' as const,
      complianceTasks: 0,
      dotNumber: vehicle.dotNumber || '', // Use extracted DOT number
      licensePlate: vehicle.licensePlate || '',
      truckNumber: vehicle.truckNumber || `Vehicle ${vehicle.vin?.slice(-4) || 'Unknown'}`,
      registrationExpiry: vehicle.registrationExpiry,
      insuranceExpiry: vehicle.insuranceExpiry,
      insuranceCarrier: vehicle.insuranceCarrier,
      policyNumber: vehicle.policyNumber,
      registrationNumber: vehicle.registrationNumber,
      registrationState: vehicle.registrationState,
      dataSource: {
        method: 'file' as const,
        confidence: 'high' as const,
        lastUpdated: new Date().toISOString(),
        source: 'AI Document Processing'
      },
      missingFields: [],
      needsReview: vehicle.needsReview || false
    }));
    
    // CRITICAL FIX: Save to persistent storage so Fleet Management tab can see the vehicles
    const vehiclesToAdd = vehicleData.map(data => ({
      vin: data.vin || `UNKNOWN_${Date.now()}`,
      make: data.make || 'Unknown',
      model: data.model || 'Unknown',
      year: data.year || new Date().getFullYear(),
      licensePlate: data.licensePlate || 'Unknown',
      dotNumber: data.dotNumber,
      truckNumber: data.truckNumber || '',
      status: 'active' as const,
      
      // Registration data from document processing
      registrationNumber: data.registrationNumber,
      registrationState: data.registrationState,
      registrationExpiry: data.registrationExpiry,
      registeredOwner: data.registeredOwner,
      
      // Insurance data from document processing
      insuranceCarrier: data.insuranceCarrier,
      policyNumber: data.policyNumber,
      insuranceExpiry: data.insuranceExpiry,
      coverageAmount: data.coverageAmount
    }));

    console.log('📄 OnboardingPage: Saving vehicles to persistent storage', vehiclesToAdd);
    const result = persistentFleetStorage.addVehicles(vehiclesToAdd);
    console.log(`📄 OnboardingPage: Storage result - ${result.successful.length} successful, ${result.failed.length} failed`);
    
    // Set local state for onboarding review
    setEnhancedVehicleData(convertedData);
    setStep(3); // Move to review step (step 3 is "Review Vehicle Data")
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadedFile(file);

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setError('Please upload a CSV or TXT file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    try {
      setIsProcessing(true);
      const parsed = await parseCSVFile(file);
      setParsedVINs(parsed);
      setIsProcessing(false);
    } catch (error) {
      setError('Failed to parse CSV file. Please check the format.');
      setIsProcessing(false);
    }
  };

  const startProcessing = async () => {
    const validVINs = parsedVINs.filter(v => v.isValid);
    if (validVINs.length === 0) {
      setError('No valid VINs found in the file');
      return;
    }

    setStep(2);
    setIsProcessing(true);
    setProcessingProgress(0);

    const processed: EnhancedVehicleData[] = [];

    for (let i = 0; i < validVINs.length; i++) {
      const vin = validVINs[i].vin;
      
      const progress = Math.round(((i + 1) / validVINs.length) * 90);
      setProcessingStatus(`Processing VIN ${i + 1} of ${validVINs.length}: ${vin}`);
      setProcessingProgress(progress);

      try {
        // Try API first, then provide fallback options
        const result = await dataInputService.getVehicleData(vin, { 
          allowPartial: true 
        });

        if (result.data) {
          processed.push(result.data);
        } else {
          // Create incomplete entry that will need manual input
          processed.push({
            vin,
            dataSource: {
              method: 'incomplete',
              confidence: 'low',
              lastUpdated: new Date().toISOString(),
              source: 'API Failed - Needs Manual Entry'
            },
            missingFields: ['make', 'model', 'year'],
            needsReview: true
          });
        }
      } catch (error) {
        console.error(`Failed to process VIN ${vin}:`, error);
        processed.push({
          vin,
          dataSource: {
            method: 'incomplete',
            confidence: 'low',
            lastUpdated: new Date().toISOString(),
            source: 'Processing Failed - Needs Manual Entry'
          },
          missingFields: ['make', 'model', 'year'],
          needsReview: true
        });
      }

      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setProcessingStatus('Finalizing vehicle profiles...');
    setProcessingProgress(100);
    await new Promise(resolve => setTimeout(resolve, 500));

    setEnhancedVehicleData(processed);
    setIsProcessing(false);
    setStep(3);
  };

  const handleBulkFileUpload = (uploadedData: EnhancedVehicleData[]) => {
    setEnhancedVehicleData(uploadedData);
    setStep(3); // Go directly to review
  };

  const handleManualEntrySubmit = (vehicleData: EnhancedVehicleData) => {
    if (manualEntryData) {
      // Update existing data
      setEnhancedVehicleData(prev => 
        prev.map(v => v.vin === vehicleData.vin ? vehicleData : v)
      );
    } else {
      // Add new data
      setEnhancedVehicleData(prev => [...prev, vehicleData]);
    }
    setManualEntryData(null);
    setStep(3);
  };

  const handleEditVehicle = async (vin: string) => {
    const existingData = enhancedVehicleData.find(v => v.vin === vin);
    const result = await dataInputService.getVehicleData(vin, { skipApi: true });
    
    setManualEntryData({
      vin,
      template: result.fallbackOptions.template!,
      existingData
    });
    setStep(5); // Manual entry step
  };

  const completeOnboarding = () => {
    // Convert enhanced data to the new persistent format
    const persistentVehicles = enhancedVehicleData
      .filter(v => v.make && v.model && v.year) // Only complete vehicles
      .map(v => ({
        vin: v.vin,
        make: v.make!,
        model: v.model!,
        year: v.year!,
        licensePlate: `${v.make?.slice(0,3).toUpperCase()}${Math.floor(Math.random() * 1000)}`,
        dotNumber: undefined,
        truckNumber: v.truckNumber || '', // Will auto-generate
        status: 'active' as const
      }));

    // Save to persistent storage
    persistentFleetStorage.addVehicles(persistentVehicles);
    
    // Also convert to legacy format for backward compatibility
    const legacyVehicles = enhancedVehicleData
      .filter(v => v.make && v.model && v.year)
      .map(v => ({
        vin: v.vin,
        year: v.year!,
        make: v.make!,
        model: v.model!,
        fuelType: v.fuelType || 'Diesel',
        maxWeight: v.maxWeight || 80000,
        vehicleClass: v.vehicleClass || 'Class 8',
        status: 'success' as const,
        complianceTasks: 3
      }));

    fleetDataManager.addVehicles(legacyVehicles);
    setStep(4);
  };

  const resetOnboarding = () => {
    setStep(1);
    setOnboardingMethod('vin_list');
    setUploadedFile(null);
    setParsedVINs([]);
    setEnhancedVehicleData([]);
    setProcessingProgress(0);
    setProcessingStatus('');
    setError(null);
    setIsProcessing(false);
    // setCurrentVinIndex(0);
    setManualEntryData(null);
  };

  return (
    <div className="max-w-6xl">
      {/* Modern Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-4xl font-bold mb-2">🚛 Fleet Onboarding</h2>
            <p className="text-blue-100 text-sm md:text-lg">Add your trucks to TruckBo for automated compliance management</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{enhancedVehicleData.length}</div>
            <div className="text-blue-200">Vehicles Added</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-red-600 text-xl">⚠️</span>
              </div>
            </div>
            <div className="ml-4 flex-1">
              <h4 className="font-semibold text-red-800 mb-1">Processing Error</h4>
              <p className="text-red-700">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Modern Progress Steps */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: 'Input Method', icon: '📋' },
            { num: 2, label: 'Data Processing', icon: '⚙️' },
            { num: 3, label: 'Vehicle Review', icon: '🔍' },
            { num: 4, label: 'Fleet Ready', icon: '✅' }
          ].map(({ num, label, icon }, index) => (
            <div key={num} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                step >= num 
                  ? 'bg-blue-600 border-blue-600 text-white' 
                  : 'bg-white border-gray-300 text-gray-400'
              }`}>
                <span className="text-lg">{step >= num ? '✓' : icon}</span>
              </div>
              <div className={`ml-3 ${step >= num ? 'text-blue-600' : 'text-gray-500'}`}>
                <div className="font-semibold text-sm">Step {num}</div>
                <div className="text-xs">{label}</div>
              </div>
              {index < 3 && (
                <div className={`flex-1 h-0.5 mx-4 ${
                  step > num ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h3 className="text-xl md:text-3xl font-bold text-gray-900 mb-3">Add Your Fleet</h3>
            <p className="text-gray-600 text-sm md:text-lg">Choose the best method to get your trucks into TruckBo</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* AI Document Processing - Primary Recommendation */}
            <div
              className={`group relative border-2 rounded-xl p-8 cursor-pointer transition-all duration-300 ${
                onboardingMethod === 'document_processing'
                  ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-indigo-50 shadow-lg scale-105'
                  : 'border-gray-200 hover:border-purple-300 hover:shadow-md hover:scale-102'
              }`}
              onClick={() => setOnboardingMethod('document_processing')}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-3xl font-bold mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                  🤖
                </div>
                <div className="flex items-center justify-center mb-2">
                  <h4 className="font-bold text-xl text-gray-900">AI Document Processing</h4>
                  <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full font-medium">
                    ⭐ RECOMMENDED
                  </span>
                </div>
                <p className="text-gray-600 leading-relaxed">
                  Upload registration and insurance documents. Our AI extracts all vehicle information and tracks compliance expiry dates automatically.
                </p>
                <div className="mt-6 text-sm text-purple-600 font-medium">
                  ✓ Complete automation   ✓ Compliance tracking   ✓ Document analysis
                </div>
              </div>
              {onboardingMethod === 'document_processing' && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            
            <div
              className={`group relative border-2 rounded-xl p-8 cursor-pointer transition-all duration-300 ${
                onboardingMethod === 'vin_list'
                  ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg scale-105'
                  : 'border-gray-200 hover:border-blue-300 hover:shadow-md hover:scale-102'
              }`}
              onClick={() => setOnboardingMethod('vin_list')}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                  VIN
                </div>
                <h4 className="font-bold text-xl mb-3 text-gray-900">VIN List Processing</h4>
                <p className="text-gray-600 leading-relaxed">
                  Upload VINs and we'll automatically fetch truck specifications and compliance requirements from government databases.
                </p>
                <div className="mt-6 text-sm text-blue-600 font-medium">
                  ✓ Automatic data lookup   ✓ API-powered   ✓ Fast processing
                </div>
              </div>
              {onboardingMethod === 'vin_list' && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>

            <div
              className={`group relative border-2 rounded-xl p-8 cursor-pointer transition-all duration-300 ${
                onboardingMethod === 'bulk_upload'
                  ? 'border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg scale-105'
                  : 'border-gray-200 hover:border-green-300 hover:shadow-md hover:scale-102'
              }`}
              onClick={() => setOnboardingMethod('bulk_upload')}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                  CSV
                </div>
                <h4 className="font-bold text-xl mb-3 text-gray-900">Complete Fleet Upload</h4>
                <p className="text-gray-600 leading-relaxed">
                  Upload a pre-filled spreadsheet with all your truck details including make, model, year, and compliance information.
                </p>
                <div className="mt-6 text-sm text-green-600 font-medium">
                  ✓ Bulk processing   ✓ Pre-filled data   ✓ Quick setup
                </div>
              </div>
              {onboardingMethod === 'bulk_upload' && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>

            <div
              className={`group relative border-2 rounded-xl p-8 cursor-pointer transition-all duration-300 ${
                onboardingMethod === 'individual'
                  ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-violet-50 shadow-lg scale-105'
                  : 'border-gray-200 hover:border-purple-300 hover:shadow-md hover:scale-102'
              }`}
              onClick={() => setOnboardingMethod('individual')}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center text-white text-2xl mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                  🚛
                </div>
                <h4 className="font-bold text-xl mb-3 text-gray-900">One-by-One Entry</h4>
                <p className="text-gray-600 leading-relaxed">
                  Add trucks individually with guided forms. Perfect for smaller fleets or when you want full control over each entry.
                </p>
                <div className="mt-6 text-sm text-purple-600 font-medium">
                  ✓ Step-by-step   ✓ Guided process   ✓ Full control
                </div>
              </div>
              {onboardingMethod === 'individual' && (
                <div className="absolute top-4 right-4 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {onboardingMethod === 'document_processing' && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-8 border border-purple-200">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl mr-4">
                  🤖
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-900">AI Document Processing</h4>
                  <p className="text-purple-700">Upload registration and insurance documents for complete automated setup</p>
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={() => setIsDocumentUploadOpen(true)}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-black text-lg shadow-xl shadow-purple-900/20 hover:shadow-2xl hover:shadow-purple-900/30 transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-purple-400"
                >
                  🤖 Start AI Document Processing
                  <div className="text-xs font-normal text-purple-100 mt-1">
                    ⭐ Upload folders or individual files
                  </div>
                </button>
              </div>
              
              <div className="mt-6 bg-white/50 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center text-sm text-purple-700">
                  <span className="text-purple-500 mr-2">💡</span>
                  <span>Our AI will extract VINs, license plates, expiry dates, and insurance details automatically from your documents</span>
                </div>
              </div>
            </div>
          )}

          {onboardingMethod === 'vin_list' && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-200">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl mr-4">
                  📋
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-900">VIN List Upload</h4>
                  <p className="text-blue-700">We'll automatically fetch truck data from government databases</p>
                </div>
              </div>

              <div className="border-2 border-dashed border-blue-300 rounded-xl p-10 text-center mb-6 bg-white/50 backdrop-blur-sm hover:bg-white/70 transition-colors duration-300">
                <div className="mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                    📁
                  </div>
                  <h5 className="text-lg font-semibold text-gray-900 mb-2">Drop your VIN file here</h5>
                  <p className="text-gray-600">or click to browse your files</p>
                </div>
                
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="w-full h-full opacity-0 absolute inset-0 cursor-pointer"
                  disabled={isProcessing}
                />
                
                <div className="space-y-2">
                  <div className="flex items-center justify-center space-x-6 text-sm text-gray-500">
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      CSV & TXT files
                    </span>
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Max 5MB
                    </span>
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      VINs in first column
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-white rounded-lg p-4 border border-blue-200">
                <div className="flex items-center">
                  <div className="text-blue-600 mr-3">📄</div>
                  <div>
                    <p className="font-medium text-gray-900">Need a template?</p>
                    <p className="text-sm text-gray-600">Download our VIN template to get started</p>
                  </div>
                </div>
                <button
                  onClick={downloadSampleCSV}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300 flex items-center shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-900/30 hover:scale-105 active:scale-95"
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download Template
                </button>
              </div>
            </div>
          )}

          {uploadedFile && parsedVINs.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mt-6">
              <div className="flex items-center mb-6">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-900">File Analysis Complete</h4>
                  <p className="text-gray-600">Your VIN file has been processed and validated</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-blue-700 mb-1">Total VINs</div>
                      <div className="text-3xl font-bold text-blue-900">{parsedVINs.length}</div>
                    </div>
                    <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xl">
                      📊
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-green-700 mb-1">Valid VINs</div>
                      <div className="text-3xl font-bold text-green-900">{parsedVINs.filter(v => v.isValid).length}</div>
                    </div>
                    <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center text-white text-xl">
                      ✓
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-red-700 mb-1">Invalid VINs</div>
                      <div className="text-3xl font-bold text-red-900">{parsedVINs.filter(v => !v.isValid).length}</div>
                    </div>
                    <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center text-white text-xl">
                      ✕
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h5 className="font-bold text-gray-900 mb-4 flex items-center">
                  <span className="mr-2">🔍</span>
                  VIN Preview (showing first 5)
                </h5>
                <div className="space-y-3">
                  {parsedVINs.slice(0, 5).map((vinData, index) => (
                    <div key={index} className="flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center">
                        <div className="font-mono text-lg font-semibold text-gray-900 mr-4">
                          {vinData.vin}
                        </div>
                      </div>
                      <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        vinData.isValid 
                          ? 'bg-green-100 text-green-800 border border-green-200' 
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {vinData.isValid ? (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Valid VIN
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Invalid VIN
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {parsedVINs.length > 5 && (
                    <div className="text-center text-gray-500 text-sm py-2 bg-gray-100 rounded-lg">
                      ... and {parsedVINs.length - 5} more VINs
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {parsedVINs.filter(v => v.isValid).length > 0 && (
            <div className="mt-8 text-center">
              <button
                onClick={startProcessing}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-12 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 flex items-center mx-auto"
              >
                <svg className="w-6 h-6 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Process {parsedVINs.filter(v => v.isValid).length} Valid VINs
              </button>
              <p className="text-gray-500 text-sm mt-3">
                We'll automatically fetch truck data and generate compliance profiles
              </p>
            </div>
          )}

          {onboardingMethod === 'bulk_upload' && (
            <div>
              <BulkFileUpload
                onDataProcessed={handleBulkFileUpload}
                onError={setError}
              />
            </div>
          )}

          {onboardingMethod === 'individual' && (
            <div>
              <h4 className="text-lg font-semibold mb-4">Add Individual Vehicle</h4>
              <p className="text-gray-600 mb-6">Enter a VIN to start adding a vehicle with API assistance.</p>
              
              <div className="max-w-md">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle Identification Number (VIN)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter 17-character VIN"
                    maxLength={17}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onKeyUp={async (e) => {
                      const vin = (e.target as HTMLInputElement).value.toUpperCase();
                      if (vin.length === 17 && validateVIN(vin)) {
                        const result = await dataInputService.getVehicleData(vin);
                        setManualEntryData({
                          vin,
                          template: result.fallbackOptions.template!,
                          existingData: result.data || undefined
                        });
                        setStep(5);
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  VIN will be validated and we'll try to fetch vehicle data automatically
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 className="text-2xl font-semibold mb-4">Processing VIN Data</h3>
          <p className="text-gray-600 mb-6">Decoding vehicle information and generating compliance data...</p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-yellow-800 font-medium">{processingStatus}</span>
                <span className="text-yellow-700 text-sm">{processingProgress}%</span>
              </div>
              <div className="w-full bg-yellow-100 rounded-full h-3">
                <div
                  className="bg-yellow-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${processingProgress}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className={`flex items-center ${processingProgress >= 60 ? 'text-green-700' : 'text-yellow-700'}`}>
                <span className="mr-2">{processingProgress >= 60 ? '✅' : '🔄'}</span>
                VIN Decoding
              </div>
              <div className={`flex items-center ${processingProgress >= 80 ? 'text-green-700' : processingProgress >= 60 ?
'text-yellow-700' : 'text-gray-500'}`}>
                <span className="mr-2">{processingProgress >= 80 ? '✅' : processingProgress >= 60 ? '🔄' : '⏳'}</span>
                Compliance Generation
              </div>
              <div className={`flex items-center ${processingProgress >= 100 ? 'text-green-700' : processingProgress >= 80 ?
'text-yellow-700' : 'text-gray-500'}`}>
                <span className="mr-2">{processingProgress >= 100 ? '✅' : processingProgress >= 80 ? '🔄' : '⏳'}</span>
                Profile Creation
              </div>
            </div>
          </div>

          {!isProcessing && processingProgress === 100 && (
            <button
              onClick={() => setStep(3)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              View Results →
            </button>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 className="text-2xl font-semibold mb-4">Review Vehicle Data</h3>
          <p className="text-gray-600 mb-6">Review your vehicles and complete any missing information.</p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="font-semibold text-blue-800">Total Vehicles</div>
              <div className="text-2xl text-blue-600">{enhancedVehicleData.length}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="font-semibold text-green-800">Complete</div>
              <div className="text-2xl text-green-600">
                {enhancedVehicleData.filter(v => v.make && v.model && v.year).length}
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="font-semibold text-yellow-800">Need Review</div>
              <div className="text-2xl text-yellow-600">
                {enhancedVehicleData.filter(v => v.needsReview).length}
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="font-semibold text-red-800">Incomplete</div>
              <div className="text-2xl text-red-600">
                {enhancedVehicleData.filter(v => !v.make || !v.model || !v.year).length}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div className="px-6 py-4 bg-gray-50">
              <h4 className="font-semibold">Vehicle Details</h4>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {enhancedVehicleData.map((vehicle, index) => (
                <div key={index} className={`p-4 ${
                  vehicle.needsReview ? 'border-l-4 border-l-yellow-500' : 
                  (!vehicle.make || !vehicle.model || !vehicle.year) ? 'border-l-4 border-l-red-500' :
                  'border-l-4 border-l-green-500'
                }`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h5 className="font-medium text-lg">
                        {vehicle.year && vehicle.make && vehicle.model ? 
                          `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 
                          'Incomplete Vehicle Data'
                        }
                      </h5>
                      <p className="text-sm text-gray-600 font-mono mb-2">VIN: {vehicle.vin}</p>
                      
                      {(vehicle.fuelType || vehicle.vehicleClass || vehicle.maxWeight) && (
                        <div className="flex flex-wrap gap-2 mb-2 text-sm">
                          {vehicle.vehicleClass && (
                            <span className="bg-gray-100 px-2 py-1 rounded">{vehicle.vehicleClass}</span>
                          )}
                          {vehicle.fuelType && (
                            <span className="bg-blue-100 px-2 py-1 rounded">{vehicle.fuelType}</span>
                          )}
                          {vehicle.maxWeight && (
                            <span className="bg-yellow-100 px-2 py-1 rounded">
                              {vehicle.maxWeight.toLocaleString()} lbs
                            </span>
                          )}
                        </div>
                      )}
                      
                      <DataSourceIndicator data={vehicle} />
                    </div>
                    
                    <div className="text-right ml-4">
                      {(!vehicle.make || !vehicle.model || !vehicle.year || vehicle.needsReview) && (
                        <button
                          onClick={() => handleEditVehicle(vehicle.vin)}
                          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold mb-2 transition-all duration-300 shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-900/30 hover:scale-105 active:scale-95"
                        >
                          {!vehicle.make || !vehicle.model || !vehicle.year ? '✨ Complete Data' : '📝 Review & Edit'}
                        </button>
                      )}
                      
                      <div className="text-xs text-gray-500">
                        {vehicle.missingFields.length > 0 && (
                          <div className="text-amber-600 font-medium">
                            Missing: {vehicle.missingFields.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={completeOnboarding}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium text-lg"
              disabled={enhancedVehicleData.filter(v => v.make && v.model && v.year).length === 0}
            >
              Complete Onboarding & Add {enhancedVehicleData.filter(v => v.make && v.model && v.year).length} Vehicles →
            </button>
            
            {enhancedVehicleData.filter(v => !v.make || !v.model || !v.year).length > 0 && (
              <div className="text-sm text-gray-600 flex items-center">
                ⚠️ {enhancedVehicleData.filter(v => !v.make || !v.model || !v.year).length} vehicles need completion
              </div>
            )}
          </div>
        </div>
      )}

      {step === 5 && manualEntryData && (
        <div>
          <ManualDataEntry
            template={manualEntryData.template}
            existingData={manualEntryData.existingData}
            onDataSubmitted={handleManualEntrySubmit}
            onCancel={() => {
              setManualEntryData(null);
              setStep(3);
            }}
          />
        </div>
      )}

      {step === 4 && (
        <div>
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-3xl font-bold text-green-600 mb-2">Onboarding Complete!</h3>
            <p className="text-gray-600 text-lg">Your fleet has been successfully processed and integrated into the
system.</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <h4 className="font-semibold text-green-800 mb-4">✅ Integration Summary:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-green-700">
              <div>✅ {enhancedVehicleData.filter(v => v.make && v.model && v.year).length} vehicles added to Fleet Management</div>
              <div>✅ {enhancedVehicleData.filter(v => v.make && v.model && v.year).length * 3} compliance tasks generated</div>
              <div>✅ Vehicle profiles created with real API data where available</div>
              <div>✅ Dashboard updated with comprehensive fleet data</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => setCurrentPage('fleet')}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 hover:shadow-2xl hover:shadow-blue-900/30 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              🚛 View Fleet Management
            </button>
            <button
              onClick={() => setCurrentPage('compliance')}
              className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-purple-900/20 hover:shadow-2xl hover:shadow-purple-900/30 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              📋 View Compliance Tasks
            </button>
            <button
              onClick={resetOnboarding}
              className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-900/20 hover:shadow-2xl hover:shadow-emerald-900/30 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              📁 Start New Onboarding
            </button>
          </div>
        </div>
      )}
      
      {/* Document Upload Modal */}
      <DocumentUploadModal
        isOpen={isDocumentUploadOpen}
        onClose={() => {
          setIsDocumentUploadOpen(false);
          console.log('🔄 Modal closed, refreshing vehicles...');
          // Use setTimeout to ensure the modal has fully closed before refreshing
          setTimeout(() => {
            try {
              loadVehicles(); // Refresh vehicles after document processing
            } catch (error) {
              console.error('❌ Error refreshing vehicles:', error);
              window.location.reload(); // Fallback: reload the page
            }
          }, 100);
        }}
        onDocumentsProcessed={handleDocumentProcessingComplete}
      />
    </div>
  );
};

// Fleet Management Component
const FleetPage: React.FC = () => {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [reconciledVehicles, setReconciledVehicles] = useState<VehicleSummaryView[]>([]);
  const [fleetDashboard, setFleetDashboard] = useState<FleetDashboard | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'compliant' | 'non_compliant' | 'expires_soon' | 'review_needed'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showReconciledView, setShowReconciledView] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isDocumentUploadOpen, setIsDocumentUploadOpen] = useState(false);
  const [isMultiBatchUploadOpen, setIsMultiBatchUploadOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);

  const loadVehicles = () => {
    console.log('🔄 loadVehicles() called - refreshing fleet data');
    // Load legacy vehicles from persistent storage for backward compatibility
    const persistentVehicles = persistentFleetStorage.getFleet();
    const legacyVehicles = fleetDataManager.getAllVehicles();
    
    // Convert legacy vehicles to new format if they exist
    const convertedLegacy = legacyVehicles.map(v => ({
      id: v.id,
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      licensePlate: v.licensePlate,
      dotNumber: v.dotNumber,
      truckNumber: `Truck #${v.vin.slice(-3)}`, // Generate from VIN for legacy vehicles
      status: v.status,
      dateAdded: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }));

    // Merge and deduplicate by VIN
    const allVehicles = [...persistentVehicles, ...convertedLegacy];
    const uniqueVehicles = allVehicles.filter((vehicle, index, self) => 
      index === self.findIndex(v => v.vin === vehicle.vin)
    );

    setVehicles(uniqueVehicles);
    
    // Load reconciled vehicles from reconcilerAPI
    try {
      const reconciledData = reconcilerAPI.getAllVehicleSummaries();
      const dashboardData = reconcilerAPI.getFleetDashboard();
      
      console.log(`📊 Loaded ${reconciledData.length} reconciled vehicles from reconcilerAPI`);
      console.log('🔍 Reconciled vehicles data:', reconciledData);
      setReconciledVehicles(reconciledData);
      setFleetDashboard(dashboardData);
    } catch (error) {
      console.error('❌ Error loading reconciled vehicles:', error);
      setReconciledVehicles([]);
      setFleetDashboard(null);
    }
  };

  useEffect(() => {
    loadVehicles();
    
    // Subscribe to both storage systems for maximum compatibility
    const unsubscribeFleetManager = fleetDataManager.subscribe(() => {
      loadVehicles();
    });
    
    const unsubscribePersistentStorage = persistentFleetStorage.subscribe(() => {
      console.log('📄 FleetPage: Persistent storage updated, reloading vehicles...');
      loadVehicles();
    });
    
    return () => {
      unsubscribeFleetManager();
      unsubscribePersistentStorage();
    };
  }, []);

  const handleVehicleAdded = (_newVehicle: VehicleRecord) => {
    loadVehicles(); // Reload from storage
  };

  const handleVehiclesAdded = (_newVehicles: VehicleRecord[]) => {
    loadVehicles(); // Reload from storage
  };

  const handleDocumentsProcessed = (extractedData: ExtractedVehicleData[]) => {
    console.log('📄 Processing extracted document data:', extractedData);
    
    // **LOW PRIORITY FIX: Use safe data access for extracted data**
    const vehiclesToAdd = extractedData.map(data => safeVehicleData(data));

    console.log('📄 Converting to vehicle records:', vehiclesToAdd);

    const result = persistentFleetStorage.addVehicles(vehiclesToAdd);
    console.log(`📄 Storage result: ${result.successful.length} successful, ${result.failed.length} failed`);
    
    // **HIGH PRIORITY FIX: Comprehensive data refresh**
    if (result.successful.length > 0) {
      console.log('📄 Successfully added vehicles, starting comprehensive refresh...');
      
      setTimeout(() => {
        try {
          console.log('🔄 Clearing reconcilerAPI cache...');
          reconcilerAPI.clearCache();
          
          console.log('🔄 Reloading all vehicle data...');
          loadVehicles(); // Reload to show new vehicles
          
          // Force component re-render by updating state
          setSearchTerm(prev => prev); // Trigger re-render
          
          console.log('✅ Comprehensive data refresh completed!');
        } catch (error) {
          console.error('❌ Error during data refresh:', error);
          // Fallback: reload the page
          window.location.reload();
        }
      }, 500);
      
    } else {
      console.error('📄 No vehicles were successfully added:', result.failed);
    }
  };

  const handleMultiBatchDocumentsReconciled = (vehicleCount: number) => {
    console.log(`📄 Multi-batch reconciliation complete: ${vehicleCount} vehicles added`);
    
    // **HIGH PRIORITY FIX: Comprehensive refresh for batch processing too**
    setTimeout(() => {
      try {
        console.log('🔄 Clearing reconcilerAPI cache after batch processing...');
        reconcilerAPI.clearCache();
        
        console.log('🔄 Reloading all vehicle data after batch processing...');
        loadVehicles(); // Reload to show reconciled vehicles
        
        // Force re-render
        setSearchTerm(prev => prev);
        
        console.log('✅ Batch processing refresh completed!');
      } catch (error) {
        console.error('❌ Error during batch processing refresh:', error);
        window.location.reload();
      }
    }, 500);
  };

  // Function to fetch real compliance data for a vehicle (PRODUCTION MODE)
  const fetchRealComplianceData = async (vehicle: VehicleRecord) => {
    try {
      console.log(`🔄 Fetching real compliance data for VIN: ${vehicle.vin}, DOT: ${vehicle.dotNumber}`);
      
      // PRODUCTION MODE: Call the real comprehensive compliance service
      const realApiData = await comprehensiveComplianceService.getUnifiedComplianceData(
        vehicle.vin, 
        vehicle.dotNumber
      );

      console.log('✅ Real API data received:', realApiData);

      // Transform the comprehensive API response to our compliance format
      const complianceData = {
        dotInspection: {
          status: getDOTComplianceStatus(realApiData.fmcsaData),
          daysUntilExpiry: calculateDaysUntilExpiry(realApiData.fmcsaData?.safetyRatingDate || ''),
          lastInspectionDate: realApiData.fmcsaData?.safetyRatingDate || '',
          inspectionType: 'DOT Safety Rating',
          safetyRating: realApiData.fmcsaData?.safetyRating || 'Unknown',
          violations: realApiData.inspectionRecords?.length || 0
        },
        registration: {
          status: getRegistrationStatus(realApiData.registrationData),
          daysUntilExpiry: calculateDaysUntilExpiry(realApiData.registrationData?.expirationDate || ''),
          registrationState: realApiData.registrationData?.state || 'Unknown',
          registrationNumber: realApiData.registrationData?.registrationNumber || vehicle.licensePlate,
          isValid: realApiData.registrationData?.isValid || false
        },
        insurance: {
          status: getInsuranceStatus(realApiData.insuranceData),
          daysUntilExpiry: calculateDaysUntilExpiry(realApiData.insuranceData?.expirationDate || ''),
          carrier: realApiData.insuranceData?.carrier || 'Unknown',
          policyNumber: realApiData.insuranceData?.policyNumber || '',
          isActive: realApiData.insuranceData?.isActive || false,
          coverageAmount: realApiData.insuranceData?.coverageTypes?.liability || 0
        },
        ifta: {
          status: 'compliant' as const, // IFTA data would need separate API
          daysUntilExpiry: 90, // Placeholder - would come from IFTA-specific API
          quarterDue: getNextIFTAQuarter(),
          jurisdiction: realApiData.registrationData?.state || 'CA'
        },
        // Store additional metadata
        apiMetadata: {
          lastUpdated: new Date().toISOString(),
          dataSource: 'real_api',
          complianceScore: realApiData.complianceScore || 0,
          vin: realApiData.vin
        }
      };

      // Update the vehicle in persistent storage with real data
      persistentFleetStorage.updateVehicle(vehicle.id, { 
        complianceData: complianceData,
        lastUpdated: new Date().toISOString()
      });
      
      // Reload vehicles to show updated data
      loadVehicles();
      
      return complianceData;
    } catch (error) {
      console.error('❌ Failed to fetch real compliance data:', error);
      
      // Return blank/no data when API fails - no fallback to mock data
      const noDataResponse = {
        dotInspection: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          lastInspectionDate: '',
          inspectionType: 'No Data Available',
          safetyRating: 'No Data',
          violations: null,
          error: 'API unavailable'
        },
        registration: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          registrationState: 'No Data',
          registrationNumber: 'No Data',
          isValid: null,
          error: 'API unavailable'
        },
        insurance: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          carrier: 'No Data Available',
          policyNumber: 'No Data',
          isActive: null,
          coverageAmount: null,
          error: 'API unavailable'
        },
        ifta: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          quarterDue: 'No Data',
          jurisdiction: 'No Data',
          error: 'API unavailable'
        },
        apiMetadata: {
          lastUpdated: new Date().toISOString(),
          dataSource: 'api_error',
          error: error instanceof Error ? error.message : String(error)
        }
      };

      return noDataResponse;
    }
  };

  // Helper functions for API data processing
  const getDOTComplianceStatus = (fmcsaData: { safetyRating?: string } | null) => {
    if (!fmcsaData) return 'warning' as const;
    if (fmcsaData.safetyRating === 'Satisfactory') return 'compliant' as const;
    if (fmcsaData.safetyRating === 'Conditional') return 'warning' as const;
    if (fmcsaData.safetyRating === 'Unsatisfactory') return 'expired' as const;
    return 'warning' as const;
  };

  const getRegistrationStatus = (regData: { isValid?: boolean; expirationDate?: string } | null) => {
    if (!regData) return 'warning' as const;
    if (regData.isValid) {
      const daysUntil = calculateDaysUntilExpiry(regData.expirationDate || '');
      if (daysUntil < 0) return 'expired' as const;
      if (daysUntil < 30) return 'warning' as const;
      return 'compliant' as const;
    }
    return 'expired' as const;
  };

  const getInsuranceStatus = (insData: { isActive?: boolean; expirationDate?: string } | null) => {
    if (!insData) return 'warning' as const;
    if (insData.isActive) {
      const daysUntil = calculateDaysUntilExpiry(insData.expirationDate || '');
      if (daysUntil < 0) return 'expired' as const;
      if (daysUntil < 30) return 'warning' as const;
      return 'compliant' as const;
    }
    return 'expired' as const;
  };

  const calculateDaysUntilExpiry = (dateString: string) => {
    if (!dateString) return 365; // Default to 1 year if no date
    const expiryDate = new Date(dateString);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getNextIFTAQuarter = () => {
    const now = new Date();
    const currentQuarter = Math.floor((now.getMonth() + 3) / 3);
    const nextQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1;
    const nextYear = currentQuarter === 4 ? now.getFullYear() + 1 : now.getFullYear();
    return `Q${nextQuarter} ${nextYear}`;
  };

  // Get compliance data - real API data, extracted document data, or show blanks
  const getComplianceData = (vehicle: VehicleRecord) => {
    // Debug: Log the vehicle data to see what's stored
    console.log(`🔍 Getting compliance data for vehicle ${vehicle.truckNumber || vehicle.vin}:`, {
      id: vehicle.id,
      registrationExpiry: vehicle.registrationExpiry,
      insuranceExpiry: vehicle.insuranceExpiry,  
      registrationNumber: vehicle.registrationNumber,
      insuranceCarrier: vehicle.insuranceCarrier,
      policyNumber: vehicle.policyNumber,
      hasComplianceData: !!vehicle.complianceData
    });

    // Check if vehicle has real compliance data stored (highest priority)
    if (vehicle.complianceData) {
      console.log(`📄 Using stored compliance data for ${vehicle.truckNumber}`);
      return {
        ...vehicle.complianceData,
        isRealData: vehicle.complianceData.apiMetadata?.dataSource === 'real_api',
        dataSource: vehicle.complianceData.apiMetadata?.dataSource || 'unknown',
        lastUpdated: vehicle.complianceData.apiMetadata?.lastUpdated
      };
    }

    // Check if vehicle has extracted document data (medium priority)
    const hasDocumentData = vehicle.registrationExpiry || vehicle.insuranceCarrier || vehicle.policyNumber;
    console.log(`📋 Document data check for ${vehicle.truckNumber}: hasDocumentData=${hasDocumentData}`);
    if (hasDocumentData) {
      console.log(`✅ Using extracted document data for ${vehicle.truckNumber}`);
      console.log(`   Registration: expiry=${vehicle.registrationExpiry}, number=${vehicle.registrationNumber}`);
      console.log(`   Insurance: carrier=${vehicle.insuranceCarrier}, expiry=${vehicle.insuranceExpiry}`);
      const calculateDaysUntilExpiry = (dateStr?: string) => {
        if (!dateStr) return null;
        try {
          const expiry = new Date(dateStr.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$1-$2'));
          const today = new Date();
          const diffTime = expiry.getTime() - today.getTime();
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch {
          return null;
        }
      };

      const getStatusFromDays = (days: number | null) => {
        if (days === null) return 'warning' as const;
        if (days < 0) return 'critical' as const;
        if (days < 30) return 'warning' as const;
        return 'compliant' as const;
      };

      const regDays = calculateDaysUntilExpiry(vehicle.registrationExpiry);
      const insDays = calculateDaysUntilExpiry(vehicle.insuranceExpiry);

      return {
        dotInspection: { 
          status: 'warning' as const, 
          daysUntilExpiry: null,
          lastInspectionDate: '',
          inspectionType: 'Not Synced',
          safetyRating: '—',
          violations: null
        },
        registration: { 
          status: getStatusFromDays(regDays),
          daysUntilExpiry: regDays,
          registrationState: vehicle.registrationState || '—',
          registrationNumber: vehicle.registrationNumber || '—',
          isValid: regDays !== null && regDays > 0
        },
        insurance: { 
          status: getStatusFromDays(insDays),
          daysUntilExpiry: insDays,
          carrier: vehicle.insuranceCarrier || '—',
          policyNumber: vehicle.policyNumber || '—',
          isActive: insDays !== null && insDays > 0,
          coverageAmount: vehicle.coverageAmount || null
        },
        ifta: { 
          status: 'warning' as const, 
          daysUntilExpiry: null,
          quarterDue: '—',
          jurisdiction: vehicle.registrationState || '—'
        },
        isRealData: false,
        dataSource: 'document_processing',
        lastUpdated: vehicle.lastUpdated
      };
    }

    // NO DATA - Show blanks until data is available
    console.log(`⚠️ No document or compliance data found for ${vehicle.truckNumber}, using blank placeholders`);
    return {
      dotInspection: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        lastInspectionDate: '',
        inspectionType: 'Not Synced',
        safetyRating: '—',
        violations: null
      },
      registration: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        registrationState: '—',
        registrationNumber: '—',
        isValid: null
      },
      insurance: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        carrier: '—',
        policyNumber: '—',
        isActive: null,
        coverageAmount: null
      },
      ifta: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        quarterDue: '—',
        jurisdiction: '—'
      },
      isRealData: false,
      dataSource: 'not_synced',
      lastUpdated: null
    };
  };

  // Map reconciled vehicle to card format
  const mapReconciledVehicleToCardFormat = (reconciledVehicle: VehicleSummaryView) => {
    // **LOW PRIORITY FIX: Use safe data access**
    const safeVehicle = safeReconciledVehicleData(reconciledVehicle);
    
    return {
      vehicle: {
        id: `reconciled-${safeVehicle.vin}`,
        vin: safeVehicle.vin,
        make: safeVehicle.make,
        model: safeVehicle.model,
        year: safeVehicle.year,
        licensePlate: safeVehicle.licensePlate,
        truckNumber: `#${safeVehicle.vin.slice(-4)}`, // Use last 4 of VIN as truck number
        status: mapComplianceToVehicleStatus(safeVehicle.overallStatus),
        location: safeVehicle.state,
        mileage: null,
        fuelLevel: null,
        nextService: null,
        dataSource: 'reconciled' as const,
        lastUpdated: safeVehicle.lastUpdated,
        engineDescription: safeVehicle.engineDescription
      },
      compliance: {
        overallStatus: mapComplianceToDisplayStatus(safeVehicle.overallStatus),
        complianceScore: safeVehicle.complianceScore,
        registration: { 
          status: reconciledVehicle.nextExpiringDocument?.documentType === 'registration' ? 
                  (reconciledVehicle.nextExpiringDocument.urgency === 'expired' ? 'expired' as const : 
                   reconciledVehicle.nextExpiringDocument.urgency === 'critical' ? 'warning' as const : 'active' as const) : 
                  'active' as const,
          daysUntilExpiry: reconciledVehicle.nextExpiringDocument?.documentType === 'registration' ? 
                          reconciledVehicle.nextExpiringDocument.daysUntilExpiry : null,
          expiryDate: reconciledVehicle.nextExpiringDocument?.documentType === 'registration' ? 
                     reconciledVehicle.nextExpiringDocument.expirationDate : null,
          renewalCost: null
        },
        insurance: { 
          status: reconciledVehicle.nextExpiringDocument?.documentType === 'insurance' ? 
                  (reconciledVehicle.nextExpiringDocument.urgency === 'expired' ? 'expired' as const : 
                   reconciledVehicle.nextExpiringDocument.urgency === 'critical' ? 'warning' as const : 'active' as const) : 
                  'active' as const,
          daysUntilExpiry: reconciledVehicle.nextExpiringDocument?.documentType === 'insurance' ? 
                          reconciledVehicle.nextExpiringDocument.daysUntilExpiry : null,
          carrier: '—',
          policyNumber: '—',
          isActive: null,
          coverageAmount: null
        },
        ifta: { 
          status: 'active' as const, 
          daysUntilExpiry: null,
          quarterDue: '—',
          jurisdiction: '—'
        },
        isRealData: true,
        dataSource: 'reconciled',
        lastUpdated: reconciledVehicle.lastUpdated
      }
    };
  };

  // Filter regular vehicles
  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = searchTerm === '' ||
      vehicle.vin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.licensePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.truckNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      // Smart search: if user types just a number, search truck numbers
      (searchTerm.match(/^\d+$/) && vehicle.truckNumber?.includes(`#${searchTerm.padStart(3, '0')}`)) ||
      // Also match "#47" format
      (searchTerm.startsWith('#') && vehicle.truckNumber?.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filter reconciled vehicles
  const filteredReconciledVehicles = reconciledVehicles.filter(vehicle => {
    // **LOW PRIORITY FIX: Safe access to vehicle properties**
    const safeVehicle = safeReconciledVehicleData(vehicle);
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    const matchesSearch = searchTerm === '' ||
      safeVehicle.vin.toLowerCase().includes(lowerSearchTerm) ||
      safeVehicle.make.toLowerCase().includes(lowerSearchTerm) ||
      safeVehicle.model.toLowerCase().includes(lowerSearchTerm) ||
      safeVehicle.licensePlate.toLowerCase().includes(lowerSearchTerm);

    // **MEDIUM PRIORITY FIX: Simplified status mapping**
    const vehicleStatus = mapComplianceToVehicleStatus(safeVehicle.overallStatus);
    const matchesStatus = statusFilter === 'all' || vehicleStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Combine filtered vehicles (show reconciled vehicles first, then regular vehicles)
  const allFilteredVehicles = [...filteredReconciledVehicles, ...filteredVehicles];
  
  console.log('🚗 Vehicle display debug:', {
    regularVehicles: vehicles.length,
    reconciledVehicles: reconciledVehicles.length,
    filteredRegular: filteredVehicles.length,
    filteredReconciled: filteredReconciledVehicles.length,
    totalDisplayed: allFilteredVehicles.length
  });

  // **MEDIUM PRIORITY FIX: Simplified stats calculation using status mapping**
  // **LOW PRIORITY FIX: Safe data access for stats calculation**
  const stats = {
    total: vehicles.length + reconciledVehicles.length,
    active: vehicles.filter(v => v.status === 'active').length + 
           reconciledVehicles.filter(v => {
             const safeVehicle = safeReconciledVehicleData(v);
             return mapComplianceToVehicleStatus(safeVehicle.overallStatus) === 'active';
           }).length,
    inactive: vehicles.filter(v => v.status === 'inactive').length + 
             reconciledVehicles.filter(v => {
               const safeVehicle = safeReconciledVehicleData(v);
               return mapComplianceToVehicleStatus(safeVehicle.overallStatus) === 'inactive';
             }).length,
    complianceWarnings: reconciledVehicles.filter(v => {
                          const safeVehicle = safeReconciledVehicleData(v);
                          return mapComplianceToDisplayStatus(safeVehicle.overallStatus) === 'warning';
                        }).length + Math.floor(vehicles.length * 0.1),
    complianceExpired: reconciledVehicles.filter(v => {
                         const safeVehicle = safeReconciledVehicleData(v);
                         return mapComplianceToDisplayStatus(safeVehicle.overallStatus) === 'expired';
                       }).length + Math.floor(vehicles.length * 0.05)
  };

  console.log('📊 Dashboard stats calculation:', {
    regularVehicles: vehicles.length,
    reconciledVehicles: reconciledVehicles.length,
    calculatedTotal: stats.total,
    statsObject: stats
  });

  // Convert vehicle data to enhanced card format
  const mapVehicleToCardFormat = (vehicle: VehicleRecord) => {
    const compliance = getComplianceData(vehicle);
    
    // Calculate overall compliance score based on status
    const complianceItems = [
      compliance.registration,
      compliance.insurance,
      compliance.dotInspection,
      compliance.ifta
    ];
    
    const compliantCount = complianceItems.filter(item => item.status === 'compliant').length;
    const warningCount = complianceItems.filter(item => item.status === 'warning').length;
    const expiredCount = complianceItems.filter(item => item.status === 'expired').length;
    
    // Calculate score: compliant = 100%, warning = 70%, expired = 0%
    const totalScore = (compliantCount * 100 + warningCount * 70 + expiredCount * 0) / complianceItems.length;
    
    const overallStatus: 'compliant' | 'warning' | 'expired' = 
      totalScore >= 90 ? 'compliant' : 
      totalScore >= 50 ? 'warning' : 'expired';

    return {
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        licensePlate: vehicle.licensePlate,
        truckNumber: vehicle.truckNumber,
        status: vehicle.status,
        dotNumber: vehicle.dotNumber,
        dateAdded: vehicle.dateAdded
      },
      compliance: {
        registration: compliance.registration,
        insurance: compliance.insurance,
        dotInspection: compliance.dotInspection,
        ifta: compliance.ifta,
        overall: {
          score: Math.round(totalScore),
          status: overallStatus
        }
      }
    };
  };

  // Helper functions for compliance status (will be used in Phase 3)
  // const getComplianceStatusColor = (item: ComplianceItem) => {
  //   switch (item.status) {
  //     case 'compliant': return 'text-emerald-800 bg-gradient-to-r from-emerald-100 to-green-100 border-emerald-300';
  //     case 'warning': return 'text-amber-800 bg-gradient-to-r from-amber-100 to-yellow-100 border-amber-300';
  //     case 'expired': return 'text-red-800 bg-gradient-to-r from-red-100 to-rose-100 border-red-300';
  //     default: return 'text-slate-700 bg-gradient-to-r from-slate-100 to-gray-100 border-slate-300';
  //   }
  // };

  // const getComplianceIcon = (item: ComplianceItem) => {
  //   const daysUntil = item.daysUntilExpiry;
  //   switch (item.status) {
  //     case 'compliant': return daysUntil > 90 ? '🟢' : daysUntil > 30 ? '🟡' : '🟠';
  //     case 'warning': return '⚠️';
  //     case 'expired': return '🔴';
  //     default: return '⚪';
  //   }
  // };

  return (
    <div className="max-w-7xl">
      {/* Modern Fleet Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl md:text-4xl font-bold mb-2 flex items-center">
              <span className="mr-3">🚛</span>
              Fleet Management
            </h2>
            <p className="text-slate-300 text-lg">Monitor and manage your truck fleet operations</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{stats.total}</div>
            <div className="text-slate-300">Total Trucks</div>
          </div>
        </div>
      </div>

      {/* Fleet Stats - Minimalistic */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-gray-600">Total:</span>
          <span className="font-semibold">{stats.total}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-gray-600">Active:</span>
          <span className="font-semibold">{stats.active}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
          <span className="text-gray-600">Parked:</span>
          <span className="font-semibold">{stats.inactive}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <span className="text-gray-600">Issues:</span>
          <span className="font-semibold">{stats.complianceWarnings + stats.complianceExpired}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search vehicles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive' | 'maintenance')}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        
        {/* View Mode Toggle */}
        <div className="flex bg-gray-100 rounded overflow-hidden">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'cards'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
            }`}
          >
            Table
          </button>
        </div>
      </div>
        
        {/* Action Buttons - Minimalistic */}
        <div className="flex items-center gap-2 mb-4">
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            + Add Vehicle
          </button>
          <button 
            onClick={() => setIsBulkUploadOpen(true)}
            className="px-3 py-1.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Bulk Upload
          </button>
          <button 
            onClick={() => setIsDocumentUploadOpen(true)}
            className="px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
          >
            Upload Documents
          </button>
          <button 
            onClick={() => setIsMultiBatchUploadOpen(true)}
            className="px-3 py-1.5 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors"
          >
            Multi-Batch
          </button>
          <button 
            onClick={() => setIsTestRunnerOpen(true)}
            className="px-3 py-1.5 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded transition-colors"
          >
            Test Runner
          </button>
        </div>
          {/* Additional Actions */}
          <div className="flex items-center gap-2 mb-4">
            <button 
              onClick={() => documentDownloadService.downloadComplianceSummary(vehicles)}
              className="px-3 py-1.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
              title="Download fleet compliance report"
            >
              Download Report
            </button>
            <button 
              onClick={async () => {
                console.log('🔄 Starting bulk compliance sync...');
                for (const vehicle of vehicles) {
                  await fetchRealComplianceData(vehicle);
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
                console.log('✅ Bulk compliance sync completed!');
              }}
              className="px-3 py-1.5 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
              title="Sync compliance data"
            >
              Sync All
            </button>
            <button 
              onClick={() => {
                if (window.confirm('Clear all fleet data? This cannot be undone.')) {
                  console.log('🗑️ Clearing all fleet data...');
                  
                  // Clear persistent fleet storage
                  persistentFleetStorage.clearFleet();
                  console.log('✅ Persistent fleet storage cleared');
                  
                  // Clear reconciled vehicle data
                  localStorage.removeItem('vehicleReconciler_data');
                  console.log('✅ Reconciled vehicle data cleared');
                  
                  // Clear reconciler API cache
                  reconcilerAPI.clearCache();
                  console.log('✅ Reconciler API cache cleared');
                  
                  // Force reload all data
                  setTimeout(() => {
                    loadVehicles();
                    setSearchTerm(''); // Reset search
                    setStatusFilter('all'); // Reset filters
                    console.log('🎉 Fleet data cleared successfully!');
                  }, 100);
                }
              }}
              className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              title="Clear all fleet data"
            >
              Clear Fleet
            </button>
          </div>


      {/* Vehicle Display - Cards or Table */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {allFilteredVehicles.map((vehicle, index) => {
            // Check if this is a reconciled vehicle or regular vehicle
            const isReconciledVehicle = 'overallStatus' in vehicle;
            const cardData = isReconciledVehicle 
              ? mapReconciledVehicleToCardFormat(vehicle as VehicleSummaryView)
              : mapVehicleToCardFormat(vehicle as VehicleRecord);
            
            return (
              <MinimalisticVehicleCard
                key={isReconciledVehicle ? `reconciled-${vehicle.vin}` : (vehicle as VehicleRecord).id}
                vehicle={cardData.vehicle}
                compliance={cardData.compliance}
                onViewDetails={() => {
                  console.log('View details for vehicle:', vehicle.id);
                }}
                onScheduleService={() => {
                  console.log('Schedule service for vehicle:', vehicle.id);
                }}
                onEditVehicle={() => {
                  console.log('Edit vehicle:', vehicle.id);
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Truck</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Vehicle</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">VIN</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">License</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Status</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">DOT</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Registration</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Insurance</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">IFTA</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allFilteredVehicles.map((vehicle, index) => {
                const isReconciledVehicle = 'overallStatus' in vehicle;
                const compliance = getComplianceData(vehicle);
                return (
                <tr key={vehicle.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-3 text-center text-sm">
                    {vehicle.truckNumber ? 
                      vehicle.truckNumber.replace('Truck #', '#') : 
                      `#${vehicle.vin?.slice(-3) || '???'}`
                    }
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-mono">
                    {vehicle.vin.slice(-8)}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {vehicle.licensePlate}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      vehicle.status === 'active' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {vehicle.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {compliance.dotInspection.daysUntilExpiry !== null ? `${compliance.dotInspection.daysUntilExpiry}d` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {compliance.registration.daysUntilExpiry !== null ? `${compliance.registration.daysUntilExpiry}d` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {compliance.insurance.daysUntilExpiry !== null ? `${compliance.insurance.daysUntilExpiry}d` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {compliance.ifta.daysUntilExpiry !== null ? `${compliance.ifta.daysUntilExpiry}d` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    <div className="flex justify-center space-x-1">
                      <button className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded">
                        View
                      </button>
                      <button className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded">
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {allFilteredVehicles.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🚛</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles found</h3>
          <p className="text-gray-500">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Get started by adding vehicles individually or use bulk upload for multiple vehicles'
            }
          </p>
        </div>
      )}

      {/* Add Vehicle Modal */}
      <AddVehicleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onVehicleAdded={handleVehicleAdded}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onVehiclesAdded={handleVehiclesAdded}
      />

      {/* Document Upload Modal */}
      <DocumentUploadModal
        isOpen={isDocumentUploadOpen}
        onClose={() => {
          setIsDocumentUploadOpen(false);
          console.log('🔄 Modal closed, refreshing vehicles...');
          // Use setTimeout to ensure the modal has fully closed before refreshing
          setTimeout(() => {
            try {
              loadVehicles(); // Refresh vehicles after document processing
            } catch (error) {
              console.error('❌ Error refreshing vehicles:', error);
              window.location.reload(); // Fallback: reload the page
            }
          }, 100);
        }}
        onDocumentsProcessed={handleDocumentsProcessed}
      />

      {/* Multi-Batch Document Upload Modal */}
      <MultiBatchDocumentUploadModal
        isOpen={isMultiBatchUploadOpen}
        onClose={() => setIsMultiBatchUploadOpen(false)}
        onDocumentsReconciled={handleMultiBatchDocumentsReconciled}
      />

      {/* Test Runner Modal */}
      <TestRunnerModal
        isOpen={isTestRunnerOpen}
        onClose={() => setIsTestRunnerOpen(false)}
      />
    </div>
  );
};

// Compliance Dashboard Component
const CompliancePage: React.FC = () => {
  const [tasks, setTasks] = useState<ComplianceTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<ComplianceTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed' | 'overdue'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setTasks(fleetDataManager.getAllComplianceTasks());
    const unsubscribe = fleetDataManager.subscribe(() => {
      setTasks(fleetDataManager.getAllComplianceTasks());
    });
    return unsubscribe;
  }, []);

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = searchTerm === '' ||
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.vehicleVin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.vehicleName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const stats = fleetDataManager.getComplianceStats();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-gradient-to-r from-red-100 to-rose-100 text-red-800 border border-red-300 shadow-sm';
      case 'high': return 'bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 border border-orange-300 shadow-sm';
      case 'medium': return 'bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border border-yellow-300 shadow-sm';
      case 'low': return 'bg-gradient-to-r from-slate-100 to-gray-100 text-slate-700 border border-slate-300 shadow-sm';
      default: return 'bg-gradient-to-r from-slate-100 to-gray-100 text-slate-700 border border-slate-300 shadow-sm';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 border border-blue-300 shadow-sm';
      case 'in_progress': return 'bg-gradient-to-r from-purple-100 to-violet-100 text-purple-800 border border-purple-300 shadow-sm';
      case 'completed': return 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border border-emerald-300 shadow-sm';
      case 'overdue': return 'bg-gradient-to-r from-red-100 to-rose-100 text-red-800 border border-red-300 shadow-sm';
      default: return 'bg-gradient-to-r from-slate-100 to-gray-100 text-slate-700 border border-slate-300 shadow-sm';
    }
  };

  const getDueDateColor = (daysUntilDue: number) => {
    if (daysUntilDue < 0) return 'text-red-600'; // Overdue
    if (daysUntilDue <= 7) return 'text-orange-600'; // Due soon
    if (daysUntilDue <= 30) return 'text-yellow-600'; // Due this month
    return 'text-gray-600'; // Not urgent
  };

  const handleStatusUpdate = (taskId: string, newStatus: ComplianceTask['status']) => {
    fleetDataManager.updateTaskStatus(taskId, newStatus);
  };

  return (
    <div className="max-w-7xl">
      <h2 className="text-3xl font-bold mb-6">📋 Compliance Dashboard</h2>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="font-semibold text-blue-800">Total Tasks</div>
          <div className="text-3xl text-blue-600">{stats.total}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-800">Pending</div>
          <div className="text-3xl text-gray-600">{stats.pending}</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="font-semibold text-purple-800">In Progress</div>
          <div className="text-3xl text-purple-600">{stats.inProgress}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="font-semibold text-green-800">Completed</div>
          <div className="text-3xl text-green-600">{stats.completed}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="font-semibold text-red-800">Overdue</div>
          <div className="text-3xl text-red-600">{stats.overdue}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="font-semibold text-red-800">Critical</div>
          <div className="text-3xl text-red-600">{stats.critical}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="font-semibold text-orange-800">High Priority</div>
          <div className="text-3xl text-orange-600">{stats.high}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search tasks by title, vehicle, or VIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500
focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as 'all' | 'high' | 'medium' | 'low')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-900/30 transition-all duration-300 hover:scale-105 active:scale-95">
            ➕ Add Task
          </button>
        </div>
      </div>

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTasks.map((task) => (
          <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(task.priority)}`}>
                    {task.priority.toUpperCase()}
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(task.status)}`}>
                    {task.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">{task.title}</h3>
                <p className="text-sm text-gray-600 mb-3">{task.description}</p>

                <div className="text-sm text-gray-500 space-y-1">
                  <div>🚛 {task.vehicleName}</div>
                  <div className="font-mono">VIN: {task.vehicleVin.slice(-8)}</div>
                  <div>📋 {task.category}</div>
                  <div>👤 {task.assignedTo}</div>
                  {task.estimatedCost && (
                    <div>💰 ${task.estimatedCost.toLocaleString()}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">Due Date</span>
                <span className={`text-sm font-medium ${getDueDateColor(task.daysUntilDue)}`}>
                  {task.daysUntilDue < 0
                    ? `${Math.abs(task.daysUntilDue)} days overdue`
                    : `${task.daysUntilDue} days remaining`
                  }
                </span>
              </div>

              <div className="flex gap-2">
                {task.status === 'pending' && (
                  <button
                    onClick={() => handleStatusUpdate(task.id, 'in_progress')}
                    className="flex-1 px-3 py-2 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Start
                  </button>
                )}
                {task.status === 'in_progress' && (
                  <button
                    onClick={() => handleStatusUpdate(task.id, 'completed')}
                    className="flex-1 px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => setSelectedTask(task)}
                  className="flex-1 px-3 py-2 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTasks.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📋</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No compliance tasks found</h3>
          <p className="text-gray-500">
            {searchTerm || filterStatus !== 'all' || filterPriority !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Compliance tasks will appear here as vehicles are added to your fleet'
            }
          </p>
        </div>
      )}

      {/* Task Details Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedTask.title}</h3>
                <p className="text-gray-600">{selectedTask.vehicleName}</p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Description</h4>
                <p className="text-gray-700">{selectedTask.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Priority</h4>
                  <span className={`px-2 py-1 text-sm rounded ${getPriorityColor(selectedTask.priority)}`}>
                    {selectedTask.priority.toUpperCase()}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Status</h4>
                  <span className={`px-2 py-1 text-sm rounded ${getStatusColor(selectedTask.status)}`}>
                    {selectedTask.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Due Date</h4>
                  <p className="text-gray-700">{selectedTask.dueDate}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Assigned To</h4>
                  <p className="text-gray-700">{selectedTask.assignedTo}</p>
                </div>
              </div>

              {selectedTask.estimatedCost && (
                <div>
                  <h4 className="font-semibold mb-2">Estimated Cost</h4>
                  <p className="text-gray-700">${selectedTask.estimatedCost.toLocaleString()}</p>
                </div>
              )}

              {selectedTask.requiredDocuments && selectedTask.requiredDocuments.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Required Documents</h4>
                  <ul className="text-gray-700 space-y-1">
                    {selectedTask.requiredDocuments.map((doc, index) => (
                      <li key={index} className="flex items-center">
                        <span className="mr-2">📄</span>
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTask.filingUrl && (
                <div>
                  <h4 className="font-semibold mb-2">Filing URL</h4>
                  <a
                    href={selectedTask.filingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    {selectedTask.filingUrl}
                  </a>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                {selectedTask.status === 'pending' && (
                  <button
                    onClick={() => {
                      handleStatusUpdate(selectedTask.id, 'in_progress');
                      setSelectedTask(null);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Start Task
                  </button>
                )}
                {selectedTask.status === 'in_progress' && (
                  <button
                    onClick={() => {
                      handleStatusUpdate(selectedTask.id, 'completed');
                      setSelectedTask(null);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Mark Complete
                  </button>
                )}
                <button
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Modern Dashboard Component  
// DashboardPageProps is now imported from ./types

const DashboardPage: React.FC<DashboardPageProps> = ({ setCurrentPage }) => {
  const [fleetStats, setFleetStats] = useState(() => {
    const persistentVehicles = persistentFleetStorage.getFleet();
    const legacyStats = fleetDataManager.getFleetStats();
    const reconciledVehicles = reconcilerAPI.getAllVehicleSummaries();
    return {
      total: persistentVehicles.length + legacyStats.total + reconciledVehicles.length,
      active: persistentVehicles.filter(v => v.status === 'active').length + legacyStats.active + reconciledVehicles.filter(v => v.status === 'active' || !v.status).length,
      inactive: persistentVehicles.filter(v => v.status === 'inactive').length + legacyStats.inactive + reconciledVehicles.filter(v => v.status === 'inactive').length,
      complianceExpired: legacyStats.complianceExpired
    };
  });
  const [complianceStats, setComplianceStats] = useState(fleetDataManager.getComplianceStats());

  const updateStats = () => {
    const persistentVehicles = persistentFleetStorage.getFleet();
    const legacyStats = fleetDataManager.getFleetStats();
    const reconciledVehicles = reconcilerAPI.getAllVehicleSummaries();
    setFleetStats({
      total: persistentVehicles.length + legacyStats.total + reconciledVehicles.length,
      active: persistentVehicles.filter(v => v.status === 'active').length + legacyStats.active + reconciledVehicles.filter(v => v.status === 'active' || !v.status).length,
      inactive: persistentVehicles.filter(v => v.status === 'inactive').length + legacyStats.inactive + reconciledVehicles.filter(v => v.status === 'inactive').length,
      complianceExpired: legacyStats.complianceExpired
    });
    setComplianceStats(fleetDataManager.getComplianceStats());
  };

  useEffect(() => {
    const unsubscribe = fleetDataManager.subscribe(updateStats);
    // Also update stats on component mount to get latest data
    updateStats();
    return unsubscribe;
  }, []);


  return (
    <div className="space-y-8">
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

      {/* Simplified Compliance Score */}
      <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Compliance Status</h3>
        
        <div className="flex items-center justify-center mb-6">
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="35" stroke="#e5e7eb" strokeWidth="8" fill="none" />
              <circle 
                cx="50" cy="50" r="35" 
                stroke="#10b981" strokeWidth="8" fill="none"
strokeDasharray="0 220"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-gray-500">--</span>
              <span className="text-sm text-gray-600">No Data</span>
            </div>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">DOT Compliance</span>
            <span className="font-semibold text-gray-500">--</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Insurance</span>
            <span className="font-semibold text-gray-500">--</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Inspections</span>
            <span className="font-semibold text-gray-500">--</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Quick Actions</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => setCurrentPage('onboarding')}
            className="flex items-center p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            <span className="text-2xl mr-3">📁</span>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Add Vehicles</div>
              <div className="text-sm text-gray-600">Upload or add manually</div>
            </div>
          </button>
          
          <button 
            onClick={() => setCurrentPage('fleet')}
            className="flex items-center p-4 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 transition-colors"
          >
            <span className="text-2xl mr-3">🚛</span>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Manage Fleet</div>
              <div className="text-sm text-gray-600">View all vehicles</div>
            </div>
          </button>
          
          <button 
            onClick={() => setCurrentPage('comprehensive-compliance')}
            className="flex items-center p-4 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors"
          >
            <span className="text-2xl mr-3">🛡️</span>
            <div className="text-left">
              <div className="font-semibold text-gray-900">Compliance</div>
              <div className="text-sm text-gray-600">Monitor alerts</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function AppContent() {
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
          
          {/* User Info */}
          {authService.getCurrentUser() && (
            <div className="bg-slate-700/50 rounded-lg p-3 mt-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold">
                  {authService.getCurrentUser()?.firstName?.[0]}{authService.getCurrentUser()?.lastName?.[0]}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">
                    {authService.getCurrentUser()?.firstName} {authService.getCurrentUser()?.lastName}
                  </p>
                  <p className="text-slate-300 text-xs">{authService.getCurrentUser()?.role}</p>
                </div>
              </div>
              <div className="text-slate-300 text-xs mb-2">
                {authService.getCurrentCompany()?.name}
              </div>
              <button
                onClick={() => authService.logout()}
                className="w-full text-center px-3 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          )}

          {/* Fleet Overview Badge */}
          <div className="bg-slate-700/50 rounded-lg p-3 mt-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 text-sm">Total Fleet</span>
              <span className="text-white font-bold text-lg">
                {persistentFleetStorage.getFleet().length + fleetDataManager.getFleetStats().total}
              </span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-slate-300 text-sm">Compliance Score</span>
              <span className="text-gray-400 font-bold">--</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-slate-300 text-xs">
                {persistentFleetStorage.getFleet().length > 0 ? 'Live Fleet Data' : 'No Data'}
              </span>
              <span className="text-blue-400 text-xs">
                {persistentFleetStorage.getFleet().length > 0 ? '🟢 Active' : '⚪ Empty'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full text-left px-4 py-4 rounded-xl flex items-center space-x-4 transition-all duration-200 group ${
                currentPage === item.id 
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg transform scale-105' 
                  : 'hover:bg-slate-700/50 hover:transform hover:translate-x-1'
              }`}
            >
              <span className={`text-2xl transition-transform duration-200 ${
                currentPage === item.id ? 'transform scale-110' : 'group-hover:scale-110'
              }`}>
                {item.icon}
              </span>
              <div>
                <span className={`font-medium ${
                  currentPage === item.id ? 'text-white' : 'text-slate-200'
                }`}>
                  {item.label}
                </span>
                {currentPage === item.id && (
                  <div className="w-2 h-2 bg-white rounded-full mt-1"></div>
                )}
              </div>
            </button>
          ))}
        </nav>

        {/* Bottom Status */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>System Online</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Last sync: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Header Bar */}
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
              {/* Quick Stats */}
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

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {currentPage === 'dashboard' && <DashboardPage setCurrentPage={setCurrentPage} />}
            {currentPage === 'onboarding' && <OnboardingPage setCurrentPage={setCurrentPage} />}
            {currentPage === 'fleet' && <FleetPage />}
            {currentPage === 'drivers' && <DriverManagementPage />}
            {currentPage === 'reports' && <ReportingDashboard />}
            {currentPage === 'compliance' && <CompliancePage />}
            {currentPage === 'comprehensive-compliance' && (
              <ComprehensiveComplianceDashboard 
                vehicles={fleetDataManager.getAllVehicles().map(v => ({
                  id: v.id,
                  vin: v.vin,
                  make: v.make,
                  model: v.model,
                  year: v.year,
                  dotNumber: v.dotNumber
                }))}
              />
            )}
            {currentPage === 'reports' && (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-gradient-to-r from-blue-100 to-blue-200 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">📈</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-800 mb-4">Advanced Reports</h2>
                <p className="text-slate-600 text-lg max-w-md mx-auto">
                  Comprehensive fleet analytics and reporting tools are coming soon to help you make data-driven decisions.
                </p>
                <button className="mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 hover:shadow-2xl hover:shadow-blue-900/30 transition-all duration-300 hover:scale-105 active:scale-95">
                  🚀 Request Early Access
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// Main App with Error Boundary and Notifications
function App() {
  return (
    <ErrorBoundary>
      <AuthWrapper>
        <AppContent />
      </AuthWrapper>
      <NotificationSystem />
    </ErrorBoundary>
  );
}

export default App;