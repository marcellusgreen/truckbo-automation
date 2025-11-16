import { useCallback, useState } from 'react';
import type { OnboardingMethod, ParsedVIN } from '../types';
import { parseCSVFile, validateVIN } from '../utils';
import {
  dataInputService,
  type EnhancedVehicleData,
  type ManualEntryTemplate
} from '../services/dataInputService';
import type { ExtractedVehicleData } from '../services/documentProcessor';
import {
  centralizedFleetDataService,
  type DataSyncResult
} from '../services/centralizedFleetDataService';
import {
  fleetStorageAdapter,
  type FleetAdapterResult,
  type FleetVehicleInput
} from '../services/fleetStorageAdapter';
import { isOnboardingHookEnabled } from '../utils/featureFlags';
import { isRefactorDebugEnabled, refactorDebugLog } from '../utils/refactorDebug';
import type { DocumentProcessingJobRecord } from '../../shared/services/documentProcessingJobs';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const logHookEvent = (event: string, details?: Record<string, unknown>) => {
  if (isRefactorDebugEnabled()) {
    refactorDebugLog('useOnboardingFlow', event, details);
  }
};

type ExtractionWithMetadata = ExtractedVehicleData & {
  job?: DocumentProcessingJobRecord;
  database?: {
    saved?: boolean;
    error?: string;
    documentId?: string;
    vehicleId?: string;
    driverId?: string;
    warnings?: string[];
    errors?: string[];
  };
};

export interface ManualEntryState {
  vin: string;
  template: ManualEntryTemplate;
  existingData?: EnhancedVehicleData;
}

export interface DocumentJobSnapshot {
  jobId: string;
  originalFilename?: string;
  status?: DocumentProcessingJobRecord['status'];
  cleanupStatus?: DocumentProcessingJobRecord['cleanupStatus'];
  updatedAt?: string;
  databaseSaved?: boolean;
  databaseDocumentId?: string;
  databaseVehicleId?: string;
  databaseError?: string;
}

export interface UseOnboardingFlowResult {
  step: number;
  onboardingMethod: OnboardingMethod;
  uploadedFile: File | null;
  isProcessing: boolean;
  parsedVINs: ParsedVIN[];
  enhancedVehicleData: EnhancedVehicleData[];
  processingProgress: number;
  processingStatus: string;
  error: string | null;
  manualEntryData: ManualEntryState | null;
  isDocumentUploadOpen: boolean;
  jobSnapshots: DocumentJobSnapshot[];
  setOnboardingMethod: (method: OnboardingMethod) => void;
  setError: (message: string | null) => void;
  goToStep: (nextStep: number) => void;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  startVinProcessing: () => Promise<void>;
  handleBulkFileUpload: (data: EnhancedVehicleData[]) => void;
  handleManualEntrySubmit: (vehicleData: EnhancedVehicleData) => void;
  handleEditVehicle: (vin: string) => Promise<void>;
  prepareManualEntryFromVin: (vin: string) => Promise<void>;
  handleDocumentProcessingComplete: (vehicleData: ExtractedVehicleData[]) => Promise<void>;
  openDocumentUploadModal: () => void;
  closeDocumentUploadModal: () => void;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => void;
  cancelManualEntry: () => void;
}

type PersistenceResult = FleetAdapterResult | DataSyncResult;

const mapExtractedToEnhanced = (vehicle: ExtractedVehicleData): EnhancedVehicleData => ({
  vin: vehicle.vin || 'UNKNOWN',
  year: vehicle.year || new Date().getFullYear(),
  make: vehicle.make || 'Unknown',
  model: vehicle.model || 'Unknown',
  fuelType: 'Diesel',
  maxWeight: 80000,
  vehicleClass: 'Class 8',
  status: 'success',
  complianceTasks: 0,
  dotNumber: vehicle.dotNumber || '',
  licensePlate: vehicle.licensePlate || '',
  truckNumber: vehicle.truckNumber || `Vehicle ${vehicle.vin?.slice(-4) || 'Unknown'}`,
  registrationExpirationDate: vehicle.registrationExpirationDate,
  insuranceExpirationDate: vehicle.insuranceExpirationDate,
  insuranceCarrier: vehicle.insuranceCarrier,
  policyNumber: vehicle.policyNumber,
  registrationNumber: vehicle.registrationNumber,
  registrationState: vehicle.registrationState,
  dataSource: {
    method: 'file',
    confidence: 'high',
    lastUpdated: new Date().toISOString(),
    source: 'AI Document Processing'
  },
  missingFields: [],
  needsReview: Boolean(vehicle.needsReview)
} as EnhancedVehicleData);

