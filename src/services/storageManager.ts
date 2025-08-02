// Storage Manager - Bridge between localStorage and PostgreSQL
// Provides seamless migration path from demo to production storage

import { DatabaseService, Vehicle, Driver, Document, ComplianceAlert } from './databaseService';
import { S3StorageService, DocumentMetadata } from './s3StorageService';

export interface StorageConfig {
  mode: 'localStorage' | 'database';
  databaseService?: DatabaseService;
  s3Service?: S3StorageService;
  organizationId?: string;
}

export class StorageManager {
  private mode: 'localStorage' | 'database';
  private databaseService?: DatabaseService;
  private s3Service?: S3StorageService;
  private organizationId: string;

  // localStorage keys for backward compatibility
  private readonly STORAGE_KEYS = {
    VEHICLES: 'truckbo_vehicles',
    DRIVERS: 'truckbo_drivers',
    DOCUMENTS: 'truckbo_documents',
    ALERTS: 'truckbo_alerts',
  };

  constructor(config: StorageConfig) {
    this.mode = config.mode;
    this.databaseService = config.databaseService;
    this.s3Service = config.s3Service;
    this.organizationId = config.organizationId || 'default-org';
  }

  // ==========================================
  // VEHICLE OPERATIONS
  // ==========================================

  async getVehicles(): Promise<Vehicle[]> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.getVehiclesByOrganization(this.organizationId);
    } else {
      // localStorage fallback
      const stored = localStorage.getItem(this.STORAGE_KEYS.VEHICLES);
      return stored ? JSON.parse(stored) : [];
    }
  }

  async createVehicle(vehicleData: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.createVehicle({
        ...vehicleData,
        organizationId: this.organizationId,
      });
    } else {
      // localStorage fallback
      const vehicles = await this.getVehicles();
      const newVehicle: Vehicle = {
        ...vehicleData,
        id: this.generateId(),
        organizationId: this.organizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vehicles.push(newVehicle);
      localStorage.setItem(this.STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
      return newVehicle;
    }
  }

  async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle | null> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.updateVehicle(id, updates);
    } else {
      // localStorage fallback
      const vehicles = await this.getVehicles();
      const index = vehicles.findIndex(v => v.id === id);
      if (index !== -1) {
        vehicles[index] = { ...vehicles[index], ...updates, updatedAt: new Date() };
        localStorage.setItem(this.STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
        return vehicles[index];
      }
      return null;
    }
  }

  async deleteVehicle(id: string): Promise<boolean> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.deleteVehicle(id);
    } else {
      // localStorage fallback
      const vehicles = await this.getVehicles();
      const filtered = vehicles.filter(v => v.id !== id);
      localStorage.setItem(this.STORAGE_KEYS.VEHICLES, JSON.stringify(filtered));
      return filtered.length < vehicles.length;
    }
  }

  // ==========================================
  // DRIVER OPERATIONS
  // ==========================================

  async getDrivers(): Promise<Driver[]> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.getDriversByOrganization(this.organizationId);
    } else {
      // localStorage fallback
      const stored = localStorage.getItem(this.STORAGE_KEYS.DRIVERS);
      return stored ? JSON.parse(stored) : [];
    }
  }

  async createDriver(driverData: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<Driver> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.createDriver({
        ...driverData,
        organizationId: this.organizationId,
      });
    } else {
      // localStorage fallback
      const drivers = await this.getDrivers();
      const newDriver: Driver = {
        ...driverData,
        id: this.generateId(),
        organizationId: this.organizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      drivers.push(newDriver);
      localStorage.setItem(this.STORAGE_KEYS.DRIVERS, JSON.stringify(drivers));
      return newDriver;
    }
  }

  async updateDriver(id: string, updates: Partial<Driver>): Promise<Driver | null> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.updateDriver(id, updates);
    } else {
      // localStorage fallback
      const drivers = await this.getDrivers();
      const index = drivers.findIndex(d => d.id === id);
      if (index !== -1) {
        drivers[index] = { ...drivers[index], ...updates, updatedAt: new Date() };
        localStorage.setItem(this.STORAGE_KEYS.DRIVERS, JSON.stringify(drivers));
        return drivers[index];
      }
      return null;
    }
  }

  // ==========================================
  // DOCUMENT OPERATIONS
  // ==========================================

  async uploadDocument(
    file: File,
    entityType: 'vehicle' | 'driver',
    entityId: string,
    documentType: string
  ): Promise<{ document: Document; s3Result?: any }> {
    if (this.mode === 'database' && this.databaseService && this.s3Service) {
      // Upload to S3 first
      const metadata: DocumentMetadata = {
        organizationId: this.organizationId,
        documentType: documentType as any,
        entityType,
        entityId,
        originalFilename: file.name,
      };

      const s3Result = await this.s3Service.uploadDocument(file, metadata);
      
      if (!s3Result.success) {
        throw new Error(`S3 upload failed: ${s3Result.error}`);
      }

      // Create database record
      const documentData: Omit<Document, 'id' | 'createdAt' | 'updatedAt'> = {
        organizationId: this.organizationId,
        documentType,
        documentCategory: `${entityType}_docs`,
        originalFilename: file.name,
        fileSize: s3Result.fileSize,
        fileType: s3Result.contentType,
        s3Bucket: process.env.S3_BUCKET_NAME || 'truckbo-documents',
        s3Key: s3Result.s3Key,
        s3Url: s3Result.s3Url,
        processingStatus: 'pending',
        vehicleId: entityType === 'vehicle' ? entityId : undefined,
        driverId: entityType === 'driver' ? entityId : undefined,
        uploadedBy: 'current-user-id', // TODO: Get from auth context
      };

      const document = await this.databaseService.createDocument(documentData);
      
      return { document, s3Result };
    } else {
      // localStorage fallback - simulate document upload
      const documents = await this.getDocuments();
      const newDocument: Document = {
        id: this.generateId(),
        organizationId: this.organizationId,
        documentType,
        documentCategory: `${entityType}_docs`,
        originalFilename: file.name,
        fileSize: file.size,
        fileType: file.type,
        s3Key: `local/${this.generateId()}/${file.name}`,
        processingStatus: 'completed',
        vehicleId: entityType === 'vehicle' ? entityId : undefined,
        driverId: entityType === 'driver' ? entityId : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      documents.push(newDocument);
      localStorage.setItem(this.STORAGE_KEYS.DOCUMENTS, JSON.stringify(documents));
      
      return { document: newDocument };
    }
  }

  async getDocuments(): Promise<Document[]> {
    if (this.mode === 'database' && this.databaseService) {
      // Get all documents for organization (would need pagination in real app)
      const result = await this.databaseService.query(
        'SELECT * FROM documents WHERE organization_id = $1 ORDER BY created_at DESC',
        [this.organizationId]
      );
      return result.rows;
    } else {
      // localStorage fallback
      const stored = localStorage.getItem(this.STORAGE_KEYS.DOCUMENTS);
      return stored ? JSON.parse(stored) : [];
    }
  }

  async getDocumentsByEntity(entityType: 'vehicle' | 'driver', entityId: string): Promise<Document[]> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.getDocumentsByEntity(entityType, entityId);
    } else {
      // localStorage fallback
      const documents = await this.getDocuments();
      return documents.filter(doc => 
        (entityType === 'vehicle' && doc.vehicleId === entityId) ||
        (entityType === 'driver' && doc.driverId === entityId)
      );
    }
  }

  // ==========================================
  // COMPLIANCE ALERT OPERATIONS
  // ==========================================

  async getActiveAlerts(): Promise<ComplianceAlert[]> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.getActiveAlertsByOrganization(this.organizationId);
    } else {
      // localStorage fallback
      const stored = localStorage.getItem(this.STORAGE_KEYS.ALERTS);
      const alerts = stored ? JSON.parse(stored) : [];
      return alerts.filter((alert: ComplianceAlert) => alert.status === 'active');
    }
  }

  async createAlert(alertData: Omit<ComplianceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<ComplianceAlert> {
    if (this.mode === 'database' && this.databaseService) {
      return await this.databaseService.createComplianceAlert({
        ...alertData,
        organizationId: this.organizationId,
      });
    } else {
      // localStorage fallback
      const alerts = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.ALERTS) || '[]');
      const newAlert: ComplianceAlert = {
        ...alertData,
        id: this.generateId(),
        organizationId: this.organizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      alerts.push(newAlert);
      localStorage.setItem(this.STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
      return newAlert;
    }
  }

  // ==========================================
  // MIGRATION UTILITIES
  // ==========================================

  /**
   * Migrate data from localStorage to PostgreSQL
   */
  async migrateToDatabase(): Promise<{ success: boolean; migrated: any; errors: any[] }> {
    if (this.mode !== 'database' || !this.databaseService) {
      throw new Error('Database service not configured for migration');
    }

    const migrated = {
      vehicles: 0,
      drivers: 0,
      documents: 0,
      alerts: 0,
    };
    const errors: any[] = [];

    try {
      // Migrate vehicles
      const localVehicles = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.VEHICLES) || '[]');
      for (const vehicle of localVehicles) {
        try {
          const { id, createdAt, updatedAt, ...vehicleData } = vehicle;
          await this.databaseService.createVehicle({
            ...vehicleData,
            organizationId: this.organizationId,
          });
          migrated.vehicles++;
        } catch (error) {
          errors.push({ type: 'vehicle', data: vehicle, error });
        }
      }

      // Migrate drivers
      const localDrivers = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.DRIVERS) || '[]');
      for (const driver of localDrivers) {
        try {
          const { id, createdAt, updatedAt, ...driverData } = driver;
          await this.databaseService.createDriver({
            ...driverData,
            organizationId: this.organizationId,
          });
          migrated.drivers++;
        } catch (error) {
          errors.push({ type: 'driver', data: driver, error });
        }
      }

      // Clear localStorage after successful migration
      if (errors.length === 0) {
        localStorage.removeItem(this.STORAGE_KEYS.VEHICLES);
        localStorage.removeItem(this.STORAGE_KEYS.DRIVERS);
        localStorage.removeItem(this.STORAGE_KEYS.DOCUMENTS);
        localStorage.removeItem(this.STORAGE_KEYS.ALERTS);
      }

      return { success: errors.length === 0, migrated, errors };
    } catch (error) {
      return { success: false, migrated, errors: [...errors, error] };
    }
  }

  /**
   * Health check for storage services
   */
  async healthCheck(): Promise<{ localStorage: boolean; database?: boolean; s3?: boolean }> {
    const health = {
      localStorage: typeof(Storage) !== 'undefined',
      database: undefined as boolean | undefined,
      s3: undefined as boolean | undefined,
    };

    if (this.databaseService) {
      const dbHealth = await this.databaseService.healthCheck();
      health.database = dbHealth.healthy;
    }

    if (this.s3Service) {
      const s3Health = await this.s3Service.healthCheck();
      health.s3 = s3Health.healthy;
    }

    return health;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Switch storage mode (useful for development/testing)
   */
  switchMode(newMode: 'localStorage' | 'database'): void {
    this.mode = newMode;
  }

  /**
   * Get current storage mode
   */
  getMode(): 'localStorage' | 'database' {
    return this.mode;
  }
}

// Factory function for creating storage manager
export function createStorageManager(
  mode: 'localStorage' | 'database' = 'localStorage',
  databaseService?: DatabaseService,
  s3Service?: S3StorageService,
  organizationId?: string
): StorageManager {
  return new StorageManager({
    mode,
    databaseService,
    s3Service,
    organizationId,
  });
}