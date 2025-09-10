// Comprehensive Data Validation Service
// Validates all input data before storage and processing

export interface ValidationRule {
  field: string;
  message: string;
  validator: (value: unknown) => boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  value: unknown;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
  value: unknown;
  suggestion?: string;
}

// Specific data interfaces for validation
export interface MedicalCertificateData extends Record<string, unknown> {
  certificateNumber?: string;
  issuedDate?: string;
  expirationDate?: string;
  examinerName?: string;
  examinerNationalRegistry?: string;
  medicalExaminerName?: string;
  medicalExaminerNumber?: string;
  restrictions?: string[];
  status?: string;
}

export interface CDLData extends Record<string, unknown> {
  cdlNumber?: string;
  licenseNumber?: string;
  cdlState?: string;
  state?: string;
  cdlIssueDate?: string;
  cdlExpirationDate?: string;
  expirationDate?: string;
  cdlClass?: string;
  classType?: string;
  cdlEndorsements?: string[];
  endorsements?: string[];
  restrictions?: string[];
  status?: string;
}

export interface DriverInfoData {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  phone?: string;
  phoneNumber?: string;
  email?: string;
  hireDate?: string;
  employeeId?: string;
}

export interface VehicleRegistrationData extends Record<string, unknown> {
  vinNumber?: string;
  licensePlate?: string;
  registrationNumber?: string;
  registrationState?: string;
  expirationDate?: string;
  state?: string;
  vehicleType?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
}

export interface InsuranceData extends Record<string, unknown> {
  policyNumber?: string;
  insuranceCompany?: string;
  effectiveDate?: string;
  expirationDate?: string;
  coverageType?: string;
  coverageAmount?: number;
  deductible?: number;
  status?: string;
}

class DataValidationService {
  
  /**
   * Validate VIN (Vehicle Identification Number)
   */
  validateVIN(vin: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!vin) {
      errors.push({
        field: 'vin',
        message: 'VIN is required',
        value: vin,
        severity: 'error'
      });
      return { isValid: false, errors, warnings };
    }

    // Remove spaces and convert to uppercase
    const cleanVIN = vin.replace(/\s/g, '').toUpperCase();

    // Check length (must be exactly 17 characters)
    if (cleanVIN.length !== 17) {
      errors.push({
        field: 'vin',
        message: `VIN must be exactly 17 characters, got ${cleanVIN.length}`,
        value: vin,
        severity: 'error'
      });
    }

    // Check for invalid characters (no I, O, Q allowed)
    const invalidChars = cleanVIN.match(/[IOQ]/g);
    if (invalidChars) {
      errors.push({
        field: 'vin',
        message: `VIN contains invalid characters: ${invalidChars.join(', ')}. VINs cannot contain I, O, or Q`,
        value: vin,
        severity: 'error'
      });
    }

