import { persistentFleetStorage, type VehicleRecord } from './persistentFleetStorage';
import {
  centralizedFleetDataService,
  type UnifiedVehicleData,
  type FleetStats,
  type DataSyncResult
} from './centralizedFleetDataService';
import type { ExtractedVehicleData } from './documentProcessor';
import { isFleetAdapterEnabled } from '../utils/featureFlags';
import { isRefactorDebugEnabled, refactorDebugLog, startRefactorTimer } from '../utils/refactorDebug';
import { vehicleRecordToUnified } from '../utils/vehicleMapping';

export type FleetVehicleInput = VehicleRecord | Partial<VehicleRecord> | UnifiedVehicleData | ExtractedVehicleData;

export interface FleetAdapterResult extends DataSyncResult {
  fallbackTriggered: boolean;
}

const debug = (event: string, details?: Record<string, unknown>): void => {
  if (isRefactorDebugEnabled()) {
    refactorDebugLog('FleetStorageAdapter', event, details);
  }
};

const toExtractedVehicle = (vehicle: FleetVehicleInput): ExtractedVehicleData => {
  if (typeof (vehicle as ExtractedVehicleData).documentType === 'string') {
    return vehicle as ExtractedVehicleData;
  }

  const fallbackDocumentType = 'registration';
  const record = vehicle as Partial<VehicleRecord>;
  const unified = vehicle as Partial<UnifiedVehicleData>;

  return {
    vin: record.vin ?? unified.vin,
    licensePlate: record.licensePlate ?? unified.licensePlate,
    year: record.year ?? unified.year,
    make: record.make ?? unified.make,
    model: record.model ?? unified.model,
    truckNumber: record.truckNumber ?? unified.truckNumber,
    registrationNumber: (record as Record<string, unknown>).registrationNumber,
    registrationState: (record as Record<string, unknown>).registrationState,
    registrationExpiry: (record as Record<string, unknown>).registrationExpirationDate,
    insuranceCarrier: record.insuranceCarrier ?? unified.insuranceCarrier,
    insuranceExpiry: (record as Record<string, unknown>).insuranceExpirationDate,
    policyNumber: record.policyNumber ?? unified.policyNumber,
    coverageAmount: (record as Record<string, unknown>).coverageAmount,
    dotNumber: record.dotNumber ?? unified.dotNumber,
    documentType: fallbackDocumentType,
    extractionConfidence: 1,
    sourceFileName: 'fleet-storage-adapter',
    processingNotes: [],
    needsReview: false
  } as ExtractedVehicleData;
};

const toLegacyVehiclePayload = (
  vehicle: FleetVehicleInput
): Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'> => {
  const record = vehicle as Partial<VehicleRecord>;
  return {
    vin: record.vin ?? 'UNKNOWN',
    make: record.make ?? 'Unknown',
    model: record.model ?? 'Unknown',
    year: record.year ?? new Date().getFullYear(),
    licensePlate: record.licensePlate ?? 'UNKNOWN',
    dotNumber: record.dotNumber,
    truckNumber: record.truckNumber ?? '',
    status: record.status ?? 'active',
    organizationId: record.organizationId,
    registrationNumber: (record as Record<string, unknown>).registrationNumber as string | undefined,
    registrationState: (record as Record<string, unknown>).registrationState as string | undefined,
    registrationExpirationDate: (record as Record<string, unknown>).registrationExpirationDate as string | undefined,
    registeredOwner: (record as Record<string, unknown>).registeredOwner as string | undefined,
    insuranceCarrier: record.insuranceCarrier,
    policyNumber: record.policyNumber,
    insuranceExpirationDate: (record as Record<string, unknown>).insuranceExpirationDate as string | undefined,
    coverageAmount: (record as Record<string, unknown>).coverageAmount as number | undefined,
    complianceStatus: record.complianceStatus,
    lastInspectionDate: record.lastInspectionDate,
    nextInspectionDue: record.nextInspectionDue,
    complianceData: record.complianceData
  };
};

