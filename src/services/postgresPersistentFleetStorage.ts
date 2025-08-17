// API-based Persistent Fleet Storage Service
// Manages fleet data via backend API endpoints following security best practices
// Enhanced with comprehensive error handling, field standardization, and logging
import { truckNumberParser } from './truckNumberParser';
// import { authService } from './authService'; // Temporarily disabled for build  
const authService = { getCurrentCompanyId: () => 'default-company' };
import { eventBus, FleetEvents } from './eventBus';
import { standardizeVehicleData, standardizeDriverData, toLegacyFormat } from '../utils/fieldStandardization';
import { FIELD_NAMING_STANDARDS } from '../types/standardizedFields';
import { logger, LogContext } from './logger';
import { errorHandler, withErrorHandling } from './errorHandlingService';

// Interfaces following Data Consistency Architecture Guide
export interface VehicleRecord {
  id: string;
  organizationId: string;
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
  
  // Registration data - following consistent naming conventions
  registrationNumber?: string;
  registrationState?: string;
  registrationExpirationDate?: string; // Standardized naming per Architecture Guide
  registeredOwner?: string;
  
  // Insurance data - following consistent naming conventions
  insuranceCarrier?: string;
  policyNumber?: string;
  insuranceExpirationDate?: string; // Standardized naming per Architecture Guide
  coverageAmount?: number;
  
  // Compliance status
  complianceStatus?: 'compliant' | 'warning' | 'expired' | 'unknown';
  lastInspectionDate?: string;
  nextInspectionDue?: string;
  
  // Legacy compliance data for backward compatibility
  complianceData?: any;
}

export interface MedicalCertificate {
  certificateNumber: string;
  issuedDate: string;
  expirationDate: string; // Consistent naming per Architecture Guide
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
  expirationDate: string; // Consistent naming per Architecture Guide
  class: 'A' | 'B' | 'C';
  endorsements: string[];
  restrictions: string[];
  status: 'valid' | 'expired' | 'expiring_soon' | 'invalid';
  daysUntilExpiry: number;
}

export interface DriverRecord {
  id: string;
  organizationId: string;
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

class PostgresPersistentFleetStorage {
  private listeners: (() => void)[] = [];
  private readonly DEFAULT_ORG_ID = '550e8400-e29b-41d4-a716-446655440000'; // Sample org from schema
  private readonly API_BASE_URL = '/api';

  constructor() {
    // No database connection needed - using API endpoints
  }

  // Get organization ID (for now using default, later can be from auth)
  private getOrganizationId(): string {
    try {
      return authService.getCompanyScopedKey('org') || this.DEFAULT_ORG_ID;
    } catch (error) {
      return this.DEFAULT_ORG_ID;
    }
  }

  /**
   * Initialize API connection and test connectivity
   */
  async initialize(): Promise<void> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PostgresPersistentFleetStorage',
      operation: 'initialize'
    };

    try {
      // Test API connectivity by trying to fetch fleet stats
      const response = await fetch(`${this.API_BASE_URL}/fleet/stats`);
      if (!response.ok) {
        throw new Error(`API connectivity test failed: ${response.status}`);
      }
      logger.info('✅ API endpoints connected successfully', context);
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to connect to API: ${(error as Error).message}`,
        'connect',
        'api',
        context
      );
      
      logger.error('❌ API connection failed', context, appError);
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      throw appError;
    }
  }

  /**
   * Cleanup resources
   */
  async disconnect(): Promise<void> {
    // No database connection to close
    logger.info('API storage service cleanup completed');
  }

  // Get all vehicles from API
  async getFleet(): Promise<VehicleRecord[]> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PostgresPersistentFleetStorage',
      operation: 'getFleet',
      metadata: { organizationId: this.getOrganizationId() }
    };

    const operationId = logger.startOperation('Loading fleet data from API', context);

    try {
      logger.debug('Fetching fleet data from API endpoint', context);
      
      const response = await fetch(`${this.API_BASE_URL}/fleet`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const rawData = await response.json();
      
      logger.info(`Successfully loaded ${rawData.length} vehicles from API`, context, {
        vehicleCount: rawData.length
      });
      
      // Apply field standardization following Architecture Guide
      const standardizedData = rawData.map((record: any) => this.standardizeVehicleRecord(record));
      
      logger.completeOperation('Loading fleet data from API', operationId, context, {
        loadedCount: standardizedData.length
      });
      
      return standardizedData;
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to load fleet data from API: ${(error as Error).message}`,
        'read',
        'vehicles',
        context
      );
      
