// Standardized Field Schema for Fleet Management System
// Single source of truth for all field names and types across all layers

// ===========================================
// CORE VEHICLE INTERFACE - STANDARDIZED
// ===========================================

export interface StandardizedVehicle {
  // Primary Identifiers (always present)
  id: string;
  vin: string;
  
  // Basic Vehicle Info
  make: string;
  model: string;
  year: number; // Always number, never string
  
  // Vehicle Identifiers
  licensePlate: string;
  truckNumber: string; // Standardized as truckNumber (not vehicleNumber, unitNumber)
  dotNumber?: string;
  mcNumber?: string;
  
  // Vehicle Specifications
  vehicleClass?: string;
  fuelType?: string;
  maxWeight?: number;
  engineDescription?: string;
  
  // Status and Metadata
  status: VehicleStatus;
  createdAt: string; // ISO string - standardized datetime format
  updatedAt: string; // ISO string - standardized datetime format
  
  // Registration Information
  registration?: {
    registrationNumber?: string;
    registrationState?: string;
    registrationExpirationDate?: string; // Standardized as 'ExpirationDate' (not 'Expiry')
    registeredOwner?: string;
  };
  
  // Insurance Information  
  insurance?: {
    insuranceCarrier?: string;
    policyNumber?: string;
    insuranceExpirationDate?: string; // Standardized as 'ExpirationDate'
    coverageAmount?: number;
  };
  
  // Compliance Information
  compliance?: {
    complianceScore?: number; // 0-100
    riskLevel?: RiskLevel;
    overallComplianceStatus?: ComplianceStatus;
    lastComplianceCheck?: string;
    nextExpiringDocument?: ExpiringDocument;
  };
  
  // Document Tracking
  documents?: {
    totalDocuments: number;
    documentTypes: DocumentType[];
    hasExpiredDocuments: boolean;
    hasExpiringSoonDocuments: boolean;
  };
  
  // Data Source and Quality
  metadata: {
    dataSource: DataSource;
    lastSyncTimestamp: number;
    conflictFlags: ConflictFlag[];
    extractionConfidence?: number;
    needsReview: boolean;
  };
}

// ===========================================
// STANDARDIZED DRIVER INTERFACE
// ===========================================

export interface StandardizedDriver {
  // Primary Identifiers
  id: string;
  employeeId: string;
  
  // Personal Information
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  
  // Employment Information
  hireDate: string;
  status: DriverStatus;
  
  // CDL Information
  cdl: {
    cdlNumber: string;
    cdlState: string;
    cdlClass: CDLClass;
    cdlIssueDate: string;
    cdlExpirationDate: string; // Standardized naming
    endorsements: string[];
    restrictions: string[];
    cdlStatus: ComplianceStatus;
  };
  
  // Medical Certificate
  medicalCertificate: {
    certificateNumber: string;
    issueDate: string;
    expirationDate: string; // Standardized naming
    examinerName: string;
    examinerNationalRegistry: string;
    medicalVariance?: string;
    restrictions: string[];
    medicalStatus: ComplianceStatus;
  };
  
  // Contact Information
  contact?: {
    email?: string;
    phone?: string;
    address?: Address;
    emergencyContact?: EmergencyContact;
  };
  
  // Metadata
  metadata: {
    createdAt: string;
    updatedAt: string;
    dataSource: DataSource;
    needsReview: boolean;
  };
}

// ===========================================
// STANDARDIZED DOCUMENT INTERFACE
// ===========================================

export interface StandardizedDocument {
  id: string;
  
  // Document Classification
  documentType: DocumentType;
  documentCategory: DocumentCategory;
  
  // File Information
  originalFilename: string;
  fileSize: number;
  fileType: string;
  
  // Content and Dates
  issueDate?: string;
  expirationDate?: string; // Standardized naming across all documents
  
  // Storage Information
  storageLocation: {
    provider: 'local' | 's3' | 'database';
    bucket?: string;
    key?: string;
    url?: string;
  };
  
  // Processing Information
  processing: {
    processingStatus: ProcessingStatus;
    extractionConfidence: number;
    processingNotes: string[];
    needsReview: boolean;
  };
  
  // Relationships
  relationships: {
    vehicleId?: string;
    driverId?: string;
    organizationId: string;
  };
  
  // Metadata
  metadata: {
    uploadedBy: string;
    uploadedAt: string;
    processedAt?: string;
    lastUpdated: string;
  };
}

// ===========================================
// STANDARDIZED ENUMS AND TYPES
// ===========================================

export type VehicleStatus = 'active' | 'inactive' | 'maintenance' | 'retired';

export type DriverStatus = 'active' | 'inactive' | 'terminated' | 'on_leave';

export type ComplianceStatus = 'compliant' | 'non_compliant' | 'expires_soon' | 'expired' | 'review_needed' | 'missing';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type DataSource = 'manual_entry' | 'document_processing' | 'api_import' | 'bulk_upload' | 'reconciliation';

