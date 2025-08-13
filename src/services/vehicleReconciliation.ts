/**
 * Vehicle Data Reconciliation Service
 * Consolidates multiple documents per vehicle using VIN as primary key
 */

export interface ExtractedDocument {
  fileName: string;
  documentType: string;
  extractedData: any;
  vin_numbers: Array<{ value: string; confidence: number }>;
  processingTime: number;
  qualityMetrics?: any;
  timestamp: string;
}

export interface ConsolidatedVehicle {
  primaryVIN: string;
  alternativeVINs: string[];
  documents: ExtractedDocument[];
  consolidatedData: {
    registration?: {
      licensePlate?: string;
      make?: string;
      model?: string;
      year?: string;
      state?: string;
      expirationDate?: string;
      lastUpdated: string;
      sourceDocument: string;
    };
    insurance?: {
      policyNumber?: string;
      insuranceCompany?: string;
      effectiveDate?: string; 
      expirationDate?: string;
      coverageAmount?: string;
      lastUpdated: string;
      sourceDocument: string;
    };
    inspection?: {
      inspectionDate?: string;
      expirationDate?: string;
      result?: string;
      lastUpdated: string;
      sourceDocument: string;
    };
    driver?: {
      driverName?: string;
      licenseNumber?: string;
      licenseClass?: string;
      expirationDate?: string;
      lastUpdated: string;
      sourceDocument: string;
    };
  };
  complianceStatus: {
    registrationStatus: 'current' | 'expired' | 'missing' | 'unknown';
    insuranceStatus: 'current' | 'expired' | 'missing' | 'unknown';
    inspectionStatus: 'current' | 'expired' | 'missing' | 'unknown';
    driverStatus: 'current' | 'expired' | 'missing' | 'unknown';
    overallStatus: 'compliant' | 'non-compliant' | 'review-needed';
    lastChecked: string;
  };
  documentCount: number;
  lastUpdated: string;
}

export class VehicleReconciliationService {
  
  /**
   * Consolidate multiple documents into vehicle records
   */
  reconcileDocuments(documents: ExtractedDocument[]): ConsolidatedVehicle[] {
    console.log(`🔄 Starting reconciliation of ${documents.length} documents`);
    
    // Group documents by VIN
    const vehicleGroups = this.groupDocumentsByVIN(documents);
    
    // Consolidate each vehicle group
    const consolidatedVehicles: ConsolidatedVehicle[] = [];
    
    vehicleGroups.forEach((docs, vin) => {
      console.log(`🚛 Consolidating ${docs.length} documents for VIN: ${vin}`);
      const consolidated = this.consolidateVehicleDocuments(vin, docs);
      consolidatedVehicles.push(consolidated);
    });
    
    console.log(`✅ Reconciliation complete: ${documents.length} documents → ${consolidatedVehicles.length} vehicles`);
    
    return consolidatedVehicles;
  }
  
  /**
   * Group documents by VIN with smart matching
   */
  private groupDocumentsByVIN(documents: ExtractedDocument[]): Map<string, ExtractedDocument[]> {
    const vinGroups = new Map<string, ExtractedDocument[]>();
    const vinAliases = new Map<string, string>(); // Maps variant VINs to canonical VIN
    
    documents.forEach(doc => {
      const vinNumbers = this.extractVINsFromDocument(doc);
      
      if (vinNumbers.length === 0) {
        // No VIN found - group by filename pattern or other identifiers
        const estimatedVIN = this.estimateVINFromFilename(doc.fileName);
        if (estimatedVIN) {
          this.addDocumentToGroup(vinGroups, estimatedVIN, doc);
        } else {
          // Create unique group for documents without VIN
          const uniqueKey = `NO_VIN_${doc.fileName}`;
          this.addDocumentToGroup(vinGroups, uniqueKey, doc);
        }
        return;
      }
      
      // Find the best VIN for this document
      const primaryVIN = this.selectPrimaryVIN(vinNumbers, vinAliases);
      this.addDocumentToGroup(vinGroups, primaryVIN, doc);
      
      // Track VIN aliases for fuzzy matching
      vinNumbers.forEach(vin => {
        if (vin !== primaryVIN) {
          vinAliases.set(vin, primaryVIN);
        }
      });
    });
    
    return vinGroups;
  }
  
  /**
   * Extract and normalize VINs from document
   */
  private extractVINsFromDocument(doc: ExtractedDocument): string[] {
    const vins: string[] = [];
    
    // From VIN numbers array
    if (doc.vin_numbers && doc.vin_numbers.length > 0) {
      doc.vin_numbers.forEach(vinData => {
        if (vinData.value && vinData.value.length >= 15) {
          vins.push(this.normalizeVIN(vinData.value));
        }
      });
    }
    
    // From extracted data
    if (doc.extractedData && doc.extractedData.vin) {
      const vinValue = typeof doc.extractedData.vin === 'object' 
        ? doc.extractedData.vin.value 
        : doc.extractedData.vin;
      
      if (vinValue && vinValue.length >= 15) {
        vins.push(this.normalizeVIN(vinValue));
      }
    }
    
    // Remove duplicates and invalid VINs
    return [...new Set(vins)].filter(vin => this.isValidVINLength(vin));
  }
  
