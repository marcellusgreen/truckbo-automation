export interface ParsedVIN {
  vin: string;
  isValid: boolean;
  row: number;
}

export interface ProcessedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  fuelType: string;
  maxWeight: number;
  vehicleClass: string;
  status: 'success' | 'failed';
  complianceTasks: number;
}

export interface VehicleTemplate {
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  status?: 'active' | 'inactive';
  mileage?: number;
  fuelType?: string;
  maxWeight?: number;
  vehicleClass?: string;
  dotNumber?: string;
  mcNumber?: string;
}

export interface ComplianceItem {
  status: 'compliant' | 'warning' | 'expired';
  expiryDate: string;
  daysUntilExpiry: number;
}

export interface FleetVehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  status: 'active' | 'inactive';
  mileage: number;
  fuelType: string;
  maxWeight: number;
  vehicleClass: string;
  dotNumber: string;
  mcNumber: string;
  purchaseDate: string;
  lastServiceDate?: string;
  nextServiceDue?: string;
  compliance: {
    dotInspection: ComplianceItem;
    registration: ComplianceItem;
    insurance: ComplianceItem;
    ifta: ComplianceItem;
    statePermits: ComplianceItem;
    emissions: ComplianceItem;
    weightCert: ComplianceItem;
  };
}

export interface ComplianceTask {
  id: string;
  vehicleId: string;
  vehicleVin: string;
  vehicleName: string;
  title: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  dueDate: string;
  daysUntilDue: number;
  assignedTo: string;
  estimatedCost?: number;
  jurisdiction: string;
  documentationRequired: boolean;
  requiredDocuments?: string[];
  uploadedDocuments?: string[];
  filingUrl?: string;
  createdDate: string;
  updatedDate: string;
  completedDate?: string;
}

export type OnboardingMethod = 'document_processing' | 'vin_list' | 'bulk_upload' | 'individual';

export interface OnboardingPageProps {
  setCurrentPage: (page: string) => void;
}

export interface DashboardPageProps {
  setCurrentPage: (page: string) => void;
}

export interface FleetStats {
  total: number;
  active: number;
  inactive: number;
  complianceWarnings: number;
  complianceExpired: number;
}

export interface ComplianceStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  critical: number;
  high: number;
}