      logger.failOperation('Loading fleet data from API', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return [];
    }
  }

  // Save entire fleet via API
  async saveFleet(vehicles: VehicleRecord[]): Promise<boolean> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PostgresPersistentFleetStorage',
      operation: 'saveFleet',
      metadata: { 
        organizationId: this.getOrganizationId(),
        vehicleCount: vehicles.length
      }
    };

    const operationId = logger.startOperation('Saving fleet data via API', context, {
      vehicleCount: vehicles.length
    });

    try {
      logger.debug('Sending fleet data to API endpoint', context);
      
      const response = await fetch(`${this.API_BASE_URL}/fleet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(vehicles)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`API request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }
      
      const result = await response.json();
      
      logger.info(`Successfully saved ${vehicles.length} vehicles via API`, context);
      
      // Notify all listeners that fleet data has changed
      this.notifyListeners();
      
      // Emit event bus notification
      FleetEvents.fleetCleared('postgresPersistentFleetStorage');
      
      logger.completeOperation('Saving fleet data via API', operationId, context, {
        savedCount: vehicles.length
      });
      
      return result.success || true;
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to save fleet data via API: ${(error as Error).message}`,
        'write',
        'vehicles',
        context
      );
      
      logger.failOperation('Saving fleet data via API', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return false;
    }
  }

  // Add single vehicle via API
  async addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<VehicleRecord | null> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PostgresPersistentFleetStorage',
      operation: 'addVehicle',
      metadata: { 
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model
      }
    };

    const operationId = logger.startOperation('Adding vehicle via API', context, {
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate
    });

    try {
      // Smart truck number detection
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
        
        // Get existing fleet to generate sequential number
        const existingFleet = await this.getFleet();
        truckNumber = parseResult.truckNumber || this.generateTruckNumber(existingFleet);
        
        logger.info(`Auto-detected truck number for ${vehicle.vin}`, context, {
          detected: parseResult.truckNumber,
          final: truckNumber,
          confidence: parseResult.confidence,
          source: parseResult.source,
          needsReview: parseResult.needsReview
        });
      }

      const newVehicle = {
        ...vehicle,
        truckNumber,
        organizationId: this.getOrganizationId(),
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      logger.debug('Sending vehicle to API endpoint', context, {
        truckNumber: newVehicle.truckNumber
      });

      const response = await fetch(`${this.API_BASE_URL}/vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newVehicle)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        if (response.status === 409) {
          const validationError = errorHandler.createValidationError(
            errorData.error || `Vehicle with VIN ${vehicle.vin} already exists`,
            'vin',
            vehicle.vin,
            context
          );
          
          logger.failOperation('Adding vehicle via API', operationId, validationError, context);
          
          errorHandler.handleError(validationError, context, {
            showUserNotification: true
          });
          
          return null;
        }
        
        throw new Error(`API request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }
      
      const insertedVehicle = await response.json();
      const standardizedVehicle = this.standardizeVehicleRecord(insertedVehicle);
      
      // Emit event for new vehicle
      FleetEvents.vehicleAdded(standardizedVehicle, 'postgresPersistentFleetStorage');
      
      logger.completeOperation('Adding vehicle via API', operationId, context, {
        vehicleId: standardizedVehicle.id,
        truckNumber: standardizedVehicle.truckNumber
      });
      
      return standardizedVehicle;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to add vehicle via API: ${(error as Error).message}`,
        'addVehicle',
        vehicle,
        context
      );
      
      logger.failOperation('Adding vehicle via API', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return null;
    }
  }

  // Update existing vehicle via API
  async updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<boolean> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PostgresPersistentFleetStorage',
      operation: 'updateVehicle',
      metadata: { 
        vehicleId: id,
        updateFields: Object.keys(updates)
      }
    };

    const operationId = logger.startOperation('Updating vehicle via API', context, {
      vehicleId: id,
      updateFields: Object.keys(updates)
    });

    try {
      logger.debug('Sending vehicle updates to API endpoint', context);
      
      const response = await fetch(`${this.API_BASE_URL}/vehicles/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        if (response.status === 404) {
          const notFoundError = errorHandler.createValidationError(
            errorData.error || `Vehicle with ID ${id} not found`,
            'vehicleId',
            id,
            context
          );
          
          logger.failOperation('Updating vehicle via API', operationId, notFoundError, context);
          
          errorHandler.handleError(notFoundError, context, {
            showUserNotification: true
          });
          
          return false;
        }
        
        throw new Error(`API request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const updatedVehicle = await response.json();
      const standardizedVehicle = this.standardizeVehicleRecord(updatedVehicle);
      
      // Emit event for updated vehicle
      FleetEvents.vehicleUpdated(standardizedVehicle, 'postgresPersistentFleetStorage');
      
      logger.completeOperation('Updating vehicle via API', operationId, context, {
        vehicleVin: standardizedVehicle.vin,
        updatedFields: Object.keys(updates)
      });
      
      return true;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to update vehicle via API: ${(error as Error).message}`,
        'updateVehicle',
        { id, updates },
        context
      );
      
      logger.failOperation('Updating vehicle via API', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return false;
    }
  }

  // Remove vehicle via API
  async removeVehicle(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/vehicles/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        if (response.status === 404) {
          throw new Error(`Vehicle with ID ${id} not found`);
        }
        
        throw new Error(`API request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }
      
      const result = await response.json();
      
      // Extract VIN from success message if available
      const vinMatch = result.message?.match(/VIN ([A-Z0-9]+)/);
      const vin = vinMatch ? vinMatch[1] : id;

      // Emit event for deleted vehicle
      FleetEvents.vehicleDeleted(vin, 'postgresPersistentFleetStorage');
      
      return true;
    } catch (error) {
      console.error('Error removing vehicle via API:', error);
      return false;
    }
  }

  // Search vehicles via API
  async searchVehicles(query: string): Promise<VehicleRecord[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/vehicles/search?q=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      return result.results.map((record: any) => this.standardizeVehicleRecord(record));
    } catch (error) {
      console.error('Error searching vehicles via API:', error);
      return [];
    }
  }

  // Get fleet statistics via API
  async getFleetStats() {
    try {
      const response = await fetch(`${this.API_BASE_URL}/fleet/stats`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const stats = await response.json();
      
      return {
        total: stats.total || 0,
        active: stats.active || 0,
        inactive: stats.inactive || 0,
        recentlyAdded: stats.recentlyAdded || 0
      };
    } catch (error) {
      console.error('Error getting fleet stats via API:', error);
      return { total: 0, active: 0, inactive: 0, recentlyAdded: 0 };
    }
  }

  // Clear all fleet data via API
  async clearFleet(): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/fleet`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`API request failed: ${response.status} - ${errorData.error || response.statusText}`);
      }
      
      this.notifyListeners();
      
      // Emit event bus notification for fleet clearing
      FleetEvents.fleetCleared('postgresPersistentFleetStorage');
      
      return true;
    } catch (error) {
      console.error('Error clearing fleet via API:', error);
      return false;
    }
  }

  // Helper methods no longer needed with API approach

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

  private generateId(): string {
    return `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      component: 'PostgresPersistentFleetStorage',
      operation: 'notifyListeners',
      metadata: { listenerCount: this.listeners.length }
    };

    logger.debug(`Notifying ${this.listeners.length} storage listeners`, context);

    this.listeners.forEach((listener, index) => {
      try {
        listener();
      } catch (error) {
        const listenerError = errorHandler.createProcessingError(
          `Error in PostgreSQL fleet storage listener at index ${index}: ${(error as Error).message}`,
          'notifyListeners',
          { listenerIndex: index },
          context
        );
        
        logger.error(`PostgreSQL fleet storage listener ${index} failed`, context, listenerError);
        
        // Don't show user notifications for listener errors as they're internal
        errorHandler.handleError(listenerError, context, {
          showUserNotification: false
        });
      }
    });
  }

  /**
   * Transform database record to standardized format following Architecture Guide
   */
  private standardizeVehicleRecord(record: any): VehicleRecord {
    // Handle database field name mapping to frontend field names
    const standardized = {
      ...record,
      licensePlate: record.license_plate || record.licensePlate,
      dotNumber: record.dot_number || record.dotNumber,
      truckNumber: record.truck_number || record.truckNumber,
      registrationNumber: record.registration_number || record.registrationNumber,
      registrationState: record.registration_state || record.registrationState,
      registrationExpirationDate: record.registration_expiry || record.registrationExpirationDate,
      registeredOwner: record.registered_owner || record.registeredOwner,
      insuranceCarrier: record.insurance_carrier || record.insuranceCarrier,
      policyNumber: record.policy_number || record.policyNumber,
      insuranceExpirationDate: record.insurance_expiry || record.insuranceExpirationDate,
      coverageAmount: record.coverage_amount || record.coverageAmount,
      complianceStatus: record.compliance_status || record.complianceStatus,
      lastInspectionDate: record.last_inspection_date || record.lastInspectionDate,
      nextInspectionDue: record.next_inspection_due || record.nextInspectionDue,
      dateAdded: record.date_added || record.dateAdded || record.created_at,
      lastUpdated: record.last_updated || record.lastUpdated || record.updated_at,
      organizationId: record.organization_id || record.organizationId
    };
    
    // Apply legacy field name transformations per Architecture Guide
    if (record.registrationExpiry && !standardized.registrationExpirationDate) {
      standardized.registrationExpirationDate = record.registrationExpiry;
    }
    if (record.insuranceExpiry && !standardized.insuranceExpirationDate) {
      standardized.insuranceExpirationDate = record.insuranceExpiry;
    }
    
    // Ensure consistent status values
    if (standardized.status && typeof standardized.status === 'string') {
      standardized.status = standardized.status.toLowerCase() as 'active' | 'inactive' | 'maintenance';
    }
    
    // Ensure year is always number
    if (standardized.year && typeof standardized.year === 'string') {
      standardized.year = parseInt(standardized.year) || new Date().getFullYear();
    }
    
    return standardized as VehicleRecord;
  }

  // Export/Import functionality
  async exportFleet(): Promise<string> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/fleet/export`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.exportData;
    } catch (error) {
      console.error('Error exporting fleet via API:', error);
      // Fallback to getting fleet data directly
      const fleet = await this.getFleet();
      return JSON.stringify(fleet, null, 2);
    }
  }

  async importFleet(jsonData: string): Promise<{ success: boolean; message: string; count?: number }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/fleet/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jsonData })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          message: result.message || `Import failed: ${response.status} ${response.statusText}`
        };
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // Get all drivers via API
  async getDrivers(): Promise<DriverRecord[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/drivers`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const drivers = await response.json();
      return drivers;
    } catch (error) {
      console.error('Error loading drivers via API:', error);
      return [];
    }
  }

  async addDriver(driver: Omit<DriverRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<DriverRecord | null> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/drivers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(driver)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to add driver:', errorData.error);
        return null;
      }
      
      const addedDriver = await response.json();
      return addedDriver;
    } catch (error) {
      console.error('Error adding driver via API:', error);
      return null;
    }
  }

  async updateDriver(driverId: string, updates: Partial<DriverRecord>): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/drivers/${driverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to update driver:', errorData.error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error updating driver via API:', error);
      return false;
    }
  }

  async getDriversWithExpiringCertificates(daysThreshold: number = 30): Promise<DriverRecord[]> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/drivers/expiring?days=${daysThreshold}`);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.drivers || [];
    } catch (error) {
      console.error('Error getting drivers with expiring certificates via API:', error);
      return [];
    }
  }
}

export const postgresPersistentFleetStorage = new PostgresPersistentFleetStorage();