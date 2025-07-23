import React, { useState, useEffect } from 'react';

// Types and interfaces
interface ParsedVIN {
  vin: string;
  isValid: boolean;
  row: number;
}

interface ProcessedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  fuelType: string;
  maxWeight: number;
  vehicleClass: string;
  status: 'success' | 'failed';
  complianceTasks: number;
}

interface FleetVehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  status: 'active' | 'maintenance' | 'inactive';
  mileage: number;
  fuelType: string;
  maxWeight: number;
  vehicleClass: string;
  dotNumber: string;
  mcNumber: string;
  purchaseDate: string;
  lastServiceDate?: string;
  nextServiceDue?: string;
  compliance: {
    dotInspection: ComplianceItem;
    registration: ComplianceItem;
    insurance: ComplianceItem;
    ifta: ComplianceItem;
    statePermits: ComplianceItem;
    emissions: ComplianceItem;
    weightCert: ComplianceItem;
  };
}

interface ComplianceItem {
  status: 'compliant' | 'warning' | 'expired';
  expiryDate: string;
  daysUntilExpiry: number;
}

interface ComplianceTask {
  id: string;
  vehicleId: string;
  vehicleVin: string;
  vehicleName: string;
  title: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  dueDate: string;
  daysUntilDue: number;
  assignedTo: string;
  estimatedCost?: number;
  jurisdiction: string;
  documentationRequired: boolean;
  requiredDocuments?: string[];
  uploadedDocuments?: string[];
  filingUrl?: string;
  createdDate: string;
  updatedDate: string;
  completedDate?: string;
}

// Data Management System
class FleetDataManager {
  private vehicles: FleetVehicle[] = [];
  private complianceTasks: ComplianceTask[] = [];
  private subscribers: (() => void)[] = [];

  constructor() {
    this.loadDemoData();
  }

  private loadDemoData() {
    // Demo vehicle data
    const demoVehicles: FleetVehicle[] = [
      {
        id: 'demo-1',
        vin: '1HGCM82633A123456',
        make: 'Freightliner',
        model: 'Cascadia',
        year: 2022,
        licensePlate: 'TRK-001',
        status: 'active',
        mileage: 125000,
        fuelType: 'Diesel',
        maxWeight: 80000,
        vehicleClass: 'Class 8',
        dotNumber: 'DOT123456',
        mcNumber: 'MC789012',
        purchaseDate: '2022-01-15',
        lastServiceDate: '2024-06-15',
        nextServiceDue: '2024-12-15',
        compliance: {
          dotInspection: { status: 'compliant', expiryDate: '2025-03-15', daysUntilExpiry: 245 },
          registration: { status: 'compliant', expiryDate: '2025-01-31', daysUntilExpiry: 200 },
          insurance: { status: 'warning', expiryDate: '2024-12-31', daysUntilExpiry: 45 },
          ifta: { status: 'compliant', expiryDate: '2024-12-31', daysUntilExpiry: 45 },
          statePermits: { status: 'expired', expiryDate: '2024-07-15', daysUntilExpiry: -7 },
          emissions: { status: 'compliant', expiryDate: '2025-06-30', daysUntilExpiry: 300 },
          weightCert: { status: 'compliant', expiryDate: '2025-01-15', daysUntilExpiry: 184 }
        }
      }
    ];

    // Demo compliance tasks
    const demoTasks: ComplianceTask[] = [
      {
        id: 'task-001',
        vehicleId: 'demo-1',
        vehicleVin: '1HGCM82633A123456',
        vehicleName: '2022 Freightliner Cascadia',
        title: 'State Permits Renewal - URGENT',
        description: 'Renew expired state operating permits for California, Nevada, and Arizona operations',
        category: 'Permits & Licenses',
        priority: 'critical',
        status: 'overdue',
        dueDate: '2024-07-15',
        daysUntilDue: -7,
        assignedTo: 'Fleet Manager',
        estimatedCost: 450,
        jurisdiction: 'State',
        documentationRequired: true,
        requiredDocuments: ['Operating permit application', 'Insurance certificate', 'DOT registration'],
        uploadedDocuments: [],
        filingUrl: 'https://permits.ca.gov',
        createdDate: '2024-07-01',
        updatedDate: '2024-07-22'
      },
      {
        id: 'task-002',
        vehicleId: 'demo-1',
        vehicleVin: '1HGCM82633A123456',
        vehicleName: '2022 Freightliner Cascadia',
        title: 'Insurance Policy Review',
        description: 'Review and renew commercial vehicle insurance policy before expiration',
        category: 'Insurance',
        priority: 'high',
        status: 'pending',
        dueDate: '2024-12-01',
        daysUntilDue: 45,
        assignedTo: 'Insurance Coordinator',
        estimatedCost: 2500,
        jurisdiction: 'Federal',
        documentationRequired: true,
        requiredDocuments: ['Current policy', 'Claims history', 'Vehicle appraisals'],
        uploadedDocuments: ['current_policy_2024.pdf'],
        createdDate: '2024-07-10',
        updatedDate: '2024-07-20'
      },
      {
        id: 'task-003',
        vehicleId: 'demo-1',
        vehicleVin: '1HGCM82633A123456',
        vehicleName: '2022 Freightliner Cascadia',
        title: 'IFTA Q4 Filing',
        description: 'Submit quarterly International Fuel Tax Agreement report for Q4 2024',
        category: 'Tax Filings',
        priority: 'high',
        status: 'pending',
        dueDate: '2025-01-31',
        daysUntilDue: 162,
        assignedTo: 'Tax Specialist',
        estimatedCost: 150,
        jurisdiction: 'Federal',
        documentationRequired: true,
        requiredDocuments: ['Fuel receipts', 'Mileage logs', 'Trip records'],
        uploadedDocuments: [],
        filingUrl: 'https://www.iftach.org',
        createdDate: '2024-07-01',
        updatedDate: '2024-07-15'
      }
    ];

    this.vehicles = demoVehicles;
    this.complianceTasks = demoTasks;
  }

