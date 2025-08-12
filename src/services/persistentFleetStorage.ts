// Persistent Fleet Storage Service - Transition Wrapper
// Manages fleet data with automatic PostgreSQL migration following Data Consistency Architecture Guide
// Enhanced with comprehensive error handling, field standardization, and seamless storage transition

import { storageTransition } from './storageTransition';
import { truckNumberParser } from './truckNumberParser';
// import { authService } from './authService'; // Temporarily disabled for build
const authService = { getCurrentCompanyId: () => 'default-company' };
import { eventBus, FleetEvents } from './eventBus';
import { standardizeVehicleData, standardizeDriverData, toLegacyFormat } from '../utils/fieldStandardization';
import { FIELD_NAMING_STANDARDS } from '../types/standardizedFields';
import { logger, LogContext } from './logger';
import { errorHandler, withErrorHandling } from './errorHandlingService';

export interface VehicleRecord {
  id: string;
  organizationId?: string; // Added for PostgreSQL compatibility
  vin: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  dotNumber?: string;
  truckNumber: string; // e.g., "Truck #001", "Unit 47", etc.
  status: 'active' | 'inactive' | 'maintenance';
  dateAdded: string;
  lastUpdated: string;
  
  // Registration data - following Data Consistency Architecture Guide
  registrationNumber?: string;
  registrationState?: string;
  registrationExpirationDate?: string; // Standardized naming per Architecture Guide
  registeredOwner?: string;
  
  // Insurance data - following Data Consistency Architecture Guide
  insuranceCarrier?: string;
  policyNumber?: string;
  insuranceExpirationDate?: string; // Standardized naming per Architecture Guide
  coverageAmount?: number;
  
  // Compliance status - added for PostgreSQL compatibility
  complianceStatus?: 'compliant' | 'warning' | 'expired' | 'unknown';
  lastInspectionDate?: string;
  nextInspectionDue?: string;
  
  // Legacy compliance data for backward compatibility
  complianceData?: any;
}

export interface MedicalCertificate {
  certificateNumber: string;
  issuedDate: string;
  expirationDate: string;
  examinerName: string;
  examinerNationalRegistry: string;
  medicalVariance?: string; // SPE certificate if applicable
  restrictions?: string[];
  documentUrl?: string; // uploaded PDF/image
  status: 'valid' | 'expired' | 'expiring_soon' | 'invalid';
  daysUntilExpiry: number;
}

export interface CDLInfo {
  cdlNumber: string;
  cdlState: string;
  issueDate: string;
  expirationDate: string;
  class: 'A' | 'B' | 'C';
  endorsements: string[];
  restrictions: string[];
  status: 'valid' | 'expired' | 'expiring_soon' | 'invalid';
  daysUntilExpiry: number;
}

export interface DriverRecord {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  hireDate: string;
  status: 'active' | 'inactive' | 'terminated';
  dateAdded: string;
  lastUpdated: string;
  
  // CDL Information
  cdlInfo: CDLInfo;
  
  // Medical Certificate
  medicalCertificate: MedicalCertificate;
  
  // Contact Information
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  
  // Emergency Contact
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  
  // Additional Documents
  backgroundCheckDate?: string;
  drugTestDate?: string;
  trainingCertificates?: string[];
}

class PersistentFleetStorage {
  private readonly BASE_STORAGE_KEY = 'truckbo_fleet_data';
  private readonly BASE_BACKUP_KEY = 'truckbo_fleet_backup';
  private readonly BASE_DRIVERS_STORAGE_KEY = 'truckbo_drivers_data';
  private readonly BASE_DRIVERS_BACKUP_KEY = 'truckbo_drivers_backup';
  private listeners: (() => void)[] = [];
  private initialized: boolean = false;

  // Get company-specific storage keys
  private getStorageKey(): string {
    try {
      return authService.getCompanyScopedKey(this.BASE_STORAGE_KEY);
    } catch (error) {
      // Fall back to base key if no auth session (for backward compatibility)
      return this.BASE_STORAGE_KEY;
    }
  }

  private getBackupKey(): string {
    try {
      return authService.getCompanyScopedKey(this.BASE_BACKUP_KEY);
    } catch (error) {
      return this.BASE_BACKUP_KEY;
    }
  }

