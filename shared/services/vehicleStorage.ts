// Vehicle Storage Service - Environment Agnostic
// Core vehicle data storage types and utilities

import { logger, LogContext } from './logger';
import { VehicleRecord, DriverRecord } from '../types/vehicleTypes';

// Re-export types for backward compatibility
export type { VehicleRecord, DriverRecord } from '../types/vehicleTypes';

/**
 * Base interface for vehicle storage operations
 * Implementations should handle the actual storage mechanism (API, database, etc.)
 */
export interface VehicleStorageInterface {
  getVehicles(): Promise<VehicleRecord[]>;
  getVehicle(id: string): Promise<VehicleRecord | null>;
  addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<VehicleRecord>;
  updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord>;
  deleteVehicle(id: string): Promise<boolean>;
  
  getDrivers(): Promise<DriverRecord[]>;
  getDriver(id: string): Promise<DriverRecord | null>;
  addDriver(driver: Omit<DriverRecord, 'id' | 'dateAdded' | 'lastUpdated'>): Promise<DriverRecord>;
  updateDriver(id: string, updates: Partial<DriverRecord>): Promise<DriverRecord>;
  deleteDriver(id: string): Promise<boolean>;
}

/**
 * Utility functions for vehicle data validation and manipulation
 */
export class VehicleUtils {
  static validateVIN(vin: string): boolean {
    if (!vin || vin.length !== 17) return false;
    
    // Basic VIN validation - no I, O, or Q characters
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
    return vinRegex.test(vin);
  }

  static formatLicensePlate(plate: string): string {
    return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  static isExpired(dateString?: string): boolean {
    if (!dateString) return false;
    
    const expiryDate = new Date(dateString);
    const today = new Date();
    return expiryDate < today;
  }

  static isExpiringWithin(dateString?: string, days: number = 30): boolean {
    if (!dateString) return false;
    
    const expiryDate = new Date(dateString);
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() + days);
    
    return expiryDate <= checkDate && expiryDate >= new Date();
  }

  static generateId(): string {
    return `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static generateDriverId(): string {
    return `driver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Vehicle compliance status calculator
 */
export class ComplianceCalculator {
  static calculateComplianceStatus(vehicle: VehicleRecord): 'compliant' | 'warning' | 'expired' | 'unknown' {
    const context: LogContext = {
      layer: 'storage',
      component: 'ComplianceCalculator',
      operation: 'calculateComplianceStatus'
    };

    try {
      // Check registration expiration
      if (VehicleUtils.isExpired(vehicle.registrationExpirationDate)) {
        logger.debug('Vehicle registration expired', context, { 
          vehicleId: vehicle.id,
          expirationDate: vehicle.registrationExpirationDate 
        });
        return 'expired';
      }

      // Check insurance expiration
      if (VehicleUtils.isExpired(vehicle.insuranceExpirationDate)) {
        logger.debug('Vehicle insurance expired', context, { 
          vehicleId: vehicle.id,
          expirationDate: vehicle.insuranceExpirationDate 
        });
        return 'expired';
      }

      // Check for upcoming expirations
      const hasUpcomingExpirations = 
        VehicleUtils.isExpiringWithin(vehicle.registrationExpirationDate, 30) ||
        VehicleUtils.isExpiringWithin(vehicle.insuranceExpirationDate, 30);

      if (hasUpcomingExpirations) {
        logger.debug('Vehicle has upcoming expirations', context, { 
          vehicleId: vehicle.id,
          registrationExpiry: vehicle.registrationExpirationDate,
          insuranceExpiry: vehicle.insuranceExpirationDate
        });
        return 'warning';
      }

      // Check if essential data is missing
      if (!vehicle.registrationExpirationDate || !vehicle.insuranceExpirationDate) {
        logger.debug('Vehicle missing essential compliance data', context, { 
          vehicleId: vehicle.id 
        });
        return 'unknown';
      }

      return 'compliant';
    } catch (error) {
      logger.error('Error calculating compliance status', context, error as Error, {
        vehicleId: vehicle.id
      });
      return 'unknown';
    }
  }
}