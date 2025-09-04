// Mock Fleet Storage - Simple implementation for server use
// This is a temporary implementation until proper database integration

import { VehicleRecord } from '../types/vehicleTypes';
import { logger, LogContext } from './logger';

class MockFleetStorage {
  private vehicles: VehicleRecord[] = [];
  
  private readonly context: LogContext = {
    layer: 'storage',
    component: 'MockFleetStorage'
  };

  async getFleetAsync(): Promise<VehicleRecord[]> {
    logger.info('Getting fleet data from mock storage', {
      ...this.context,
      operation: 'getFleetAsync'
    });
    
    return [...this.vehicles];
  }

  async getAllVehicles(): Promise<VehicleRecord[]> {
    return this.getFleetAsync();
  }

  async getVehicle(id: string): Promise<VehicleRecord | null> {
    logger.info(`Getting vehicle ${id} from mock storage`, {
      ...this.context,
      operation: 'getVehicle'
    });
    
    return this.vehicles.find(v => v.id === id) || null;
  }

  async getVehicleByIdAsync(id: string): Promise<VehicleRecord | null> {
    return this.getVehicle(id);
  }

  async addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<VehicleRecord> {
    return this.addVehicleAsync(vehicle);
  }

  async addVehicleAsync(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<VehicleRecord> {
    const now = new Date().toISOString();
    const newVehicle: VehicleRecord = {
      ...vehicle,
      id: `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      dateAdded: now,
      lastUpdated: now
    };

    this.vehicles.push(newVehicle);
    
    logger.info(`Added vehicle to mock storage`, {
      ...this.context,
      operation: 'addVehicleAsync'
    }, { vehicleId: newVehicle.id });
    
    return newVehicle;
  }

  async updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord | null> {
    return this.updateVehicleAsync(id, updates);
  }

  async updateVehicleAsync(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord | null> {
    const vehicleIndex = this.vehicles.findIndex(v => v.id === id);
    if (vehicleIndex === -1) {
      logger.warn(`Vehicle ${id} not found for update`, {
        ...this.context,
        operation: 'updateVehicleAsync'
      });
      return null;
    }

    this.vehicles[vehicleIndex] = {
      ...this.vehicles[vehicleIndex],
      ...updates,
      lastUpdated: new Date().toISOString()
    };

    logger.info(`Updated vehicle ${id} in mock storage`, {
      ...this.context,
      operation: 'updateVehicleAsync'
    });

    return this.vehicles[vehicleIndex];
  }

  async removeVehicle(id: string): Promise<boolean> {
    return this.deleteVehicleAsync(id);
  }

  async deleteVehicleAsync(id: string): Promise<boolean> {
    const initialLength = this.vehicles.length;
    this.vehicles = this.vehicles.filter(v => v.id !== id);
    const wasDeleted = this.vehicles.length < initialLength;

    if (wasDeleted) {
      logger.info(`Deleted vehicle ${id} from mock storage`, {
        ...this.context,
        operation: 'deleteVehicleAsync'
      });
    } else {
      logger.warn(`Vehicle ${id} not found for deletion`, {
        ...this.context,
        operation: 'deleteVehicleAsync'
      });
    }

    return wasDeleted;
  }

  // Additional methods needed by server
  async searchVehiclesAsync(query: {
    vin?: string;
    licensePlate?: string;
    status?: string;
    limit?: number;
  }): Promise<VehicleRecord[]> {
    let results = [...this.vehicles];

    if (query.vin) {
      results = results.filter(v => v.vin.toLowerCase().includes(query.vin!.toLowerCase()));
    }
    if (query.licensePlate) {
      results = results.filter(v => v.licensePlate.toLowerCase().includes(query.licensePlate!.toLowerCase()));
    }
    if (query.status) {
      results = results.filter(v => v.status === query.status);
    }
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    logger.info('Searched vehicles in mock storage', {
      ...this.context,
      operation: 'searchVehiclesAsync'
    }, { query, resultCount: results.length });

    return results;
  }
}

// Export singleton instance
export const persistentFleetStorage = new MockFleetStorage();