  private getDriversStorageKey(): string {
    try {
      return authService.getCompanyScopedKey(this.BASE_DRIVERS_STORAGE_KEY);
    } catch (error) {
      return this.BASE_DRIVERS_STORAGE_KEY;
    }
  }

  private getDriversBackupKey(): string {
    try {
      return authService.getCompanyScopedKey(this.BASE_DRIVERS_BACKUP_KEY);
    } catch (error) {
      return this.BASE_DRIVERS_BACKUP_KEY;
    }
  }

  /**
   * Initialize storage system with automatic PostgreSQL migration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'initialize'
    };

    const operationId = logger.startOperation('Initializing fleet storage system', context);

    try {
      logger.info('🔄 Initializing fleet storage with PostgreSQL migration', context);
      
      // Initialize the storage transition manager
      await storageTransition.initialize();
      
      // Log storage status for debugging
      const status = await storageTransition.getStorageStatus();
      logger.info('Storage system initialized', context, {
        currentMode: status.currentMode,
        postgresqlAvailable: status.postgresqlAvailable,
        dataStats: status.dataStats
      });

      this.initialized = true;
      
      logger.completeOperation('Initializing fleet storage system', operationId, context, {
        storageMode: status.currentMode,
        migrationPerformed: status.dataStats.postgresql.vehicles > 0
      });

    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Fleet storage initialization failed: ${(error as Error).message}`,
        'initialize',
        'storage_system',
        context
      );
      
      logger.failOperation('Initializing fleet storage system', operationId, appError, context);
      
      // Still allow the system to work with localStorage fallback
      logger.warn('Falling back to localStorage-only mode', context);
      this.initialized = true;
    }
  }

  /**
   * Get the active storage service (PostgreSQL or localStorage)
   */
  private getActiveStorageService() {
    return storageTransition.getStorageService();
  }

  // Get all vehicles from active storage (PostgreSQL or localStorage)
  getFleet(): VehicleRecord[] {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'getFleet'
    };

    const operationId = logger.startOperation('Loading fleet data', context);

    try {
      // Ensure storage is initialized
      if (!this.initialized) {
        logger.warn('Storage not initialized, using localStorage fallback', context);
        return this.getFleetFromLocalStorage();
      }

      const activeService = this.getActiveStorageService();
      
      // Check if active service has async methods (PostgreSQL) or sync methods (localStorage)
      if (typeof activeService.getFleet === 'function') {
        const fleetResult = activeService.getFleet();
        
        // Handle both sync (localStorage) and async (PostgreSQL) results
        if (fleetResult && typeof fleetResult.then === 'function') {
          // This is async (PostgreSQL) - we need to handle it differently
          logger.warn('Async fleet loading not supported in sync context, falling back to localStorage', context);
          return this.getFleetFromLocalStorage();
        }
        
        // This is sync (localStorage or hybrid fallback)
        const fleet = fleetResult as VehicleRecord[];
        
        logger.completeOperation('Loading fleet data', operationId, context, {
          loadedCount: fleet.length,
          sourceType: 'activeService'
        });
        
        return fleet;
      }
      
      // Fallback to localStorage
      return this.getFleetFromLocalStorage();
      
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to load fleet data: ${(error as Error).message}`,
        'read',
        'active_storage',
        context
      );
      
      logger.failOperation('Loading fleet data', operationId, appError, context);
      
      // Final fallback to localStorage
      logger.warn('Active storage failed, falling back to localStorage', context);
      return this.getFleetFromLocalStorage();
    }
  }

  // Async version for PostgreSQL compatibility
  async getFleetAsync(): Promise<VehicleRecord[]> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'getFleetAsync'
    };

    try {
      // Ensure storage is initialized
      await this.ensureInitialized();
      
      const activeService = this.getActiveStorageService();
      
      // Try async method first (PostgreSQL)
      if (activeService.getFleet) {
        const result = await activeService.getFleet();
        return Array.isArray(result) ? result : [];
      }
      
      // Fallback to sync localStorage
      return this.getFleetFromLocalStorage();
      
    } catch (error) {
      logger.warn('Async fleet loading failed, using localStorage fallback', context, error);
      return this.getFleetFromLocalStorage();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getFleetFromLocalStorage(): VehicleRecord[] {
    try {
      const data = localStorage.getItem(this.getStorageKey());
      const rawData = data ? JSON.parse(data) : [];
      
      // Apply field standardization to legacy data
      return rawData.map((record: any) => this.standardizeVehicleRecord(record));
    } catch (error) {
      console.error('Error loading from localStorage:', error);
      return [];
    }
  }

  // Save entire fleet
  saveFleet(vehicles: VehicleRecord[]): boolean {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'saveFleet',
      metadata: { 
        storageKey: this.getStorageKey(),
        vehicleCount: vehicles.length
      }
    };

    const operationId = logger.startOperation('Saving fleet data', context, {
      vehicleCount: vehicles.length
    });

    try {
      logger.debug('Creating backup before saving fleet data', context);
      
      // Create backup before saving
      this.createBackup();
      
      logger.debug('Serializing and saving fleet data to localStorage', context);
      
      const serializedData = JSON.stringify(vehicles);
      localStorage.setItem(this.getStorageKey(), serializedData);
      
      logger.info(`Successfully saved ${vehicles.length} vehicles to storage`, context, {
        dataSize: serializedData.length
      });
      
      // Notify all listeners that fleet data has changed
      this.notifyListeners();
      
      // Emit event bus notification
      FleetEvents.fleetCleared('persistentFleetStorage');
      
      logger.completeOperation('Saving fleet data', operationId, context, {
        savedCount: vehicles.length
      });
      
      return true;
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to save fleet data: ${(error as Error).message}`,
        'write',
        this.getStorageKey(),
        context
      );
      
