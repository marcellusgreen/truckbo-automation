import type { VehicleRecord } from '../services/persistentFleetStorage';
import type { UnifiedVehicleData } from '../services/centralizedFleetDataService';
import type { VehicleSummaryView } from '../services/reconcilerAPI';

/**
 * Convert a legacy vehicle record returned by persistentFleetStorage into the
 * standard UnifiedVehicleData shape consumed by the refactored UI layers.
 */
export const vehicleRecordToUnified = (
  record: VehicleRecord,
  overrides: Partial<UnifiedVehicleData> = {}
): UnifiedVehicleData => ({
  ...record,
  ...overrides,
  dataSource: overrides.dataSource ?? 'legacy',
  lastSyncTimestamp: overrides.lastSyncTimestamp ?? Date.now(),
  reconciledData: overrides.reconciledData,
  complianceScore: overrides.complianceScore,
  riskLevel: overrides.riskLevel,
  documentCount: overrides.documentCount
});

/**
 * Merge reconciler summary data into a unified vehicle to expose
 * compliance/document metadata without mutating the original object.
 */
export const applyVehicleSummary = (
  vehicle: UnifiedVehicleData,
  summary?: VehicleSummaryView
): UnifiedVehicleData => {
  if (!summary) {
    return vehicle;
  }

  return {
    ...vehicle,
    reconciledData: summary,
    complianceScore: summary.complianceScore,
    riskLevel: summary.riskLevel,
    documentCount: summary.totalDocuments,
    dataSource: vehicle.dataSource === 'legacy' ? 'merged' : vehicle.dataSource
  };
};

/**
 * Convert a unified vehicle back into the legacy VehicleRecord shape
 * for APIs that still expect persistent storage payloads.
 */
export const unifiedToVehicleRecord = (vehicle: UnifiedVehicleData): VehicleRecord => ({
  id: vehicle.id,
  organizationId: vehicle.organizationId,
  vin: vehicle.vin,
  make: vehicle.make,
  model: vehicle.model,
  year: vehicle.year,
  licensePlate: vehicle.licensePlate,
  dotNumber: vehicle.dotNumber,
  truckNumber: vehicle.truckNumber,
  status: vehicle.status,
  dateAdded: vehicle.dateAdded,
  lastUpdated: vehicle.lastUpdated,
  registrationNumber: vehicle.registrationNumber,
  registrationState: vehicle.registrationState,
  registrationExpirationDate: vehicle.registrationExpirationDate,
  registeredOwner: vehicle.registeredOwner,
  insuranceCarrier: vehicle.insuranceCarrier,
  policyNumber: vehicle.policyNumber,
  insuranceExpirationDate: vehicle.insuranceExpirationDate,
  coverageAmount: vehicle.coverageAmount,
  complianceStatus: vehicle.complianceStatus,
  lastInspectionDate: vehicle.lastInspectionDate,
  nextInspectionDue: vehicle.nextInspectionDue,
  complianceData: vehicle.complianceData
});