class FleetStorageAdapter {
  async initialize(): Promise<{ source: 'centralized' | 'legacy'; featureFlag: boolean }> {
    const usingAdapter = isFleetAdapterEnabled();
    const stopTimer = startRefactorTimer();

    if (usingAdapter) {
      debug('initialize:centralized:start');
      await centralizedFleetDataService.initializeData();
      debug('initialize:centralized:complete', { durationMs: stopTimer() });
      return { source: 'centralized', featureFlag: true };
    }

    debug('initialize:legacy:start');
    await persistentFleetStorage.initialize();
    debug('initialize:legacy:complete', { durationMs: stopTimer() });
    return { source: 'legacy', featureFlag: false };
  }

  async getFleet(): Promise<UnifiedVehicleData[]> {
    if (isFleetAdapterEnabled()) {
      return centralizedFleetDataService.getVehicles();
    }

    const legacyVehicles = await persistentFleetStorage.getFleetAsync();
    return legacyVehicles.map(vehicle => vehicleRecordToUnified(vehicle));
  }

  getFleetStats(): FleetStats {
    if (isFleetAdapterEnabled()) {
      return centralizedFleetDataService.getFleetStats();
    }

    const vehicles = centralizedFleetDataService.getVehicles();
    if (vehicles.length > 0) {
      return centralizedFleetDataService.getFleetStats();
    }

    const fallback = {
      total: 0,
      active: 0,
      inactive: 0,
      compliant: 0,
      nonCompliant: 0,
      expiringDocuments: 0,
      averageComplianceScore: 0
    } as FleetStats;

    return fallback;
  }

  async addVehicles(vehicles: FleetVehicleInput[]): Promise<FleetAdapterResult> {
    const stopTimer = startRefactorTimer();

    if (isFleetAdapterEnabled()) {
      const payload = vehicles.map(toExtractedVehicle);
      debug('addVehicles:centralized:start', { count: payload.length });
      const result = await centralizedFleetDataService.addVehicles(payload);
      debug('addVehicles:centralized:complete', {
        durationMs: stopTimer(),
        processed: result.processed,
        failed: result.failed
      });
      return { ...result, fallbackTriggered: false };
    }

    debug('addVehicles:legacy:start', { count: vehicles.length });

    const summary: FleetAdapterResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
      rollbackAvailable: false,
      fallbackTriggered: true
    };

    for (const vehicle of vehicles) {
      try {
        const payload = toLegacyVehiclePayload(vehicle);
        await persistentFleetStorage.addVehicle(payload);
        summary.processed += 1;
      } catch (error) {
        summary.failed += 1;
        summary.success = false;
        summary.errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    debug('addVehicles:legacy:complete', {
      durationMs: stopTimer(),
      processed: summary.processed,
      failed: summary.failed
    });

    return summary;
  }

  async updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord> {
    if (isFleetAdapterEnabled()) {
      const updated = await persistentFleetStorage.updateVehicle(id, updates);
      centralizedFleetDataService.initializeData().catch(() => undefined);
      return updated;
    }

    return persistentFleetStorage.updateVehicle(id, updates);
  }

  async clearFleet(): Promise<FleetAdapterResult> {
    const stopTimer = startRefactorTimer();

    if (isFleetAdapterEnabled()) {
      debug('clearFleet:centralized:start');
      const result = await centralizedFleetDataService.clearAllFleetData();
      debug('clearFleet:centralized:complete', {
        durationMs: stopTimer(),
        processed: result.processed,
        failed: result.failed
      });
      return { ...result, fallbackTriggered: false };
    }

    debug('clearFleet:legacy:start');
    await persistentFleetStorage.clearFleet();
    debug('clearFleet:legacy:complete', { durationMs: stopTimer() });

    return {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
      rollbackAvailable: false,
      fallbackTriggered: true
    };
  }
}

export const fleetStorageAdapter = new FleetStorageAdapter();






