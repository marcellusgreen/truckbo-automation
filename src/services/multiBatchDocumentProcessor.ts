// Multi-Batch Document Processing Service
// Handles multiple document upload sessions and intelligent data reconciliation

import { documentProcessor, ExtractedVehicleData } from './documentProcessor';
import { persistentFleetStorage, VehicleRecord } from './persistentFleetStorage';

export interface DocumentBatch {
  id: string;
  timestamp: string;
  totalFiles: number;
  processedFiles: number;
  registrationDocs: number;
  insuranceDocs: number;
  extractedData: ExtractedVehicleData[];
  errors: { fileName: string; error: string }[];
}

export interface ReconciliationResult {
  completeVehicles: VehicleRecord[]; // Vehicles with both registration and insurance
  registrationOnly: VehicleRecord[]; // Vehicles with only registration data
  insuranceOnly: VehicleRecord[]; // Vehicles with only insurance data
  duplicates: { vin: string; sources: string[] }[];
  summary: {
    totalVehicles: number;
    fullyDocumented: number;
    missingInsurance: number;
    missingRegistration: number;
    reconciliationScore: number; // Percentage of vehicles with complete data
  };
}

export interface MultiBatchProcessingState {
  batches: DocumentBatch[];
  allExtractedData: ExtractedVehicleData[];
  reconciliationResult: ReconciliationResult | null;
  totalDocumentsProcessed: number;
  lastProcessedAt: string;
}

class MultiBatchDocumentProcessor {
  private readonly STORAGE_KEY = 'truckbo_document_batches';
  private listeners: ((state: MultiBatchProcessingState) => void)[] = [];

  // Get current processing state
  getProcessingState(): MultiBatchProcessingState {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading document processing state:', error);
    }

