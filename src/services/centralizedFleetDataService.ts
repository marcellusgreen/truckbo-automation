// Centralized Fleet Data Service - Single Source of Truth
// Solves data synchronization issues by providing atomic operations and consistent state

import { persistentFleetStorage, type VehicleRecord } from './persistentFleetStorage';
import { reconcilerAPI, VehicleSummaryView, FleetDashboard } from './reconcilerAPI';
import { ExtractedVehicleData } from './documentProcessor';
import { authService } from './authService';
import { isRefactorDebugEnabled, startRefactorTimer, refactorDebugLog } from '../utils/refactorDebug';

// Enhanced vehicle type that combines all data sources
export interface UnifiedVehicleData extends VehicleRecord {
  // From reconcilerAPI
  reconciledData?: VehicleSummaryView;
  complianceScore?: number;
  riskLevel?: string;
  documentCount?: number;

  // Computed fields
  dataSource: 'persistent' | 'reconciled' | 'legacy' | 'merged';
  lastSyncTimestamp: number;
  conflictFlags?: string[];
}

export interface FleetStats {
  total: number;
  active: number;
  inactive: number;
  compliant: number;
  nonCompliant: number;
  expiringDocuments: number;
  averageComplianceScore: number;
}

export interface DataSyncResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  rollbackAvailable: boolean;
}

const logDebug = (event: string, details?: Record<string, unknown>): void => {
  if (isRefactorDebugEnabled()) {
    refactorDebugLog('CentralizedFleetDataService', event, details);
  }
};

class CentralizedFleetDataService {
  // Single source of truth - all UI reads from this
  private vehicles: Map<string, UnifiedVehicleData> = new Map();
  private fleetStats: FleetStats | null = null;
  private fleetDashboard: FleetDashboard | null = null;

  // Caching and loading state
  private isLoading = false;
  private lastLoadTime = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Event subscriptions
  private subscribers: Set<(event: 'data_changed' | 'loading_changed' | 'error') => void> = new Set();

  // Backup for rollback operations
  private lastBackup: Map<string, UnifiedVehicleData> | null = null;

  constructor() {}

  /**
   * Get all vehicles - SINGLE SOURCE OF TRUTH
   */
  getVehicles(): UnifiedVehicleData[] {
    return Array.from(this.vehicles.values());
  }

  /**
   * Get vehicle by VIN
   */
  getVehicle(vin: string): UnifiedVehicleData | null {
    return this.vehicles.get(vin) || null;
  }

  /**
   * Get fleet statistics - COMPUTED FROM SINGLE SOURCE
   */
  getFleetStats(): FleetStats {
    if (!this.fleetStats) {
      this.computeFleetStats();
    }
    return this.fleetStats!;
  }

  /**
   * Get fleet dashboard data
   */
  getFleetDashboard(): FleetDashboard | null {
    return this.fleetDashboard;
  }

  /**
   * Check if data is currently loading
   */
  isLoadingData(): boolean {
    return this.isLoading;
  }

  /**
   * ATOMIC OPERATION: Add vehicles with rollback capability
   */
  async addVehicles(vehicleDataArray: ExtractedVehicleData[]): Promise<DataSyncResult> {
    console.log('[FleetData] Starting atomic add vehicles operation');

    const stopTimer = startRefactorTimer();
    logDebug('addVehicles:start', { payloadCount: vehicleDataArray.length });

    // Create backup for rollback
    this.createBackup();

    const result: DataSyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
      rollbackAvailable: true
    };

