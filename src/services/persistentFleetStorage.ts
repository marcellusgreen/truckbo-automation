// Persistent Fleet Storage Service - API-based
// Manages fleet data by interacting with the backend API.

import { authService } from './authService';
import { FleetEvents } from './eventBus';
import { logger, LogContext } from './logger';
import { withErrorHandling } from './errorHandlingService';
import { isRefactorDebugEnabled, startRefactorTimer, refactorDebugLog } from '../utils/refactorDebug';

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
      // Check if user is authenticated; if not, trigger logout
      if (!authService.isAuthenticated()) {
        console.log('ðŸ” Authentication expired, logging out user');
        authService.logout();
      }
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
    const stopTimer = startRefactorTimer();
    return await withErrorHandling.async(async () => {
      try {
        const headers = await this.getAuthHeaders();
        const response = await fetch('/api/v1/vehicles', { headers });
        if (!response.ok) {
          throw new Error('Failed to fetch fleet data');
        }
        const apiResponse = await response.json();
        const vehicles = apiResponse.data as VehicleRecord[];
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'getFleetAsync', {
            durationMs: stopTimer(),
            vehicleCount: vehicles.length
          });
        }
        return vehicles;
      } catch (error) {
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'getFleetAsync:error', {
            durationMs: stopTimer(),
            message: error instanceof Error ? error.message : String(error)
          });
        }
        throw error;
      }
    }, context);
  }

  async addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<VehicleRecord> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'addVehicle'
    };
    const stopTimer = startRefactorTimer();
    return await withErrorHandling.async(async () => {
      try {
        const headers = await this.getAuthHeaders();
        const response = await fetch('/api/v1/vehicles', {
          method: 'POST',
          headers,
          body: JSON.stringify(vehicle)
        });
        if (!response.ok) {
          throw new Error('Failed to add vehicle');
        }
        const apiResponse = await response.json();
        const newVehicle = apiResponse.data;
        FleetEvents.vehicleAdded(newVehicle, 'persistentFleetStorage');
        this.notifyListeners();
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'addVehicle', {
            durationMs: stopTimer(),
            vehicleId: newVehicle?.id,
            caller: 'unknown'
          });
        }
        return newVehicle;
      } catch (error) {
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'addVehicle:error', {
            durationMs: stopTimer(),
            message: error instanceof Error ? error.message : String(error)
          });
        }
        throw error;
      }
    }, context);
  }

  async updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'updateVehicle'
    };
    const stopTimer = startRefactorTimer();
    return await withErrorHandling.async(async () => {
      try {
        const headers = await this.getAuthHeaders();
        const response = await fetch(`/api/v1/vehicles/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updates)
        });
        if (!response.ok) {
          throw new Error('Failed to update vehicle');
        }
        const apiResponse = await response.json();
        const updatedVehicle = apiResponse.data;
        FleetEvents.vehicleUpdated(updatedVehicle, 'persistentFleetStorage');
        this.notifyListeners();
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'updateVehicle', {
            durationMs: stopTimer(),
            vehicleId: updatedVehicle?.id
          });
        }
        return updatedVehicle;
      } catch (error) {
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'updateVehicle:error', {
            durationMs: stopTimer(),
            message: error instanceof Error ? error.message : String(error)
          });
        }
        throw error;
      }
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
      const response = await fetch(`/api/v1/vehicles/${id}`, {
        method: 'DELETE',
        headers
      });
      if (!response.ok) {
        throw new Error('Failed to remove vehicle');
      }
      const apiResponse = await response.json();
      const deletedVehicle = apiResponse.data;
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
      const response = await fetch('/api/v1/drivers', { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch drivers data');
      }
      const apiResponse = await response.json();
      return apiResponse.data as DriverRecord[];
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
      const response = await fetch('/api/v1/drivers', {
        method: 'POST',
        headers,
        body: JSON.stringify(driver)
      });
      if (!response.ok) {
        throw new Error('Failed to add driver');
      }
      const apiResponse = await response.json();
      const newDriver = apiResponse.data;
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
      const response = await fetch(`/api/v1/drivers/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error('Failed to update driver');
      }
      const apiResponse = await response.json();
      const updatedDriver = apiResponse.data;
      this.notifyListeners();
      return updatedDriver;
    }, context);
  }

  async clearFleet(): Promise<void> {
    const context: LogContext = {
      layer: 'storage',
      component: 'PersistentFleetStorage',
      operation: 'clearFleet'
    };

    const stopTimer = startRefactorTimer();
    await withErrorHandling.async(async () => {
      const headers = await this.getAuthHeaders();
      const vehicles = await this.getFleetAsync();
      const failures: string[] = [];

      try {
        for (const vehicle of vehicles) {
          try {
            const response = await fetch(`/api/v1/vehicles/${vehicle.id}`, {
              method: 'DELETE',
              headers
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: 'Failed to delete vehicle' }));
              throw new Error(errorData.error || response.statusText);
            }

            FleetEvents.vehicleDeleted(vehicle.vin, 'persistentFleetStorage');
          } catch (error) {
            failures.push(vehicle.vin || vehicle.id);
            logger.error('Failed to clear vehicle during fleet reset', context, error as Error, { vehicle });
          }
        }

        if (failures.length > 0) {
          throw new Error(`Failed to remove ${failures.length} vehicle(s)`);
        }

        FleetEvents.fleetCleared('persistentFleetStorage');
        this.notifyListeners();
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'clearFleet', {
            durationMs: stopTimer(),
            processed: vehicles.length,
            failures: failures.length
          });
        }
      } catch (error) {
        if (isRefactorDebugEnabled()) {
          refactorDebugLog('PersistentFleetStorage', 'clearFleet:error', {
            durationMs: stopTimer(),
            failures: failures.length,
            message: error instanceof Error ? error.message : String(error)
          });
        }
        throw error;
      }
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
