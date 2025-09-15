// Document Storage Service
// Handles saving document processing results to Neon database

import { query } from './db';
import { logger, LogContext } from './logger';
import { ExtractedVehicleData, ExtractedDriverData } from '../utils/dataExtractor';

export interface DocumentRecord {
  id?: string;
  organizationId: string;
  documentType: 'registration' | 'insurance' | 'medical_certificate' | 'cdl' | 'inspection';
  documentCategory: 'vehicle_docs' | 'driver_docs' | 'compliance_docs';
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
  documentDate?: string;
  expirationDate?: string;
  issuingAuthority?: string;
  uploadedBy?: string;
  processedAt?: string;
}

export interface SaveDocumentResult {
  success: boolean;
  documentId?: string;
  vehicleId?: string;
  driverId?: string;
  warnings?: string[];
  errors?: string[];
}

class DocumentStorage {
  private readonly context: LogContext = { layer: 'storage', component: 'DocumentStorage' };

  /**
   * Save document processing results to database
   */
  async saveDocumentResult(
    documentRecord: DocumentRecord,
    extractedData?: ExtractedVehicleData | ExtractedDriverData
  ): Promise<SaveDocumentResult> {
    const result: SaveDocumentResult = {
      success: false,
      warnings: [],
      errors: []
    };

    try {
      logger.info('Saving document processing result', {
        ...this.context,
        operation: 'saveDocumentResult'
      }, {
        documentType: documentRecord.documentType,
        filename: documentRecord.originalFilename
      });

      // Start transaction
      await query('BEGIN', []);

      try {
        // 1. Save document record
        const documentId = await this.insertDocumentRecord(documentRecord);
        result.documentId = documentId;

        // 2. Create or update vehicle/driver records based on extracted data
        if (extractedData) {
          if ('vin' in extractedData) {
            // Vehicle document
            const vehicleResult = await this.handleVehicleData(
              extractedData as ExtractedVehicleData,
              documentRecord.organizationId,
              documentId
            );
            result.vehicleId = vehicleResult.vehicleId;
            if (vehicleResult.warnings) result.warnings?.push(...vehicleResult.warnings);
            if (vehicleResult.errors) result.errors?.push(...vehicleResult.errors);
          } else {
            // Driver document
            const driverResult = await this.handleDriverData(
              extractedData as ExtractedDriverData,
              documentRecord.organizationId,
              documentId
            );
            result.driverId = driverResult.driverId;
            if (driverResult.warnings) result.warnings?.push(...driverResult.warnings);
            if (driverResult.errors) result.errors?.push(...driverResult.errors);
          }
        }

        // 3. Update document record with entity associations
        if (result.vehicleId || result.driverId) {
          await this.updateDocumentAssociations(documentId, result.vehicleId, result.driverId);
        }

        // Commit transaction
        await query('COMMIT', []);
        result.success = true;

        logger.info('Document processing result saved successfully', {
          ...this.context,
          operation: 'saveDocumentResult'
        }, {
          documentId,
          vehicleId: result.vehicleId,
          driverId: result.driverId
        });

      } catch (error) {
        await query('ROLLBACK', []);
        throw error;
      }

    } catch (error) {
      logger.error('Failed to save document processing result', this.context, error as Error);
      result.errors?.push(`Database save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Insert document record into database
   */
  private async insertDocumentRecord(doc: DocumentRecord): Promise<string> {
    const insertQuery = `
      INSERT INTO documents (
        organization_id, document_type, document_category, original_filename,
        file_size, file_type, s3_bucket, s3_key, s3_url, ocr_text,
        extraction_data, extraction_confidence, processing_status, processing_errors,
        document_date, expiration_date, issuing_authority, uploaded_by, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `;

    const values = [
      doc.organizationId,
      doc.documentType,
      doc.documentCategory,
      doc.originalFilename,
      doc.fileSize,
      doc.fileType,
      doc.s3Bucket,
      doc.s3Key,
      doc.s3Url,
      doc.ocrText,
      doc.extractionData ? JSON.stringify(doc.extractionData) : null,
      doc.extractionConfidence,
      doc.processingStatus,
      doc.processingErrors,
      doc.documentDate,
      doc.expirationDate,
      doc.issuingAuthority,
      doc.uploadedBy,
      doc.processedAt || new Date().toISOString()
    ];

    const res = await query(insertQuery, values);
    return res.rows[0].id;
  }

  /**
   * Handle vehicle data - create or update vehicle record with conflict resolution
   */
  private async handleVehicleData(
    data: ExtractedVehicleData,
    organizationId: string,
    documentId: string
  ): Promise<{ vehicleId?: string; warnings?: string[]; errors?: string[] }> {
    const result: { vehicleId?: string; warnings?: string[]; errors?: string[] } = {
      warnings: [],
      errors: []
    };

    try {
      if (!data.vin) {
        result.warnings?.push('No VIN found in extracted data - vehicle not linked');
        return result;
      }

      // Validate VIN format
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(data.vin)) {
        result.errors?.push(`Invalid VIN format: ${data.vin}`);
        return result;
      }

      // Check if vehicle exists by VIN
      const vehicleQuery = 'SELECT id, make, model, year, license_plate FROM vehicles WHERE vin = $1 AND organization_id = $2';
      const vehicleRes = await query(vehicleQuery, [data.vin, organizationId]);

      if (vehicleRes.rows.length > 0) {
        // Vehicle exists - check for conflicts before updating
        result.vehicleId = vehicleRes.rows[0].id;
        const existingVehicle = vehicleRes.rows[0];

        const conflicts = this.detectVehicleConflicts(existingVehicle, data);
        if (conflicts.length > 0) {
          result.warnings?.push(...conflicts.map(c => `Conflict detected: ${c}`));
          // For high-confidence extractions, update anyway but log conflicts
          if ((data.extractionConfidence || 0) > 0.8) {
            await this.updateVehicleFromExtractedData(result.vehicleId!, data);
            result.warnings?.push('Updated existing vehicle record despite conflicts (high confidence)');
          } else {
            result.warnings?.push('Vehicle conflicts detected - manual review required');
          }
        } else {
          await this.updateVehicleFromExtractedData(result.vehicleId!, data);
          result.warnings?.push('Updated existing vehicle record');
        }
      } else {
        // Check for potential duplicates by license plate or truck number
        const duplicateChecks = await this.checkVehicleDuplicates(data, organizationId);
        if (duplicateChecks.length > 0) {
          result.warnings?.push(...duplicateChecks.map(d => `Potential duplicate: ${d}`));
        }

        // Create new vehicle
        result.vehicleId = await this.createVehicleFromExtractedData(data, organizationId);
        result.warnings?.push('Created new vehicle record');
      }

    } catch (error) {
      logger.error('Failed to handle vehicle data', this.context, error as Error);
      result.errors?.push(`Vehicle data processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Handle driver data - create or update driver record with conflict resolution
   */
  private async handleDriverData(
    data: ExtractedDriverData,
    organizationId: string,
    documentId: string
  ): Promise<{ driverId?: string; warnings?: string[]; errors?: string[] }> {
    const result: { driverId?: string; warnings?: string[]; errors?: string[] } = {
      warnings: [],
      errors: []
    };

    try {
      if (!data.firstName || !data.lastName) {
        result.warnings?.push('Insufficient driver name data - driver not linked');
        return result;
      }

      // Try to find existing driver by CDL number or name
      let driverQuery;
      let driverParams;

      if (data.cdlNumber) {
        driverQuery = 'SELECT id, first_name, last_name, date_of_birth, cdl_number FROM drivers WHERE cdl_number = $1 AND organization_id = $2';
        driverParams = [data.cdlNumber, organizationId];
      } else {
        driverQuery = 'SELECT id, first_name, last_name, date_of_birth, cdl_number FROM drivers WHERE first_name = $1 AND last_name = $2 AND organization_id = $3';
        driverParams = [data.firstName, data.lastName, organizationId];
      }

      const driverRes = await query(driverQuery, driverParams);

      if (driverRes.rows.length > 0) {
        // Driver exists - check for conflicts before updating
        result.driverId = driverRes.rows[0].id;
        const existingDriver = driverRes.rows[0];

        const conflicts = this.detectDriverConflicts(existingDriver, data);
        if (conflicts.length > 0) {
          result.warnings?.push(...conflicts.map(c => `Conflict detected: ${c}`));
          // For high-confidence extractions, update anyway but log conflicts
          if ((data.extractionConfidence || 0) > 0.8) {
            await this.updateDriverFromExtractedData(result.driverId!, data);
            result.warnings?.push('Updated existing driver record despite conflicts (high confidence)');
          } else {
            result.warnings?.push('Driver conflicts detected - manual review required');
          }
        } else {
          await this.updateDriverFromExtractedData(result.driverId!, data);
          result.warnings?.push('Updated existing driver record');
        }
      } else {
        // Check for potential duplicates
        const duplicateChecks = await this.checkDriverDuplicates(data, organizationId);
        if (duplicateChecks.length > 0) {
          result.warnings?.push(...duplicateChecks.map(d => `Potential duplicate: ${d}`));
        }

        // Create new driver
        result.driverId = await this.createDriverFromExtractedData(data, organizationId);
        result.warnings?.push('Created new driver record');
      }

    } catch (error) {
      logger.error('Failed to handle driver data', this.context, error as Error);
      result.errors?.push(`Driver data processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Create new vehicle from extracted data
   */
  private async createVehicleFromExtractedData(data: ExtractedVehicleData, organizationId: string): Promise<string> {
    const insertQuery = `
      INSERT INTO vehicles (
        organization_id, vin, make, model, year, license_plate, truck_number,
        dot_number, registration_number, registration_state, registration_expiry,
        registered_owner, insurance_carrier, policy_number, insurance_expiry,
        coverage_amount, compliance_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `;

    const values = [
      organizationId,
      data.vin,
      data.make,
      data.model,
      data.year,
      data.licensePlate,
      data.truckNumber,
      data.dotNumber,
      data.registrationNumber,
      data.registrationState,
      data.registrationExpirationDate,
      data.registeredOwner,
      data.insuranceCarrier,
      data.policyNumber,
      data.insuranceExpirationDate,
      data.coverageAmount,
      data.needsReview ? 'unknown' : 'compliant'
    ];

    const res = await query(insertQuery, values);
    return res.rows[0].id;
  }

  /**
   * Update existing vehicle from extracted data
   */
  private async updateVehicleFromExtractedData(vehicleId: string, data: ExtractedVehicleData): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query based on available data
    if (data.make) { updates.push(`make = $${paramIndex++}`); values.push(data.make); }
    if (data.model) { updates.push(`model = $${paramIndex++}`); values.push(data.model); }
    if (data.year) { updates.push(`year = $${paramIndex++}`); values.push(data.year); }
    if (data.licensePlate) { updates.push(`license_plate = $${paramIndex++}`); values.push(data.licensePlate); }
    if (data.truckNumber) { updates.push(`truck_number = $${paramIndex++}`); values.push(data.truckNumber); }
    if (data.dotNumber) { updates.push(`dot_number = $${paramIndex++}`); values.push(data.dotNumber); }

    if (data.documentType === 'registration') {
      if (data.registrationNumber) { updates.push(`registration_number = $${paramIndex++}`); values.push(data.registrationNumber); }
      if (data.registrationState) { updates.push(`registration_state = $${paramIndex++}`); values.push(data.registrationState); }
      if (data.registrationExpirationDate) { updates.push(`registration_expiry = $${paramIndex++}`); values.push(data.registrationExpirationDate); }
      if (data.registeredOwner) { updates.push(`registered_owner = $${paramIndex++}`); values.push(data.registeredOwner); }
    }

    if (data.documentType === 'insurance') {
      if (data.insuranceCarrier) { updates.push(`insurance_carrier = $${paramIndex++}`); values.push(data.insuranceCarrier); }
      if (data.policyNumber) { updates.push(`policy_number = $${paramIndex++}`); values.push(data.policyNumber); }
      if (data.insuranceExpirationDate) { updates.push(`insurance_expiry = $${paramIndex++}`); values.push(data.insuranceExpirationDate); }
      if (data.coverageAmount) { updates.push(`coverage_amount = $${paramIndex++}`); values.push(data.coverageAmount); }
    }

    if (updates.length > 0) {
      values.push(vehicleId);
      const updateQuery = `UPDATE vehicles SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
      await query(updateQuery, values);
    }
  }

  /**
   * Create new driver from extracted data
   */
  private async createDriverFromExtractedData(data: ExtractedDriverData, organizationId: string): Promise<string> {
    const insertQuery = `
      INSERT INTO drivers (
        organization_id, first_name, last_name, date_of_birth,
        cdl_number, cdl_state, cdl_class, cdl_issue_date, cdl_expiration_date,
        cdl_endorsements, cdl_restrictions, cdl_status,
        medical_cert_number, medical_cert_issued_date, medical_cert_expiration_date,
        medical_examiner_name, medical_examiner_registry, medical_restrictions, medical_cert_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `;

    const values = [
      organizationId,
      data.firstName,
      data.lastName,
      data.dateOfBirth,
      data.cdlNumber,
      data.cdlState,
      data.cdlClass,
      data.cdlIssueDate,
      data.cdlExpirationDate,
      data.cdlEndorsements,
      data.cdlRestrictions,
      data.needsReview ? 'unknown' : 'valid',
      data.medicalCertNumber,
      data.medicalIssueDate,
      data.medicalExpirationDate,
      data.examinerName,
      data.examinerNationalRegistry,
      data.medicalRestrictions,
      data.needsReview ? 'unknown' : 'valid'
    ];

    const res = await query(insertQuery, values);
    return res.rows[0].id;
  }

  /**
   * Update existing driver from extracted data
   */
  private async updateDriverFromExtractedData(driverId: string, data: ExtractedDriverData): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query based on available data and document type
    if (data.dateOfBirth) { updates.push(`date_of_birth = $${paramIndex++}`); values.push(data.dateOfBirth); }

    if (data.documentType === 'cdl') {
      if (data.cdlNumber) { updates.push(`cdl_number = $${paramIndex++}`); values.push(data.cdlNumber); }
      if (data.cdlState) { updates.push(`cdl_state = $${paramIndex++}`); values.push(data.cdlState); }
      if (data.cdlClass) { updates.push(`cdl_class = $${paramIndex++}`); values.push(data.cdlClass); }
      if (data.cdlIssueDate) { updates.push(`cdl_issue_date = $${paramIndex++}`); values.push(data.cdlIssueDate); }
      if (data.cdlExpirationDate) { updates.push(`cdl_expiration_date = $${paramIndex++}`); values.push(data.cdlExpirationDate); }
      if (data.cdlEndorsements) { updates.push(`cdl_endorsements = $${paramIndex++}`); values.push(data.cdlEndorsements); }
      if (data.cdlRestrictions) { updates.push(`cdl_restrictions = $${paramIndex++}`); values.push(data.cdlRestrictions); }
    }

    if (data.documentType === 'medical_certificate') {
      if (data.medicalCertNumber) { updates.push(`medical_cert_number = $${paramIndex++}`); values.push(data.medicalCertNumber); }
      if (data.medicalIssueDate) { updates.push(`medical_cert_issued_date = $${paramIndex++}`); values.push(data.medicalIssueDate); }
      if (data.medicalExpirationDate) { updates.push(`medical_cert_expiration_date = $${paramIndex++}`); values.push(data.medicalExpirationDate); }
      if (data.examinerName) { updates.push(`medical_examiner_name = $${paramIndex++}`); values.push(data.examinerName); }
      if (data.examinerNationalRegistry) { updates.push(`medical_examiner_registry = $${paramIndex++}`); values.push(data.examinerNationalRegistry); }
      if (data.medicalRestrictions) { updates.push(`medical_restrictions = $${paramIndex++}`); values.push(data.medicalRestrictions); }
    }

    if (updates.length > 0) {
      values.push(driverId);
      const updateQuery = `UPDATE drivers SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
      await query(updateQuery, values);
    }
  }

  /**
   * Update document record with entity associations
   */
  private async updateDocumentAssociations(documentId: string, vehicleId?: string, driverId?: string): Promise<void> {
    const updateQuery = 'UPDATE documents SET vehicle_id = $1, driver_id = $2 WHERE id = $3';
    await query(updateQuery, [vehicleId || null, driverId || null, documentId]);
  }

  /**
   * Detect conflicts between existing vehicle data and extracted data
   */
  private detectVehicleConflicts(existing: any, extracted: ExtractedVehicleData): string[] {
    const conflicts: string[] = [];

    if (existing.make && extracted.make && existing.make.toLowerCase() !== extracted.make.toLowerCase()) {
      conflicts.push(`Make mismatch: existing '${existing.make}' vs extracted '${extracted.make}'`);
    }

    if (existing.model && extracted.model && existing.model.toLowerCase() !== extracted.model.toLowerCase()) {
      conflicts.push(`Model mismatch: existing '${existing.model}' vs extracted '${extracted.model}'`);
    }

    if (existing.year && extracted.year && existing.year !== extracted.year) {
      conflicts.push(`Year mismatch: existing '${existing.year}' vs extracted '${extracted.year}'`);
    }

    if (existing.license_plate && extracted.licensePlate &&
        existing.license_plate.replace(/[^A-Z0-9]/g, '') !== extracted.licensePlate.replace(/[^A-Z0-9]/g, '')) {
      conflicts.push(`License plate mismatch: existing '${existing.license_plate}' vs extracted '${extracted.licensePlate}'`);
    }

    return conflicts;
  }

  /**
   * Check for potential vehicle duplicates by license plate or truck number
   */
  private async checkVehicleDuplicates(data: ExtractedVehicleData, organizationId: string): Promise<string[]> {
    const warnings: string[] = [];

    try {
      if (data.licensePlate) {
        const plateQuery = 'SELECT id, vin FROM vehicles WHERE license_plate = $1 AND organization_id = $2 AND vin != $3';
        const plateRes = await query(plateQuery, [data.licensePlate, organizationId, data.vin]);
        if (plateRes.rows.length > 0) {
          warnings.push(`License plate '${data.licensePlate}' already exists for VIN ${plateRes.rows[0].vin}`);
        }
      }

      if (data.truckNumber) {
        const truckQuery = 'SELECT id, vin FROM vehicles WHERE truck_number = $1 AND organization_id = $2 AND vin != $3';
        const truckRes = await query(truckQuery, [data.truckNumber, organizationId, data.vin]);
        if (truckRes.rows.length > 0) {
          warnings.push(`Truck number '${data.truckNumber}' already exists for VIN ${truckRes.rows[0].vin}`);
        }
      }
    } catch (error) {
      logger.warn('Error checking for vehicle duplicates', this.context, error);
      warnings.push('Could not check for duplicate vehicles');
    }

    return warnings;
  }

  /**
   * Detect conflicts between existing driver data and extracted data
   */
  private detectDriverConflicts(existing: any, extracted: ExtractedDriverData): string[] {
    const conflicts: string[] = [];

    if (existing.first_name && extracted.firstName &&
        existing.first_name.toLowerCase() !== extracted.firstName.toLowerCase()) {
      conflicts.push(`First name mismatch: existing '${existing.first_name}' vs extracted '${extracted.firstName}'`);
    }

    if (existing.last_name && extracted.lastName &&
        existing.last_name.toLowerCase() !== extracted.lastName.toLowerCase()) {
      conflicts.push(`Last name mismatch: existing '${existing.last_name}' vs extracted '${extracted.lastName}'`);
    }

    if (existing.date_of_birth && extracted.dateOfBirth &&
        existing.date_of_birth !== extracted.dateOfBirth) {
      conflicts.push(`Date of birth mismatch: existing '${existing.date_of_birth}' vs extracted '${extracted.dateOfBirth}'`);
    }

    if (existing.cdl_number && extracted.cdlNumber &&
        existing.cdl_number !== extracted.cdlNumber) {
      conflicts.push(`CDL number mismatch: existing '${existing.cdl_number}' vs extracted '${extracted.cdlNumber}'`);
    }

    return conflicts;
  }

  /**
   * Check for potential driver duplicates
   */
  private async checkDriverDuplicates(data: ExtractedDriverData, organizationId: string): Promise<string[]> {
    const warnings: string[] = [];

    try {
      if (data.cdlNumber) {
        const cdlQuery = 'SELECT id, first_name, last_name FROM drivers WHERE cdl_number = $1 AND organization_id = $2';
        const cdlRes = await query(cdlQuery, [data.cdlNumber, organizationId]);
        if (cdlRes.rows.length > 0) {
          warnings.push(`CDL number '${data.cdlNumber}' already exists for ${cdlRes.rows[0].first_name} ${cdlRes.rows[0].last_name}`);
        }
      }
    } catch (error) {
      logger.warn('Error checking for driver duplicates', this.context, error);
      warnings.push('Could not check for duplicate drivers');
    }

    return warnings;
  }

  /**
   * Get document by ID with associated entities
   */
  async getDocumentWithEntities(documentId: string): Promise<any> {
    const selectQuery = `
      SELECT
        d.*,
        v.vin, v.make, v.model, v.truck_number,
        dr.first_name, dr.last_name, dr.cdl_number
      FROM documents d
      LEFT JOIN vehicles v ON d.vehicle_id = v.id
      LEFT JOIN drivers dr ON d.driver_id = dr.id
      WHERE d.id = $1
    `;

    const res = await query(selectQuery, [documentId]);
    return res.rows[0] || null;
  }
}

export const documentStorage = new DocumentStorage();