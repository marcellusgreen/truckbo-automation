"use strict";
// Standardized Field Schema for Fleet Management System
// Single source of truth for all field names and types across all layers
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidStatusField = exports.isValidDateField = exports.FIELD_NAMING_STANDARDS = void 0;
// ===========================================
// FIELD NAMING STANDARDS
// ===========================================
exports.FIELD_NAMING_STANDARDS = {
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
};
// Validation helpers
const isValidDateField = (fieldName) => {
    return fieldName.endsWith('Date') || fieldName.endsWith('At');
};
exports.isValidDateField = isValidDateField;
const isValidStatusField = (fieldName) => {
    return fieldName.endsWith('Status') || fieldName === 'status';
};
exports.isValidStatusField = isValidStatusField;
