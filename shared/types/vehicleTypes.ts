// Shared Vehicle Types
// Types used by both frontend and backend for vehicle data

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
}