    // Check format (alphanumeric only)
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVIN)) {
      errors.push({
        field: 'vin',
        message: 'VIN contains invalid characters. Only letters and numbers allowed (no I, O, Q)',
        value: vin,
        severity: 'error'
      });
    }

    // VIN check digit validation (position 9)
    if (cleanVIN.length === 17) {
      const isValid = this.validateVINCheckDigit(cleanVIN);
      if (!isValid) {
        warnings.push({
          field: 'vin',
          message: 'VIN check digit validation failed. Please verify VIN is correct',
          value: vin,
          suggestion: 'Double-check the VIN against the vehicle title or registration'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate driver medical certificate data
   */
  validateMedicalCertificate(data: MedicalCertificateData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Certificate number validation
    if (!data.certificateNumber) {
      errors.push({
        field: 'certificateNumber',
        message: 'Medical certificate number is required',
        value: data.certificateNumber,
        severity: 'error'
      });
    } else if (!/^[A-Z0-9]{8,20}$/i.test(data.certificateNumber)) {
      warnings.push({
        field: 'certificateNumber',
        message: 'Medical certificate number format may be incorrect',
        value: data.certificateNumber,
        suggestion: 'Certificate numbers are typically 8-20 alphanumeric characters'
      });
    }

    // Date validations
    const dateValidation = this.validateDateFields(data, [
      { field: 'issuedDate', required: true, label: 'Issue Date' },
      { field: 'expirationDate', required: true, label: 'Expiration Date' }
    ]);
    errors.push(...dateValidation.errors);
    warnings.push(...dateValidation.warnings);

    // Expiration date should be after issue date
    if (data.issuedDate && data.expirationDate) {
      const issueDate = new Date(data.issuedDate);
      const expirationDate = new Date(data.expirationDate);
      
      if (expirationDate <= issueDate) {
        errors.push({
          field: 'expirationDate',
          message: 'Expiration date must be after issue date',
          value: data.expirationDate,
          severity: 'error'
        });
      }

      // Medical certificates typically valid for 2 years
      const daysDiff = Math.floor((expirationDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 730) { // More than 2 years
        warnings.push({
          field: 'expirationDate',
          message: 'Medical certificate validity period seems unusually long',
          value: data.expirationDate,
          suggestion: 'Standard medical certificates are valid for up to 2 years'
        });
      }
    }

    // Examiner validation
    if (!data.examinerName) {
      errors.push({
        field: 'examinerName',
        message: 'Medical examiner name is required',
        value: data.examinerName,
        severity: 'error'
      });
    } else if (!/^(Dr\.?\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+/i.test(data.examinerName)) {
      warnings.push({
        field: 'examinerName',
        message: 'Examiner name format may be incorrect',
        value: data.examinerName,
        suggestion: 'Format should be "Dr. First Last" or "First Last"'
      });
    }

    // National Registry validation
    if (data.examinerNationalRegistry && !/^[A-Z0-9]{6,12}$/i.test(data.examinerNationalRegistry)) {
      warnings.push({
        field: 'examinerNationalRegistry',
        message: 'National Registry number format may be incorrect',
        value: data.examinerNationalRegistry,
        suggestion: 'Registry numbers are typically 6-12 alphanumeric characters'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate CDL information
   */
  validateCDL(data: CDLData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // CDL number validation
    if (!data.cdlNumber) {
      errors.push({
        field: 'cdlNumber',
        message: 'CDL number is required',
        value: data.cdlNumber,
        severity: 'error'
      });
    } else if (!/^[A-Z0-9\-]{8,20}$/i.test(data.cdlNumber)) {
      warnings.push({
        field: 'cdlNumber',
        message: 'CDL number format may be incorrect',
        value: data.cdlNumber,
        suggestion: 'CDL numbers vary by state but are typically 8-20 characters'
      });
    }

    // CDL class validation
    if (!data.cdlClass) {
      errors.push({
        field: 'cdlClass',
        message: 'CDL class is required',
        value: data.cdlClass,
        severity: 'error'
      });
    } else if (!['A', 'B', 'C'].includes(data.cdlClass.toUpperCase())) {
      errors.push({
        field: 'cdlClass',
        message: 'CDL class must be A, B, or C',
        value: data.cdlClass,
        severity: 'error'
      });
    }

    // State validation
    if (!data.cdlState) {
      errors.push({
        field: 'cdlState',
        message: 'CDL issuing state is required',
        value: data.cdlState,
        severity: 'error'
      });
    } else if (!this.isValidUSState(data.cdlState)) {
      errors.push({
        field: 'cdlState',
        message: 'Invalid US state code',
        value: data.cdlState,
        severity: 'error'
      });
    }

    // Date validations
    const dateValidation = this.validateDateFields(data, [
      { field: 'cdlIssueDate', required: false, label: 'Issue Date' },
      { field: 'cdlExpirationDate', required: true, label: 'Expiration Date' }
    ]);
    errors.push(...dateValidation.errors);
    warnings.push(...dateValidation.warnings);

    // Endorsements validation
    if (data.cdlEndorsements && Array.isArray(data.cdlEndorsements)) {
      const validEndorsements = ['H', 'N', 'P', 'S', 'T', 'X'];
      const invalidEndorsements = data.cdlEndorsements.filter((e: string) => 
        !validEndorsements.includes(e.toUpperCase())
      );
      
      if (invalidEndorsements.length > 0) {
        warnings.push({
          field: 'cdlEndorsements',
          message: `Unknown endorsements: ${invalidEndorsements.join(', ')}`,
          value: data.cdlEndorsements,
          suggestion: 'Valid endorsements are: H, N, P, S, T, X'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate driver personal information
   */
  validateDriverInfo(data: DriverInfoData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Name validation
    if (!data.firstName) {
      errors.push({
        field: 'firstName',
        message: 'First name is required',
        value: data.firstName,
        severity: 'error'
      });
    } else if (!/^[A-Za-z\s\-']{1,50}$/.test(data.firstName)) {
      errors.push({
        field: 'firstName',
        message: 'First name contains invalid characters',
        value: data.firstName,
        severity: 'error'
      });
    }

    if (!data.lastName) {
      errors.push({
        field: 'lastName',
        message: 'Last name is required',
        value: data.lastName,
        severity: 'error'
      });
    } else if (!/^[A-Za-z\s\-']{1,50}$/.test(data.lastName)) {
      errors.push({
        field: 'lastName',
        message: 'Last name contains invalid characters',
        value: data.lastName,
        severity: 'error'
      });
    }

    // Employee ID validation
    if (!data.employeeId) {
      errors.push({
        field: 'employeeId',
        message: 'Employee ID is required',
        value: data.employeeId,
        severity: 'error'
      });
    } else if (!/^[A-Z0-9]{3,20}$/i.test(data.employeeId)) {
      warnings.push({
        field: 'employeeId',
        message: 'Employee ID format may be non-standard',
        value: data.employeeId,
        suggestion: 'Employee IDs are typically 3-20 alphanumeric characters'
      });
    }

    // Date of birth validation
    if (data.dateOfBirth) {
      const dobValidation = this.validateDateOfBirth(data.dateOfBirth);
      errors.push(...dobValidation.errors);
      warnings.push(...dobValidation.warnings);
    }

    // Email validation
    if (data.email) {
      const emailValidation = this.validateEmail(data.email);
      errors.push(...emailValidation.errors);
      warnings.push(...emailValidation.warnings);
    }

    // Phone validation
    if (data.phone) {
      const phoneValidation = this.validatePhone(data.phone);
      warnings.push(...phoneValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate vehicle registration data
   */
  validateVehicleRegistration(data: VehicleRegistrationData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // License plate validation
    if (!data.licensePlate) {
      errors.push({
        field: 'licensePlate',
        message: 'License plate is required',
        value: data.licensePlate,
        severity: 'error'
      });
    } else if (!/^[A-Z0-9\-\s]{2,8}$/i.test(data.licensePlate)) {
      warnings.push({
        field: 'licensePlate',
        message: 'License plate format may be incorrect',
        value: data.licensePlate,
        suggestion: 'License plates are typically 2-8 alphanumeric characters'
      });
    }

    // Registration dates
    const dateValidation = this.validateDateFields(data, [
      { field: 'registrationExpiry', required: true, label: 'Registration Expiry' }
    ]);
    errors.push(...dateValidation.errors);
    warnings.push(...dateValidation.warnings);

    // State validation
    if (data.registrationState && !this.isValidUSState(data.registrationState)) {
      errors.push({
        field: 'registrationState',
        message: 'Invalid US state code',
        value: data.registrationState,
        severity: 'error'
      });
    }

    // Year validation
    if (data.year) {
      const currentYear = new Date().getFullYear();
      if (data.year < 1990 || data.year > currentYear + 1) {
        warnings.push({
          field: 'year',
          message: `Vehicle year ${data.year} seems unusual`,
          value: data.year,
          suggestion: `Expected range: 1990-${currentYear + 1}`
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate insurance data
   */
  validateInsuranceData(data: InsuranceData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Policy number validation
    if (!data.policyNumber) {
      errors.push({
        field: 'policyNumber',
        message: 'Insurance policy number is required',
        value: data.policyNumber,
        severity: 'error'
      });
    }

    // Insurance expiry date
    const dateValidation = this.validateDateFields(data, [
      { field: 'insuranceExpiry', required: true, label: 'Insurance Expiry' }
    ]);
    errors.push(...dateValidation.errors);
    warnings.push(...dateValidation.warnings);

    // Coverage amount validation
    if (data.coverageAmount) {
      if (typeof data.coverageAmount !== 'number' || data.coverageAmount < 0) {
        errors.push({
          field: 'coverageAmount',
          message: 'Coverage amount must be a positive number',
          value: data.coverageAmount,
          severity: 'error'
        });
      } else if (data.coverageAmount < 750000) { // DOT minimum for commercial vehicles
        warnings.push({
          field: 'coverageAmount',
          message: 'Coverage amount may be below DOT requirements',
          value: data.coverageAmount,
          suggestion: 'Commercial vehicles typically require $750,000+ liability coverage'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate date fields with common patterns
   */
  private validateDateFields(data: Record<string, unknown>, fields: Array<{field: string, required: boolean, label: string}>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    fields.forEach(({field, required, label}) => {
      const value = data[field];
      
      if (!value && required) {
        errors.push({
          field,
          message: `${label} is required`,
          value,
          severity: 'error'
        });
        return;
      }

      if (value) {
        const dateValidation = this.validateDate(String(value));
        if (!dateValidation.isValid) {
          errors.push({
            field,
            message: `${label} is not a valid date`,
            value,
            severity: 'error'
          });
        } else {
          // Check for future dates where inappropriate
          const date = new Date(String(value));
          const today = new Date();
          
          if (field.includes('expir') || field.includes('Expir')) {
            // Expiration dates should be in the future
            if (date < today) {
              warnings.push({
                field,
                message: `${label} appears to be in the past`,
                value,
                suggestion: 'Expired documents may need renewal'
              });
            }
          }
        }
      }
    });

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate individual date
   */
  validateDate(dateString: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!dateString) {
      return { isValid: false, errors: [{ field: 'date', message: 'Date is required', value: dateString, severity: 'error' }], warnings: [] };
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      errors.push({
        field: 'date',
        message: 'Invalid date format',
        value: dateString,
        severity: 'error'
      });
    }

    return { isValid: errors.length === 0, errors, warnings: [] };
  }

  /**
   * Validate date of birth
   */
  private validateDateOfBirth(dob: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const dateValidation = this.validateDate(dob);
    if (!dateValidation.isValid) {
      return dateValidation;
    }

    const birthDate = new Date(dob);
    const today = new Date();
    const age = Math.floor((today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));

    if (age < 18) {
      errors.push({
        field: 'dateOfBirth',
        message: 'Driver must be at least 18 years old',
        value: dob,
        severity: 'error'
      });
    } else if (age < 21) {
      warnings.push({
        field: 'dateOfBirth',
        message: 'Driver is under 21 - interstate restrictions may apply',
        value: dob,
        suggestion: 'Check interstate driving restrictions for drivers under 21'
      });
    }

    if (age > 100) {
      warnings.push({
        field: 'dateOfBirth',
        message: 'Age seems unusually high',
        value: dob,
        suggestion: 'Please verify date of birth'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate email address
   */
  private validateEmail(email: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({
        field: 'email',
        message: 'Invalid email format',
        value: email,
        severity: 'error'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate phone number
   */
  private validatePhone(phone: string): ValidationResult {
    const warnings: ValidationWarning[] = [];

    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length !== 10 && digits.length !== 11) {
      warnings.push({
        field: 'phone',
        message: 'Phone number format may be incorrect',
        value: phone,
        suggestion: 'Use format: (555) 123-4567 or 555-123-4567'
      });
    }

    return { isValid: true, errors: [], warnings };
  }

  /**
   * Validate VIN check digit (simplified version)
   */
  private validateVINCheckDigit(vin: string): boolean {
    // This is a simplified check - real VIN validation is more complex
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    const values: {[key: string]: number} = {
      'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
      'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9,
      'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9
    };

    let sum = 0;
    for (let i = 0; i < 17; i++) {
      if (i === 8) continue; // Skip check digit position
      const char = vin[i];
      const value = isNaN(parseInt(char)) ? values[char] || 0 : parseInt(char);
      sum += value * weights[i];
    }

    const checkDigit = sum % 11;
    const expectedCheckDigit = checkDigit === 10 ? 'X' : checkDigit.toString();
    
    return vin[8] === expectedCheckDigit;
  }

  /**
   * Check if state code is valid
   */
  private isValidUSState(state: string): boolean {
    const validStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
    ];
    return validStates.includes(state.toUpperCase());
  }

  /**
   * Validate complete driver record
   */
  validateDriverRecord(driver: Record<string, unknown>): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];

    // Validate personal info
    const personalValidation = this.validateDriverInfo(driver);
    allErrors.push(...personalValidation.errors);
    allWarnings.push(...personalValidation.warnings);

    // Validate medical certificate
    if (driver.medicalCertificate && typeof driver.medicalCertificate === 'object' && driver.medicalCertificate !== null) {
      const medicalValidation = this.validateMedicalCertificate(driver.medicalCertificate as MedicalCertificateData);
      allErrors.push(...medicalValidation.errors);
      allWarnings.push(...medicalValidation.warnings);
    }

    // Validate CDL info
    if (driver.cdlInfo && typeof driver.cdlInfo === 'object' && driver.cdlInfo !== null) {
      const cdlValidation = this.validateCDL(driver.cdlInfo as CDLData);
      allErrors.push(...cdlValidation.errors);
      allWarnings.push(...cdlValidation.warnings);
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Validate complete vehicle record
   */
  validateVehicleRecord(vehicle: Record<string, unknown>): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];

    // Validate VIN
    if (vehicle.vin && typeof vehicle.vin === 'string') {
      const vinValidation = this.validateVIN(vehicle.vin);
      allErrors.push(...vinValidation.errors);
      allWarnings.push(...vinValidation.warnings);
    }

    // Validate registration
    const registrationValidation = this.validateVehicleRegistration(vehicle);
    allErrors.push(...registrationValidation.errors);
    allWarnings.push(...registrationValidation.warnings);

    // Validate insurance if present
    if (vehicle.insuranceCarrier || vehicle.policyNumber || vehicle.insuranceExpiry) {
      const insuranceValidation = this.validateInsuranceData(vehicle);
      allErrors.push(...insuranceValidation.errors);
      allWarnings.push(...insuranceValidation.warnings);
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

}

export const dataValidator = new DataValidationService();