    // Return empty state
    return {
      batches: [],
      allExtractedData: [],
      reconciliationResult: null,
      totalDocumentsProcessed: 0,
      lastProcessedAt: ''
    };
  }

  // Save processing state
  private saveProcessingState(state: MultiBatchProcessingState): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
      this.notifyListeners(state);
    } catch (error) {
      console.error('Error saving document processing state:', error);
    }
  }

  // Process a new batch of documents
  async processBatch(files: FileList): Promise<DocumentBatch> {
    console.log(`📁 Processing new document batch: ${files.length} files`);

    // Process documents using existing document processor
    const processingResult = await documentProcessor.processBulkDocuments(files);

    // Create batch record
    const batch: DocumentBatch = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      totalFiles: files.length,
      processedFiles: processingResult.summary.processed,
      registrationDocs: processingResult.summary.registrationDocs,
      insuranceDocs: processingResult.summary.insuranceDocs,
      extractedData: processingResult.vehicleData,
      errors: processingResult.errors
    };

    // Update processing state
    const currentState = this.getProcessingState();
    const newState: MultiBatchProcessingState = {
      batches: [...currentState.batches, batch],
      allExtractedData: [...currentState.allExtractedData, ...batch.extractedData],
      reconciliationResult: null, // Will be recalculated
      totalDocumentsProcessed: currentState.totalDocumentsProcessed + batch.processedFiles,
      lastProcessedAt: batch.timestamp
    };

    // Perform data reconciliation
    newState.reconciliationResult = this.reconcileVehicleData(newState.allExtractedData);

    // Save updated state
    this.saveProcessingState(newState);

    console.log(`✅ Batch processed: ${batch.processedFiles} documents, ${batch.registrationDocs} registration, ${batch.insuranceDocs} insurance`);
    
    return batch;
  }

  // Intelligent data reconciliation - merge registration and insurance data by VIN
  private reconcileVehicleData(allData: ExtractedVehicleData[]): ReconciliationResult {
    console.log(`🔄 Reconciling vehicle data from ${allData.length} extracted records`);

    // Debug: Log all extracted data with document types
    allData.forEach((data, index) => {
      console.log(`📋 Record ${index + 1}: VIN=${data.vin}, Type=${data.documentType}, File=${data.sourceFileName}`);
      console.log(`   Registration Fields: ${data.registrationNumber ? '✅' : '❌'} regNum, ${data.registrationExpiry ? '✅' : '❌'} regExp`);
      console.log(`   Insurance Fields: ${data.insuranceCarrier ? '✅' : '❌'} carrier, ${data.policyNumber ? '✅' : '❌'} policy`);
    });

    // Group data by VIN
    const vehicleGroups: { [vin: string]: { registration?: ExtractedVehicleData; insurance?: ExtractedVehicleData; sources: string[] } } = {};

    allData.forEach(data => {
      const vin = data.vin;
      if (!vin) return; // Skip records without VIN

      if (!vehicleGroups[vin]) {
        vehicleGroups[vin] = { sources: [] };
      }

      // Assign to appropriate category based on document type
      if (data.documentType === 'registration') {
        console.log(`📋 Assigning ${vin} as REGISTRATION from ${data.sourceFileName}`);
        vehicleGroups[vin].registration = data;
        vehicleGroups[vin].sources.push(`Registration: ${data.sourceFileName}`);
      } else if (data.documentType === 'insurance') {
        console.log(`🛡️ Assigning ${vin} as INSURANCE from ${data.sourceFileName}`);
        vehicleGroups[vin].insurance = data;
        vehicleGroups[vin].sources.push(`Insurance: ${data.sourceFileName}`);
      } else {
        console.log(`⚠️ Unknown document type '${data.documentType}' for ${vin} from ${data.sourceFileName}`);
      }
    });

    // Convert groups to reconciled vehicle records
    const completeVehicles: VehicleRecord[] = [];
    const registrationOnly: VehicleRecord[] = [];
    const insuranceOnly: VehicleRecord[] = [];
    const duplicates: { vin: string; sources: string[] }[] = [];

    Object.entries(vehicleGroups).forEach(([vin, group]) => {
      const hasRegistration = !!group.registration;
      const hasInsurance = !!group.insurance;

      // Create merged vehicle record
      const vehicleRecord = this.createMergedVehicleRecord(vin, group.registration, group.insurance);

      // Check for duplicates (multiple sources for same document type)
      if (group.sources.length > 2) {
        duplicates.push({ vin, sources: group.sources });
      }

      // Categorize based on data completeness
      if (hasRegistration && hasInsurance) {
        completeVehicles.push(vehicleRecord);
      } else if (hasRegistration) {
        registrationOnly.push(vehicleRecord);
      } else if (hasInsurance) {
        insuranceOnly.push(vehicleRecord);
      }
    });

    const totalVehicles = completeVehicles.length + registrationOnly.length + insuranceOnly.length;
    const reconciliationScore = totalVehicles > 0 ? Math.round((completeVehicles.length / totalVehicles) * 100) : 0;

    const result: ReconciliationResult = {
      completeVehicles,
      registrationOnly,
      insuranceOnly,
      duplicates,
      summary: {
        totalVehicles,
        fullyDocumented: completeVehicles.length,
        missingInsurance: registrationOnly.length,
        missingRegistration: insuranceOnly.length,
        reconciliationScore
      }
    };

    console.log(`✅ Reconciliation complete: ${result.summary.fullyDocumented}/${result.summary.totalVehicles} vehicles fully documented (${reconciliationScore}%)`);
    
    return result;
  }

  // Create merged vehicle record from registration and insurance data
  private createMergedVehicleRecord(vin: string, regData?: ExtractedVehicleData, insData?: ExtractedVehicleData): VehicleRecord {
    // Debug logging
    console.log(`🔗 Merging vehicle record for VIN: ${vin}`);
    console.log(`   Registration data available: ${regData ? '✅' : '❌'}`, regData ? {
      file: regData.sourceFileName,
      regNum: regData.registrationNumber,
      regExp: regData.registrationExpiry,
      regState: regData.registrationState
    } : 'none');
    console.log(`   Insurance data available: ${insData ? '✅' : '❌'}`, insData ? {
      file: insData.sourceFileName,
      carrier: insData.insuranceCarrier,
      policy: insData.policyNumber,
      insExp: insData.insuranceExpiry
    } : 'none');

    // Use registration data as primary source, insurance as supplementary
    const primaryData = regData || insData!;
    const secondaryData = regData ? insData : undefined;

    const mergedRecord = {
      id: `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      vin,
      make: primaryData.make || secondaryData?.make || 'Unknown',
      model: primaryData.model || secondaryData?.model || 'Unknown', 
      year: primaryData.year || secondaryData?.year || new Date().getFullYear(),
      licensePlate: primaryData.licensePlate || secondaryData?.licensePlate || 'Unknown',
      dotNumber: primaryData.dotNumber || secondaryData?.dotNumber,
      truckNumber: primaryData.truckNumber || secondaryData?.truckNumber || '',
      status: 'active' as const,
      dateAdded: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),

      // Registration data (from registration documents)
      registrationNumber: regData?.registrationNumber,
      registrationState: regData?.registrationState,
      registrationExpiry: regData?.registrationExpiry,
      registeredOwner: regData?.registeredOwner,

      // Insurance data (from insurance documents)
      insuranceCarrier: insData?.insuranceCarrier,
      policyNumber: insData?.policyNumber,
      insuranceExpiry: insData?.insuranceExpiry,
      coverageAmount: insData?.coverageAmount
    };

    console.log(`✅ Created merged record for ${vin}:`, {
      regFields: {
        registrationNumber: mergedRecord.registrationNumber,
        registrationExpiry: mergedRecord.registrationExpiry,
        registrationState: mergedRecord.registrationState
      },
      insFields: {
        insuranceCarrier: mergedRecord.insuranceCarrier,
        policyNumber: mergedRecord.policyNumber,
        insuranceExpiry: mergedRecord.insuranceExpiry,
        coverageAmount: mergedRecord.coverageAmount
      }
    });

    // SPECIFIC INSURANCE DEBUG: Check if insurance data is the same across vehicles
    if (mergedRecord.insuranceExpiry === '12/31/2024') {
      console.log(`🚨 DUPLICATE INSURANCE DATE DETECTED for ${vin}! All showing 12/31/2024`);
      console.log(`   Insurance source file: ${insData?.sourceFileName}`);
      console.log(`   Insurance raw extracted data:`, insData);
    }

    return mergedRecord;
  }

  // Apply reconciled data to fleet storage
  async applyReconciliation(): Promise<{ successful: VehicleRecord[]; failed: any[] }> {
    const state = this.getProcessingState();
    if (!state.reconciliationResult) {
      throw new Error('No reconciliation data available - process documents first');
    }

    console.log(`📄 Applying reconciliation: ${state.reconciliationResult.summary.totalVehicles} vehicles`);

    // Combine all vehicle categories
    const allVehicles = [
      ...state.reconciliationResult.completeVehicles,
      ...state.reconciliationResult.registrationOnly,
      ...state.reconciliationResult.insuranceOnly
    ];

    // Convert to format expected by persistent storage (remove id, dateAdded, lastUpdated)
    const vehiclesToAdd = allVehicles.map(vehicle => {
      const { id, dateAdded, lastUpdated, ...vehicleData } = vehicle;
      return vehicleData;
    });

    // Add to persistent storage
    const result = persistentFleetStorage.addVehicles(vehiclesToAdd);
    
    console.log(`✅ Applied reconciliation: ${result.successful.length} successful, ${result.failed.length} failed`);
    
    return result;
  }

  // Clear all processing data (start fresh)
  clearProcessingData(): void {
    const emptyState: MultiBatchProcessingState = {
      batches: [],
      allExtractedData: [],
      reconciliationResult: null,
      totalDocumentsProcessed: 0,
      lastProcessedAt: ''
    };
    this.saveProcessingState(emptyState);
    console.log('🗑️ Cleared all document processing data');
  }

  // Subscribe to processing state changes
  subscribe(listener: (state: MultiBatchProcessingState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(state: MultiBatchProcessingState): void {
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in multi-batch processor listener:', error);
      }
    });
  }
}

export const multiBatchDocumentProcessor = new MultiBatchDocumentProcessor();