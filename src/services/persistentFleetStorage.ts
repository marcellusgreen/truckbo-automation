// Persistent Fleet Storage Service - API-based
// Manages fleet data by interacting with the backend API.

import { authService } from './authService';
import { eventBus, FleetEvents } from './eventBus';
import { logger, LogContext } from './logger';
import { errorHandler, withErrorHandling } from './errorHandlingService';

export interface VehicleRecord {
  id: string;
  organizationId?: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  dotNumber?: string;
  truckNumber: string;
  status: 'active' | 'inactive' | 'maintenance';
  dateAdded: string;
  lastUpdated: string;
  registrationNumber?: string;
  registrationState?: string;
  registrationExpirationDate?: string;
  registeredOwner?: string;
  insuranceCarrier?: string;
  policyNumber?: string;
  insuranceExpirationDate?: string;
  coverageAmount?: number;
  complianceStatus?: 'compliant' | 'warning' | 'expired' | 'unknown';
  lastInspectionDate?: string;
  nextInspectionDue?: string;
  complianceData?: any;
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
  cdlInfo: any;
  medicalCertificate: any;
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  backgroundCheckDate?: string;
  drugTestDate?: string;
  trainingCertificates?: string[];
}

class PersistentFleetStorage {
  private initialized: boolean = false;
  private listeners: (() => void)[] = [];

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'initialize'
    };
    logger.info('Initializing API-based fleet storage', context);
    this.initialized = true;
    logger.info('API-based fleet storage initialized', context);
  }

  private async getAuthHeaders() {
    const session = authService.getCurrentSession();
    if (!session?.token) {
      throw new Error('No authentication token found.');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.token}`
    };
  }

  async getFleetAsync(): Promise<VehicleRecord[]> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'getFleetAsync'
    };
    return await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/fleet', { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch fleet data');
      }
      const data = await response.json();
      return data.fleet as VehicleRecord[];
    }, context);
  }

  async addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<VehicleRecord> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'addVehicle'
    };
    return await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/vehicles', {
        method: 'POST',
        headers,
        body: JSON.stringify(vehicle)
      });
      if (!response.ok) {
        throw new Error('Failed to add vehicle');
      }
      const newVehicle = await response.json();
      FleetEvents.vehicleAdded(newVehicle, 'persistentFleetStorage');
      this.notifyListeners();
      return newVehicle;
    }, context);
  }

  async updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'updateVehicle'
    };
    return await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/vehicles/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error('Failed to update vehicle');
      }
      const updatedVehicle = await response.json();
      FleetEvents.vehicleUpdated(updatedVehicle, 'persistentFleetStorage');
      this.notifyListeners();
      return updatedVehicle;
    }, context);
  }

  async removeVehicle(id: string): Promise<void> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'removeVehicle'
    };
    await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/vehicles/${id}`, {
        method: 'DELETE',
        headers
      });
      if (!response.ok) {
        throw new Error('Failed to remove vehicle');
      }
      const deletedVehicle = await response.json();
      FleetEvents.vehicleDeleted(deletedVehicle.vin, 'persistentFleetStorage');
      this.notifyListeners();
    }, context);
  }

  async getDriversAsync(): Promise<DriverRecord[]> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'getDriversAsync'
    };
    return await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/drivers', { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch drivers data');
      }
      const data = await response.json();
      return data.drivers as DriverRecord[];
    }, context);
  }

  async addDriver(driver: Omit<DriverRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<DriverRecord> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'addDriver'
    };
    return await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/drivers', {
        method: 'POST',
        headers,
        body: JSON.stringify(driver)
      });
      if (!response.ok) {
        throw new Error('Failed to add driver');
      }
      const newDriver = await response.json();
      this.notifyListeners();
      return newDriver;
    }, context);
  }

  async updateDriver(id: string, updates: Partial<DriverRecord>): Promise<DriverRecord> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'updateDriver'
    };
    return await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const response = await fetch(`/api/drivers/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error('Failed to update driver');
      }
      const updatedDriver = await response.json();
      this.notifyListeners();
      return updatedDriver;
    }, context);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in fleet storage listener:', error);
      }
    });
  }
}

export const persistentFleetStorage = new PersistentFleetStorage();
