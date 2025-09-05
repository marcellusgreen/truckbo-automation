// Vehicle Data Transformer
// Handles transformation between database models and API responses

import { DataTransformer } from '../types/apiTypes';
import { VehicleRecord } from '../../../shared/types/vehicleTypes';

// API Vehicle Response Format
export interface ApiVehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  status: 'active' | 'inactive' | 'maintenance';
  dotNumber?: string;
  truckNumber: string;
  
  // Timestamps
  createdAt: string; // ISO 8601 format
  updatedAt: string; // ISO 8601 format
  
  // Registration Information
  registration?: {
    number?: string;
    state?: string;
    expirationDate?: string; // ISO 8601 format
    registeredOwner?: string;
  };
  
  // Insurance Information
  insurance?: {
    carrier?: string;
    policyNumber?: string;
    expirationDate?: string; // ISO 8601 format
    coverageAmount?: number;
  };
  
  // Compliance Status
  compliance?: {
    overall: 'compliant' | 'non_compliant' | 'expires_soon' | 'review_needed' | 'incomplete';
    registrationStatus: 'current' | 'expires_soon' | 'expired' | 'missing';
    insuranceStatus: 'current' | 'expires_soon' | 'expired' | 'missing';
    inspectionStatus: 'current' | 'expires_soon' | 'expired' | 'missing';
    lastUpdated: string;
  };
  
  // Additional metadata
  metadata?: {
    documentCount?: number;
    lastDocumentProcessed?: string;
    dataSource?: string[];
    qualityScore?: number;
  };
}

// API Vehicle Input Format (for creation/updates)
export interface ApiVehicleInput {
  vin: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  status?: 'active' | 'inactive' | 'maintenance';
  dotNumber?: string;
  truckNumber?: string;
  
  // Optional registration data
  registration?: {
    number?: string;
    state?: string;
    expirationDate?: string;
    registeredOwner?: string;
  };
  
  // Optional insurance data
  insurance?: {
    carrier?: string;
    policyNumber?: string;
    expirationDate?: string;
    coverageAmount?: number;
  };
}

// Vehicle List Response Format
export interface ApiVehicleList {
  vehicles: ApiVehicle[];
  summary: {
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
    compliant: number;
    nonCompliant: number;
  };
}

export class VehicleTransformer implements DataTransformer<VehicleRecord, ApiVehicle> {
  