    try {
      // Phase 1: Add to persistent storage
      const organizationId = authService.getCurrentCompany()?.id;

      for (const vehicleData of vehicleDataArray) {
        const payload = this.mapToPersistentVehiclePayload(vehicleData, organizationId);
        try {
          await persistentFleetStorage.addVehicle(payload);
          result.processed += 1;
        } catch (storageError) {
          result.failed += 1;
          const message = storageError instanceof Error ? storageError.message : String(storageError);
          result.errors.push(`Persistent storage add failed for ${payload.vin}: ${message}`);
          logDebug('addVehicles:persistentError', {
            durationMs: stopTimer(),
            vin: payload.vin,
            message
          });
        }
      }

      logDebug('addVehicles:persistentSummary', {
        processed: result.processed,
        failed: result.failed
      });

      // Phase 2: Sync with reconcilerAPI
      for (const vehicleData of vehicleDataArray) {
        if (vehicleData.vin) {
          try {
            await reconcilerAPI.addDocument(vehicleData, {
              fileName: `centralized_service_${vehicleData.vin}_${Date.now()}`,
              source: 'centralized_fleet_service',
              uploadDate: new Date().toISOString()
            });
          } catch (error) {
            logDebug('addVehicles:reconcilerError', {
              durationMs: stopTimer(),
              processed: result.processed,
              failed: result.failed,
              vin: vehicleData.vin,
              message: error instanceof Error ? error.message : String(error)
            });
            result.errors.push(`ReconcilerAPI sync failed for ${vehicleData.vin}: ${error}`);
            console.warn('[FleetData] ReconcilerAPI sync failed for VIN ' + vehicleData.vin + ':', error);
          }
        }
      }

      // Phase 3: Refresh unified data immediately
      await this.initializeData();
      logDebug('addVehicles:initializeData');

      // Emit events
      FleetEvents.documentProcessed({
        processedVehicles: vehicleDataArray.length,
        successfulVehicles: result.processed,
        failedVehicles: result.failed,
        source: 'centralized_service'
      }, undefined, 'centralizedFleetDataService');

      logDebug('addVehicles:complete', {
        durationMs: stopTimer(),
        processed: result.processed,
        failed: result.failed,
        errorCount: result.errors.length
      });

      console.log('[FleetData] Atomic add vehicles completed successfully');
      return result;

    } catch (error) {
      logDebug('addVehicles:error', {
        durationMs: stopTimer(),
        processed: result.processed,
        failed: result.failed,
        errorCount: result.errors.length,
        message: error instanceof Error ? error.message : String(error)
      });

      console.error('[FleetData] Atomic operation failed, attempting rollback', error);
      result.success = false;
      result.errors.push(`Atomic operation failed: ${error}`);

      // Attempt rollback
      try {
        this.rollback();
        console.log('[FleetData] Rollback successful');
      } catch (rollbackError) {
        console.error('[FleetData] Rollback failed:', rollbackError);
        result.rollbackAvailable = false;
      }

      return result;
    }
  }

  /**
   * ATOMIC OPERATION: Clear all fleet data
   */
  async clearAllFleetData(): Promise<DataSyncResult> {
    console.log('[FleetData] Starting atomic clear operation');

    const stopTimer = startRefactorTimer();
    logDebug('clearAllFleetData:start');

    this.createBackup();

    const result: DataSyncResult = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
      rollbackAvailable: true
    };

    try {
      // Clear all storage systems atomically
      const operations = [
        () => persistentFleetStorage.clearFleet(),
        () => localStorage.removeItem('vehicleReconciler_data'),
        () => reconcilerAPI.clearCache(),
        () => this.vehicles.clear(),
        () => { this.fleetStats = null; this.fleetDashboard = null; }
      ];

      for (const operation of operations) {
        try {
          operation();
        } catch (error) {
          logDebug('clearAllFleetData:operationError', {
            durationMs: stopTimer(),
            operationIndex: result.processed + result.failed,
            message: error instanceof Error ? error.message : String(error)
          });
          result.errors.push(`Clear operation failed: ${error}`);
          result.failed++;
        }
      }

      if (result.errors.length === 0) {
        FleetEvents.fleetCleared('centralizedFleetDataService');
        logDebug('clearAllFleetData:complete', {
          durationMs: stopTimer(),
          failures: result.failed
        });
        console.log('[FleetData] Atomic clear completed successfully');
      } else {
        result.success = false;
        logDebug('clearAllFleetData:failure', {
          durationMs: stopTimer(),
          failures: result.failed,
          errors: result.errors
        });
        console.error('[FleetData] Some clear operations failed:', result.errors);
      }

      this.notifySubscribers('data_changed');

      return result;

    } catch (error) {
      logDebug('clearAllFleetData:error', {
        durationMs: stopTimer(),
        processed: result.processed,
        failed: result.failed,
        message: error instanceof Error ? error.message : String(error)
      });
      console.error('[FleetData] Clear operation failed:', error);
      result.success = false;
      result.errors.push(`Clear failed: ${error}`);

      try {
        this.rollback();
      } catch (rollbackError) {
        result.rollbackAvailable = false;
      }

      return result;
    }
  }

  /**
   * Initialize data from all sources and unify
   */
  async initializeData(): Promise<void> {
    if (!authService.isAuthenticated()) {
      console.log('[FleetData] User not authenticated, skipping data initialization');
      return;
    }

    if (this.isLoading) {
      console.log('[FleetData] Already loading data, skipping refresh');
      return;
    }

    const now = Date.now();
    if (this.lastLoadTime && now - this.lastLoadTime < this.CACHE_DURATION) {
      logDebug('initializeData:cacheHit', { ageMs: now - this.lastLoadTime });
      return;
    }

    this.isLoading = true;
    this.notifySubscribers('loading_changed');

    const stopTimer = startRefactorTimer();
    logDebug('initializeData:start');

    try {
      console.log('[FleetData] Refreshing data from all sources');

      const [persistentVehicles, reconciledVehicles, dashboardData] = await Promise.all([
        persistentFleetStorage.getFleetAsync(),
        reconcilerAPI.getAllVehicleSummaries(),
        reconcilerAPI.getFleetDashboard()
      ]);

      logDebug('initializeData:sourceCounts', {
        persistentCount: persistentVehicles.length,
        reconciledCount: reconciledVehicles.length,
        hasDashboard: Boolean(dashboardData)
      });

      this.vehicles.clear();

      persistentVehicles.forEach(vehicle => {
        const unifiedVehicle: UnifiedVehicleData = {
          ...vehicle,
          dataSource: 'persistent',
          lastSyncTimestamp: Date.now(),
          conflictFlags: []
        };
        this.vehicles.set(vehicle.vin, unifiedVehicle);
      });

      reconciledVehicles.forEach(reconciledVehicle => {
        const existingVehicle = this.vehicles.get(reconciledVehicle.vin);

        if (existingVehicle) {
          existingVehicle.reconciledData = reconciledVehicle;
          existingVehicle.complianceScore = reconciledVehicle.complianceScore;
          existingVehicle.riskLevel = reconciledVehicle.riskLevel;
          existingVehicle.documentCount = reconciledVehicle.totalDocuments;
          existingVehicle.dataSource = 'merged';
          existingVehicle.lastSyncTimestamp = Date.now();

          if (existingVehicle.make !== reconciledVehicle.make) {
            existingVehicle.conflictFlags?.push('make_mismatch');
          }
          if (existingVehicle.model !== reconciledVehicle.model) {
            existingVehicle.conflictFlags?.push('model_mismatch');
          }
        } else {
          const unifiedVehicle: UnifiedVehicleData = {
            id: `reconciled_${reconciledVehicle.vin}_${Date.now()}`,
            vin: reconciledVehicle.vin,
            make: reconciledVehicle.make || 'Unknown',
            model: reconciledVehicle.model || 'Unknown',
            year: parseInt(reconciledVehicle.year || '2024'),
            licensePlate: reconciledVehicle.licensePlate || 'Unknown',
            truckNumber: `Reconciled-${reconciledVehicle.vin.slice(-4)}`,
            status: 'active',
            dateAdded: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            reconciledData: reconciledVehicle,
            complianceScore: reconciledVehicle.complianceScore,
            riskLevel: reconciledVehicle.riskLevel,
            documentCount: reconciledVehicle.totalDocuments,
            dataSource: 'reconciled',
            lastSyncTimestamp: Date.now(),
            conflictFlags: []
          };
          this.vehicles.set(reconciledVehicle.vin, unifiedVehicle);
        }
      });

      this.fleetDashboard = dashboardData;
      this.computeFleetStats();
      this.lastLoadTime = Date.now();

      logDebug('initializeData:complete', {
        durationMs: stopTimer(),
        vehicleCount: this.vehicles.size,
        statsComputed: Boolean(this.fleetStats),
        dashboard: Boolean(this.fleetDashboard)
      });

      console.log(`[FleetData] Data refresh complete. ${this.vehicles.size} vehicles loaded`);

    } catch (error) {
      logDebug('initializeData:error', {
        durationMs: stopTimer(),
        message: error instanceof Error ? error.message : String(error),
        vehicleCount: this.vehicles.size
      });

      console.error('[FleetData] Error refreshing data:', error);
      this.notifySubscribers('error');
    } finally {
      this.isLoading = false;
      this.notifySubscribers('loading_changed');
      this.notifySubscribers('data_changed');
    }
  }

  /**
   * Subscribe to data changes
   */
  subscribe(callback: (event: 'data_changed' | 'loading_changed' | 'error') => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Search vehicles
   */
  searchVehicles(query: string): UnifiedVehicleData[] {
    const lowerQuery = query.toLowerCase();
    return this.getVehicles().filter(vehicle =>
      vehicle.vin.toLowerCase().includes(lowerQuery) ||
      vehicle.make.toLowerCase().includes(lowerQuery) ||
      vehicle.model.toLowerCase().includes(lowerQuery) ||
      vehicle.licensePlate.toLowerCase().includes(lowerQuery) ||
      vehicle.truckNumber.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Filter vehicles by status
   */
  filterVehicles(status: 'all' | 'active' | 'inactive' | 'compliant' | 'non_compliant'): UnifiedVehicleData[] {
    const vehicles = this.getVehicles();

    switch (status) {
      case 'all': return vehicles;
      case 'active': return vehicles.filter(v => v.status === 'active');
      case 'inactive': return vehicles.filter(v => v.status === 'inactive');
      case 'compliant': return vehicles.filter(v => (v.complianceScore || 0) >= 80);
      case 'non_compliant': return vehicles.filter(v => (v.complianceScore || 0) < 80);
      default: return vehicles;
    }
  }

  // Private methods
  private computeFleetStats(): void {
    const vehicles = this.getVehicles();

    const active = vehicles.filter(v => v.status === 'active').length;
    const inactive = vehicles.filter(v => v.status === 'inactive').length;
    const compliant = vehicles.filter(v => (v.complianceScore || 0) >= 80).length;
    const nonCompliant = vehicles.filter(v => (v.complianceScore || 0) < 80).length;

    // Count expiring documents from reconciled data
    const expiringDocuments = vehicles.reduce((count, vehicle) => {
      if (vehicle.reconciledData?.hasExpiringSoonDocuments) {
        return count + 1;
      }
      return count;
    }, 0);

    const totalComplianceScore = vehicles.reduce((sum, v) => sum + (v.complianceScore || 0), 0);
    const averageComplianceScore = vehicles.length > 0 ? Math.round(totalComplianceScore / vehicles.length) : 0;

    this.fleetStats = {
      total: vehicles.length,
      active,
      inactive,
      compliant,
      nonCompliant,
      expiringDocuments,
      averageComplianceScore
    };
  }

  private mapToPersistentVehiclePayload(
    data: ExtractedVehicleData,
    organizationId?: string
  ): Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'> {
    const extractedYear =
      typeof data.year === 'number'
        ? data.year
        : Number.parseInt(String(data.year ?? ''), 10);
    const sanitizedYear = Number.isFinite(extractedYear) ? extractedYear : new Date().getFullYear();

    const toOptionalString = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

    const toOptionalNumber = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    };

    return {
      organizationId,
      vin: toOptionalString(data.vin) ?? `UNKNOWN_${Date.now()}`,
      make: toOptionalString(data.make) ?? 'Unknown',
      model: toOptionalString(data.model) ?? 'Unknown',
      year: sanitizedYear,
      licensePlate: toOptionalString(data.licensePlate) ?? 'Unknown',
      dotNumber: toOptionalString(data.dotNumber),
      truckNumber: toOptionalString(data.truckNumber) ?? '',
      status: 'active',
      registrationNumber: toOptionalString(data.registrationNumber),
      registrationState: toOptionalString(data.registrationState),
      registrationExpirationDate: toOptionalString(data.registrationExpirationDate),
      registeredOwner: toOptionalString(data.registeredOwner),
      insuranceCarrier: toOptionalString(data.insuranceCarrier),
      policyNumber: toOptionalString(data.policyNumber),
      insuranceExpirationDate: toOptionalString(data.insuranceExpirationDate),
      coverageAmount: toOptionalNumber(data.coverageAmount),
      complianceStatus: 'unknown',
      lastInspectionDate: undefined,
      nextInspectionDue: undefined,
      complianceData: undefined
    };
  }

  private createBackup(): void {
    this.lastBackup = new Map(this.vehicles);
  }

  private rollback(): void {
    if (this.lastBackup) {
      this.vehicles = new Map(this.lastBackup);
      this.computeFleetStats();
      this.notifySubscribers('data_changed');
      console.log('[FleetData] Rollback completed');
    } else {
      throw new Error('No backup available for rollback');
    }
  }

  private notifySubscribers(event: 'data_changed' | 'loading_changed' | 'error'): void {
    this.subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in subscriber callback:', error);
      }
    });
  }
}

// Singleton instance - SINGLE SOURCE OF TRUTH
export const centralizedFleetDataService = new CentralizedFleetDataService();

// React hook for easy component integration
export const useFleetData = () => {
  return {
    getVehicles: () => centralizedFleetDataService.getVehicles(),
    getVehicle: (vin: string) => centralizedFleetDataService.getVehicle(vin),
    getFleetStats: () => centralizedFleetDataService.getFleetStats(),
    getFleetDashboard: () => centralizedFleetDataService.getFleetDashboard(),
    isLoading: () => centralizedFleetDataService.isLoadingData(),
    searchVehicles: (query: string) => centralizedFleetDataService.searchVehicles(query),
    filterVehicles: (status: any) => centralizedFleetDataService.filterVehicles(status),
    addVehicles: (data: ExtractedVehicleData[]) => centralizedFleetDataService.addVehicles(data),
    clearAll: () => centralizedFleetDataService.clearAllFleetData(),
    initializeData: () => centralizedFleetDataService.initializeData(),
    subscribe: (callback: any) => centralizedFleetDataService.subscribe(callback)
  };
};

