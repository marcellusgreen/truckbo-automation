"use strict";
// Mock Fleet Storage - Simple implementation for server use
// This is a temporary implementation until proper database integration
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistentFleetStorage = void 0;
const logger_1 = require("./logger");
class MockFleetStorage {
    constructor() {
        Object.defineProperty(this, "vehicles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                layer: 'storage',
                component: 'MockFleetStorage'
            }
        });
    }
    async getFleetAsync() {
        logger_1.logger.info('Getting fleet data from mock storage', {
            ...this.context,
            operation: 'getFleetAsync'
        });
        return [...this.vehicles];
    }
    async getAllVehicles() {
        return this.getFleetAsync();
    }
    async getVehicle(id) {
        logger_1.logger.info(`Getting vehicle ${id} from mock storage`, {
            ...this.context,
            operation: 'getVehicle'
        });
        return this.vehicles.find(v => v.id === id) || null;
    }
    async getVehicleByIdAsync(id) {
        return this.getVehicle(id);
    }
    async addVehicle(vehicle) {
        return this.addVehicleAsync(vehicle);
    }
    async addVehicleAsync(vehicle) {
        const now = new Date().toISOString();
        const newVehicle = {
            ...vehicle,
            id: `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            dateAdded: now,
            lastUpdated: now
        };
        this.vehicles.push(newVehicle);
        logger_1.logger.info(`Added vehicle to mock storage`, {
            ...this.context,
            operation: 'addVehicleAsync'
        }, { vehicleId: newVehicle.id });
        return newVehicle;
    }
    async updateVehicle(id, updates) {
        return this.updateVehicleAsync(id, updates);
    }
    async updateVehicleAsync(id, updates) {
        const vehicleIndex = this.vehicles.findIndex(v => v.id === id);
        if (vehicleIndex === -1) {
            logger_1.logger.warn(`Vehicle ${id} not found for update`, {
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
        logger_1.logger.info(`Updated vehicle ${id} in mock storage`, {
            ...this.context,
            operation: 'updateVehicleAsync'
        });
        return this.vehicles[vehicleIndex];
    }
    async removeVehicle(id) {
        return this.deleteVehicleAsync(id);
    }
    async deleteVehicleAsync(id) {
        const initialLength = this.vehicles.length;
        this.vehicles = this.vehicles.filter(v => v.id !== id);
        const wasDeleted = this.vehicles.length < initialLength;
        if (wasDeleted) {
            logger_1.logger.info(`Deleted vehicle ${id} from mock storage`, {
                ...this.context,
                operation: 'deleteVehicleAsync'
            });
        }
        else {
            logger_1.logger.warn(`Vehicle ${id} not found for deletion`, {
                ...this.context,
                operation: 'deleteVehicleAsync'
            });
        }
        return wasDeleted;
    }
    // Additional methods needed by server
    async searchVehiclesAsync(query) {
        let results = [...this.vehicles];
        if (query.vin) {
            results = results.filter(v => v.vin.toLowerCase().includes(query.vin.toLowerCase()));
        }
        if (query.licensePlate) {
            results = results.filter(v => v.licensePlate.toLowerCase().includes(query.licensePlate.toLowerCase()));
        }
        if (query.status) {
            results = results.filter(v => v.status === query.status);
        }
        if (query.limit && query.limit > 0) {
            results = results.slice(0, query.limit);
        }
        logger_1.logger.info('Searched vehicles in mock storage', {
            ...this.context,
            operation: 'searchVehiclesAsync'
        }, { query, resultCount: results.length });
        return results;
    }
}
// Export singleton instance
exports.persistentFleetStorage = new MockFleetStorage();