  /**
   * Normalize VIN format
   */
  private normalizeVIN(vin: string): string {
    return vin.toString()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 17); // Ensure exactly 17 characters
  }
  
  /**
   * Check if VIN length is reasonable
   */
  private isValidVINLength(vin: string): boolean {
    return vin.length >= 15 && vin.length <= 17;
  }
  
  /**
   * Select primary VIN from multiple candidates
   */
  private selectPrimaryVIN(vins: string[], vinAliases: Map<string, string>): string {
    // Prefer 17-character VINs
    const fullVINs = vins.filter(vin => vin.length === 17);
    if (fullVINs.length > 0) {
      return fullVINs[0];
    }
    
    // Check if any VIN is already known as an alias
    for (const vin of vins) {
      if (vinAliases.has(vin)) {
        return vinAliases.get(vin)!;
      }
    }
    
    // Return the first available VIN
    return vins[0];
  }
  
  /**
   * Estimate VIN from filename patterns
   */
  private estimateVINFromFilename(fileName: string): string | null {
    // Look for VIN-like patterns in filename
    const vinPattern = /[A-HJ-NPR-Z0-9]{15,17}/g;
    const matches = fileName.toUpperCase().match(vinPattern);
    
    if (matches && matches.length > 0) {
      return this.normalizeVIN(matches[0]);
    }
    
    return null;
  }
  
  /**
   * Add document to VIN group
   */
  private addDocumentToGroup(vinGroups: Map<string, ExtractedDocument[]>, vin: string, doc: ExtractedDocument) {
    if (!vinGroups.has(vin)) {
      vinGroups.set(vin, []);
    }
    vinGroups.get(vin)!.push(doc);
  }
  
  /**
   * Consolidate documents for a single vehicle
   */
  private consolidateVehicleDocuments(primaryVIN: string, documents: ExtractedDocument[]): ConsolidatedVehicle {
    const now = new Date().toISOString();
    
    // Collect all VINs associated with this vehicle
    const allVINs = new Set<string>();
    documents.forEach(doc => {
      this.extractVINsFromDocument(doc).forEach(vin => allVINs.add(vin));
    });
    
    const consolidatedData = {
      registration: this.consolidateRegistrationData(documents),
      insurance: this.consolidateInsuranceData(documents),
      inspection: this.consolidateInspectionData(documents),
      driver: this.consolidateDriverData(documents)
    };
    
    const complianceStatus = this.calculateComplianceStatus(consolidatedData);
    
    return {
      primaryVIN: primaryVIN,
      alternativeVINs: Array.from(allVINs).filter(vin => vin !== primaryVIN),
      documents: documents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      consolidatedData,
      complianceStatus,
      documentCount: documents.length,
      lastUpdated: now
    };
  }
  
  /**
   * Consolidate registration data from multiple documents
   */
  private consolidateRegistrationData(documents: ExtractedDocument[]) {
    const registrationDocs = documents.filter(doc => 
      doc.documentType === 'registration' || 
      doc.fileName.toLowerCase().includes('registration') ||
      doc.fileName.toLowerCase().includes('title')
    );
    
    if (registrationDocs.length === 0) return undefined;
    
    // Use the most recent document
    const latestDoc = registrationDocs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
    
    const data = latestDoc.extractedData;
    
    return {
      licensePlate: this.extractValue(data, ['licensePlate', 'plate', 'plateNumber']),
      make: this.extractValue(data, ['make', 'manufacturer']),
      model: this.extractValue(data, ['model']),
      year: this.extractValue(data, ['year', 'modelYear']),
      state: this.extractValue(data, ['state', 'issuingState']),
      expirationDate: this.extractValue(data, ['expirationDate', 'registrationExpiry', 'expiry']),
      lastUpdated: latestDoc.timestamp,
      sourceDocument: latestDoc.fileName
    };
  }
  
  /**
   * Consolidate insurance data from multiple documents
   */
  private consolidateInsuranceData(documents: ExtractedDocument[]) {
    const insuranceDocs = documents.filter(doc => 
      doc.documentType === 'insurance' || 
      doc.fileName.toLowerCase().includes('insurance') ||
      doc.fileName.toLowerCase().includes('policy')
    );
    
    if (insuranceDocs.length === 0) return undefined;
    
    // Use the document with the latest expiration date
    const latestDoc = this.selectLatestExpiringDocument(insuranceDocs);
    const data = latestDoc.extractedData;
    
    return {
      policyNumber: this.extractValue(data, ['policyNumber', 'policy']),
      insuranceCompany: this.extractValue(data, ['insuranceCompany', 'carrier', 'insurer']),
      effectiveDate: this.extractValue(data, ['effectiveDate', 'startDate']),
      expirationDate: this.extractValue(data, ['expirationDate', 'endDate', 'expiry']),
      coverageAmount: this.extractValue(data, ['coverageAmount', 'liability', 'coverage']),
      lastUpdated: latestDoc.timestamp,
      sourceDocument: latestDoc.fileName
    };
  }
  
  /**
   * Consolidate inspection data from multiple documents
   */
  private consolidateInspectionData(documents: ExtractedDocument[]) {
    const inspectionDocs = documents.filter(doc => 
      doc.documentType === 'inspection' || 
      doc.fileName.toLowerCase().includes('inspection') ||
      doc.fileName.toLowerCase().includes('safety')
    );
    
    if (inspectionDocs.length === 0) return undefined;
    
    const latestDoc = this.selectLatestExpiringDocument(inspectionDocs);
    const data = latestDoc.extractedData;
    
    return {
      inspectionDate: this.extractValue(data, ['inspectionDate', 'date']),
      expirationDate: this.extractValue(data, ['expirationDate', 'expiry']),
      result: this.extractValue(data, ['result', 'status']),
      lastUpdated: latestDoc.timestamp,
      sourceDocument: latestDoc.fileName
    };
  }
  
  /**
   * Consolidate driver data from multiple documents
   */
  private consolidateDriverData(documents: ExtractedDocument[]) {
    const driverDocs = documents.filter(doc => 
      doc.documentType === 'cdl_license' || 
      doc.documentType === 'medical_certificate' ||
      doc.fileName.toLowerCase().includes('license') ||
      doc.fileName.toLowerCase().includes('cdl')
    );
    
    if (driverDocs.length === 0) return undefined;
    
    const latestDoc = this.selectLatestExpiringDocument(driverDocs);
    const data = latestDoc.extractedData;
    
    return {
      driverName: this.extractValue(data, ['driverName', 'name']),
      licenseNumber: this.extractValue(data, ['licenseNumber', 'license']),
      licenseClass: this.extractValue(data, ['licenseClass', 'class']),
      expirationDate: this.extractValue(data, ['expirationDate', 'expiry']),
      lastUpdated: latestDoc.timestamp,
      sourceDocument: latestDoc.fileName
    };
  }
  
  /**
   * Extract value from nested object using multiple possible keys
   */
  private extractValue(data: any, keys: string[]): string | undefined {
    if (!data) return undefined;
    
    for (const key of keys) {
      if (data[key]) {
        return typeof data[key] === 'object' ? data[key].value : data[key];
      }
    }
    
    return undefined;
  }
  
  /**
   * Select document with latest expiration date
   */
  private selectLatestExpiringDocument(documents: ExtractedDocument[]): ExtractedDocument {
    return documents.sort((a, b) => {
      const aExpiry = this.extractExpirationDate(a);
      const bExpiry = this.extractExpirationDate(b);
      
      if (!aExpiry && !bExpiry) {
        // Sort by timestamp if no expiration dates
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      
      if (!aExpiry) return 1;
      if (!bExpiry) return -1;
      
      return new Date(bExpiry).getTime() - new Date(aExpiry).getTime();
    })[0];
  }
  
  /**
   * Extract expiration date from document
   */
  private extractExpirationDate(doc: ExtractedDocument): string | null {
    const data = doc.extractedData;
    if (!data) return null;
    
    const expiryKeys = ['expirationDate', 'expiry', 'endDate'];
    for (const key of expiryKeys) {
      if (data[key]) {
        return typeof data[key] === 'object' ? data[key].value : data[key];
      }
    }
    
    return null;
  }
  
  /**
   * Calculate compliance status for vehicle
   */
  private calculateComplianceStatus(consolidatedData: any) {
    const now = new Date();
    
    const registrationStatus = this.getComplianceStatus(
      consolidatedData.registration?.expirationDate
    );
    
    const insuranceStatus = this.getComplianceStatus(
      consolidatedData.insurance?.expirationDate
    );
    
    const inspectionStatus = this.getComplianceStatus(
      consolidatedData.inspection?.expirationDate
    );
    
    const driverStatus = this.getComplianceStatus(
      consolidatedData.driver?.expirationDate
    );
    
    // Determine overall status
    let overallStatus: 'compliant' | 'non-compliant' | 'review-needed' = 'compliant';
    
    if ([registrationStatus, insuranceStatus, inspectionStatus, driverStatus].includes('expired')) {
      overallStatus = 'non-compliant';
    } else if ([registrationStatus, insuranceStatus, inspectionStatus, driverStatus].includes('unknown')) {
      overallStatus = 'review-needed';
    }
    
    return {
      registrationStatus,
      insuranceStatus,
      inspectionStatus,
      driverStatus,
      overallStatus,
      lastChecked: now.toISOString()
    };
  }
  
  /**
   * Get compliance status for a specific expiration date
   */
  private getComplianceStatus(expirationDate?: string): 'current' | 'expired' | 'missing' | 'unknown' {
    if (!expirationDate) return 'missing';
    
    try {
      const expiry = new Date(expirationDate);
      const now = new Date();
      
      if (isNaN(expiry.getTime())) return 'unknown';
      
      return expiry > now ? 'current' : 'expired';
    } catch {
      return 'unknown';
    }
  }
}

// Export singleton instance
export const vehicleReconciliation = new VehicleReconciliationService();