export type ConflictFlag = 'make_mismatch' | 'model_mismatch' | 'year_mismatch' | 'license_plate_conflict' | 'duplicate_vin' | 'missing_data';

export type DocumentType = 'registration' | 'insurance' | 'medical_certificate' | 'cdl' | 'inspection' | 'maintenance' | 'permit';

export type DocumentCategory = 'vehicle_documents' | 'driver_documents' | 'compliance_documents';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'review_required';

export type CDLClass = 'A' | 'B' | 'C';

// ===========================================
// SUPPORTING INTERFACES
// ===========================================

export interface ExpiringDocument {
  documentType: DocumentType;
  expirationDate: string;
  daysUntilExpiry: number;
  urgencyLevel: 'normal' | 'warning' | 'critical' | 'expired';
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

// ===========================================
// STANDARDIZED STATS INTERFACES
// ===========================================

export interface StandardizedFleetStats {
  // Vehicle Counts
  totalVehicles: number;
  activeVehicles: number;
  inactiveVehicles: number;
  maintenanceVehicles: number;
  retiredVehicles: number;
  
  // Compliance Stats
  compliantVehicles: number;
  nonCompliantVehicles: number;
  vehiclesExpiringSoon: number;
  expiredVehicles: number;
  vehiclesNeedingReview: number;
  
  // Document Stats
  totalDocuments: number;
  expiredDocuments: number;
  expiringSoonDocuments: number;
  missingDocuments: number;
  
  // Quality Metrics
  averageComplianceScore: number;
  dataQualityScore: number;
  conflictCount: number;
  
  // Timestamp
  lastUpdated: string;
}

export interface StandardizedDriverStats {
  // Driver Counts
  totalDrivers: number;
  activeDrivers: number;
  inactiveDrivers: number;
  driversOnLeave: number;
  terminatedDrivers: number;
  
  // CDL Stats
  validCDLs: number;
  expiredCDLs: number;
  cdlsExpiringSoon: number;
  
  // Medical Certificate Stats
  validMedicalCertificates: number;
  expiredMedicalCertificates: number;
  medicalCertificatesExpiringSoon: number;
  
  // Compliance
  fullyCompliantDrivers: number;
  driversNeedingReview: number;
  
  // Timestamp
  lastUpdated: string;
}

// ===========================================
// FIELD NAMING STANDARDS
// ===========================================

export const FIELD_NAMING_STANDARDS = {
  // Date Fields - Always use 'ExpirationDate' (not 'Expiry' or 'ExpiryDate')
  DATE_FIELDS: {
    EXPIRATION: 'expirationDate',
    ISSUE: 'issueDate',
    CREATED: 'createdAt',
    UPDATED: 'updatedAt',
    UPLOADED: 'uploadedAt',
    PROCESSED: 'processedAt'
  },
  
  // Status Fields - Always use full descriptive names
  STATUS_FIELDS: {
    VEHICLE_STATUS: 'status',
    DRIVER_STATUS: 'status', 
    COMPLIANCE_STATUS: 'complianceStatus',
    PROCESSING_STATUS: 'processingStatus',
    OVERALL_COMPLIANCE: 'overallComplianceStatus'
  },
  
  // Identifier Fields - Consistent naming
  ID_FIELDS: {
    PRIMARY: 'id',
    VEHICLE_ID: 'vehicleId',
    DRIVER_ID: 'driverId',
    EMPLOYEE_ID: 'employeeId',
    ORGANIZATION_ID: 'organizationId',
    TRUCK_NUMBER: 'truckNumber', // Standardized (not vehicleNumber or unitNumber)
    DOT_NUMBER: 'dotNumber',
    MC_NUMBER: 'mcNumber'
  },
  
  // Insurance Fields - Consistent structure
  INSURANCE_FIELDS: {
    CARRIER: 'insuranceCarrier',
    POLICY_NUMBER: 'policyNumber',
    EXPIRATION_DATE: 'insuranceExpirationDate',
    COVERAGE_AMOUNT: 'coverageAmount'
  },
  
  // Registration Fields - Consistent structure  
  REGISTRATION_FIELDS: {
    NUMBER: 'registrationNumber',
    STATE: 'registrationState',
    EXPIRATION_DATE: 'registrationExpirationDate',
    OWNER: 'registeredOwner'
  }
} as const;

// ===========================================
// TYPE UTILITIES FOR VALIDATION
// ===========================================

// Helper type to ensure all date fields end with proper suffix
type DateFieldName = `${string}${'Date' | 'At'}`;

// Helper type to ensure all status fields are properly named  
type StatusFieldName = `${string}Status` | 'status';

// Validation helpers
export const isValidDateField = (fieldName: string): fieldName is DateFieldName => {
  return fieldName.endsWith('Date') || fieldName.endsWith('At');
};

export const isValidStatusField = (fieldName: string): fieldName is StatusFieldName => {
  return fieldName.endsWith('Status') || fieldName === 'status';
};