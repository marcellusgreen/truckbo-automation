"use strict";
// Field Standardization and Transformation Utilities
// Provides mapping between legacy field names and standardized schema
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALUE_MAPPINGS = exports.FIELD_MAPPINGS = void 0;
exports.standardizeVehicleData = standardizeVehicleData;
exports.standardizeDriverData = standardizeDriverData;
exports.standardizeDocumentData = standardizeDocumentData;
exports.toLegacyFormat = toLegacyFormat;
exports.validateStandardizedFields = validateStandardizedFields;
exports.batchStandardizeVehicles = batchStandardizeVehicles;
// ===========================================
// FIELD MAPPING DICTIONARIES
// ===========================================
// Maps legacy field names to standardized field names
exports.FIELD_MAPPINGS = {
    // Date field variations
    EXPIRATION_DATES: {
        'expiryDate': 'expirationDate',
        'expiry': 'expirationDate',
        'expires': 'expirationDate',
        'expirationDate': 'expirationDate', // Already standard
        'insuranceExpiry': 'insuranceExpirationDate',
        'registrationExpiry': 'registrationExpirationDate',
        'medicalExpiry': 'medicalExpirationDate',
        'cdlExpiry': 'cdlExpirationDate'
    },
    // Issue/creation date variations
    ISSUE_DATES: {
        'issued': 'issueDate',
        'issuedDate': 'issueDate',
        'issueDate': 'issueDate', // Already standard
        'createdDate': 'createdAt',
        'created': 'createdAt',
        'dateAdded': 'createdAt'
    },
    // Status field variations
    STATUS_FIELDS: {
        'overallStatus': 'overallComplianceStatus',
        'complianceStatus': 'overallComplianceStatus',
        'vehicleStatus': 'status',
        'driverStatus': 'status'
    },
    // Vehicle identifier variations
    VEHICLE_IDS: {
        'vehicleNumber': 'truckNumber',
        'unitNumber': 'truckNumber',
        'truckNum': 'truckNumber',
        'unit': 'truckNumber',
        'vehicleId': 'id',
        'VIN': 'vin',
        'primaryVIN': 'vin', // From consolidated vehicle data
        'vinNumber': 'vin',
        'vehicle_vin': 'vin'
    },
    // Insurance field variations
    INSURANCE_FIELDS: {
        'carrier': 'insuranceCarrier',
        'insCarrier': 'insuranceCarrier',
        'policy': 'policyNumber',
        'policyNum': 'policyNumber',
        'coverage': 'coverageAmount',
        'coverageLimit': 'coverageAmount'
    },
    // Registration field variations
    REGISTRATION_FIELDS: {
        'regNumber': 'registrationNumber',
        'registrationNum': 'registrationNumber',
        'regState': 'registrationState',
        'registeredState': 'registrationState',
        'owner': 'registeredOwner'
    },
    // Driver field variations
    DRIVER_FIELDS: {
        'empId': 'employeeId',
        'employeeNumber': 'employeeId',
        'first': 'firstName',
        'last': 'lastName',
        'dob': 'dateOfBirth',
        'birthDate': 'dateOfBirth'
    }
};
// ===========================================
// VALUE STANDARDIZATION MAPPINGS
// ===========================================
// Standardizes enum values across different systems
exports.VALUE_MAPPINGS = {
    VEHICLE_STATUS: {
        'Active': 'active',
        'ACTIVE': 'active',
        'Inactive': 'inactive',
        'INACTIVE': 'inactive',
        'In Maintenance': 'maintenance',
        'MAINTENANCE': 'maintenance',
        'maintenance': 'maintenance',
        'Retired': 'retired',
        'RETIRED': 'retired'
    },
    COMPLIANCE_STATUS: {
        'Compliant': 'compliant',
        'COMPLIANT': 'compliant',
        'Non-Compliant': 'non_compliant',
        'NON_COMPLIANT': 'non_compliant',
        'non_compliant': 'non_compliant',
        'Expires Soon': 'expires_soon',
        'EXPIRES_SOON': 'expires_soon',
        'expires_soon': 'expires_soon',
        'Expired': 'expired',
        'EXPIRED': 'expired',
        'Review Needed': 'review_needed',
        'REVIEW_NEEDED': 'review_needed',
        'review_needed': 'review_needed',
        'Missing': 'missing',
        'MISSING': 'missing'
    },
    DATA_SOURCE: {
        'manual': 'manual_entry',
        'document': 'document_processing',
        'api': 'api_import',
        'bulk': 'bulk_upload',
        'reconciler': 'reconciliation'
    }
};
// ===========================================
// TRANSFORMATION FUNCTIONS
// ===========================================
/**
 * Transforms legacy vehicle data to standardized format
 */