  subscribe(callback: () => void) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notify() {
    this.subscribers.forEach(callback => callback());
  }

  getAllVehicles(): FleetVehicle[] {
    return [...this.vehicles];
  }

  getAllComplianceTasks(): ComplianceTask[] {
    return [...this.complianceTasks];
  }

  addVehicles(processedVehicles: ProcessedVehicle[]): FleetVehicle[] {
    const newVehicles: FleetVehicle[] = processedVehicles
      .filter(v => v.status === 'success')
      .map(vehicle => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        licensePlate: `TRK-${vehicle.vin.slice(-3)}`,
        status: 'active' as const,
        mileage: Math.floor(Math.random() * 50000) + 10000,
        fuelType: vehicle.fuelType,
        maxWeight: vehicle.maxWeight,
        vehicleClass: vehicle.vehicleClass,
        dotNumber: `DOT${Math.floor(Math.random() * 900000) + 100000}`,
        mcNumber: `MC${Math.floor(Math.random() * 900000) + 100000}`,
        purchaseDate: new Date().toISOString().split('T')[0],
        compliance: {
          dotInspection: { status: 'compliant', expiryDate: '2025-07-22', daysUntilExpiry: 365 },
          registration: { status: 'compliant', expiryDate: '2025-06-22', daysUntilExpiry: 335 },
          insurance: { status: 'compliant', expiryDate: '2025-05-22', daysUntilExpiry: 304 },
          ifta: { status: 'compliant', expiryDate: '2024-12-31', daysUntilExpiry: 162 },
          statePermits: { status: 'compliant', expiryDate: '2025-04-22', daysUntilExpiry: 274 },
          emissions: { status: 'compliant', expiryDate: '2025-08-22', daysUntilExpiry: 396 },
          weightCert: { status: 'compliant', expiryDate: '2025-03-22', daysUntilExpiry: 243 }
        }
      }));

    this.vehicles.push(...newVehicles);

    // Generate compliance tasks for new vehicles
    newVehicles.forEach(vehicle => {
      this.generateComplianceTasksForVehicle(vehicle);
    });

    this.notify();
    return newVehicles;
  }

  private generateComplianceTasksForVehicle(vehicle: FleetVehicle) {
    const tasks: Omit<ComplianceTask, 'id' | 'createdDate' | 'updatedDate'>[] = [
      {
        vehicleId: vehicle.id,
        vehicleVin: vehicle.vin,
        vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        title: 'Annual DOT Inspection',
        description: 'Schedule and complete mandatory annual DOT safety inspection',
        category: 'Safety & Inspections',
        priority: 'high',
        status: 'pending',
        dueDate: new Date(Date.now() + 350 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        daysUntilDue: 350,
        assignedTo: 'Fleet Manager',
        estimatedCost: 200,
        jurisdiction: 'Federal',
        documentationRequired: true,
        requiredDocuments: ['Inspection certificate', 'Maintenance records'],
        uploadedDocuments: []
      },
      {
        vehicleId: vehicle.id,
        vehicleVin: vehicle.vin,
        vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        title: 'Registration Renewal',
        description: 'Renew vehicle registration before expiration',
        category: 'Registration & Titles',
        priority: 'medium',
        status: 'pending',
        dueDate: new Date(Date.now() + 320 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        daysUntilDue: 320,
        assignedTo: 'Fleet Manager',
        estimatedCost: 150,
        jurisdiction: 'State',
        documentationRequired: true,
        requiredDocuments: ['Title', 'Insurance proof'],
        uploadedDocuments: []
      }
    ];

    const newTasks = tasks.map(task => ({
      ...task,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString()
    }));

    this.complianceTasks.push(...newTasks);
  }

  updateTaskStatus(taskId: string, status: ComplianceTask['status'], notes?: string) {
    const taskIndex = this.complianceTasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      this.complianceTasks[taskIndex] = {
        ...this.complianceTasks[taskIndex],
        status,
        updatedDate: new Date().toISOString(),
        completedDate: status === 'completed' ? new Date().toISOString() : undefined
      };
      this.notify();
    }
  }

  getFleetStats() {
    const total = this.vehicles.length;
    const active = this.vehicles.filter(v => v.status === 'active').length;
    const maintenance = this.vehicles.filter(v => v.status === 'maintenance').length;
    const inactive = this.vehicles.filter(v => v.status === 'inactive').length;

    // Compliance warnings and expirations
    let warnings = 0;
    let expired = 0;

    this.vehicles.forEach(vehicle => {
      Object.values(vehicle.compliance).forEach(item => {
        if (item.status === 'warning') warnings++;
        if (item.status === 'expired') expired++;
      });
    });

    return {
      total,
      active,
      maintenance,
      inactive,
      complianceWarnings: warnings,
      complianceExpired: expired
    };
  }

  getComplianceStats() {
    const total = this.complianceTasks.length;
    const pending = this.complianceTasks.filter(t => t.status === 'pending').length;
    const inProgress = this.complianceTasks.filter(t => t.status === 'in_progress').length;
    const completed = this.complianceTasks.filter(t => t.status === 'completed').length;
    const overdue = this.complianceTasks.filter(t => t.status === 'overdue').length;
    const critical = this.complianceTasks.filter(t => t.priority === 'critical').length;
    const high = this.complianceTasks.filter(t => t.priority === 'high').length;

    return {
      total,
      pending,
      inProgress,
      completed,
      overdue,
      critical,
      high
    };
  }
}

