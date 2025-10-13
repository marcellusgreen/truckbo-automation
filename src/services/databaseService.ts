// API Service for TruckBo Fleet Compliance System
// Handles all communication with the backend API

import { authService } from './authService';

const API_BASE_URL = '/api';

async function fetchAPI(url: string, options: RequestInit = {}) {
  const session = authService.getCurrentSession();
  const authHeaders: Record<string, string> = session?.token
    ? { Authorization: `Bearer ${session.token}` }
    : {};

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'API request failed' }));
    throw new Error(errorData.error || `API request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}


export interface Vehicle {
  id: string;
  organizationId: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  dotNumber?: string;
  truckNumber?: string;
  status: 'active' | 'inactive' | 'maintenance';
  registrationNumber?: string;
  registrationState?: string;
  registrationExpiry?: Date;
  registeredOwner?: string;
  insuranceCarrier?: string;
  policyNumber?: string;
  insuranceExpiry?: Date;
  coverageAmount?: number;
  complianceStatus: 'compliant' | 'warning' | 'expired' | 'unknown';
  lastInspectionDate?: Date;
  nextInspectionDue?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Driver {
  id: string;
  organizationId: string;
  employeeId?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  hireDate?: Date;
  status: 'active' | 'inactive' | 'terminated';
  email?: string;
  phone?: string;
  address?: any;
  emergencyContact?: any;
  cdlNumber?: string;
  cdlState?: string;
  cdlClass?: 'A' | 'B' | 'C';
  cdlIssueDate?: Date;
  cdlExpirationDate?: Date;
  cdlEndorsements?: string[];
  cdlRestrictions?: string[];
  cdlStatus: 'valid' | 'expired' | 'expiring_soon' | 'invalid';
  medicalCertNumber?: string;
  medicalCertIssuedDate?: Date;
  medicalCertExpirationDate?: Date;
  medicalExaminerName?: string;
  medicalExaminerRegistry?: string;
  medicalRestrictions?: string[];
  medicalCertStatus: 'valid' | 'expired' | 'expiring_soon' | 'invalid';
  backgroundCheckDate?: Date;
  drugTestDate?: Date;
  trainingCertificates?: string[];
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  organizationId: string;
  documentType: string;
  documentCategory?: string;
  originalFilename: string;
  fileSize?: number;
  fileType?: string;
  s3Bucket?: string;
  s3Key: string;
  s3Url?: string;
  ocrText?: string;
  extractionData?: any;
  extractionConfidence?: number;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processingErrors?: string[];
  vehicleId?: string;
  driverId?: string;
  documentDate?: Date;
  expirationDate?: Date;
  issuingAuthority?: string;
  uploadedBy?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceAlert {
  id: string;
  organizationId: string;
  alertType: string;
  alertCategory: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description?: string;
  recommendedAction?: string;
  vehicleId?: string;
  driverId?: string;
  documentId?: string;
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  expirationDate?: Date;
  daysUntilExpiry?: number;
  reminderSentAt?: Date;
  nextReminderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class DatabaseService {
  
  constructor() {}

  async connect(): Promise<void> {
    // No-op in API-based service
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    // No-op in API-based service
    return Promise.resolve();
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await fetchAPI('/health');
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'API health check failed' };
    }
  }

  // =========================================
  // VEHICLE OPERATIONS
  // =========================================

  async createVehicle(vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
    return fetchAPI('/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicle),
    });
  }

  async getVehicleById(id: string): Promise<Vehicle | null> {
    return fetchAPI(`/vehicles/${id}`);
  }

  async getVehiclesByOrganization(): Promise<Vehicle[]> {
    // Using the vehicles API endpoint
    return fetchAPI('/v1/vehicles');
  }

  async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle | null> {
    return fetchAPI(`/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteVehicle(id: string): Promise<boolean> {
    await fetchAPI(`/vehicles/${id}`, { method: 'DELETE' });
    return true;
  }

  // =========================================
  // DRIVER OPERATIONS
  // =========================================

  async createDriver(driver: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<Driver> {
    return fetchAPI('/drivers', {
      method: 'POST',
      body: JSON.stringify(driver),
    });
  }

  async getDriverById(id: string): Promise<Driver | null> {
    return fetchAPI(`/drivers/${id}`);
  }

  async getDriversByOrganization(): Promise<Driver[]> {
    // Driver endpoints not yet implemented - returning empty array
    console.warn('Driver API endpoints not yet implemented');
    return Promise.resolve([]);
  }

  async updateDriver(id: string, updates: Partial<Driver>): Promise<Driver | null> {
    return fetchAPI(`/drivers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // =========================================
  // DOCUMENT OPERATIONS
  // =========================================

  async createDocument(document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    // Document creation happens via document processing API
    return fetchAPI('/v1/documents/process', {
      method: 'POST',
      body: JSON.stringify(document),
    });
  }

  async getDocumentsByEntity(entityType: 'vehicle' | 'driver', entityId: string): Promise<Document[]> {
    return fetchAPI(`/${entityType}s/${entityId}/documents`);
  }

  async updateDocumentProcessing(
    id: string,
    ocrText: string,
    extractionData: any,
    confidence: number
  ): Promise<Document | null> {
     return fetchAPI(`/v1/documents/${id}/processing`, {
      method: 'PUT',
      body: JSON.stringify({ ocrText, extractionData, confidence }),
    });
  }

  // =========================================
  // COMPLIANCE ALERT OPERATIONS
  // =========================================

  async createComplianceAlert(alert: Omit<ComplianceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<ComplianceAlert> {
     return fetchAPI('/v1/compliance/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    });
  }

  async getActiveAlertsByOrganization(): Promise<ComplianceAlert[]> {
    return fetchAPI('/v1/compliance/expiring');
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<ComplianceAlert | null> {
    return fetchAPI(`/v1/compliance/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  // =========================================
  // DASHBOARD QUERIES
  // =========================================

  async getOrganizationDashboard(): Promise<any> {
    return fetchAPI('/v1/compliance/summary');
  }

  async getVehicleComplianceOverview(): Promise<any[]> {
    return fetchAPI('/v1/vehicles');
  }

  async getDriverComplianceOverview(): Promise<any[]> {
    // Driver endpoints not yet implemented - returning empty array
    console.warn('Driver compliance API endpoints not yet implemented');
    return Promise.resolve([]);
  }
  
  // =========================================
  // UTILITY METHODS
  // =========================================

  async searchDocuments(searchTerm: string): Promise<Document[]> {
    return fetchAPI(`/v1/documents/search?q=${encodeURIComponent(searchTerm)}`);
  }
}

export function createDatabaseService(): DatabaseService {
  return new DatabaseService();
}
''
