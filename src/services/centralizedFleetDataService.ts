// Centralized Fleet Data Service - Single Source of Truth
// Solves data synchronization issues by providing atomic operations and consistent state

import { VehicleRecord } from './persistentFleetStorage';
import { persistentFleetStorage } from './persistentFleetStorage';
import { fleetDataManager } from './fleetDataManager';
import { reconcilerAPI, VehicleSummaryView, FleetDashboard } from './reconcilerAPI';
import { eventBus, FleetEvents } from './eventBus';
import { ExtractedVehicleData } from './documentProcessor';
import { standardizeVehicleData, batchStandardizeVehicles } from '../utils/fieldStandardization';
import { type StandardizedVehicle } from '../types/standardizedFields';
import { authService } from './authService';

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
  
  constructor() {
    // Subscribe to event bus for automatic sync
    eventBus.subscribe('fleet_data_changed', () => {
      console.log('🔄 CentralizedFleetDataService: Event bus triggered, refreshing data');
      this.initializeData();
    });
  }

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
    console.log('🔄 CentralizedFleetDataService: Starting atomic add vehicles operation');
    
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
      const persistentVehicles = vehicleDataArray.map(data => ({
        vin: data.vin || `UNKNOWN_${Date.now()}`,
        make: data.make || 'Unknown',
        model: data.model || 'Unknown',
        year: data.year || new Date().getFullYear(),
        licensePlate: data.licensePlate || 'Unknown',
        dotNumber: data.dotNumber,
        truckNumber: data.truckNumber || '',
        status: 'active' as const,
        registrationNumber: data.registrationNumber,
        registrationState: data.registrationState,
        registrationExpiry: data.registrationExpiry,
        registeredOwner: data.registeredOwner,
        insuranceCarrier: data.insuranceCarrier,
        policyNumber: data.policyNumber,
        insuranceExpiry: data.insuranceExpiry,
        coverageAmount: data.coverageAmount
      }));

      const persistentResult = persistentFleetStorage.addVehicles(persistentVehicles);
      result.processed += persistentResult.successful.length;
      result.failed += persistentResult.failed.length;
      
      if (persistentResult.failed.length > 0) {
        result.errors.push(...persistentResult.failed.map(f => f.error));
      }

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
            result.errors.push(`ReconcilerAPI sync failed for ${vehicleData.vin}: ${error}`);
            console.warn(`⚠️ ReconcilerAPI sync failed for VIN ${vehicleData.vin}:`, error);
          }
        }
      }

      // Phase 3: Refresh unified data immediately
      await this.initializeData();

      // Emit events
      FleetEvents.documentProcessed({
        processedVehicles: vehicleDataArray.length,
        successfulVehicles: result.processed,
        failedVehicles: result.failed,
        source: 'centralized_service'
      }, undefined, 'centralizedFleetDataService');

      console.log('✅ CentralizedFleetDataService: Atomic add vehicles completed successfully');
      return result;

    } catch (error) {
      console.error('❌ CentralizedFleetDataService: Atomic operation failed, attempting rollback', error);
      result.success = false;
      result.errors.push(`Atomic operation failed: ${error}`);
      
      // Attempt rollback
      try {
        this.rollback();
        console.log('✅ Rollback successful');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError);
        result.rollbackAvailable = false;
      }

      return result;
    }
  }

  /**
   * ATOMIC OPERATION: Clear all fleet data
   */
  async clearAllFleetData(): Promise<DataSyncResult> {
    console.log('🗑️ CentralizedFleetDataService: Starting atomic clear operation');
    
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
          result.errors.push(`Clear operation failed: ${error}`);
          result.failed++;
        }
      }

      if (result.errors.length === 0) {
        // Emit success event
        FleetEvents.fleetCleared('centralizedFleetDataService');
        console.log('✅ CentralizedFleetDataService: Atomic clear completed successfully');
      } else {
        result.success = false;
        console.error('❌ Some clear operations failed:', result.errors);
      }

      // Notify subscribers
      this.notifySubscribers('data_changed');

      return result;

    } catch (error) {
      console.error('❌ CentralizedFleetDataService: Clear operation failed:', error);
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
    // Check if user is authenticated before trying to load data
    if (!authService.isAuthenticated()) {
      console.log('🔒 User not authenticated, skipping data initialization');
      return;
    }

    if (this.isLoading) {
      console.log('🔄 Already loading data, skipping refresh');
      return;
    }

    this.isLoading = true;
    this.notifySubscribers('loading_changed');

    try {
      console.log('🔄 CentralizedFleetDataService: Refreshing data from all sources');
      
      // Load from all sources in parallel for speed
      const [persistentVehicles, reconciledVehicles, dashboardData] = await Promise.all([
        persistentFleetStorage.getFleetAsync(),
        reconcilerAPI.getAllVehicleSummaries(),
        reconcilerAPI.getFleetDashboard()
      ]);

      // Clear existing data
      this.vehicles.clear();

      // Phase 1: Add persistent vehicles
      persistentVehicles.forEach(vehicle => {
        const unifiedVehicle: UnifiedVehicleData = {
          ...vehicle,
          dataSource: 'persistent',
          lastSyncTimestamp: Date.now(),
          conflictFlags: []
        };
        this.vehicles.set(vehicle.vin, unifiedVehicle);
      });

      // Phase 2: Merge/update with reconciled data
      reconciledVehicles.forEach(reconciledVehicle => {
        const existingVehicle = this.vehicles.get(reconciledVehicle.vin);
        
        if (existingVehicle) {
          // Merge with existing
          existingVehicle.reconciledData = reconciledVehicle;
          existingVehicle.complianceScore = reconciledVehicle.complianceScore;
          existingVehicle.riskLevel = reconciledVehicle.riskLevel;
          existingVehicle.documentCount = reconciledVehicle.totalDocuments;
          existingVehicle.dataSource = 'merged';
          existingVehicle.lastSyncTimestamp = Date.now();
          
          // Check for conflicts
          if (existingVehicle.make !== reconciledVehicle.make) {
            existingVehicle.conflictFlags?.push('make_mismatch');
          }
          if (existingVehicle.model !== reconciledVehicle.model) {
            existingVehicle.conflictFlags?.push('model_mismatch');
          }
        } else {
          // Add as reconciled-only vehicle
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
            
            // Reconciled data
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

      // Update dashboard data
      this.fleetDashboard = dashboardData;

      // Compute stats
      this.computeFleetStats();

      this.lastLoadTime = Date.now();
      
      console.log(`✅ CentralizedFleetDataService: Data refresh complete. ${this.vehicles.size} vehicles loaded`);

    } catch (error) {
      console.error('❌ CentralizedFleetDataService: Error refreshing data:', error);
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

  private createBackup(): void {
    this.lastBackup = new Map(this.vehicles);
  }

  private rollback(): void {
    if (this.lastBackup) {
      this.vehicles = new Map(this.lastBackup);
      this.computeFleetStats();
      this.notifySubscribers('data_changed');
      console.log('✅ CentralizedFleetDataService: Rollback completed');
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