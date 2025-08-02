// Persistent Fleet Storage Service
// Manages fleet data with localStorage for demo purposes

import { truckNumberParser } from './truckNumberParser';
import { authService } from './authService';

export interface VehicleRecord {
  id: string;
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
  
  // Registration data (extracted from documents)
  registrationNumber?: string;
  registrationState?: string;
  registrationExpiry?: string;
  registeredOwner?: string;
  
  // Insurance data (extracted from documents)
  insuranceCarrier?: string;
  policyNumber?: string;
  insuranceExpiry?: string;
  coverageAmount?: number;
  
  // Legacy compliance data
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

  // Get all vehicles from storage
  getFleet(): VehicleRecord[] {
    try {
      const data = localStorage.getItem(this.getStorageKey());
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading fleet data:', error);
      return this.getBackup();
    }
  }

  // Save entire fleet
  saveFleet(vehicles: VehicleRecord[]): boolean {
    try {
      // Create backup before saving
      this.createBackup();
      
      localStorage.setItem(this.getStorageKey(), JSON.stringify(vehicles));
      
      // Notify all listeners that fleet data has changed
      this.notifyListeners();
      
      return true;
    } catch (error) {
      console.error('Error saving fleet data:', error);
      return false;
    }
  }

  // Add single vehicle to existing fleet
  addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'dateAdded' | 'lastUpdated'>): VehicleRecord | null {
    try {
      const fleet = this.getFleet();
      
      // Check for duplicate VIN
      if (fleet.some(v => v.vin === vehicle.vin)) {
        throw new Error(`Vehicle with VIN ${vehicle.vin} already exists`);
      }

      // Smart truck number detection - parse from existing data first
      let truckNumber = vehicle.truckNumber;
      
      if (!truckNumber) {
        const parseResult = truckNumberParser.parseTruckNumber({
          vin: vehicle.vin,
          licensePlate: vehicle.licensePlate,
          dotNumber: vehicle.dotNumber,
          make: vehicle.make,
          model: vehicle.model
        });
        
        truckNumber = parseResult.truckNumber || this.generateTruckNumber(fleet);
        
        // Log parsing result for debugging
        console.log(`🚛 Auto-detected truck number for ${vehicle.vin}:`, {
          detected: parseResult.truckNumber,
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

      fleet.push(newVehicle);
      this.saveFleet(fleet);
      
      return newVehicle;
    } catch (error) {
      console.error('Error adding vehicle:', error);
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
    try {
      const fleet = this.getFleet();
      const index = fleet.findIndex(v => v.id === id);
      
      if (index === -1) {
        throw new Error(`Vehicle with ID ${id} not found`);
      }

      fleet[index] = {
        ...fleet[index],
        ...updates,
        lastUpdated: new Date().toISOString()
      };

      return this.saveFleet(fleet);
    } catch (error) {
      console.error('Error updating vehicle:', error);
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

      return this.saveFleet(filtered);
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
    try {
      const data = localStorage.getItem(this.getDriversStorageKey());
      const drivers = data ? JSON.parse(data) : [];
      
      // Calculate status and days until expiry for each driver
      return drivers.map((driver: DriverRecord) => ({
        ...driver,
        medicalCertificate: {
          ...driver.medicalCertificate,
          ...this.calculateCertificateStatus(driver.medicalCertificate.expirationDate)
        },
        cdlInfo: {
          ...driver.cdlInfo,
          ...this.calculateCertificateStatus(driver.cdlInfo.expirationDate)
        }
      }));
    } catch (error) {
      console.error('Error loading drivers data:', error);
      return this.getDriversBackup();
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