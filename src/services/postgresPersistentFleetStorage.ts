// PostgreSQL-based Persistent Fleet Storage Service
// Manages fleet data with PostgreSQL following Data Consistency Architecture Guide
// Enhanced with comprehensive error handling, field standardization, and logging

// Conditional import for browser compatibility
let Pool: any, PoolClient: any;
if (typeof window === 'undefined') {
  // Only import pg in Node.js environment
  try {
    const pg = require('pg');
    Pool = pg.Pool;
    PoolClient = pg.PoolClient;
  } catch (error) {
    console.warn('PostgreSQL (pg) module not available - using fallback mode');
    Pool = class MockPool {
      connect() { throw new Error('PostgreSQL not available in browser environment'); }
      query() { throw new Error('PostgreSQL not available in browser environment'); }
      end() { return Promise.resolve(); }
      on() {}
    };
  }
} else {
  // Browser environment - use mock classes
  Pool = class MockPool {
    connect() { throw new Error('PostgreSQL not available in browser environment'); }
    query() { throw new Error('PostgreSQL not available in browser environment'); }
    end() { return Promise.resolve(); }
    on() {}
  };
}
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
  private pool: Pool;
  private listeners: (() => void)[] = [];
  private readonly DEFAULT_ORG_ID = '550e8400-e29b-41d4-a716-446655440000'; // Sample org from schema

  constructor() {
    // Parse DATABASE_URL from environment
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
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
   * Initialize database connection and test connectivity
   */
  async initialize(): Promise<void> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PostgresPersistentFleetStorage',
      operation: 'initialize'
    };

    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('✅ PostgreSQL database connected successfully', context);
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to connect to PostgreSQL: ${(error as Error).message}`,
        'connect',
        'database',
        context
      );
      
      logger.error('❌ PostgreSQL connection failed', context, appError);
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      throw appError;
    }
  }

  /**
   * Close database connection pool
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('PostgreSQL connection pool closed');
  }

  // Get all vehicles from PostgreSQL
  async getFleet(): Promise<VehicleRecord[]> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PostgresPersistentFleetStorage',
      operation: 'getFleet',
      metadata: { organizationId: this.getOrganizationId() }
    };

    const operationId = logger.startOperation('Loading fleet data from PostgreSQL', context);

    try {
      logger.debug('Querying PostgreSQL for fleet data', context);
      
      const query = `
        SELECT 
          id, organization_id, vin, make, model, year, license_plate, dot_number,
          truck_number, status, registration_number, registration_state,
          registration_expiry as registration_expiration_date, registered_owner,
          insurance_carrier, policy_number, insurance_expiry as insurance_expiration_date,
          coverage_amount, compliance_status, last_inspection_date, next_inspection_due,
          created_at as date_added, updated_at as last_updated
        FROM vehicles 
        WHERE organization_id = $1 
        ORDER BY created_at DESC
      `;
      
      const result = await this.pool.query(query, [this.getOrganizationId()]);
      const rawData = result.rows;
      
      logger.info(`Successfully loaded ${rawData.length} vehicles from PostgreSQL`, context, {
        vehicleCount: rawData.length
      });
      
      // Apply field standardization following Architecture Guide
      const standardizedData = rawData.map((record: any) => this.standardizeVehicleRecord(record));
      
      logger.completeOperation('Loading fleet data from PostgreSQL', operationId, context, {
        loadedCount: standardizedData.length
      });
      
      return standardizedData;
    } catch (error) {
      const appError = errorHandler.createStorageError(
        `Failed to load fleet data from PostgreSQL: ${(error as Error).message}`,
        'read',
        'vehicles',
        context
      );
      
      logger.failOperation('Loading fleet data from PostgreSQL', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return [];
    }
  }

  // Save entire fleet to PostgreSQL
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

    const operationId = logger.startOperation('Saving fleet data to PostgreSQL', context, {
      vehicleCount: vehicles.length
    });

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      logger.debug('Clearing existing fleet data', context);
      
      // Clear existing vehicles for this organization
      await client.query('DELETE FROM vehicles WHERE organization_id = $1', [this.getOrganizationId()]);
      
      logger.debug('Inserting new fleet data', context);
      
      // Insert all vehicles
      for (const vehicle of vehicles) {
        await this.insertVehicleRecord(client, vehicle);
      }
      
      await client.query('COMMIT');
      
      logger.info(`Successfully saved ${vehicles.length} vehicles to PostgreSQL`, context);
      
      // Notify all listeners that fleet data has changed
      this.notifyListeners();
      
      // Emit event bus notification
      FleetEvents.fleetCleared('postgresPersistentFleetStorage');
      
      logger.completeOperation('Saving fleet data to PostgreSQL', operationId, context, {
        savedCount: vehicles.length
      });
      
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      
      const appError = errorHandler.createStorageError(
        `Failed to save fleet data to PostgreSQL: ${(error as Error).message}`,
        'write',
        'vehicles',
        context
      );
      
      logger.failOperation('Saving fleet data to PostgreSQL', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return false;
    } finally {
      client.release();
    }
  }

  // Add single vehicle to PostgreSQL
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

    const operationId = logger.startOperation('Adding vehicle to PostgreSQL', context, {
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate
    });

    try {
      logger.debug('Checking for duplicate VIN', context);
      
      // Check for duplicate VIN
      const existingCheck = await this.pool.query(
        'SELECT id FROM vehicles WHERE vin = $1 AND organization_id = $2',
        [vehicle.vin, this.getOrganizationId()]
      );
      
      if (existingCheck.rows.length > 0) {
        const validationError = errorHandler.createValidationError(
          `Vehicle with VIN ${vehicle.vin} already exists`,
          'vin',
          vehicle.vin,
          context
        );
        
        logger.failOperation('Adding vehicle to PostgreSQL', operationId, validationError, context);
        
        errorHandler.handleError(validationError, context, {
          showUserNotification: true
        });
        
        return null;
      }

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

      const newVehicle: VehicleRecord = {
        ...vehicle,
        truckNumber,
        id: '', // Will be set by database
        organizationId: this.getOrganizationId(),
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      logger.debug('Inserting vehicle into PostgreSQL', context, {
        truckNumber: newVehicle.truckNumber
      });

      // Insert vehicle using standardized field names
      const insertQuery = `
        INSERT INTO vehicles (
          organization_id, vin, make, model, year, license_plate, dot_number,
          truck_number, status, registration_number, registration_state,
          registration_expiry, registered_owner, insurance_carrier, policy_number,
          insurance_expiry, coverage_amount, compliance_status, last_inspection_date,
          next_inspection_due
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *, created_at as date_added, updated_at as last_updated
      `;
      
      const values = [
        newVehicle.organizationId, newVehicle.vin, newVehicle.make, newVehicle.model,
        newVehicle.year, newVehicle.licensePlate, newVehicle.dotNumber, newVehicle.truckNumber,
        newVehicle.status, newVehicle.registrationNumber, newVehicle.registrationState,
        newVehicle.registrationExpirationDate, newVehicle.registeredOwner, newVehicle.insuranceCarrier,
        newVehicle.policyNumber, newVehicle.insuranceExpirationDate, newVehicle.coverageAmount,
        newVehicle.complianceStatus, newVehicle.lastInspectionDate, newVehicle.nextInspectionDue
      ];

      const result = await this.pool.query(insertQuery, values);
      const insertedVehicle = this.standardizeVehicleRecord(result.rows[0]);
      
      // Emit event for new vehicle
      FleetEvents.vehicleAdded(insertedVehicle, 'postgresPersistentFleetStorage');
      
      logger.completeOperation('Adding vehicle to PostgreSQL', operationId, context, {
        vehicleId: insertedVehicle.id,
        truckNumber: insertedVehicle.truckNumber
      });
      
      return insertedVehicle;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to add vehicle to PostgreSQL: ${(error as Error).message}`,
        'addVehicle',
        vehicle,
        context
      );
      
      logger.failOperation('Adding vehicle to PostgreSQL', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return null;
    }
  }

  // Update existing vehicle in PostgreSQL
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

    const operationId = logger.startOperation('Updating vehicle in PostgreSQL', context, {
      vehicleId: id,
      updateFields: Object.keys(updates)
    });

    try {
      logger.debug('Building update query for vehicle', context);
      
      // Build dynamic UPDATE query with standardized field names
      const setClause = [];
      const values = [];
      let paramCount = 1;
      
      // Map frontend field names to database column names
      const fieldMappings: Record<string, string> = {
        'registrationExpirationDate': 'registration_expiry',
        'insuranceExpirationDate': 'insurance_expiry',
        'licensePlate': 'license_plate',
        'dotNumber': 'dot_number',
        'truckNumber': 'truck_number',
        'registrationNumber': 'registration_number',
        'registrationState': 'registration_state',
        'registeredOwner': 'registered_owner',
        'insuranceCarrier': 'insurance_carrier',
        'policyNumber': 'policy_number',
        'coverageAmount': 'coverage_amount',
        'complianceStatus': 'compliance_status',
        'lastInspectionDate': 'last_inspection_date',
        'nextInspectionDue': 'next_inspection_due'
      };
      
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'dateAdded' || key === 'lastUpdated') continue;
        
        const dbColumn = fieldMappings[key] || key;
        setClause.push(`${dbColumn} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
      
      if (setClause.length === 0) {
        logger.warn('No valid fields to update', context);
        return false;
      }
      
      // Add updated_at timestamp
      setClause.push('updated_at = CURRENT_TIMESTAMP');
      
      const updateQuery = `
        UPDATE vehicles 
        SET ${setClause.join(', ')} 
        WHERE id = $${paramCount} AND organization_id = $${paramCount + 1}
        RETURNING *, created_at as date_added, updated_at as last_updated
      `;
      
      values.push(id, this.getOrganizationId());

      const result = await this.pool.query(updateQuery, values);
      
      if (result.rows.length === 0) {
        const notFoundError = errorHandler.createValidationError(
          `Vehicle with ID ${id} not found`,
          'vehicleId',
          id,
          context
        );
        
        logger.failOperation('Updating vehicle in PostgreSQL', operationId, notFoundError, context);
        
        errorHandler.handleError(notFoundError, context, {
          showUserNotification: true
        });
        
        return false;
      }

      const updatedVehicle = this.standardizeVehicleRecord(result.rows[0]);
      
      // Emit event for updated vehicle
      FleetEvents.vehicleUpdated(updatedVehicle, 'postgresPersistentFleetStorage');
      
      logger.completeOperation('Updating vehicle in PostgreSQL', operationId, context, {
        vehicleVin: updatedVehicle.vin,
        updatedFields: Object.keys(updates)
      });
      
      return true;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to update vehicle in PostgreSQL: ${(error as Error).message}`,
        'updateVehicle',
        { id, updates },
        context
      );
      
      logger.failOperation('Updating vehicle in PostgreSQL', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return false;
    }
  }

  // Remove vehicle from PostgreSQL
  async removeVehicle(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM vehicles WHERE id = $1 AND organization_id = $2 RETURNING vin',
        [id, this.getOrganizationId()]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Vehicle with ID ${id} not found`);
      }

      // Emit event for deleted vehicle
      FleetEvents.vehicleDeleted(result.rows[0].vin, 'postgresPersistentFleetStorage');
      
      return true;
    } catch (error) {
      console.error('Error removing vehicle from PostgreSQL:', error);
      return false;
    }
  }

  // Search vehicles in PostgreSQL
  async searchVehicles(query: string): Promise<VehicleRecord[]> {
    try {
      const searchQuery = `
        SELECT *, created_at as date_added, updated_at as last_updated
        FROM vehicles 
        WHERE organization_id = $1 
        AND (
          LOWER(vin) LIKE LOWER($2) OR
          LOWER(make) LIKE LOWER($2) OR
          LOWER(model) LIKE LOWER($2) OR
          LOWER(license_plate) LIKE LOWER($2) OR
          LOWER(truck_number) LIKE LOWER($2)
        )
        ORDER BY created_at DESC
      `;
      
      const result = await this.pool.query(searchQuery, [
        this.getOrganizationId(),
        `%${query}%`
      ]);
      
      return result.rows.map((record: any) => this.standardizeVehicleRecord(record));
    } catch (error) {
      console.error('Error searching vehicles in PostgreSQL:', error);
      return [];
    }
  }

  // Get fleet statistics from PostgreSQL
  async getFleetStats() {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
          COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as recently_added
        FROM vehicles 
        WHERE organization_id = $1
      `;
      
      const result = await this.pool.query(statsQuery, [this.getOrganizationId()]);
      const stats = result.rows[0];
      
      return {
        total: parseInt(stats.total),
        active: parseInt(stats.active),
        inactive: parseInt(stats.inactive),
        recentlyAdded: parseInt(stats.recently_added)
      };
    } catch (error) {
      console.error('Error getting fleet stats from PostgreSQL:', error);
      return { total: 0, active: 0, inactive: 0, recentlyAdded: 0 };
    }
  }

  // Clear all fleet data from PostgreSQL
  async clearFleet(): Promise<boolean> {
    try {
      await this.pool.query('DELETE FROM vehicles WHERE organization_id = $1', [this.getOrganizationId()]);
      this.notifyListeners();
      
      // Emit event bus notification for fleet clearing
      FleetEvents.fleetCleared('postgresPersistentFleetStorage');
      
      return true;
    } catch (error) {
      console.error('Error clearing fleet from PostgreSQL:', error);
      return false;
    }
  }

  // Helper method to insert vehicle record with proper field mapping
  private async insertVehicleRecord(client: PoolClient, vehicle: VehicleRecord): Promise<void> {
    const insertQuery = `
      INSERT INTO vehicles (
        id, organization_id, vin, make, model, year, license_plate, dot_number,
        truck_number, status, registration_number, registration_state,
        registration_expiry, registered_owner, insurance_carrier, policy_number,
        insurance_expiry, coverage_amount, compliance_status, last_inspection_date,
        next_inspection_due, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    `;
    
    const values = [
      vehicle.id || this.generateId(), vehicle.organizationId || this.getOrganizationId(),
      vehicle.vin, vehicle.make, vehicle.model, vehicle.year, vehicle.licensePlate,
      vehicle.dotNumber, vehicle.truckNumber, vehicle.status, vehicle.registrationNumber,
      vehicle.registrationState, vehicle.registrationExpirationDate, vehicle.registeredOwner,
      vehicle.insuranceCarrier, vehicle.policyNumber, vehicle.insuranceExpirationDate,
      vehicle.coverageAmount, vehicle.complianceStatus, vehicle.lastInspectionDate,
      vehicle.nextInspectionDue, vehicle.dateAdded, vehicle.lastUpdated
    ];

    await client.query(insertQuery, values);
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
    const fleet = await this.getFleet();
    return JSON.stringify(fleet, null, 2);
  }

  async importFleet(jsonData: string): Promise<{ success: boolean; message: string; count?: number }> {
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

      const success = await this.saveFleet(validated);
      
      return {
        success,
        message: success 
          ? `Successfully imported ${validated.length} vehicles`
          : 'Failed to import vehicles',
        count: validated.length
      };
    } catch (error) {
      return {
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // TODO: Implement driver management methods similar to vehicles
  // Following the same patterns and field standardization
  async getDrivers(): Promise<DriverRecord[]> {
    // Implementation placeholder - would follow same pattern as vehicles
    return [];
  }

  async addDriver(driver: Omit<DriverRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<DriverRecord | null> {
    // Implementation placeholder - would follow same pattern as vehicles
    return null;
  }

  async updateDriver(driverId: string, updates: Partial<DriverRecord>): Promise<boolean> {
    // Implementation placeholder - would follow same pattern as vehicles
    return false;
  }

  async getDriversWithExpiringCertificates(daysThreshold: number = 30): Promise<DriverRecord[]> {
    // Implementation placeholder - would follow same pattern as vehicles
    return [];
  }
}

export const postgresPersistentFleetStorage = new PostgresPersistentFleetStorage();