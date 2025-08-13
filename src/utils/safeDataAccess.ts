/**
 * Safe Data Access Utilities
 * Provides null-safe data access and validation functions
 * **LOW PRIORITY FIX: Better null/undefined handling**
 */

// ===== SAFE ACCESSOR FUNCTIONS =====

/**
 * Safely get a string value with fallback
 */
export const safeString = (value: any, fallback: string = '—'): string => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
};

/**
 * Safely get a number value with fallback
 */
export const safeNumber = (value: any, fallback: number = 0): number => {
  if (value === null || value === undefined || isNaN(value)) {
    return fallback;
  }
  const parsed = Number(value);
  return isNaN(parsed) ? fallback : parsed;
};

/**
 * Safely get a boolean value with fallback
 */
export const safeBoolean = (value: any, fallback: boolean = false): boolean => {
  if (value === null || value === undefined) {
    return fallback;
  }
  return Boolean(value);
};

/**
 * Safely get an array with fallback
 */
export const safeArray = <T>(value: any, fallback: T[] = []): T[] => {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value;
};

/**
 * Safely get an object property with fallback
 */
export const safeProperty = <T>(obj: any, property: string, fallback: T): T => {
  if (!obj || typeof obj !== 'object') {
    return fallback;
  }
  const value = obj[property];
  return value !== null && value !== undefined ? value : fallback;
};

// ===== VALIDATION FUNCTIONS =====

/**
 * Check if a VIN is valid (basic validation)
 */
export const isValidVIN = (vin: any): boolean => {
  if (typeof vin !== 'string') return false;
  const cleanVin = vin.replace(/[^A-Z0-9]/g, '');
  return cleanVin.length >= 15 && cleanVin.length <= 17;
};

/**
 * Check if a value is a valid date string
 */
export const isValidDateString = (dateStr: any): boolean => {
  if (typeof dateStr !== 'string') return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

/**
 * Check if an email is valid (basic validation)
 */
export const isValidEmail = (email: any): boolean => {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// ===== DATA SANITIZATION =====

/**
 * Sanitize VIN by removing invalid characters and converting to uppercase
 */
export const sanitizeVIN = (vin: any): string => {
  if (typeof vin !== 'string') return '';
  return vin.toUpperCase().replace(/[^A-Z0-9]/g, '');
};

/**
 * Sanitize license plate by removing extra spaces and special characters
 */
export const sanitizeLicensePlate = (plate: any): string => {
  if (typeof plate !== 'string') return '';
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
};

/**
 * Sanitize phone number to keep only digits
 */
export const sanitizePhoneNumber = (phone: any): string => {
  if (typeof phone !== 'string') return '';
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits : '';
};

// ===== SAFE VEHICLE DATA HANDLING =====

/**
 * Safely extract vehicle data from any source
 */
export const safeVehicleData = (data: any) => {
  return {
    vin: isValidVIN(data?.vin) ? sanitizeVIN(data.vin) : `UNKNOWN_${Date.now()}`,
    make: safeString(data?.make, 'Unknown'),
    model: safeString(data?.model, 'Unknown'), 
    year: safeNumber(data?.year, new Date().getFullYear()),
    licensePlate: safeString(data?.licensePlate, 'Unknown'),
    truckNumber: safeString(data?.truckNumber, ''),
    state: safeString(data?.state),
    
    // Registration data
    registrationNumber: safeString(data?.registrationNumber),
    registrationState: safeString(data?.registrationState),
    registrationExpiry: isValidDateString(data?.registrationExpiry) ? data.registrationExpiry : undefined,
    registeredOwner: safeString(data?.registeredOwner),
    
    // Insurance data
    insuranceCarrier: safeString(data?.insuranceCarrier),
    policyNumber: safeString(data?.policyNumber),
    insuranceExpiry: isValidDateString(data?.insuranceExpiry) ? data.insuranceExpiry : undefined,
    coverageAmount: safeNumber(data?.coverageAmount),
    
    // DOT data
    dotNumber: safeString(data?.dotNumber),
    
    // Meta data
    status: (['active', 'inactive', 'maintenance'].includes(data?.status)) ? data.status : 'active',
    dateAdded: isValidDateString(data?.dateAdded) ? data.dateAdded : new Date().toISOString(),
    lastUpdated: isValidDateString(data?.lastUpdated) ? data.lastUpdated : new Date().toISOString()
  };
};

/**
 * Safely extract reconciled vehicle summary data
 */
export const safeReconciledVehicleData = (data: any) => {
  return {
    vin: isValidVIN(data?.vin) ? sanitizeVIN(data.vin) : 'UNKNOWN',
    make: safeString(data?.make),
    model: safeString(data?.model),
    year: safeString(data?.year),
    licensePlate: safeString(data?.licensePlate),
    state: safeString(data?.state),
    
    // Compliance data
    overallStatus: safeString(data?.overallStatus, 'incomplete'),
    complianceScore: safeNumber(data?.complianceScore, 0),
    riskLevel: safeString(data?.riskLevel, 'medium'),
    
    // Document data
    totalDocuments: safeNumber(data?.totalDocuments, 0),
    documentTypes: safeArray(data?.documentTypes),
    lastUpdated: isValidDateString(data?.lastUpdated) ? data.lastUpdated : new Date().toISOString(),
    
    // Expiration data  
    nextExpiringDocument: data?.nextExpiringDocument ? {
      documentType: safeString(data.nextExpiringDocument.documentType),
      expirationDate: safeString(data.nextExpiringDocument.expirationDate),
      daysUntilExpiry: safeNumber(data.nextExpiringDocument.daysUntilExpiry, 999),
      urgency: safeString(data.nextExpiringDocument.urgency, 'normal')
    } : undefined,
    
    // Alert data
    activeConflicts: safeNumber(data?.activeConflicts, 0),
    hasExpiredDocuments: safeBoolean(data?.hasExpiredDocuments),
    hasExpiringSoonDocuments: safeBoolean(data?.hasExpiringSoonDocuments),
    
    // Engine info
    engineDescription: safeString(data?.engineDescription)
  };
};

// ===== ERROR HANDLING UTILITIES =====

/**
 * Safely execute a function and return fallback on error
 */
export const safeExecute = <T>(fn: () => T, fallback: T, errorMessage?: string): T => {
  try {
    return fn();
  } catch (error) {
    if (errorMessage) {
      console.warn(errorMessage, error);
    }
    return fallback;
  }
};

/**
 * Safely parse JSON with fallback
 */
export const safeJsonParse = <T>(jsonString: any, fallback: T): T => {
  return safeExecute(
    () => {
      if (typeof jsonString !== 'string') return fallback;
      return JSON.parse(jsonString);
    },
    fallback,
    'Failed to parse JSON:'
  );
};

/**
 * Safely access nested object properties
 */
export const safeNestedProperty = (obj: any, path: string[], fallback: any = null): any => {
  return safeExecute(() => {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return fallback;
      }
      current = current[key];
    }
    return current !== undefined ? current : fallback;
  }, fallback);
};

// ===== DEFAULT EXPORT =====
export default {
  safeString,
  safeNumber,
  safeBoolean,
  safeArray,
  safeProperty,
  isValidVIN,
  isValidDateString,
  isValidEmail,
  sanitizeVIN,
  sanitizeLicensePlate,
  sanitizePhoneNumber,
  safeVehicleData,
  safeReconciledVehicleData,
  safeExecute,
  safeJsonParse,
  safeNestedProperty
};