      logger.failOperation('Saving fleet data', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return false;
    }
  }

  // Add single vehicle to existing fleet
  addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): VehicleRecord | null {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'addVehicle',
      metadata: { 
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model
      }
    };

    const operationId = logger.startOperation('Adding vehicle to fleet', context, {
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate
    });

    try {
      logger.debug('Loading existing fleet for duplicate check', context);
      const fleet = this.getFleet();
      
      // Check for duplicate VIN
      const existingVehicle = fleet.find(v => v.vin === vehicle.vin);
      if (existingVehicle) {
        const validationError = errorHandler.createValidationError(
          `Vehicle with VIN ${vehicle.vin} already exists`,
          'vin',
          vehicle.vin,
          context
        );
        
        logger.failOperation('Adding vehicle to fleet', operationId, validationError, context);
        
        errorHandler.handleError(validationError, context, {
          showUserNotification: true
        });
        
        return null;
      }

      // Smart truck number detection - parse from existing data first
      let truckNumber = vehicle.truckNumber;
      
      if (!truckNumber) {
        logger.debug('Auto-detecting truck number', context);
        
        const parseResult = truckNumberParser.parseTruckNumber({
          vin: vehicle.vin,
          licensePlate: vehicle.licensePlate,
          dotNumber: vehicle.dotNumber,
          make: vehicle.make,
          model: vehicle.model
        });
        
        truckNumber = parseResult.truckNumber || this.generateTruckNumber(fleet);
        
        logger.info(`Auto-detected truck number for ${vehicle.vin}`, context, {
          detected: parseResult.truckNumber,
          final: truckNumber,
          confidence: parseResult.confidence,
          source: parseResult.source,
          needsReview: parseResult.needsReview
        });
      }

      const newVehicle: VehicleRecord = {
        ...vehicle,
        truckNumber,
        id: this.generateId(),
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      logger.debug('Adding vehicle to fleet array', context, {
        vehicleId: newVehicle.id,
        truckNumber: newVehicle.truckNumber
      });

      fleet.push(newVehicle);
      
      const saveSuccess = this.saveFleet(fleet);
      if (!saveSuccess) {
        const saveError = errorHandler.createStorageError(
          'Failed to save fleet after adding vehicle',
          'write',
          this.getStorageKey(),
          context
        );
        
        logger.failOperation('Adding vehicle to fleet', operationId, saveError, context);
        
        errorHandler.handleError(saveError, context, {
          showUserNotification: true
        });
        
        return null;
      }
      
      // Emit event for new vehicle
      FleetEvents.vehicleAdded(newVehicle, 'persistentFleetStorage');
      
      logger.completeOperation('Adding vehicle to fleet', operationId, context, {
        vehicleId: newVehicle.id,
        truckNumber: newVehicle.truckNumber,
        fleetSize: fleet.length
      });
      
      return newVehicle;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to add vehicle: ${(error as Error).message}`,
        'addVehicle',
        vehicle,
        context
      );
      
      logger.failOperation('Adding vehicle to fleet', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return null;
    }
  }

  // Add multiple vehicles
  addVehicles(vehicles: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>[]): {
    successful: VehicleRecord[];
    failed: { vehicle: any; error: string }[];
  } {
    const successful: VehicleRecord[] = [];
    const failed: { vehicle: any; error: string }[] = [];

    vehicles.forEach(vehicle => {
      try {
        const added = this.addVehicle(vehicle);
        if (added) {
          successful.push(added);
        } else {
          failed.push({ vehicle, error: 'Failed to add vehicle' });
        }
      } catch (error) {
        failed.push({ vehicle, error: error instanceof Error ? error.message : String(error) });
      }
    });

    return { successful, failed };
  }

  // Update existing vehicle
  updateVehicle(id: string, updates: Partial<VehicleRecord>): boolean {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'updateVehicle',
      metadata: { 
        vehicleId: id,
        updateFields: Object.keys(updates)
      }
    };

    const operationId = logger.startOperation('Updating vehicle', context, {
      vehicleId: id,
      updateFields: Object.keys(updates)
    });

    try {
      logger.debug('Loading fleet to find vehicle for update', context);
      const fleet = this.getFleet();
      const index = fleet.findIndex(v => v.id === id);
      
      if (index === -1) {
        const notFoundError = errorHandler.createValidationError(
          `Vehicle with ID ${id} not found`,
          'vehicleId',
          id,
          context
        );
        
        logger.failOperation('Updating vehicle', operationId, notFoundError, context);
        
        errorHandler.handleError(notFoundError, context, {
          showUserNotification: true
        });
        
        return false;
      }

      const originalVehicle = { ...fleet[index] };
      fleet[index] = {
        ...fleet[index],
        ...updates,
        lastUpdated: new Date().toISOString()
      };

      logger.debug('Attempting to save updated fleet', context, {
        originalVin: originalVehicle.vin,
        updatedFields: Object.keys(updates)
      });

      const success = this.saveFleet(fleet);
      
      if (success) {
        // Emit event for updated vehicle
        FleetEvents.vehicleUpdated(fleet[index], 'persistentFleetStorage');
        
        logger.completeOperation('Updating vehicle', operationId, context, {
          vehicleVin: fleet[index].vin,
          updatedFields: Object.keys(updates)
        });
      } else {
        const saveError = errorHandler.createStorageError(
          'Failed to save updated vehicle data',
          'write',
          this.getStorageKey(),
          context
        );
        
        logger.failOperation('Updating vehicle', operationId, saveError, context);
        
        errorHandler.handleError(saveError, context, {
          showUserNotification: true
        });
      }
      
      return success;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to update vehicle: ${(error as Error).message}`,
        'updateVehicle',
        { id, updates },
        context
      );
      
      logger.failOperation('Updating vehicle', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return false;
    }
  }

  // Remove vehicle
  removeVehicle(id: string): boolean {
    try {
      const fleet = this.getFleet();
      const filtered = fleet.filter(v => v.id !== id);
      
      if (filtered.length === fleet.length) {
        throw new Error(`Vehicle with ID ${id} not found`);
      }

      const success = this.saveFleet(filtered);
      
      if (success) {
        // Emit event for deleted vehicle - find the VIN from the original fleet
        const deletedVehicle = fleet.find(v => v.id === id);
        if (deletedVehicle) {
          FleetEvents.vehicleDeleted(deletedVehicle.vin, 'persistentFleetStorage');
        }
      }
      
      return success;
    } catch (error) {
      console.error('Error removing vehicle:', error);
      return false;
    }
  }

  // Search vehicles - now includes truck numbers for fleet managers
  searchVehicles(query: string): VehicleRecord[] {
    const fleet = this.getFleet();
    const lowercaseQuery = query.toLowerCase();
    
    return fleet.filter(vehicle => 
      vehicle.vin.toLowerCase().includes(lowercaseQuery) ||
      vehicle.make.toLowerCase().includes(lowercaseQuery) ||
      vehicle.model.toLowerCase().includes(lowercaseQuery) ||
      vehicle.licensePlate.toLowerCase().includes(lowercaseQuery) ||
      vehicle.truckNumber.toLowerCase().includes(lowercaseQuery)
    );
  }

  // Get fleet statistics
  getFleetStats() {
    const fleet = this.getFleet();
    
    return {
      total: fleet.length,
      active: fleet.filter(v => v.status === 'active').length,
      inactive: fleet.filter(v => v.status === 'inactive').length,
      recentlyAdded: fleet.filter(v => {
        const addedDate = new Date(v.dateAdded);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return addedDate > weekAgo;
      }).length
    };
  }

  // Import/Export functionality
  exportFleet(): string {
    const fleet = this.getFleet();
    return JSON.stringify(fleet, null, 2);
  }

  importFleet(jsonData: string): { success: boolean; message: string; count?: number } {
    try {
      const importedVehicles = JSON.parse(jsonData);
      
      if (!Array.isArray(importedVehicles)) {
        throw new Error('Invalid data format - expected array of vehicles');
      }

      // Validate each vehicle has required fields
      const validated = importedVehicles.filter(v => v.vin && v.make && v.model);
      
      if (validated.length === 0) {
        throw new Error('No valid vehicles found in import data');
      }

      this.saveFleet(validated);
      
      return {
        success: true,
        message: `Successfully imported ${validated.length} vehicles`,
        count: validated.length
      };
    } catch (error) {
      return {
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Backup and restore
  private createBackup(): void {
    const currentData = localStorage.getItem(this.getStorageKey());
    if (currentData) {
      localStorage.setItem(this.getBackupKey(), currentData);
    }
  }

  private getBackup(): VehicleRecord[] {
    try {
      const backup = localStorage.getItem(this.getBackupKey());
      return backup ? JSON.parse(backup) : [];
    } catch (error) {
      console.error('Error loading backup:', error);
      return [];
    }
  }

  restoreFromBackup(): boolean {
    try {
      const backup = localStorage.getItem(this.getBackupKey());
      if (backup) {
        localStorage.setItem(this.getStorageKey(), backup);
        this.notifyListeners();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error restoring backup:', error);
      return false;
    }
  }

  // Clear all data
  clearFleet(): boolean {
    try {
      this.createBackup(); // Backup before clearing
      localStorage.removeItem(this.getStorageKey());
      this.notifyListeners();
      
      // Emit event bus notification for fleet clearing
      FleetEvents.fleetCleared('persistentFleetStorage');
      
      return true;
    } catch (error) {
      console.error('Error clearing fleet:', error);
      return false;
    }
  }

  private generateId(): string {
    return `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Generate sequential truck numbers for fleet management
  private generateTruckNumber(existingFleet: VehicleRecord[]): string {
    const existingNumbers = existingFleet
      .map(v => v.truckNumber)
      .filter(num => num?.match(/^Truck #\d+$/))
      .map(num => parseInt(num.replace('Truck #', '')))
      .filter(num => !isNaN(num));
    
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    return `Truck #${nextNumber.toString().padStart(3, '0')}`;
  }

  // === DRIVER MANAGEMENT METHODS ===

  // Get all drivers from storage
  getDrivers(): DriverRecord[] {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'getDrivers',
      metadata: { storageKey: this.getDriversStorageKey() }
    };

    const operationId = logger.startOperation('Loading drivers data', context);

    try {
      logger.debug('Attempting to load drivers data from localStorage', context);
      
      const data = localStorage.getItem(this.getDriversStorageKey());
      const rawDrivers = data ? JSON.parse(data) : [];
      
      logger.info(`Successfully loaded ${rawDrivers.length} drivers from storage`, context, {
        driverCount: rawDrivers.length,
        hasData: !!data
      });
      
      // Apply field standardization to legacy data and calculate status
      const standardizedDrivers = rawDrivers.map((driver: any) => {
        const standardizedDriver = this.standardizeDriverRecord(driver);
        return {
          ...standardizedDriver,
          medicalCertificate: {
            ...standardizedDriver.medicalCertificate,
            ...this.calculateCertificateStatus(standardizedDriver.medicalCertificate.expirationDate)
          },
          cdlInfo: {
            ...standardizedDriver.cdlInfo,
            ...this.calculateCertificateStatus(standardizedDriver.cdlInfo.expirationDate)
          }
        };
      });
      
      logger.completeOperation('Loading drivers data', operationId, context, {
        loadedCount: standardizedDrivers.length
      });
      
      return standardizedDrivers;
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to load drivers data: ${(error as Error).message}`,
        'read',
        this.getDriversStorageKey(),
        context
      );
      
      logger.failOperation('Loading drivers data', operationId, appError, context);
      
      logger.warn('Attempting to load backup drivers data', context);
      
      try {
        const backupDrivers = this.getDriversBackup();
        logger.info(`Loaded ${backupDrivers.length} drivers from backup`, context, {
          backupCount: backupDrivers.length
        });
        
        errorHandler.handleError(appError, context, {
          showUserNotification: true,
          enableFallback: true
        });
        
        return backupDrivers;
      } catch (backupError) {
        const backupAppError = errorHandler.createStorageError(
          `Failed to load backup drivers data: ${(backupError as Error).message}`,
          'read',
          this.getDriversBackupKey(),
          context
        );
        
        logger.error('Both main and backup drivers data loading failed', context, backupAppError);
        
        errorHandler.handleError(backupAppError, context, {
          showUserNotification: true
        });
        
        return [];
      }
    }
  }

  // Save entire drivers list
  saveDrivers(drivers: DriverRecord[]): boolean {
    try {
      // Create backup before saving
      this.createDriversBackup();
      
      localStorage.setItem(this.getDriversStorageKey(), JSON.stringify(drivers));
      
      // Notify all listeners that data has changed
      this.notifyListeners();
      
      return true;
    } catch (error) {
      console.error('Error saving drivers data:', error);
      return false;
    }
  }

  // Add single driver
  addDriver(driver: Omit<DriverRecord, 'id' | 'dateAdded' | 'lastUpdated'>): DriverRecord | null {
    try {
      const drivers = this.getDrivers();
      
      // Check for duplicate employee ID or CDL number
      const duplicateEmployee = drivers.find(d => d.employeeId === driver.employeeId);
      if (duplicateEmployee) {
        console.error('Driver with this employee ID already exists:', driver.employeeId);
        return null;
      }

      const duplicateCDL = drivers.find(d => d.cdlInfo.cdlNumber === driver.cdlInfo.cdlNumber);
      if (duplicateCDL) {
        console.error('Driver with this CDL number already exists:', driver.cdlInfo.cdlNumber);
        return null;
      }

      const newDriver: DriverRecord = {
        ...driver,
        id: this.generateId(),
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        medicalCertificate: {
          ...driver.medicalCertificate,
          ...this.calculateCertificateStatus(driver.medicalCertificate.expirationDate)
        },
        cdlInfo: {
          ...driver.cdlInfo,
          ...this.calculateCertificateStatus(driver.cdlInfo.expirationDate)
        }
      };

      drivers.push(newDriver);
      
      if (this.saveDrivers(drivers)) {
        console.log('✅ Driver added successfully:', newDriver.firstName, newDriver.lastName);
        return newDriver;
      } else {
        console.error('❌ Failed to save driver');
        return null;
      }
    } catch (error) {
      console.error('Error adding driver:', error);
      return null;
    }
  }

  // Update existing driver
  updateDriver(driverId: string, updates: Partial<DriverRecord>): boolean {
    try {
      const drivers = this.getDrivers();
      const driverIndex = drivers.findIndex(d => d.id === driverId);
      
      if (driverIndex === -1) {
        console.error('Driver not found:', driverId);
        return false;
      }

      drivers[driverIndex] = {
        ...drivers[driverIndex],
        ...updates,
        lastUpdated: new Date().toISOString(),
        medicalCertificate: updates.medicalCertificate ? {
          ...updates.medicalCertificate,
          ...this.calculateCertificateStatus(updates.medicalCertificate.expirationDate)
        } : drivers[driverIndex].medicalCertificate,
        cdlInfo: updates.cdlInfo ? {
          ...updates.cdlInfo,
          ...this.calculateCertificateStatus(updates.cdlInfo.expirationDate)
        } : drivers[driverIndex].cdlInfo
      };

      return this.saveDrivers(drivers);
    } catch (error) {
      console.error('Error updating driver:', error);
      return false;
    }
  }

  // Get drivers with expiring certificates
  getDriversWithExpiringCertificates(daysThreshold: number = 30): DriverRecord[] {
    return this.getDrivers().filter(driver => 
      driver.medicalCertificate.daysUntilExpiry <= daysThreshold ||
      driver.cdlInfo.daysUntilExpiry <= daysThreshold
    );
  }

  // Helper method to calculate certificate status and days until expiry
  private calculateCertificateStatus(expirationDate: string): { status: 'valid' | 'expired' | 'expiring_soon' | 'invalid', daysUntilExpiry: number } {
    try {
      const expiry = new Date(expirationDate);
      const today = new Date();
      const timeDiff = expiry.getTime() - today.getTime();
      const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 3600 * 24));

      let status: 'valid' | 'expired' | 'expiring_soon' | 'invalid';
      
      if (daysUntilExpiry < 0) {
        status = 'expired';
      } else if (daysUntilExpiry <= 30) {
        status = 'expiring_soon';
      } else {
        status = 'valid';
      }

      return { status, daysUntilExpiry };
    } catch (error) {
      console.error('Error calculating certificate status:', error);
      return { status: 'invalid', daysUntilExpiry: -999 };
    }
  }

  // Backup methods for drivers
  private createDriversBackup(): void {
    try {
      const current = localStorage.getItem(this.getDriversStorageKey());
      if (current) {
        localStorage.setItem(this.getDriversBackupKey(), current);
      }
    } catch (error) {
      console.error('Error creating drivers backup:', error);
    }
  }

  private getDriversBackup(): DriverRecord[] {
    try {
      const backup = localStorage.getItem(this.getDriversBackupKey());
      return backup ? JSON.parse(backup) : [];
    } catch (error) {
      console.error('Error loading drivers backup:', error);
      return [];
    }
  }

  // Event system for UI updates
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'notifyListeners',
      metadata: { listenerCount: this.listeners.length }
    };

    logger.debug(`Notifying ${this.listeners.length} storage listeners`, context);

    this.listeners.forEach((listener, index) => {
      try {
        listener();
      } catch (error) {
        const listenerError = errorHandler.createProcessingError(
          `Error in fleet storage listener at index ${index}: ${(error as Error).message}`,
          'notifyListeners',
          { listenerIndex: index },
          context
        );
        
        logger.error(`Fleet storage listener ${index} failed`, context, listenerError);
        
        // Don't show user notifications for listener errors as they're internal
        errorHandler.handleError(listenerError, context, {
          showUserNotification: false
        });
      }
    });
  }

  /**
   * Transform legacy data to standardized format when loading from storage
   */
  private standardizeVehicleRecord(record: any): VehicleRecord {
    // Handle legacy field name mappings
    if (record.registrationExpiry && !record.registrationExpirationDate) {
      record.registrationExpirationDate = record.registrationExpiry;
      delete record.registrationExpiry;
    }
    if (record.insuranceExpiry && !record.insuranceExpirationDate) {
      record.insuranceExpirationDate = record.insuranceExpiry;
      delete record.insuranceExpiry;
    }
    
    // Ensure consistent status values
    if (record.status && typeof record.status === 'string') {
      record.status = record.status.toLowerCase() as 'active' | 'inactive' | 'maintenance';
    }
    
    // Ensure year is always number
    if (record.year && typeof record.year === 'string') {
      record.year = parseInt(record.year) || new Date().getFullYear();
    }
    
    return record as VehicleRecord;
  }

  /**
   * Transform legacy driver data to standardized format when loading from storage
   */
  private standardizeDriverRecord(record: any): DriverRecord {
    // Handle legacy CDL expiration field names
    if (record.cdlInfo) {
      if (record.cdlInfo.cdlExpiry && !record.cdlInfo.expirationDate) {
        record.cdlInfo.expirationDate = record.cdlInfo.cdlExpiry;
        delete record.cdlInfo.cdlExpiry;
      }
    }
    
    // Handle legacy medical certificate field names
    if (record.medicalCertificate) {
      if (record.medicalCertificate.medicalExpiry && !record.medicalCertificate.expirationDate) {
        record.medicalCertificate.expirationDate = record.medicalCertificate.medicalExpiry;
        delete record.medicalCertificate.medicalExpiry;
      }
    }
    
    return record as DriverRecord;
  }
}

export const persistentFleetStorage = new PersistentFleetStorage();