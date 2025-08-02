// Fleet Vehicle Defaults
export const DEFAULT_MILEAGE_MIN = 10000;
export const DEFAULT_MILEAGE_MAX = 50000;

// DOT and MC Number Generation
export const DOT_NUMBER_MIN = 100000;
export const DOT_NUMBER_MAX = 999999;
export const MC_NUMBER_MIN = 100000;
export const MC_NUMBER_MAX = 999999;

// VIN Validation
export const VIN_LENGTH = 17;
export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

// License Plate Prefix
export const LICENSE_PLATE_PREFIX = 'TRK';

// Default Compliance Expiry Dates (example values)
export const DEFAULT_COMPLIANCE_EXPIRY = {
  DOT_INSPECTION: '2025-07-22',
  REGISTRATION: '2025-06-22',
  INSURANCE: '2025-05-22',
  IFTA: '2024-12-31',
  STATE_PERMITS: '2025-04-22',
  EMISSIONS: '2025-08-22',
  WEIGHT_CERT: '2025-03-22'
};

// Default Compliance Days Until Expiry
export const DEFAULT_COMPLIANCE_DAYS = {
  DOT_INSPECTION: 365,
  REGISTRATION: 335,
  INSURANCE: 304,
  IFTA: 162,
  STATE_PERMITS: 274,
  EMISSIONS: 396,
  WEIGHT_CERT: 243
};

// File Upload Constants
export const ACCEPTED_FILE_TYPES = {
  CSV: 'text/csv',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// Sample CSV Content
export const SAMPLE_CSV_CONTENT = `VIN
SAMPLE1234567890A
SAMPLE1234567890B
SAMPLE1234567890C`;

// CSV Header Names
export const CSV_HEADERS = {
  VIN: 'vin'
};

// Random ID Generation
export const ID_SUFFIX_LENGTH = 9;