function standardizeVehicleData(legacyData, source = 'api_import') {
    const standardized = {};
    // Transform each field using mapping dictionaries
    Object.entries(legacyData).forEach(([legacyKey, value]) => {
        const standardKey = getStandardizedFieldName(legacyKey);
        const standardValue = getStandardizedFieldValue(legacyKey, value);
        // Handle nested object structures
        if (standardKey.includes('.')) {
            setNestedProperty(standardized, standardKey, standardValue);
        }
        else {
            standardized[standardKey] = standardValue;
        }
    });
    // Ensure required metadata
    standardized.metadata = {
        dataSource: source,
        lastSyncTimestamp: Date.now(),
        conflictFlags: [],
        needsReview: false,
        ...standardized.metadata
    };
    // Standardize timestamps
    if (standardized.createdAt && typeof standardized.createdAt !== 'string') {
        standardized.createdAt = new Date(standardized.createdAt).toISOString();
    }
    if (standardized.updatedAt && typeof standardized.updatedAt !== 'string') {
        standardized.updatedAt = new Date(standardized.updatedAt).toISOString();
    }
    // Ensure year is always a number
    if (standardized.year && typeof standardized.year === 'string') {
        const yearNum = parseInt(standardized.year);
        standardized.year = isNaN(yearNum) ? new Date().getFullYear() : yearNum;
    }
    return standardized;
}
/**
 * Transforms legacy driver data to standardized format
 */
function standardizeDriverData(legacyData, source = 'api_import') {
    const standardized = {};
    Object.entries(legacyData).forEach(([legacyKey, value]) => {
        const standardKey = getStandardizedFieldName(legacyKey);
        const standardValue = getStandardizedFieldValue(legacyKey, value);
        if (standardKey.includes('.')) {
            setNestedProperty(standardized, standardKey, standardValue);
        }
        else {
            standardized[standardKey] = standardValue;
        }
    });
    // Ensure required metadata
    standardized.metadata = {
        dataSource: source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        needsReview: false,
        ...standardized.metadata
    };
    return standardized;
}
/**
 * Transforms legacy document data to standardized format
 */
function standardizeDocumentData(legacyData, source = 'document_processing') {
    const standardized = {};
    Object.entries(legacyData).forEach(([legacyKey, value]) => {
        const standardKey = getStandardizedFieldName(legacyKey);
        const standardValue = getStandardizedFieldValue(legacyKey, value);
        if (standardKey.includes('.')) {
            setNestedProperty(standardized, standardKey, standardValue);
        }
        else {
            standardized[standardKey] = standardValue;
        }
    });
    // Ensure proper document structure
    standardized.processing = {
        processingStatus: 'completed',
        extractionConfidence: 0.8,
        processingNotes: [],
        needsReview: false,
        ...standardized.processing
    };
    standardized.metadata = {
        uploadedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        ...standardized.metadata
    };
    return standardized;
}
// ===========================================
// HELPER FUNCTIONS
// ===========================================
/**
 * Maps legacy field name to standardized field name
 */
function getStandardizedFieldName(legacyFieldName) {
    // Check all mapping categories
    for (const mappingCategory of Object.values(exports.FIELD_MAPPINGS)) {
        if (legacyFieldName in mappingCategory) {
            return mappingCategory[legacyFieldName];
        }
    }
    // Apply naming convention rules if no direct mapping
    return applyNamingConventions(legacyFieldName);
}
/**
 * Applies standardized naming conventions
 */
function applyNamingConventions(fieldName) {
    // Convert camelCase variations to standard
    let standardName = fieldName;
    // Handle expiration date variations
    if (fieldName.toLowerCase().includes('expir') && !fieldName.endsWith('ExpirationDate')) {
        if (fieldName.toLowerCase().includes('insurance')) {
            return 'insurance.insuranceExpirationDate';
        }
        else if (fieldName.toLowerCase().includes('registration')) {
            return 'registration.registrationExpirationDate';
        }
        else if (fieldName.toLowerCase().includes('medical')) {
            return 'medicalCertificate.expirationDate';
        }
        else if (fieldName.toLowerCase().includes('cdl')) {
            return 'cdl.cdlExpirationDate';
        }
        else {
            standardName = fieldName.replace(/expir[ye]?.*$/i, 'expirationDate');
        }
    }
    // Handle date/created variations
    if (fieldName.toLowerCase().includes('created') || fieldName.toLowerCase().includes('added')) {
        return 'createdAt';
    }
    if (fieldName.toLowerCase().includes('updated') || fieldName.toLowerCase().includes('modified')) {
        return 'updatedAt';
    }
    return standardName;
}
/**
 * Standardizes field values using value mappings
 */