const extractJobSnapshots = (vehicles: ExtractedVehicleData[]): DocumentJobSnapshot[] =>
  vehicles
    .map((entry) => entry as ExtractionWithMetadata)
    .filter((entry): entry is ExtractionWithMetadata & { job: DocumentProcessingJobRecord } => Boolean(entry.job))
    .map((entry) => ({
      jobId: entry.job.jobId,
      originalFilename: entry.job.originalFilename,
      status: entry.job.status,
      cleanupStatus: entry.job.cleanupStatus,
      updatedAt: entry.job.updatedAt,
      databaseSaved: entry.database?.saved,
      databaseDocumentId: entry.database?.documentId,
      databaseVehicleId: entry.database?.vehicleId,
      databaseError: entry.database?.error
    }));

export const useOnboardingFlow = (): UseOnboardingFlowResult => {
  const [step, setStep] = useState(1);
  const [onboardingMethod, setOnboardingMethod] = useState<OnboardingMethod>('document_processing');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedVINs, setParsedVINs] = useState<ParsedVIN[]>([]);
  const [enhancedVehicleData, setEnhancedVehicleData] = useState<EnhancedVehicleData[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [manualEntryData, setManualEntryData] = useState<ManualEntryState | null>(null);
  const [isDocumentUploadOpen, setIsDocumentUploadOpen] = useState(false);
  const [jobSnapshots, setJobSnapshots] = useState<DocumentJobSnapshot[]>([]);

  const onboardingFeatureEnabled = isOnboardingHookEnabled();

  const persistDocumentVehicles = useCallback(
    async (vehicles: ExtractedVehicleData[]): Promise<PersistenceResult> => {
      if (vehicles.length === 0) {
        return {
          success: true,
          processed: 0,
          failed: 0,
          errors: [],
          rollbackAvailable: false
        };
      }

      if (onboardingFeatureEnabled) {
        logHookEvent('documents:persist:adapter', { count: vehicles.length });
        return fleetStorageAdapter.addVehicles(vehicles as FleetVehicleInput[]);
      }

      logHookEvent('documents:persist:direct', { count: vehicles.length });
      return centralizedFleetDataService.addVehicles(vehicles);
    },
    [onboardingFeatureEnabled]
  );

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

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
        logHookEvent('vin-upload:parse:start', { fileName: file.name, size: file.size });
        setIsProcessing(true);
        const parsed = await parseCSVFile(file);
        setParsedVINs(parsed);
        logHookEvent('vin-upload:parse:success', { totalRows: parsed.length });
      } catch (parseError) {
        logHookEvent('vin-upload:parse:error', {
          message: parseError instanceof Error ? parseError.message : 'unknown-parse-error'
        });
        setError('Failed to parse CSV file. Please check the format.');
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const startVinProcessing = useCallback(async () => {
    const validVINs = parsedVINs.filter(v => v.isValid);
    if (validVINs.length === 0) {
      setError('No valid VINs found in the file');
      return;
    }

    logHookEvent('vin-processing:start', { count: validVINs.length });
    setStep(2);
    setIsProcessing(true);
    setProcessingProgress(0);

    const processed: EnhancedVehicleData[] = [];

    for (let i = 0; i < validVINs.length; i += 1) {
      const vin = validVINs[i].vin;
      const progress = Math.round(((i + 1) / validVINs.length) * 90);
      setProcessingStatus(`Processing VIN ${i + 1} of ${validVINs.length}: ${vin}`);
      setProcessingProgress(progress);

      try {
        const result = await dataInputService.getVehicleData(vin, { allowPartial: true });
        if (result.data) {
          processed.push(result.data);
        } else {
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
      } catch (vinError) {
        logHookEvent('vin-processing:error', {
          vin,
          message: vinError instanceof Error ? vinError.message : 'unknown-error'
        });
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

      await delay(300);
    }

    setProcessingStatus('Finalizing vehicle profiles...');
    setProcessingProgress(100);
    await delay(500);

    setEnhancedVehicleData(processed);
    setIsProcessing(false);
    setStep(3);
    logHookEvent('vin-processing:complete', { processed: processed.length });
  }, [parsedVINs]);

  const handleBulkFileUpload = useCallback((data: EnhancedVehicleData[]) => {
    setEnhancedVehicleData(data);
    setStep(3);
    setJobSnapshots([]);
    logHookEvent('bulk-upload:complete', { count: data.length });
  }, []);

  const handleManualEntrySubmit = useCallback((vehicleData: EnhancedVehicleData) => {
    setEnhancedVehicleData(prev => {
      const exists = prev.some(vehicle => vehicle.vin === vehicleData.vin);
      if (exists) {
        return prev.map(vehicle => (vehicle.vin === vehicleData.vin ? vehicleData : vehicle));
      }
      return [...prev, vehicleData];
    });
    setManualEntryData(null);
    setStep(3);
    logHookEvent('manual-entry:submitted', { vin: vehicleData.vin });
  }, []);

  const handleEditVehicle = useCallback(
    async (vin: string) => {
      const existingData = enhancedVehicleData.find(v => v.vin === vin);
      const result = await dataInputService.getVehicleData(vin, { skipApi: true });

      if (!result.fallbackOptions.template) {
        setError('Manual entry template unavailable for this VIN.');
        return;
      }

      setManualEntryData({
        vin,
        template: result.fallbackOptions.template,
        existingData
      });
      setStep(5);
      logHookEvent('manual-entry:edit', { vin });
    },
    [enhancedVehicleData]
  );

  const prepareManualEntryFromVin = useCallback(
    async (vin: string) => {
      if (vin.length !== 17 || !validateVIN(vin)) {
        return;
      }

      try {
        const result = await dataInputService.getVehicleData(vin);
        if (!result.fallbackOptions.template) {
          setError('Unable to prepare manual entry template for this VIN.');
          return;
        }

        setManualEntryData({
          vin,
          template: result.fallbackOptions.template,
          existingData: result.data || undefined
        });
        setStep(5);
        setError(null);
        logHookEvent('manual-entry:prefill', { vin });
      } catch (vinError) {
        setError(vinError instanceof Error ? vinError.message : 'Failed to fetch VIN details');
      }
    },
    []
  );

  const handleDocumentProcessingComplete = useCallback(
    async (vehicleData: ExtractedVehicleData[]) => {
      logHookEvent('documents:complete', { count: vehicleData.length });
      const converted = vehicleData.map(mapExtractedToEnhanced);
      setEnhancedVehicleData(converted);
      setStep(3);

      try {
        const result = await persistDocumentVehicles(vehicleData);
        logHookEvent('documents:persist:result', {
          success: result.success,
          processed: result.processed,
          failed: result.failed,
          fallbackTriggered: 'fallbackTriggered' in result ? result.fallbackTriggered : false
        });
      } catch (persistError) {
        const message = persistError instanceof Error ? persistError.message : 'Document persistence failed';
        setError(message);
        logHookEvent('documents:persist:error', { message });
      } finally {
        setJobSnapshots(extractJobSnapshots(vehicleData));
      }
    },
    [persistDocumentVehicles]
  );

  const completeOnboarding = useCallback(async () => {
    const readyVehicles = enhancedVehicleData
      .filter(v => v.make && v.model && v.year)
      .map(v => ({
        vin: v.vin,
        make: v.make!,
        model: v.model!,
        year: v.year!,
        licensePlate: `${v.make?.slice(0, 3).toUpperCase() || 'TMP'}${Math.floor(Math.random() * 1000)}`,
        dotNumber: undefined,
        truckNumber: v.truckNumber || '',
        status: 'active' as const
      }));

    if (readyVehicles.length === 0) {
      setError('No valid vehicles to add.');
      return;
    }

    try {
      const result = await fleetStorageAdapter.addVehicles(readyVehicles as FleetVehicleInput[]);
      if (!result.success) {
        setError('Unable to add some vehicles. Please review and try again.');
        return;
      }

      setStep(4);
      logHookEvent('onboarding:complete', { added: readyVehicles.length });
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : 'Failed to complete onboarding');
    }
  }, [enhancedVehicleData]);

  const resetOnboarding = useCallback(() => {
    setStep(1);
    setOnboardingMethod('vin_list');
    setUploadedFile(null);
    setParsedVINs([]);
    setEnhancedVehicleData([]);
    setProcessingProgress(0);
    setProcessingStatus('');
    setError(null);
    setIsProcessing(false);
    setManualEntryData(null);
    setJobSnapshots([]);
    logHookEvent('onboarding:reset');
  }, []);

  const openDocumentUploadModal = useCallback(() => {
    setIsDocumentUploadOpen(true);
    logHookEvent('document-modal:open');
  }, []);

  const closeDocumentUploadModal = useCallback(() => {
    setIsDocumentUploadOpen(false);
    logHookEvent('document-modal:close');

    setTimeout(async () => {
      try {
        await centralizedFleetDataService.initializeData();
        logHookEvent('document-modal:refresh');
      } catch (refreshError) {
        logHookEvent('document-modal:refresh:error', {
          message: refreshError instanceof Error ? refreshError.message : 'unknown-refresh-error'
        });
        window.location.reload();
      }
    }, 100);
  }, []);

  const goToStep = useCallback((nextStep: number) => {
    setStep(nextStep);
  }, []);

  const cancelManualEntry = useCallback(() => {
    setManualEntryData(null);
    setStep(3);
    logHookEvent('manual-entry:cancelled');
  }, []);

  return {
    step,
    onboardingMethod,
    uploadedFile,
    isProcessing,
    parsedVINs,
    enhancedVehicleData,
    processingProgress,
    processingStatus,
    error,
    manualEntryData,
    isDocumentUploadOpen,
    jobSnapshots,
    setOnboardingMethod,
    setError,
    goToStep,
    handleFileUpload,
    startVinProcessing,
    handleBulkFileUpload,
    handleManualEntrySubmit,
    handleEditVehicle,
    prepareManualEntryFromVin,
    handleDocumentProcessingComplete,
    openDocumentUploadModal,
    closeDocumentUploadModal,
    completeOnboarding,
    resetOnboarding,
    cancelManualEntry
  };
};
