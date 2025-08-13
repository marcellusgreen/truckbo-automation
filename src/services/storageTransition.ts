// Storage Transition Utility
// Handles migration from localStorage to PostgreSQL following Data Consistency Architecture Guide
// Provides seamless transition with data preservation and fallback mechanisms

import { persistentFleetStorage as localStorageService } from './persistentFleetStorage';
import { postgresPersistentFleetStorage as postgresService } from './postgresPersistentFleetStorage';
import { logger, LogContext } from './logger';
import { errorHandler } from './errorHandlingService';

export type StorageMode = 'localStorage' | 'postgresql' | 'hybrid';

export interface StorageConfig {
  mode: StorageMode;
  enableAutoMigration: boolean;
  fallbackToLocalStorage: boolean;
  syncBidirectionally: boolean;
}

class StorageTransitionManager {
  private currentMode: StorageMode;
  private config: StorageConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      mode: 'localStorage', // Start with localStorage for safety
      enableAutoMigration: true,
      fallbackToLocalStorage: true,
      syncBidirectionally: false,
      ...config
    };
    this.currentMode = this.config.mode;
  }

  /**
   * Initialize the storage system and handle migration
   */
  async initialize(): Promise<void> {
    const context: LogContext = {
      layer: 'storage',
      component: 'StorageTransitionManager',
      operation: 'initialize',
      metadata: { 
        mode: this.currentMode,
        config: this.config 
      }
    };

    const operationId = logger.startOperation('Initializing storage transition', context);

    try {
      logger.info('🔄 Initializing storage transition manager', context, {
        mode: this.currentMode,
        config: this.config
      });

      // Try to initialize PostgreSQL if needed
      if (this.currentMode === 'postgresql' || this.currentMode === 'hybrid') {
        try {
          await postgresService.initialize();
          logger.info('✅ PostgreSQL storage initialized successfully', context);
        } catch (error) {
          logger.warn('⚠️ PostgreSQL initialization failed, checking fallback options', context, error);
          
          if (this.config.fallbackToLocalStorage) {
            logger.info('🔄 Falling back to localStorage mode', context);
            this.currentMode = 'localStorage';
          } else {
            throw error;
          }
        }
      }

      // Perform migration if enabled and needed
      if (this.config.enableAutoMigration && this.shouldMigrate()) {
        await this.performMigration();
      }

      this.initialized = true;
      
      logger.completeOperation('Initializing storage transition', operationId, context, {
        finalMode: this.currentMode,
        migrationPerformed: this.config.enableAutoMigration && this.shouldMigrate()
      });

    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Storage transition initialization failed: ${(error as Error).message}`,
        'initialize',
        'transition_manager',
        context
      );
      
      logger.failOperation('Initializing storage transition', operationId, appError, context);
      throw appError;
    }
  }

  /**
   * Get the appropriate storage service based on current mode
   */
  getStorageService() {
    this.checkInitialized();
    
    switch (this.currentMode) {
      case 'postgresql':
        return postgresService;
      case 'localStorage':
        return localStorageService;
      case 'hybrid':
        return new HybridStorageProxy(postgresService, localStorageService);
      default:
        throw new Error(`Unknown storage mode: ${this.currentMode}`);
    }
  }

  /**
   * Migrate data from localStorage to PostgreSQL
   */
  async migrateToPostgreSQL(): Promise<{ success: boolean; message: string; migratedCount: number }> {
    const context: LogContext = {
      layer: 'storage',
      component: 'StorageTransitionManager',
      operation: 'migrateToPostgreSQL'
    };

    const operationId = logger.startOperation('Migrating data to PostgreSQL', context);

    try {
      logger.info('🚚 Starting migration from localStorage to PostgreSQL', context);

      // Get data from localStorage
      const localFleetData = localStorageService.getFleet();
      const localDriversData = localStorageService.getDrivers();

      logger.info(`Found ${localFleetData.length} vehicles and ${localDriversData.length} drivers in localStorage`, context, {
        vehicleCount: localFleetData.length,
        driverCount: localDriversData.length
      });

      if (localFleetData.length === 0 && localDriversData.length === 0) {
        logger.info('No data to migrate', context);
        return {
          success: true,
          message: 'No data found in localStorage to migrate',
          migratedCount: 0
        };
      }

      // Initialize PostgreSQL if not already done
      await postgresService.initialize();

      let migratedCount = 0;

      // Migrate vehicles
      if (localFleetData.length > 0) {
        logger.info(`Migrating ${localFleetData.length} vehicles`, context);
        
        // Apply field standardization during migration
        const standardizedVehicles = localFleetData.map(vehicle => this.standardizeForMigration(vehicle));
        
        const vehicleMigrationSuccess = await postgresService.saveFleet(standardizedVehicles);
        
        if (vehicleMigrationSuccess) {
          migratedCount += localFleetData.length;
          logger.info(`✅ Successfully migrated ${localFleetData.length} vehicles`, context);
        } else {
          throw new Error('Failed to migrate vehicles to PostgreSQL');
        }
      }

      // TODO: Migrate drivers when driver methods are implemented in PostgreSQL service

      // Update mode to PostgreSQL after successful migration
      this.currentMode = 'postgresql';

      logger.completeOperation('Migrating data to PostgreSQL', operationId, context, {
        migratedVehicles: localFleetData.length,
        migratedDrivers: localDriversData.length,
        totalMigrated: migratedCount
      });

      return {
        success: true,
        message: `Successfully migrated ${migratedCount} records to PostgreSQL`,
        migratedCount
      };

    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Migration to PostgreSQL failed: ${(error as Error).message}`,
        'migrate',
        'postgresql',
        context
      );
      
      logger.failOperation('Migrating data to PostgreSQL', operationId, appError, context);
      
      return {
        success: false,
        message: `Migration failed: ${(error as Error).message}`,
        migratedCount: 0
      };
    }
  }

  /**
   * Switch storage mode
   */
  async switchMode(newMode: StorageMode): Promise<void> {
    const context: LogContext = {
      layer: 'storage',
      component: 'StorageTransitionManager',
      operation: 'switchMode',
      metadata: { 
        fromMode: this.currentMode,
        toMode: newMode 
      }
    };

    logger.info(`🔄 Switching storage mode from ${this.currentMode} to ${newMode}`, context);

    // Validate transition
    if (newMode === 'postgresql' || newMode === 'hybrid') {
      try {
        await postgresService.initialize();
      } catch (error) {
        throw new Error(`Cannot switch to ${newMode}: PostgreSQL not available`);
      }
    }

    this.currentMode = newMode;
    this.config.mode = newMode;

    logger.info(`✅ Storage mode switched to ${newMode}`, context);
  }

  /**
   * Get current storage statistics and health
   */
  async getStorageStatus(): Promise<{
    currentMode: StorageMode;
    postgresqlAvailable: boolean;
    localStorageUsed: boolean;
    dataStats: {
      localStorage: { vehicles: number; drivers: number };
      postgresql: { vehicles: number; drivers: number };
    };
  }> {
    let postgresqlAvailable = false;
    let postgresStats = { vehicles: 0, drivers: 0 };

    try {
      await postgresService.initialize();
      const postgresFleet = await postgresService.getFleet();
      const postgresDrivers = await postgresService.getDrivers();
      postgresStats = {
        vehicles: postgresFleet.length,
        drivers: postgresDrivers.length
      };
      postgresqlAvailable = true;
    } catch (error) {
      // PostgreSQL not available
    }

    const localFleet = localStorageService.getFleet();
    const localDrivers = localStorageService.getDrivers();

    return {
      currentMode: this.currentMode,
      postgresqlAvailable,
      localStorageUsed: localFleet.length > 0 || localDrivers.length > 0,
      dataStats: {
        localStorage: {
          vehicles: localFleet.length,
          drivers: localDrivers.length
        },
        postgresql: postgresStats
      }
    };
  }

  private shouldMigrate(): boolean {
    // Migrate if:
    // 1. Current mode is PostgreSQL but data exists in localStorage
    // 2. Auto migration is enabled
    const localFleet = localStorageService.getFleet();
    const localDrivers = localStorageService.getDrivers();
    
    return this.currentMode === 'postgresql' && 
           (localFleet.length > 0 || localDrivers.length > 0);
  }

  private async performMigration(): Promise<void> {
    const migrationResult = await this.migrateToPostgreSQL();
    if (!migrationResult.success) {
      throw new Error(`Auto-migration failed: ${migrationResult.message}`);
    }
  }

  private standardizeForMigration(vehicle: any): any {
    // Apply Data Consistency Architecture Guide field standardization
    const standardized = { ...vehicle };
    
    // Handle legacy field name mappings
    if (vehicle.registrationExpiry && !standardized.registrationExpirationDate) {
      standardized.registrationExpirationDate = vehicle.registrationExpiry;
      delete standardized.registrationExpiry;
    }
    
    if (vehicle.insuranceExpiry && !standardized.insuranceExpirationDate) {
      standardized.insuranceExpirationDate = vehicle.insuranceExpiry;
      delete standardized.insuranceExpiry;
    }
    
    // Ensure proper organization ID
    if (!standardized.organizationId) {
      standardized.organizationId = '550e8400-e29b-41d4-a716-446655440000'; // Default org
    }
    
    // Ensure proper date formats
    if (!standardized.dateAdded) {
      standardized.dateAdded = new Date().toISOString();
    }
    if (!standardized.lastUpdated) {
      standardized.lastUpdated = new Date().toISOString();
    }
    
    return standardized;
  }

  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('StorageTransitionManager not initialized. Call initialize() first.');
    }
  }
}