  /**
   * Transform database VehicleRecord to API response format
   */
  transform(input: VehicleRecord): ApiVehicle {
    // Helper function to safely parse dates
    const parseDate = (dateString?: string): string | undefined => {
      if (!dateString) return undefined;
      
      try {
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? undefined : date.toISOString();
      } catch {
        return undefined;
      }
    };

    // Helper function to determine compliance status
    const getComplianceStatus = (vehicle: VehicleRecord): ApiVehicle['compliance'] => {
      // This would typically integrate with your compliance checking service
      // For now, we'll provide a basic implementation
      const now = new Date();
      
      let registrationStatus: 'current' | 'expires_soon' | 'expired' | 'missing' = 'missing';
      let insuranceStatus: 'current' | 'expires_soon' | 'expired' | 'missing' = 'missing';
      let inspectionStatus: 'current' | 'expires_soon' | 'expired' | 'missing' = 'missing';
      
      // Check registration
      if (vehicle.registrationExpirationDate) {
        const regExpiry = new Date(vehicle.registrationExpirationDate);
        const daysUntilExpiry = Math.ceil((regExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          registrationStatus = 'expired';
        } else if (daysUntilExpiry <= 30) {
          registrationStatus = 'expires_soon';
        } else {
          registrationStatus = 'current';
        }
      }
      
      // Check insurance
      if (vehicle.insuranceExpirationDate) {
        const insExpiry = new Date(vehicle.insuranceExpirationDate);
        const daysUntilExpiry = Math.ceil((insExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          insuranceStatus = 'expired';
        } else if (daysUntilExpiry <= 30) {
          insuranceStatus = 'expires_soon';
        } else {
          insuranceStatus = 'current';
        }
      }
      
      // Overall compliance logic
      let overall: 'compliant' | 'non_compliant' | 'expires_soon' | 'review_needed' | 'incomplete' = 'compliant';
      
      if (registrationStatus === 'expired' || insuranceStatus === 'expired') {
        overall = 'non_compliant';
      } else if (registrationStatus === 'expires_soon' || insuranceStatus === 'expires_soon') {
        overall = 'expires_soon';
      } else if (registrationStatus === 'missing' || insuranceStatus === 'missing') {
        overall = 'incomplete';
      }
      
      return {
        overall,
        registrationStatus,
        insuranceStatus,
        inspectionStatus,
        lastUpdated: new Date().toISOString()
      };
    };

    return {
      id: input.id,
      vin: input.vin,
      make: input.make,
      model: input.model,
      year: input.year,
      licensePlate: input.licensePlate,
      status: input.status,
      dotNumber: input.dotNumber,
      truckNumber: input.truckNumber,
      
      // Transform timestamps
      createdAt: parseDate(input.dateAdded) || new Date().toISOString(),
      updatedAt: parseDate(input.lastUpdated) || new Date().toISOString(),
      
      // Transform registration data
      ...(input.registrationNumber || input.registrationState || input.registrationExpirationDate || input.registeredOwner) && {
        registration: {
          ...(input.registrationNumber && { number: input.registrationNumber }),
          ...(input.registrationState && { state: input.registrationState }),
          ...(input.registrationExpirationDate && { expirationDate: parseDate(input.registrationExpirationDate) }),
          ...(input.registeredOwner && { registeredOwner: input.registeredOwner })
        }
      },
      
      // Transform insurance data
      ...(input.insuranceCarrier || input.policyNumber || input.insuranceExpirationDate || input.coverageAmount) && {
        insurance: {
          ...(input.insuranceCarrier && { carrier: input.insuranceCarrier }),
          ...(input.policyNumber && { policyNumber: input.policyNumber }),
          ...(input.insuranceExpirationDate && { expirationDate: parseDate(input.insuranceExpirationDate) }),
          ...(input.coverageAmount && { coverageAmount: input.coverageAmount })
        }
      },
      
      // Add compliance status
      compliance: getComplianceStatus(input),
      
      // Add metadata
      metadata: {
        dataSource: ['manual_entry'], // Would be dynamic in real implementation
        qualityScore: this.calculateDataQualityScore(input),
        lastDocumentProcessed: parseDate(input.lastUpdated)
      }
    };
  }

  /**
   * Validate input data before transformation
   */
  validate(input: any): input is VehicleRecord {
    if (!input || typeof input !== 'object') return false;
    
    // Check required fields
    const requiredFields = ['id', 'vin', 'make', 'model', 'year', 'licensePlate', 'status', 'truckNumber'];
    for (const field of requiredFields) {
      if (!(field in input) || input[field] === null || input[field] === undefined) {
        return false;
      }
    }
    
    // Validate data types
    if (typeof input.vin !== 'string' || input.vin.length !== 17) return false;
    if (typeof input.year !== 'number' || input.year < 1900 || input.year > new Date().getFullYear() + 1) return false;
    if (!['active', 'inactive', 'maintenance'].includes(input.status)) return false;
    
    return true;
  }

  /**
   * Transform API output back to database format
   */
  reverse(output: ApiVehicle): VehicleRecord {
    return {
      id: output.id,
      vin: output.vin,
      make: output.make,
      model: output.model,
      year: output.year,
      licensePlate: output.licensePlate,
      status: output.status || 'active',
      dotNumber: output.dotNumber,
      truckNumber: output.truckNumber,
      dateAdded: output.createdAt,
      lastUpdated: output.updatedAt,
      
      // Transform registration data
      registrationNumber: output.registration?.number,
      registrationState: output.registration?.state,
      registrationExpirationDate: output.registration?.expirationDate,
      registeredOwner: output.registration?.registeredOwner,
      
      // Transform insurance data
      insuranceCarrier: output.insurance?.carrier,
      policyNumber: output.insurance?.policyNumber,
      insuranceExpirationDate: output.insurance?.expirationDate,
      coverageAmount: output.insurance?.coverageAmount,
      
      // Transform compliance data
      complianceStatus: this.mapComplianceStatus(output.compliance?.overall),
      complianceData: output.compliance
    };
  }
  
  /**
   * Transform API input to database format (for create/update operations)
   */
  reverseInput(input: ApiVehicleInput): Partial<VehicleRecord> {
    return {
      vin: input.vin,
      make: input.make,
      model: input.model,
      year: input.year,
      licensePlate: input.licensePlate,
      status: input.status || 'active',
      dotNumber: input.dotNumber,
      truckNumber: input.truckNumber,
      
      // Transform registration data
      registrationNumber: input.registration?.number,
      registrationState: input.registration?.state,
      registrationExpirationDate: input.registration?.expirationDate,
      registeredOwner: input.registration?.registeredOwner,
      
      // Transform insurance data
      insuranceCarrier: input.insurance?.carrier,
      policyNumber: input.insurance?.policyNumber,
      insuranceExpirationDate: input.insurance?.expirationDate,
      coverageAmount: input.insurance?.coverageAmount
    };
  }

  private mapComplianceStatus(status?: string): 'compliant' | 'warning' | 'expired' | 'unknown' {
    switch (status) {
      case 'compliant': return 'compliant';
      case 'expires_soon': return 'warning';
      case 'non_compliant': return 'expired';
      default: return 'unknown';
    }
  }

  /**
   * Transform multiple vehicles with summary
   */
  transformList(vehicles: VehicleRecord[]): ApiVehicleList {
    const transformedVehicles = vehicles.map(vehicle => this.transform(vehicle));
    
    // Calculate summary statistics
    const summary = {
      total: transformedVehicles.length,
      active: transformedVehicles.filter(v => v.status === 'active').length,
      inactive: transformedVehicles.filter(v => v.status === 'inactive').length,
      maintenance: transformedVehicles.filter(v => v.status === 'maintenance').length,
      compliant: transformedVehicles.filter(v => v.compliance?.overall === 'compliant').length,
      nonCompliant: transformedVehicles.filter(v => 
        v.compliance?.overall === 'non_compliant' || 
        v.compliance?.overall === 'expires_soon' ||
        v.compliance?.overall === 'incomplete'
      ).length
    };
    
    return {
      vehicles: transformedVehicles,
      summary
    };
  }

  /**
   * Calculate data quality score based on completeness
   */
  private calculateDataQualityScore(vehicle: VehicleRecord): number {
    const fields = [
      'vin', 'make', 'model', 'year', 'licensePlate', 'truckNumber',
      'registrationNumber', 'registrationState', 'registrationExpirationDate',
      'insuranceCarrier', 'policyNumber', 'insuranceExpirationDate'
    ];
    
    const filledFields = fields.filter(field => {
      const value = (vehicle as any)[field];
      return value !== null && value !== undefined && value !== '';
    }).length;
    
    return Math.round((filledFields / fields.length) * 100);
  }

  /**
   * Transform for search/filter operations
   */
  transformForSearch(vehicles: VehicleRecord[], filters?: {
    status?: string;
    compliance?: string;
    search?: string;
  }): ApiVehicleList {
    let filteredVehicles = vehicles;
    
    if (filters?.status) {
      filteredVehicles = filteredVehicles.filter(v => v.status === filters.status);
    }
    
    if (filters?.search) {
      const searchTerm = filters.search.toLowerCase();
      filteredVehicles = filteredVehicles.filter(v => 
        v.vin.toLowerCase().includes(searchTerm) ||
        v.make.toLowerCase().includes(searchTerm) ||
        v.model.toLowerCase().includes(searchTerm) ||
        v.licensePlate.toLowerCase().includes(searchTerm) ||
        v.truckNumber.toLowerCase().includes(searchTerm)
      );
    }
    
    if (filters?.compliance) {
      const transformedVehicles = filteredVehicles.map(v => this.transform(v));
      const complianceFiltered = transformedVehicles.filter(v => 
        v.compliance?.overall === filters.compliance
      );
      
      // Convert back to VehicleRecord format for summary calculation
      const backToRecord = complianceFiltered.map(v => {
        return filteredVehicles.find(orig => orig.id === v.id)!;
      });
      
      return this.transformList(backToRecord);
    }
    
    return this.transformList(filteredVehicles);
  }
}

// Export singleton instance
export const vehicleTransformer = new VehicleTransformer();