function getStandardizedFieldValue(fieldName, value) {
    if (value === null || value === undefined) {
        return value;
    }
    const lowerFieldName = fieldName.toLowerCase();
    // Standardize status values
    if (lowerFieldName.includes('status') && typeof value === 'string') {
        if (lowerFieldName.includes('vehicle') || fieldName === 'status') {
            return exports.VALUE_MAPPINGS.VEHICLE_STATUS[value] || value.toLowerCase();
        }
        else if (lowerFieldName.includes('compliance')) {
            return exports.VALUE_MAPPINGS.COMPLIANCE_STATUS[value] || value.toLowerCase();
        }
    }
    // Standardize data source values
    if (lowerFieldName.includes('source') && typeof value === 'string') {
        return exports.VALUE_MAPPINGS.DATA_SOURCE[value.toLowerCase()] || value;
    }
    // Standardize date formats to ISO strings
    if (isDateField(fieldName) && value) {
        try {
            return new Date(value).toISOString();
        }
        catch {
            return value; // Return original if date parsing fails
        }
    }
    return value;
}
/**
 * Sets nested property using dot notation
 */
function setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
}
/**
 * Checks if field name represents a date field
 */
function isDateField(fieldName) {
    const lowerName = fieldName.toLowerCase();
    return lowerName.includes('date') ||
        lowerName.includes('time') ||
        lowerName.includes('expir') ||
        lowerName.includes('issue') ||
        lowerName.includes('created') ||
        lowerName.includes('updated');
}
// ===========================================
// REVERSE TRANSFORMATION (for legacy support)
// ===========================================
/**
 * Transforms standardized data back to legacy format for backward compatibility
 */
function toLegacyFormat(standardizedData, targetFormat) {
    const legacy = {};
    const reverseMappings = createReverseMappings();
    Object.entries(standardizedData).forEach(([standardKey, value]) => {
        const legacyKey = reverseMappings[targetFormat]?.[standardKey] || standardKey;
        legacy[legacyKey] = value;
    });
    // Apply format-specific transformations
    if (targetFormat === 'reconciler') {
        // VehicleSummaryView expects year as string
        if (legacy.year && typeof legacy.year === 'number') {
            legacy.year = legacy.year.toString();
        }
        // Map to reconciler-specific fields
        if (legacy.overallComplianceStatus) {
            legacy.overallStatus = legacy.overallComplianceStatus;
            delete legacy.overallComplianceStatus;
        }
    }
    return legacy;
}
/**
 * Creates reverse mappings for legacy format conversion
 */
function createReverseMappings() {
    const reverseMappings = {
        persistent: {},
        reconciler: {},
        processor: {}
    };
    // Create reverse mappings for each category
    Object.entries(exports.FIELD_MAPPINGS).forEach(([category, mappings]) => {
        Object.entries(mappings).forEach(([legacy, standard]) => {
            // Add to all formats by default
            reverseMappings.persistent[standard] = legacy;
            reverseMappings.reconciler[standard] = legacy;
            reverseMappings.processor[standard] = legacy;
        });
    });
    // Format-specific overrides
    reverseMappings.reconciler['overallComplianceStatus'] = 'overallStatus';
    return reverseMappings;
}
// ===========================================
// VALIDATION FUNCTIONS
// ===========================================
/**
 * Validates that data follows standardized field naming conventions
 */
function validateStandardizedFields(data) {
    const errors = [];
    // Check date field naming
    Object.keys(data).forEach(key => {
        if (isDateField(key) && !key.endsWith('Date') && !key.endsWith('At')) {
            errors.push(`Date field '${key}' should end with 'Date' or 'At'`);
        }
        if (key.includes('expir') && !key.includes('expirationDate')) {
            errors.push(`Expiration field '${key}' should use 'expirationDate' format`);
        }
        if (key.includes('status') && key !== 'status' && !key.endsWith('Status')) {
            errors.push(`Status field '${key}' should end with 'Status' or be 'status'`);
        }
    });
    return {
        isValid: errors.length === 0,
        errors
    };
}
/**
 * Batch processes an array of legacy data to standardized format
 */
function batchStandardizeVehicles(legacyVehicles, source = 'api_import') {
    return legacyVehicles
        .map(vehicle => standardizeVehicleData(vehicle, source))
        .filter(vehicle => vehicle.vin) // Ensure VIN exists
        .map(vehicle => ({
        id: vehicle.id || `${vehicle.vin}_${Date.now()}`,
        vin: vehicle.vin,
        make: vehicle.make || 'Unknown',
        model: vehicle.model || 'Unknown',
        year: vehicle.year || new Date().getFullYear(),
        licensePlate: vehicle.licensePlate || 'Unknown',
        truckNumber: vehicle.truckNumber || `Truck-${vehicle.vin.slice(-4)}`,
        status: vehicle.status || 'active',
        createdAt: vehicle.createdAt || new Date().toISOString(),
        updatedAt: vehicle.updatedAt || new Date().toISOString(),
        metadata: vehicle.metadata || {
            dataSource: source,
            lastSyncTimestamp: Date.now(),
            conflictFlags: [],
            needsReview: false
        },
        ...vehicle
    }));
}