/**
 * Hybrid storage proxy that tries PostgreSQL first, falls back to localStorage
 */
class HybridStorageProxy {
  constructor(
    private primaryService: typeof postgresService,
    private fallbackService: typeof localStorageService
  ) {}

  async getFleet() {
    try {
      return await this.primaryService.getFleet();
    } catch (error) {
      logger.warn('PostgreSQL failed, falling back to localStorage', { error });
      return this.fallbackService.getFleet();
    }
  }

  async addVehicle(vehicle: any) {
    try {
      return await this.primaryService.addVehicle(vehicle);
    } catch (error) {
      logger.warn('PostgreSQL failed, falling back to localStorage', { error });
      return this.fallbackService.addVehicle(vehicle);
    }
  }

  async updateVehicle(id: string, updates: any) {
    try {
      return await this.primaryService.updateVehicle(id, updates);
    } catch (error) {
      logger.warn('PostgreSQL failed, falling back to localStorage', { error });
      return this.fallbackService.updateVehicle(id, updates);
    }
  }

  async removeVehicle(id: string) {
    try {
      return await this.primaryService.removeVehicle(id);
    } catch (error) {
      logger.warn('PostgreSQL failed, falling back to localStorage', { error });
      return this.fallbackService.removeVehicle(id);
    }
  }

  // Add other methods as needed following the same pattern
}

// Singleton instance
export const storageTransition = new StorageTransitionManager({
  mode: 'postgresql', // Try PostgreSQL first
  enableAutoMigration: true,
  fallbackToLocalStorage: true,
  syncBidirectionally: false
});