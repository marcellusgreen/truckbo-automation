// PostgreSQL Database Service
// Handles all database operations for TruckBo fleet compliance system

// Conditional import for browser compatibility
let Pool: any, PoolClient: any, QueryResult: any;
if (typeof window === 'undefined') {
  // Only import pg in Node.js environment
  try {
    const pg = require('pg');
    Pool = pg.Pool;
    PoolClient = pg.PoolClient;
    QueryResult = pg.QueryResult;
  } catch (error) {
    console.warn('PostgreSQL (pg) module not available - using fallback mode');
    Pool = class MockPool {
      connect() { throw new Error('PostgreSQL not available in browser environment'); }
      query() { throw new Error('PostgreSQL not available in browser environment'); }
      end() { return Promise.resolve(); }
      on() {}
    };
  }
} else {
  // Browser environment - use mock classes
  Pool = class MockPool {
    connect() { throw new Error('PostgreSQL not available in browser environment'); }
    query() { throw new Error('PostgreSQL not available in browser environment'); }
    end() { return Promise.resolve(); }
    on() {}
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeoutMs?: number;
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
  private pool: Pool;
  // private isConnected: boolean = false;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 20,
      connectionTimeoutMillis: config.connectionTimeoutMs || 30000,
      idleTimeoutMillis: 30000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      // this.isConnected = false;
    });
  }

  /**
   * Initialize database connection and test connectivity
   */
  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      // this.isConnected = true;
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  async disconnect(): Promise<void> {
    await this.pool.end();
    // this.isConnected = false;
    console.log('Database connection closed');
  }

  /**
   * Health check for database connectivity
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.query('SELECT NOW() as current_time');
      return { healthy: true };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : 'Database health check failed' 
      };
    }
  }

  /**
   * Execute a database query
   */
  async query(text: string, params?: any[]): Promise<QueryResult<any>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================
  // VEHICLE OPERATIONS
  // ==========================================

  async createVehicle(vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vehicle> {
    const query = `
      INSERT INTO vehicles (
        organization_id, vin, make, model, year, license_plate, dot_number, 
        truck_number, status, registration_number, registration_state, 
        registration_expiry, registered_owner, insurance_carrier, policy_number,
        insurance_expiry, coverage_amount, compliance_status, last_inspection_date,
        next_inspection_due, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *
    `;
    
    const values = [
      vehicle.organizationId, vehicle.vin, vehicle.make, vehicle.model, vehicle.year,
      vehicle.licensePlate, vehicle.dotNumber, vehicle.truckNumber, vehicle.status,
      vehicle.registrationNumber, vehicle.registrationState, vehicle.registrationExpiry,
      vehicle.registeredOwner, vehicle.insuranceCarrier, vehicle.policyNumber,
      vehicle.insuranceExpiry, vehicle.coverageAmount, vehicle.complianceStatus,
      vehicle.lastInspectionDate, vehicle.nextInspectionDue, vehicle.createdBy
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getVehicleById(id: string): Promise<Vehicle | null> {
    const result = await this.query('SELECT * FROM vehicles WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getVehiclesByOrganization(organizationId: string): Promise<Vehicle[]> {
    const result = await this.query(
      'SELECT * FROM vehicles WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId]
    );
    return result.rows;
  }

  async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle | null> {
    const setClause = Object.keys(updates)
      .map((key, index) => `${this.camelToSnake(key)} = $${index + 2}`)
      .join(', ');
    
    const query = `UPDATE vehicles SET ${setClause} WHERE id = $1 RETURNING *`;
    const values = [id, ...Object.values(updates)];
    
    const result = await this.query(query, values);
    return result.rows[0] || null;
  }

  async deleteVehicle(id: string): Promise<boolean> {
    const result = await this.query('DELETE FROM vehicles WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // ==========================================
  // DRIVER OPERATIONS
  // ==========================================

  async createDriver(driver: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<Driver> {
    const query = `
      INSERT INTO drivers (
        organization_id, employee_id, first_name, last_name, date_of_birth, hire_date,
        status, email, phone, address, emergency_contact, cdl_number, cdl_state,
        cdl_class, cdl_issue_date, cdl_expiration_date, cdl_endorsements, cdl_restrictions,
        cdl_status, medical_cert_number, medical_cert_issued_date, medical_cert_expiration_date,
        medical_examiner_name, medical_examiner_registry, medical_restrictions, medical_cert_status,
        background_check_date, drug_test_date, training_certificates, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
      RETURNING *
    `;
    
    const values = [
      driver.organizationId, driver.employeeId, driver.firstName, driver.lastName,
      driver.dateOfBirth, driver.hireDate, driver.status, driver.email, driver.phone,
      JSON.stringify(driver.address), JSON.stringify(driver.emergencyContact),
      driver.cdlNumber, driver.cdlState, driver.cdlClass, driver.cdlIssueDate,
      driver.cdlExpirationDate, driver.cdlEndorsements, driver.cdlRestrictions,
      driver.cdlStatus, driver.medicalCertNumber, driver.medicalCertIssuedDate,
      driver.medicalCertExpirationDate, driver.medicalExaminerName, driver.medicalExaminerRegistry,
      driver.medicalRestrictions, driver.medicalCertStatus, driver.backgroundCheckDate,
      driver.drugTestDate, driver.trainingCertificates, driver.createdBy
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getDriverById(id: string): Promise<Driver | null> {
    const result = await this.query('SELECT * FROM drivers WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getDriversByOrganization(organizationId: string): Promise<Driver[]> {
    const result = await this.query(
      'SELECT * FROM drivers WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId]
    );
    return result.rows;
  }

  async updateDriver(id: string, updates: Partial<Driver>): Promise<Driver | null> {
    const setClause = Object.keys(updates)
      .map((key, index) => `${this.camelToSnake(key)} = $${index + 2}`)
      .join(', ');
    
    const query = `UPDATE drivers SET ${setClause} WHERE id = $1 RETURNING *`;
    const values = [id, ...Object.values(updates)];
    
    const result = await this.query(query, values);
    return result.rows[0] || null;
  }

  // ==========================================
  // DOCUMENT OPERATIONS
  // ==========================================

  async createDocument(document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> {
    const query = `
      INSERT INTO documents (
        organization_id, document_type, document_category, original_filename, file_size,
        file_type, s3_bucket, s3_key, s3_url, ocr_text, extraction_data,
        extraction_confidence, processing_status, processing_errors, vehicle_id,
        driver_id, document_date, expiration_date, issuing_authority, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;
    
    const values = [
      document.organizationId, document.documentType, document.documentCategory,
      document.originalFilename, document.fileSize, document.fileType, document.s3Bucket,
      document.s3Key, document.s3Url, document.ocrText, JSON.stringify(document.extractionData),
      document.extractionConfidence, document.processingStatus, document.processingErrors,
      document.vehicleId, document.driverId, document.documentDate, document.expirationDate,
      document.issuingAuthority, document.uploadedBy
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getDocumentsByEntity(entityType: 'vehicle' | 'driver', entityId: string): Promise<Document[]> {
    const columnName = entityType === 'vehicle' ? 'vehicle_id' : 'driver_id';
    const result = await this.query(
      `SELECT * FROM documents WHERE ${columnName} = $1 ORDER BY created_at DESC`,
      [entityId]
    );
    return result.rows;
  }

  async updateDocumentProcessing(
    id: string, 
    ocrText: string, 
    extractionData: any, 
    confidence: number
  ): Promise<Document | null> {
    const query = `
      UPDATE documents 
      SET ocr_text = $2, extraction_data = $3, extraction_confidence = $4, 
          processing_status = 'completed', processed_at = CURRENT_TIMESTAMP
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = await this.query(query, [id, ocrText, JSON.stringify(extractionData), confidence]);
    return result.rows[0] || null;
  }

  // ==========================================
  // COMPLIANCE ALERT OPERATIONS
  // ==========================================

  async createComplianceAlert(alert: Omit<ComplianceAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<ComplianceAlert> {
    const query = `
      INSERT INTO compliance_alerts (
        organization_id, alert_type, alert_category, priority, severity, title,
        description, recommended_action, vehicle_id, driver_id, document_id,
        status, expiration_date, days_until_expiry
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    
    const values = [
      alert.organizationId, alert.alertType, alert.alertCategory, alert.priority,
      alert.severity, alert.title, alert.description, alert.recommendedAction,
      alert.vehicleId, alert.driverId, alert.documentId, alert.status,
      alert.expirationDate, alert.daysUntilExpiry
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getActiveAlertsByOrganization(organizationId: string): Promise<ComplianceAlert[]> {
    const result = await this.query(
      `SELECT * FROM compliance_alerts 
       WHERE organization_id = $1 AND status = 'active' 
       ORDER BY priority = 'critical' DESC, priority = 'high' DESC, days_until_expiry ASC`,
      [organizationId]
    );
    return result.rows;
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<ComplianceAlert | null> {
    const query = `
      UPDATE compliance_alerts 
      SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = await this.query(query, [alertId, userId]);
    return result.rows[0] || null;
  }

  // ==========================================
  // DASHBOARD QUERIES
  // ==========================================

  async getOrganizationDashboard(organizationId: string): Promise<any> {
    const result = await this.query(
      'SELECT * FROM organization_dashboard WHERE id = $1',
      [organizationId]
    );
    return result.rows[0] || null;
  }

  async getVehicleComplianceOverview(organizationId: string): Promise<any[]> {
    const result = await this.query(
      'SELECT * FROM vehicle_compliance_overview WHERE organization_id = $1',
      [organizationId]
    );
    return result.rows;
  }

  async getDriverComplianceOverview(organizationId: string): Promise<any[]> {
    const result = await this.query(
      'SELECT * FROM driver_compliance_overview WHERE organization_id = $1',
      [organizationId]
    );
    return result.rows;
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  async searchDocuments(organizationId: string, searchTerm: string): Promise<Document[]> {
    const result = await this.query(
      `SELECT * FROM documents 
       WHERE organization_id = $1 
       AND (ocr_text ILIKE $2 OR original_filename ILIKE $2)
       ORDER BY created_at DESC`,
      [organizationId, `%${searchTerm}%`]
    );
    return result.rows;
  }
}

// Factory function for creating database service
export function createDatabaseService(config?: Partial<DatabaseConfig>): DatabaseService {
  const defaultConfig: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'truckbo',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
  };

  const finalConfig = { ...defaultConfig, ...config };

  return new DatabaseService(finalConfig);
}