// Global fleet data manager
const fleetDataManager = new FleetDataManager();

// Utility functions
const validateVIN = (vin: string): boolean => {
  if (!vin || typeof vin !== 'string') return false;
  const cleanVIN = vin.toUpperCase().trim();
  return cleanVIN.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(cleanVIN);
};

const parseCSVFile = async (file: File): Promise<ParsedVIN[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        const parsedVINs: ParsedVIN[] = [];
        lines.forEach((line, index) => {
          const columns = line.split(',').map(col => col.trim().replace(/['"]/g, ''));
          const potentialVIN = columns[0];

          if (index === 0 && potentialVIN.toLowerCase() === 'vin') {
            return;
          }

          if (potentialVIN) {
            parsedVINs.push({
              vin: potentialVIN.toUpperCase(),
              isValid: validateVIN(potentialVIN),
              row: index + 1
            });
          }
        });

        resolve(parsedVINs);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

const generateVehicleData = (vin: string): ProcessedVehicle => {
  const makes = ['Peterbilt', 'Kenworth', 'Freightliner', 'Volvo', 'Mack', 'International'];
  const models = ['579', '680', 'Cascadia', 'VNL', 'Anthem', 'LT'];
  const fuelTypes = ['Diesel', 'CNG', 'Electric'];

  const makeIndex = vin.charCodeAt(0) % makes.length;
  const modelIndex = vin.charCodeAt(1) % models.length;
  const fuelIndex = vin.charCodeAt(2) % fuelTypes.length;
  const year = 2018 + (vin.charCodeAt(3) % 6);
  const maxWeight = 60000 + (vin.charCodeAt(4) % 20000);
  const complianceTasks = 2 + (vin.charCodeAt(5) % 4);

  return {
    vin,
    year,
    make: makes[makeIndex],
    model: models[modelIndex],
    fuelType: fuelTypes[fuelIndex],
    maxWeight,
    vehicleClass: 'Class 8',
    status: Math.random() > 0.1 ? 'success' : 'failed',
    complianceTasks
  };
};

const downloadSampleCSV = () => {
  const csvContent = `VIN
1HGBH41JXMN109186
1FTFW1ET5DKE96708
3C6UR5CL2FG123456
5UXWX9C59F0A12345
JH4KA8260PC123456`;

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = 'vin_sample.csv';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

// Enhanced Onboarding Component
interface OnboardingPageProps {
  setCurrentPage: (page: string) => void;
}

const OnboardingPage: React.FC<OnboardingPageProps> = ({ setCurrentPage }) => {
  const [step, setStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedVINs, setParsedVINs] = useState<ParsedVIN[]>([]);
  const [processedVehicles, setProcessedVehicles] = useState<ProcessedVehicle[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

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

    const processed: ProcessedVehicle[] = [];

    for (let i = 0; i < validVINs.length; i++) {
      const vin = validVINs[i].vin;
      const progress = Math.round(((i + 1) / validVINs.length) * 60);

      setProcessingStatus(`Processing VIN ${i + 1} of ${validVINs.length}: ${vin}`);
      setProcessingProgress(progress);

      await new Promise(resolve => setTimeout(resolve, 800));

      const vehicleData = generateVehicleData(vin);
      processed.push(vehicleData);
    }

    setProcessingStatus('Generating compliance tasks...');
    setProcessingProgress(80);
    await new Promise(resolve => setTimeout(resolve, 1000));

    setProcessingStatus('Finalizing profiles...');
    setProcessingProgress(100);
    await new Promise(resolve => setTimeout(resolve, 500));

    setProcessedVehicles(processed);
    setIsProcessing(false);
    setStep(3);
  };

  const completeOnboarding = () => {
    fleetDataManager.addVehicles(processedVehicles);
    setStep(4);
  };

  const resetOnboarding = () => {
    setStep(1);
    setUploadedFile(null);
    setParsedVINs([]);
    setProcessedVehicles([]);
    setProcessingProgress(0);
    setProcessingStatus('');
    setError(null);
    setIsProcessing(false);
  };

  return (
    <div className="max-w-6xl">
      <h2 className="text-3xl font-bold mb-6">📁 Fleet Onboarding</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <span className="text-red-600 text-xl mr-2">⚠️</span>
            <div>
              <h4 className="font-semibold text-red-800">Error</h4>
              <p className="text-red-700">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex mb-8 space-x-2">
        {[
          { num: 1, label: 'Upload' },
          { num: 2, label: 'Process' },
          { num: 3, label: 'Review' },
          { num: 4, label: 'Complete' }
        ].map(({ num, label }) => (
          <div key={num} className={`flex-1 text-center py-3 px-4 rounded-lg ${
            step >= num ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            <div className="font-semibold">Step {num}</div>
            <div className="text-sm">{label}</div>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div>
          <h3 className="text-2xl font-semibold mb-4">Upload VIN List</h3>
          <p className="text-gray-600 mb-6">Upload a CSV file containing vehicle identification numbers. The first column
should contain VINs.</p>

          <div className="border-2 border-dashed border-blue-400 rounded-lg p-12 text-center mb-6 bg-blue-50">
            <div className="mb-4"><span className="text-4xl">📁</span></div>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="mb-4 block mx-auto"
              disabled={isProcessing}
            />
            <p className="text-gray-600 mb-2">Drag and drop your CSV file here, or click to browse</p>
            <p className="text-sm text-gray-500">Supported formats: .csv, .txt • Max size: 5MB</p>
          </div>

          <div className="mb-6">
            <button
              onClick={downloadSampleCSV}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm"
            >
              📥 Download Sample CSV
            </button>
          </div>

          {uploadedFile && parsedVINs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="font-semibold mb-4">File Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 p-3 rounded">
                  <div className="font-semibold text-blue-800">Total VINs</div>
                  <div className="text-2xl text-blue-600">{parsedVINs.length}</div>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <div className="font-semibold text-green-800">Valid VINs</div>
                  <div className="text-2xl text-green-600">{parsedVINs.filter(v => v.isValid).length}</div>
                </div>
                <div className="bg-red-50 p-3 rounded">
                  <div className="font-semibold text-red-800">Invalid VINs</div>
                  <div className="text-2xl text-red-600">{parsedVINs.filter(v => !v.isValid).length}</div>
                </div>
              </div>

              <div>
                <h5 className="font-medium mb-2">VIN Preview (first 5):</h5>
                <div className="bg-gray-50 p-3 rounded max-h-40 overflow-y-auto">
                  {parsedVINs.slice(0, 5).map((vinData, index) => (
                    <div key={index} className="flex justify-between items-center py-1 border-b border-gray-200
last:border-b-0">
                      <span className="font-mono text-sm">{vinData.vin}</span>
                      <span className={`text-sm px-2 py-1 rounded ${
                        vinData.isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {vinData.isValid ? '✅ Valid' : '❌ Invalid'}
                      </span>
                    </div>
                  ))}
                  {parsedVINs.length > 5 && (
                    <div className="text-center text-gray-500 text-sm mt-2">
                      ... and {parsedVINs.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {parsedVINs.filter(v => v.isValid).length > 0 && (
            <button
              onClick={startProcessing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium text-lg"
            >
              Process {parsedVINs.filter(v => v.isValid).length} Valid VINs →
            </button>
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
          <h3 className="text-2xl font-semibold mb-4">Review Results</h3>
          <p className="text-gray-600 mb-6">Review your processed vehicles before completing onboarding.</p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="font-semibold text-blue-800">Total Processed</div>
              <div className="text-2xl text-blue-600">{processedVehicles.length}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="font-semibold text-green-800">Successful</div>
              <div className="text-2xl text-green-600">{processedVehicles.filter(v => v.status === 'success').length}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="font-semibold text-red-800">Failed</div>
              <div className="text-2xl text-red-600">{processedVehicles.filter(v => v.status === 'failed').length}</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="font-semibold text-purple-800">Compliance Tasks</div>
              <div className="text-2xl text-purple-600">{processedVehicles.reduce((sum, v) => sum + v.complianceTasks,
0)}</div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h4 className="font-semibold">Processed Vehicles</h4>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {processedVehicles.map((vehicle, index) => (
                <div key={index} className={`p-4 border-b last:border-b-0 ${
                  vehicle.status === 'success' ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-medium text-lg">{vehicle.year} {vehicle.make} {vehicle.model}</h5>
                      <p className="text-sm text-gray-600 font-mono">VIN: {vehicle.vin}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-sm">
                        <span className="bg-gray-100 px-2 py-1 rounded">{vehicle.vehicleClass}</span>
                        <span className="bg-blue-100 px-2 py-1 rounded">{vehicle.fuelType}</span>
                        <span className="bg-yellow-100 px-2 py-1 rounded">{vehicle.maxWeight.toLocaleString()} lbs</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                        vehicle.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {vehicle.status === 'success' ? '✅ Success' : '❌ Failed'}
                      </span>
                      <div className="text-sm text-gray-600 mt-1">
                        {vehicle.complianceTasks} compliance tasks
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={completeOnboarding}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium text-lg"
          >
            Complete Onboarding & Add to Fleet →
          </button>
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
              <div>✅ {processedVehicles.filter(v => v.status === 'success').length} vehicles added to Fleet Management</div>
              <div>✅ {processedVehicles.reduce((sum, v) => sum + v.complianceTasks, 0)} compliance tasks generated</div>
              <div>✅ Vehicle profiles created and validated</div>
              <div>✅ Dashboard updated with new fleet data</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => setCurrentPage('fleet')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              🚛 View Fleet Management
            </button>
            <button
              onClick={() => setCurrentPage('compliance')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              📋 View Compliance Tasks
            </button>
            <button
              onClick={resetOnboarding}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              📁 Start New Onboarding
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Fleet Management Component
const FleetPage: React.FC = () => {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'maintenance' | 'inactive'>('all');

  useEffect(() => {
    setVehicles(fleetDataManager.getAllVehicles());
    const unsubscribe = fleetDataManager.subscribe(() => {
      setVehicles(fleetDataManager.getAllVehicles());
    });
    return unsubscribe;
  }, []);

  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = searchTerm === '' ||
      vehicle.vin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.licensePlate.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = fleetDataManager.getFleetStats();

  const getComplianceStatusColor = (item: ComplianceItem) => {
    switch (item.status) {
      case 'compliant': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'expired': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getComplianceIcon = (item: ComplianceItem) => {
    switch (item.status) {
      case 'compliant': return '✅';
      case 'warning': return '⚠️';
      case 'expired': return '❌';
      default: return '❓';
    }
  };

  return (
    <div className="max-w-7xl">
      <h2 className="text-3xl font-bold mb-6">🚛 Fleet Management</h2>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="font-semibold text-blue-800">Total Fleet</div>
          <div className="text-3xl text-blue-600">{stats.total}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="font-semibold text-green-800">Active</div>
          <div className="text-3xl text-green-600">{stats.active}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="font-semibold text-orange-800">Maintenance</div>
          <div className="text-3xl text-orange-600">{stats.maintenance}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-800">Inactive</div>
          <div className="text-3xl text-gray-600">{stats.inactive}</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="font-semibold text-yellow-800">Warnings</div>
          <div className="text-3xl text-yellow-600">{stats.complianceWarnings}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="font-semibold text-red-800">Expired</div>
          <div className="text-3xl text-red-600">{stats.complianceExpired}</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by VIN, make, model, or license plate..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500
focus:border-blue-500"
          />
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          + Add Vehicle
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VIN</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">License</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOT</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase
tracking-wider">Registration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insurance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IFTA</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVehicles.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <div>
                      <div className="font-medium text-gray-900">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </div>
                      <div className="text-sm text-gray-500">
                        {vehicle.vehicleClass} • {vehicle.fuelType} • {vehicle.maxWeight.toLocaleString()} lbs
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm">{vehicle.vin.slice(-8)}</span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-900">
                    {vehicle.licensePlate}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      vehicle.status === 'active' ? 'bg-green-100 text-green-800' :
                      vehicle.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {vehicle.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className={`flex items-center text-xs px-2 py-1 rounded
${getComplianceStatusColor(vehicle.compliance.dotInspection)}`}>
                      <span className="mr-1">{getComplianceIcon(vehicle.compliance.dotInspection)}</span>
                      {vehicle.compliance.dotInspection.daysUntilExpiry}d
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className={`flex items-center text-xs px-2 py-1 rounded
${getComplianceStatusColor(vehicle.compliance.registration)}`}>
                      <span className="mr-1">{getComplianceIcon(vehicle.compliance.registration)}</span>
                      {vehicle.compliance.registration.daysUntilExpiry}d
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className={`flex items-center text-xs px-2 py-1 rounded
${getComplianceStatusColor(vehicle.compliance.insurance)}`}>
                      <span className="mr-1">{getComplianceIcon(vehicle.compliance.insurance)}</span>
                      {vehicle.compliance.insurance.daysUntilExpiry}d
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className={`flex items-center text-xs px-2 py-1 rounded
${getComplianceStatusColor(vehicle.compliance.ifta)}`}>
                      <span className="mr-1">{getComplianceIcon(vehicle.compliance.ifta)}</span>
                      {vehicle.compliance.ifta.daysUntilExpiry}d
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="flex space-x-2">
                      <button className="text-blue-600 hover:text-blue-800">View</button>
                      <button className="text-gray-600 hover:text-gray-800">Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredVehicles.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🚛</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles found</h3>
            <p className="text-gray-500">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Get started by adding vehicles through Fleet Onboarding'
              }
            </p>
          </div>
        )}
      </div>
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
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
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
            onChange={(e) => setFilterStatus(e.target.value as any)}
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
            onChange={(e) => setFilterPriority(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Add Task
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

            <div className="border-t pt-4">
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

// Dashboard Component
const DashboardPage: React.FC = () => {
  const [fleetStats, setFleetStats] = useState(fleetDataManager.getFleetStats());
  const [complianceStats, setComplianceStats] = useState(fleetDataManager.getComplianceStats());

  useEffect(() => {
    const unsubscribe = fleetDataManager.subscribe(() => {
      setFleetStats(fleetDataManager.getFleetStats());
      setComplianceStats(fleetDataManager.getComplianceStats());
    });
    return unsubscribe;
  }, []);

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">📊 Dashboard</h2>
      <p className="text-gray-600 mb-8">Welcome to the TruckBo Automation System!</p>

      {/* Fleet Overview */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Fleet Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="font-semibold text-blue-800">Total Vehicles</div>
            <div className="text-2xl text-blue-600">{fleetStats.total}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="font-semibold text-green-800">Active</div>
            <div className="text-2xl text-green-600">{fleetStats.active}</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="font-semibold text-yellow-800">Warnings</div>
            <div className="text-2xl text-yellow-600">{fleetStats.complianceWarnings}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="font-semibold text-red-800">Expired</div>
            <div className="text-2xl text-red-600">{fleetStats.complianceExpired}</div>
          </div>
        </div>
      </div>

      {/* Compliance Overview */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Compliance Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="font-semibold text-blue-800">Total Tasks</div>
            <div className="text-2xl text-blue-600">{complianceStats.total}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="font-semibold text-gray-800">Pending</div>
            <div className="text-2xl text-gray-600">{complianceStats.pending}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="font-semibold text-purple-800">In Progress</div>
            <div className="text-2xl text-purple-600">{complianceStats.inProgress}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="font-semibold text-green-800">Completed</div>
            <div className="text-2xl text-green-600">{complianceStats.completed}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="font-semibold text-red-800">Overdue</div>
            <div className="text-2xl text-red-600">{complianceStats.overdue}</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="font-semibold mb-2">📁 Onboard New Fleet</h4>
            <p className="text-gray-600 text-sm mb-4">Upload VIN lists to quickly add vehicles to your fleet.</p>
            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Start Onboarding
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="font-semibold mb-2">🚛 Manage Fleet</h4>
            <p className="text-gray-600 text-sm mb-4">View and manage your fleet vehicles and compliance status.</p>
            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              View Fleet
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="font-semibold mb-2">📋 Review Tasks</h4>
            <p className="text-gray-600 text-sm mb-4">Check compliance tasks and upcoming deadlines.</p>
            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              View Compliance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'onboarding', label: 'Fleet Onboarding', icon: '📁' },
    { id: 'fleet', label: 'Fleet Management', icon: '🚛' },
    { id: 'compliance', label: 'Compliance', icon: '📋' },
    { id: 'reports', label: 'Reports', icon: '📈' }
  ];

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-blue-900 text-white">
        <div className="p-4">
          <h1 className="text-xl font-bold">🚚 TruckBo</h1>
          <p className="text-blue-200 text-sm">Automation System</p>
        </div>

        <nav className="mt-8">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full text-left px-4 py-3 flex items-center space-x-3 hover:bg-blue-800 ${
                currentPage === item.id ? 'bg-blue-800 border-r-2 border-white' : ''
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          {currentPage === 'dashboard' && <DashboardPage />}
          {currentPage === 'onboarding' && <OnboardingPage setCurrentPage={setCurrentPage} />}
          {currentPage === 'fleet' && <FleetPage />}
          {currentPage === 'compliance' && <CompliancePage />}
          {currentPage === 'reports' && (
            <div>
              <h2 className="text-2xl font-bold mb-4">📈 Reports</h2>
              <p>Fleet reports and analytics coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;