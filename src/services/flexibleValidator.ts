/**
 * Flexible Validation System
 * Confidence-based validation that never fails completely - always allows processing to continue
 */

export interface FlexibleValidationResult {
  status: 'success' | 'success_with_warnings' | 'needs_review';
  confidence_score: number; // 0-100
  extracted_fields: ValidatedField[];
  missing_fields: MissingField[];
  confidence_scores: { [key: string]: number };
  warnings: ValidationWarning[];
  suggestions: string[];
  data: any; // Original data always preserved
  validation_summary: ValidationSummary;
}

export interface ValidatedField {
  field: string;
  value: any;
  confidence: number;
  status: 'excellent' | 'good' | 'acceptable' | 'questionable';
  corrected_value?: any;
  correction_applied?: string;
  validation_notes: string[];
}

export interface MissingField {
  field: string;
  importance: 'critical' | 'important' | 'optional';
  impact: string;
  alternatives?: string[];
}

export interface ValidationWarning {
  field: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
  can_proceed: boolean;
}

export interface ValidationSummary {
  total_fields_expected: number;
  total_fields_found: number;
  high_confidence_fields: number;
  questionable_fields: number;
  critical_missing: number;
  overall_completeness: number; // 0-100
  processing_recommendation: 'auto_approve' | 'review_recommended' | 'manual_review_required';
}

export class FlexibleValidator {
  
  /**
   * Main validation method - NEVER fails completely, always returns actionable data
   */
  validateExtraction(extractedData: any, documentType: string): FlexibleValidationResult {
    console.log(`🔍 Starting flexible validation for ${documentType} document`);
    
    const result: FlexibleValidationResult = {
      status: 'success',
      confidence_score: 0,
      extracted_fields: [],
      missing_fields: [],
      confidence_scores: {},
      warnings: [],
      suggestions: [],
      data: extractedData, // Always preserve original data
      validation_summary: {
        total_fields_expected: 0,
        total_fields_found: 0,
        high_confidence_fields: 0,
        questionable_fields: 0,
        critical_missing: 0,
        overall_completeness: 0,
        processing_recommendation: 'auto_approve'
      }
    };

    // Get expected fields based on document type
    const expectedFields = this.getExpectedFields(documentType);
    result.validation_summary.total_fields_expected = expectedFields.length;

    // Validate each expected field
    expectedFields.forEach(fieldConfig => {
      const fieldResult = this.validateField(extractedData, fieldConfig);
      
      if (fieldResult.found) {
        result.extracted_fields.push(fieldResult.validatedField!);
        result.confidence_scores[fieldConfig.name] = fieldResult.validatedField!.confidence;
        result.validation_summary.total_fields_found++;
        
        if (fieldResult.validatedField!.confidence >= 80) {
          result.validation_summary.high_confidence_fields++;
        } else if (fieldResult.validatedField!.confidence < 60) {
          result.validation_summary.questionable_fields++;
        }
      } else {
        const missingField: MissingField = {
          field: fieldConfig.name,
          importance: fieldConfig.importance,
          impact: fieldConfig.impact,
          alternatives: fieldConfig.alternatives
        };
        result.missing_fields.push(missingField);
        
        if (fieldConfig.importance === 'critical') {
          result.validation_summary.critical_missing++;
        }
      }
    });

    // Validate VINs with OCR correction
    this.validateVINsWithCorrection(extractedData, result);

    // Validate dates with flexible parsing
    this.validateDatesFlexibly(extractedData, result);

    // Calculate overall scores and status
    this.calculateOverallAssessment(result);

    // Generate actionable suggestions
    this.generateSuggestions(result, documentType);

    console.log(`✅ Flexible validation complete: ${result.status} (${result.confidence_score}% confidence)`);
    
    return result;
  }

  /**
   * Validate individual field with flexible scoring
   */
  private validateField(data: any, fieldConfig: FieldConfig): FieldValidationResult {
    const fieldValue = this.extractFieldValue(data, fieldConfig.paths);
    
    if (!fieldValue) {
      return { found: false };
    }

    const validatedField: ValidatedField = {
      field: fieldConfig.name,
      value: fieldValue,
      confidence: 0,
      status: 'acceptable',
      validation_notes: []
    };

    // Apply field-specific validation
    switch (fieldConfig.type) {
      case 'vin':
        this.validateVINField(validatedField, fieldValue);
        break;
      case 'date':
        this.validateDateField(validatedField, fieldValue);
        break;
      case 'license_plate':
        this.validateLicensePlateField(validatedField, fieldValue);
        break;
      case 'policy_number':
        this.validatePolicyNumberField(validatedField, fieldValue);
        break;
      case 'state':
        this.validateStateField(validatedField, fieldValue);
        break;
      case 'text':
        this.validateTextField(validatedField, fieldValue, fieldConfig);
        break;
      case 'number':
        this.validateNumberField(validatedField, fieldValue, fieldConfig);
        break;
      default:
        this.validateGenericField(validatedField, fieldValue);
    }

    return { found: true, validatedField };
  }

  /**
   * VIN validation with OCR error correction
   */
  private validateVINField(field: ValidatedField, value: string): void {
    const cleanVIN = value.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    field.validation_notes.push(`Original value: "${value}"`);
    field.validation_notes.push(`Cleaned value: "${cleanVIN}"`);

    // Apply OCR corrections
    const correctedVIN = this.correctVINOCRErrors(cleanVIN);
    if (correctedVIN !== cleanVIN) {
      field.corrected_value = correctedVIN;
      field.correction_applied = `OCR corrections applied: ${cleanVIN} → ${correctedVIN}`;
      field.validation_notes.push(field.correction_applied);
    }

    const finalVIN = correctedVIN;

    // Length check
    if (finalVIN.length === 17) {
      field.confidence += 40;
      field.validation_notes.push('✓ Correct length (17 characters)');
    } else if (finalVIN.length >= 15 && finalVIN.length <= 19) {
      field.confidence += 25;
      field.validation_notes.push(`⚠ Length ${finalVIN.length} (expected 17) - likely OCR issue`);
    } else {
      field.confidence += 5;
      field.validation_notes.push(`✗ Invalid length ${finalVIN.length}`);
    }

    // Character validation
    if (!/[IOQ]/.test(finalVIN)) {
      field.confidence += 30;
      field.validation_notes.push('✓ No invalid characters (I, O, Q)');
    } else {
      field.confidence += 15;
      field.validation_notes.push('⚠ Contains I, O, or Q - potential OCR errors');
    }

    // Format validation
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(finalVIN)) {
      field.confidence += 30;
      field.validation_notes.push('✓ Valid VIN format');
      
      // Manufacturer code validation
      const manufacturerValidation = this.validateManufacturerCode(finalVIN);
      field.confidence += (manufacturerValidation.confidence > 50 ? 15 : 0);
      field.validation_notes.push(...manufacturerValidation.notes);
      
      // Engine information extraction from VIN
      const engineInfo = this.decodeEngineFromVIN(finalVIN);
      if (engineInfo.confidence > 60) {
        field.validation_notes.push(`🔧 Engine: ${engineInfo.engineDescription}`);
        // Store engine information for vehicle record
        field.engine_info = engineInfo;
      }
      
      // Additional check digit validation
      if (this.validateVINCheckDigit(finalVIN)) {
        field.confidence += 20;
        field.validation_notes.push('✓ Valid VIN check digit - mathematically correct');
      } else {
        field.confidence -= 10;
        field.validation_notes.push('⚠ Invalid VIN check digit - possible OCR error in position 9');
        
        // Suggest alternative characters for position 9
        const suggestedChar = this.calculateCorrectCheckDigit(finalVIN);
        if (suggestedChar) {
          field.validation_notes.push(`💡 Suggested check digit: '${suggestedChar}' (current: '${finalVIN[8]}')`);
        }
      }
    } else if (/^[A-Z0-9]{15,19}$/.test(finalVIN)) {
      field.confidence += 20;
      field.validation_notes.push('⚠ Alphanumeric format but needs verification');
    } else {
      field.confidence += 5;
      field.validation_notes.push('✗ Invalid format');
    }

    this.setFieldStatus(field);
  }

  /**
   * Date validation with flexible format parsing
   */
  private validateDateField(field: ValidatedField, value: string): void {
    field.validation_notes.push(`Original date: "${value}"`);

    const dateFormats = [
      { regex: /^(\d{4})-(\d{2})-(\d{2})$/, format: 'YYYY-MM-DD' },
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, format: 'MM/DD/YYYY' },
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, format: 'MM/DD/YY' },
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, format: 'DD.MM.YYYY' },
      { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, format: 'DD-MM-YYYY' },
      { regex: /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/, format: 'Month DD YYYY' },
      { regex: /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/, format: 'DD-MMM-YYYY' }
    ];

    let parsedDate: Date | null = null;
    let recognizedFormat = 'Unknown';

    // Try each format
    for (const format of dateFormats) {
      if (format.regex.test(value.trim())) {
        recognizedFormat = format.format;
        try {
          parsedDate = new Date(value);
          if (!isNaN(parsedDate.getTime())) {
            field.confidence += 40;
            field.validation_notes.push(`✓ Recognized format: ${recognizedFormat}`);
            break;
          }
        } catch (e) {
          // Continue to next format
        }
      }
    }

    // Fallback parsing
    if (!parsedDate) {
      try {
        parsedDate = new Date(value);
        if (!isNaN(parsedDate.getTime())) {
          field.confidence += 25;
          field.validation_notes.push('⚠ Parsed with fallback method');
        } else {
          field.confidence += 5;
          field.validation_notes.push('✗ Unable to parse date');
        }
      } catch (e) {
        field.confidence += 5;
        field.validation_notes.push('✗ Date parsing failed');
      }
    }

    // Date reasonableness check
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      const year = parsedDate.getFullYear();
      const now = new Date();
      
      if (year >= 2000 && year <= now.getFullYear() + 5) {
        field.confidence += 35;
        field.validation_notes.push('✓ Date is reasonable');
      } else if (year >= 1990 && year <= now.getFullYear() + 10) {
        field.confidence += 20;
        field.validation_notes.push('⚠ Date is plausible but unusual');
      } else {
        field.confidence += 5;
        field.validation_notes.push(`⚠ Date year ${year} seems unusual`);
      }

      // Corrected date format
      field.corrected_value = parsedDate.toISOString().split('T')[0];
      if (field.corrected_value !== value) {
        field.correction_applied = `Standardized to ISO format: ${value} → ${field.corrected_value}`;
        field.validation_notes.push(field.correction_applied);
      }

      field.confidence += 25;
    }

    this.setFieldStatus(field);
  }

  /**
   * License plate validation
   */
  private validateLicensePlateField(field: ValidatedField, value: string): void {
    const cleanPlate = value.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    field.validation_notes.push(`Cleaned plate: "${cleanPlate}"`);

    if (cleanPlate.length >= 2 && cleanPlate.length <= 8) {
      field.confidence += 60;
      field.validation_notes.push('✓ Valid length for license plate');
    } else {
      field.confidence += 20;
      field.validation_notes.push(`⚠ Unusual length for license plate: ${cleanPlate.length}`);
    }

    if (/^[A-Z0-9]+$/.test(cleanPlate)) {
      field.confidence += 40;
      field.validation_notes.push('✓ Alphanumeric format');
    } else {
      field.confidence += 10;
      field.validation_notes.push('✗ Contains non-alphanumeric characters');
    }

    if (cleanPlate !== value.toString().toUpperCase()) {
      field.corrected_value = cleanPlate;
      field.correction_applied = `Cleaned: ${value} → ${cleanPlate}`;
      field.validation_notes.push(field.correction_applied);
    }

    this.setFieldStatus(field);
  }

  /**
   * Policy number validation
   */
  private validatePolicyNumberField(field: ValidatedField, value: string): void {
    const cleanPolicy = value.toString().trim();
    
    if (cleanPolicy.length >= 3) {
      field.confidence += 50;
      field.validation_notes.push('✓ Adequate length for policy number');
    } else {
      field.confidence += 15;
      field.validation_notes.push(`⚠ Very short for policy number: ${cleanPolicy.length} characters`);
    }

    if (/^[A-Z0-9\-\s]+$/i.test(cleanPolicy)) {
      field.confidence += 35;
      field.validation_notes.push('✓ Valid alphanumeric format');
    } else {
      field.confidence += 20;
      field.validation_notes.push('⚠ Contains unusual characters for policy number');
    }

    field.confidence += 15; // Base confidence for having a value

    this.setFieldStatus(field);
  }

  /**
   * State validation
   */
  private validateStateField(field: ValidatedField, value: string): void {
    const validStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 
      'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 
      'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 
      'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 
      'WI', 'WY', 'DC'
    ];

    const cleanState = value.toString().toUpperCase().trim();

    if (validStates.includes(cleanState)) {
      field.confidence = 100;
      field.validation_notes.push('✓ Valid US state code');
    } else if (cleanState.length === 2 && /^[A-Z]{2}$/.test(cleanState)) {
      field.confidence = 60;
      field.validation_notes.push('⚠ 2-letter format but not recognized US state');
    } else {
      field.confidence = 25;
      field.validation_notes.push('✗ Not a valid state code format');
    }

    if (cleanState !== value.toString()) {
      field.corrected_value = cleanState;
      field.correction_applied = `Normalized: ${value} → ${cleanState}`;
      field.validation_notes.push(field.correction_applied);
    }

    this.setFieldStatus(field);
  }

  /**
   * Text field validation
   */
  private validateTextField(field: ValidatedField, value: string, config: FieldConfig): void {
    const cleanText = value.toString().trim();
    
    if (cleanText.length === 0) {
      field.confidence = 0;
      field.validation_notes.push('✗ Empty text field');
      return;
    }

    // Length validation
    const minLength = config.minLength || 1;
    const maxLength = config.maxLength || 200;
    
    if (cleanText.length >= minLength && cleanText.length <= maxLength) {
      field.confidence += 50;
      field.validation_notes.push(`✓ Length ${cleanText.length} within range ${minLength}-${maxLength}`);
    } else {
      field.confidence += 20;
      field.validation_notes.push(`⚠ Length ${cleanText.length} outside expected range ${minLength}-${maxLength}`);
    }

    // Character validation
    if (/^[A-Za-z0-9\s\-\.']+$/.test(cleanText)) {
      field.confidence += 35;
      field.validation_notes.push('✓ Standard characters only');
    } else {
      field.confidence += 20;
      field.validation_notes.push('⚠ Contains special characters');
    }

    field.confidence += 15; // Base confidence

    this.setFieldStatus(field);
  }

  /**
   * Number field validation
   */
  private validateNumberField(field: ValidatedField, value: any, config: FieldConfig): void {
    const numValue = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
    
    if (isNaN(numValue)) {
      field.confidence = 15;
      field.validation_notes.push('✗ Not a valid number');
      return;
    }

    field.confidence += 50;
    field.validation_notes.push(`✓ Valid number: ${numValue}`);

    // Range validation
    if (config.minValue !== undefined && numValue < config.minValue) {
      field.confidence -= 20;
      field.validation_notes.push(`⚠ Below minimum value ${config.minValue}`);
    }
    if (config.maxValue !== undefined && numValue > config.maxValue) {
      field.confidence -= 20;
      field.validation_notes.push(`⚠ Above maximum value ${config.maxValue}`);
    }

    field.confidence += 35; // Additional confidence for numbers
    
    if (numValue !== parseFloat(value.toString())) {
      field.corrected_value = numValue;
      field.correction_applied = `Cleaned number: ${value} → ${numValue}`;
      field.validation_notes.push(field.correction_applied);
    }

    this.setFieldStatus(field);
  }

  /**
   * Generic field validation
   */
  private validateGenericField(field: ValidatedField, value: any): void {
    if (value === null || value === undefined || value === '') {
      field.confidence = 5;
      field.validation_notes.push('⚠ Empty or null value');
      return;
    }

    field.confidence = 60; // Default confidence for having any value
    field.validation_notes.push('✓ Has value');
    
    const stringValue = value.toString().trim();
    if (stringValue.length > 0) {
      field.confidence += 25;
      field.validation_notes.push(`✓ Non-empty content (${stringValue.length} characters)`);
    }

    this.setFieldStatus(field);
  }

  /**
   * Validate VINs with correction
   */
  private validateVINsWithCorrection(data: any, result: FlexibleValidationResult): void {
    const vinFields = ['vin', 'vinNumber', 'vehicle_vin', 'vin_number'];
    const vinArrayFields = ['vin_numbers', 'vins'];
    
    // Check individual VIN fields
    vinFields.forEach(fieldName => {
      const vinValue = data[fieldName];
      if (vinValue) {
        const validatedField: ValidatedField = {
          field: fieldName,
          value: vinValue,
          confidence: 0,
          status: 'acceptable',
          validation_notes: []
        };
        
        this.validateVINField(validatedField, vinValue);
        
        if (validatedField.confidence > 0) {
          result.extracted_fields.push(validatedField);
          result.confidence_scores[fieldName] = validatedField.confidence;
        }
      }
    });

    // Check VIN arrays
    vinArrayFields.forEach(fieldName => {
      const vinArray = data[fieldName];
      if (Array.isArray(vinArray)) {
        vinArray.forEach((vinObj, index) => {
          const vinValue = typeof vinObj === 'object' ? vinObj.value || vinObj.vin : vinObj;
          if (vinValue) {
            const validatedField: ValidatedField = {
              field: `${fieldName}[${index}]`,
              value: vinValue,
              confidence: 0,
              status: 'acceptable',
              validation_notes: []
            };
            
            this.validateVINField(validatedField, vinValue);
            
            if (validatedField.confidence > 0) {
              result.extracted_fields.push(validatedField);
              result.confidence_scores[`${fieldName}[${index}]`] = validatedField.confidence;
            }
          }
        });
      }
    });
  }

  /**
   * Validate dates flexibly
   */
  private validateDatesFlexibly(data: any, result: FlexibleValidationResult): void {
    const dateFields = [
      'expirationDate', 'expiry', 'expiration_date', 'due_date',
      'issueDate', 'issue_date', 'effective_date', 'effectiveDate',
      'registration_expiry', 'insurance_expiry', 'cdl_expiry'
    ];

    dateFields.forEach(fieldName => {
      const dateValue = data[fieldName];
      if (dateValue) {
        const validatedField: ValidatedField = {
          field: fieldName,
          value: dateValue,
          confidence: 0,
          status: 'acceptable',
          validation_notes: []
        };
        
        this.validateDateField(validatedField, dateValue);
        
        if (validatedField.confidence > 0) {
          result.extracted_fields.push(validatedField);
          result.confidence_scores[fieldName] = validatedField.confidence;
        }
      }
    });

    // Check date arrays
    if (data.dates && Array.isArray(data.dates)) {
      data.dates.forEach((dateObj: any, index: number) => {
        const dateValue = typeof dateObj === 'object' ? dateObj.date || dateObj.value : dateObj;
        if (dateValue) {
          const validatedField: ValidatedField = {
            field: `dates[${index}]`,
            value: dateValue,
            confidence: 0,
            status: 'acceptable',
            validation_notes: []
          };
          
          this.validateDateField(validatedField, dateValue);
          
          if (validatedField.confidence > 0) {
            result.extracted_fields.push(validatedField);
            result.confidence_scores[`dates[${index}]`] = validatedField.confidence;
          }
        }
      });
    }
  }

  /**
   * Calculate overall assessment
   */
  private calculateOverallAssessment(result: FlexibleValidationResult): void {
    const summary = result.validation_summary;
    
    // Calculate overall completeness
    if (summary.total_fields_expected > 0) {
      summary.overall_completeness = Math.round(
        (summary.total_fields_found / summary.total_fields_expected) * 100
      );
    } else {
      summary.overall_completeness = result.extracted_fields.length > 0 ? 75 : 0;
    }

    // Calculate confidence score
    const confidenceValues = Object.values(result.confidence_scores);
    if (confidenceValues.length > 0) {
      result.confidence_score = Math.round(
        confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length
      );
    } else {
      result.confidence_score = 0;
    }

    // Determine processing recommendation
    if (summary.critical_missing === 0 && result.confidence_score >= 80 && summary.questionable_fields === 0) {
      summary.processing_recommendation = 'auto_approve';
      result.status = 'success';
    } else if (summary.critical_missing <= 1 && result.confidence_score >= 60) {
      summary.processing_recommendation = 'review_recommended';
      result.status = 'success_with_warnings';
    } else {
      summary.processing_recommendation = 'manual_review_required';
      result.status = 'needs_review';
    }

    // Add warnings based on assessment
    if (summary.critical_missing > 0) {
      result.warnings.push({
        field: 'overall',
        issue: `${summary.critical_missing} critical field(s) missing`,
        severity: 'high',
        suggestion: 'Review document quality and try re-processing',
        can_proceed: true
      });
    }

    if (summary.questionable_fields > 0) {
      result.warnings.push({
        field: 'overall',
        issue: `${summary.questionable_fields} field(s) have low confidence`,
        severity: 'medium',
        suggestion: 'Manual verification recommended',
        can_proceed: true
      });
    }

    if (summary.overall_completeness < 50) {
      result.warnings.push({
        field: 'overall',
        issue: `Low data completeness (${summary.overall_completeness}%)`,
        severity: 'medium',
        suggestion: 'Consider improving document quality or manual data entry',
        can_proceed: true
      });
    }
  }

  /**
   * Generate actionable suggestions
   */
  private generateSuggestions(result: FlexibleValidationResult, documentType: string): void {
    const suggestions: string[] = [];

    // Suggestions based on missing fields
    result.missing_fields.forEach(missing => {
      if (missing.importance === 'critical') {
        if (missing.alternatives && missing.alternatives.length > 0) {
          suggestions.push(`Missing ${missing.field}: Try looking for ${missing.alternatives.join(' or ')}`);
        } else {
          suggestions.push(`Missing critical field ${missing.field}: ${missing.impact}`);
        }
      }
    });

    // Suggestions based on low confidence fields
    result.extracted_fields.forEach(field => {
      if (field.confidence < 60) {
        if (field.field.includes('vin')) {
          suggestions.push(`VIN validation issues: Check document quality and verify ${field.field} manually`);
        } else if (field.field.includes('date')) {
          suggestions.push(`Date format issues: Verify ${field.field} and confirm date interpretation`);
        } else {
          suggestions.push(`Low confidence in ${field.field}: Manual verification recommended`);
        }
      }
    });

    // Document-specific suggestions
    if (documentType === 'registration' && result.confidence_score < 70) {
      suggestions.push('Registration documents: Focus on VIN, license plate, and expiration date areas');
    } else if (documentType === 'insurance' && result.confidence_score < 70) {
      suggestions.push('Insurance documents: Verify policy number, company name, and coverage dates');
    } else if (documentType === 'cdl' && result.confidence_score < 70) {
      suggestions.push('CDL documents: Check license number, class, and expiration date');
    }

    // General suggestions for low confidence
    if (result.confidence_score < 60) {
      suggestions.push('Consider improving document image quality (lighting, resolution, orientation)');
      suggestions.push('Try scanning at higher resolution or taking a clearer photo');
    }

    result.suggestions = suggestions;
  }

  /**
   * Set field status based on confidence score
   */
  private setFieldStatus(field: ValidatedField): void {
    if (field.confidence >= 90) {
      field.status = 'excellent';
    } else if (field.confidence >= 75) {
      field.status = 'good';
    } else if (field.confidence >= 60) {
      field.status = 'acceptable';
    } else {
      field.status = 'questionable';
    }
  }

  /**
   * OCR error correction for VINs with enhanced character mapping
   */
  private correctVINOCRErrors(vin: string): string {
    return vin
      .replace(/I/g, '1')  // I → 1
      .replace(/O/g, '0')  // O → 0
      .replace(/Q/g, '0')  // Q → 0
      .replace(/S/g, '5')  // S → 5 (in number contexts)
      .replace(/G/g, '6')  // G → 6 (in number contexts) 
      .replace(/B/g, '8')  // B → 8 (in number contexts)
      .replace(/Z/g, '2')  // Z → 2 (common OCR error)
      // Enhanced corrections based on real-world examples
      .replace(/C/g, (match, offset) => {
        // C can be confused with G in positions 3, 8, etc.
        return this.isLikelyGPosition(offset, vin) ? 'G' : 'C';
      })
      .replace(/8/g, (match, offset) => {
        // 8 can be confused with A in certain positions
        return this.isLikelyAPosition(offset, vin) ? 'A' : '8';
      });
  }

  /**
   * Check if position is likely to contain G based on VIN structure
   */
  private isLikelyGPosition(position: number, vin: string): boolean {
    // Common positions where G appears in VINs vs C
    const manufacturerCode = vin.substring(0, 3);
    // Add manufacturer-specific logic here
    return false; // Conservative approach - keep original character
  }

  /**
   * Decode engine information from VIN position 8
   */
  private decodeEngineFromVIN(vin: string): {
    engineCode: string;
    engineDescription: string;
    confidence: number;
  } {
    if (vin.length !== 17) {
      return { engineCode: 'Unknown', engineDescription: 'Invalid VIN length', confidence: 0 };
    }
    
    const manufacturerCode = vin.substring(0, 3);
    const engineCode = vin[7]; // Position 8 (0-indexed)
    
    // Freightliner engine codes (1FV prefix)
    if (manufacturerCode === '1FV') {
      const freightlinerEngines: { [key: string]: string } = {
        'Y': 'Cummins ISL 8.9L Diesel',
        'S': 'Cummins ISL 8.9L Diesel', 
        'T': 'Cummins ISX 15L Diesel',
        'U': 'Cummins X15 Diesel',
        'V': 'Detroit Diesel DD13',
        'W': 'Detroit Diesel DD15',
        'H': 'Caterpillar C7',
        'J': 'Caterpillar C13'
      };
      
      return {
        engineCode,
        engineDescription: freightlinerEngines[engineCode] || `Freightliner Engine Code ${engineCode}`,
        confidence: freightlinerEngines[engineCode] ? 90 : 60
      };
    }
    
    // Volvo engine codes (5VC prefix) 
    if (manufacturerCode === '5VC') {
      const volvoEngines: { [key: string]: string } = {
        'F': 'Volvo D13 Diesel',
        'G': 'Volvo D16 Diesel',
        'H': 'Volvo D11 Diesel',
        'J': 'Cummins ISX (Volvo Application)',
        'K': 'Volvo D13TC Diesel'
      };
      
      return {
        engineCode,
        engineDescription: volvoEngines[engineCode] || `Volvo Engine Code ${engineCode}`,
        confidence: volvoEngines[engineCode] ? 90 : 60
      };
    }
    
    return {
      engineCode,
      engineDescription: `Engine Code ${engineCode} (${manufacturerCode})`,
      confidence: 50
    };
  }

  /**
   * Validate manufacturer code against known mappings
   */
  private validateManufacturerCode(vin: string): { 
    manufacturer: string; 
    confidence: number; 
    notes: string[]; 
  } {
    const wmi = vin.substring(0, 3); // World Manufacturer Identifier
    
    const manufacturerCodes: { [key: string]: string } = {
      // Ford Motor Company
      '1FA': 'Ford (USA)',
      '1FB': 'Ford (USA)',
      '1FC': 'Ford (USA)', 
      '1FD': 'Ford (USA)',
      '1FE': 'Ford (USA)',
      '1FF': 'Ford (USA)',
      '1FG': 'Ford (USA)',
      '1FH': 'Ford (USA)',
      '1FJ': 'Ford (USA)',
      '1FK': 'Ford (USA)',
      '1FL': 'Ford (USA)',
      '1FM': 'Ford (USA)',
      '1FN': 'Ford (USA)',
      '1FP': 'Ford (USA)',
      '1FR': 'Ford (USA)',
      '1FS': 'Ford (USA)',
      '1FT': 'Ford (USA)',
      '1FU': 'Ford (USA)',
      '1FV': 'Freightliner (USA)', // CRITICAL CORRECTION
      '1FW': 'Ford (USA)',
      '1FX': 'Ford (USA)',
      '1FY': 'Ford (USA)',
      '1FZ': 'Ford (USA)',
      
      // General Motors
      '1G1': 'General Motors (USA)',
      '1G2': 'General Motors (USA)',
      '1G3': 'General Motors (USA)',
      '1G4': 'General Motors (USA)',
      '1G6': 'General Motors (USA)',
      '1G7': 'General Motors (USA)',
      '1G8': 'General Motors (USA)',
      '1GC': 'General Motors (USA)',
      '1GD': 'General Motors (USA)',
      '1GE': 'General Motors (USA)',
      '1GG': 'General Motors (USA)',
      '1GH': 'General Motors (USA)',
      '1GJ': 'General Motors (USA)',
      '1GK': 'General Motors (USA)',
      '1GL': 'General Motors (USA)',
      '1GM': 'General Motors (USA)',
      '1GN': 'General Motors (USA)',
      '1GP': 'General Motors (USA)',
      '1GR': 'General Motors (USA)',
      '1GS': 'General Motors (USA)',
      '1GT': 'General Motors (USA)',
      '1GU': 'General Motors (USA)',
      '1GW': 'General Motors (USA)',
      '1GY': 'General Motors (USA)',
      '1GZ': 'General Motors (USA)',
      
      // Volvo
      '5VC': 'Volvo (Sweden)',
      '5VF': 'Volvo (Sweden)', 
      '5V1': 'Volvo (Sweden)',
      '5V2': 'Volvo (Sweden)',
      '5V3': 'Volvo (Sweden)',
      '5V4': 'Volvo (Sweden)',
      
      // Honda
      '1HG': 'Honda (USA)',
      '2HG': 'Honda (Canada)',
      '3HG': 'Honda (Mexico)',
      'JHM': 'Honda (Japan)',
      
      // Add more as needed
    };

    const manufacturer = manufacturerCodes[wmi];
    
    if (manufacturer) {
      return {
        manufacturer,
        confidence: 95,
        notes: [`✓ Valid WMI code: ${wmi} = ${manufacturer}`]
      };
    } else {
      return {
        manufacturer: 'Unknown',
        confidence: 20,
        notes: [`⚠ Unrecognized WMI code: ${wmi} - may need database update`]
      };
    }
  }

  /**
   * Check if position is likely to contain A based on VIN structure  
   */
  private isLikelyAPosition(position: number, vin: string): boolean {
    // Positions where A is more common than 8 in VINs
    return position >= 4 && position <= 8; // VDS section often has A
  }

  /**
   * Validate VIN using check digit algorithm (position 9)
   */
  private validateVINCheckDigit(vin: string): boolean {
    if (vin.length !== 17) return false;
    
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    const values: { [key: string]: number } = {
      'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
      'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9, 'S': 2,
      'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
      '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
    };

    let sum = 0;
    for (let i = 0; i < 17; i++) {
      if (i === 8) continue; // Skip check digit position
      const char = vin[i];
      sum += (values[char] || 0) * weights[i];
    }

    const checkDigit = sum % 11;
    const expectedCheckChar = checkDigit === 10 ? 'X' : checkDigit.toString();
    
    return vin[8] === expectedCheckChar;
  }

  /**
   * Calculate the correct check digit for a VIN
   */
  private calculateCorrectCheckDigit(vin: string): string | null {
    if (vin.length !== 17) return null;
    
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    const values: { [key: string]: number } = {
      'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
      'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9, 'S': 2,
      'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
      '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
    };

    let sum = 0;
    for (let i = 0; i < 17; i++) {
      if (i === 8) continue; // Skip check digit position
      const char = vin[i];
      sum += (values[char] || 0) * weights[i];
    }

    const checkDigit = sum % 11;
    return checkDigit === 10 ? 'X' : checkDigit.toString();
  }

  /**
   * Extract field value from multiple possible paths
   */
  private extractFieldValue(data: any, paths: string[]): any {
    for (const path of paths) {
      const value = this.getNestedValue(data, path);
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
    return null;
  }

  /**
   * Get nested object value by path
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  /**
   * Get expected fields configuration for document type
   */
  private getExpectedFields(documentType: string): FieldConfig[] {
    const commonFields: FieldConfig[] = [
      {
        name: 'vin',
        type: 'vin',
        paths: ['vin', 'vinNumber', 'vehicle_vin', 'vin_number'],
        importance: 'critical',
        impact: 'Cannot identify specific vehicle without VIN',
        alternatives: ['Vehicle ID', 'Chassis Number', '17-character identifier']
      }
    ];

    const typeSpecificFields: { [key: string]: FieldConfig[] } = {
      registration: [
        {
          name: 'license_plate',
          type: 'license_plate',
          paths: ['licensePlate', 'license_plate', 'plateNumber', 'plate'],
          importance: 'critical',
          impact: 'Cannot identify vehicle registration without license plate'
        },
        {
          name: 'expiration_date',
          type: 'date',
          paths: ['expirationDate', 'expiry', 'registration_expiry'],
          importance: 'critical',
          impact: 'Cannot determine if registration is current without expiration date'
        },
        {
          name: 'state',
          type: 'state',
          paths: ['state', 'registrationState', 'issuingState'],
          importance: 'important',
          impact: 'Needed for jurisdiction compliance'
        }
      ],
      insurance: [
        {
          name: 'policy_number',
          type: 'policy_number',
          paths: ['policyNumber', 'policy_number', 'policy'],
          importance: 'critical',
          impact: 'Cannot verify insurance coverage without policy number'
        },
        {
          name: 'expiration_date',
          type: 'date',
          paths: ['expirationDate', 'expiry', 'insurance_expiry'],
          importance: 'critical',
          impact: 'Cannot determine if insurance is current without expiration date'
        },
        {
          name: 'insurance_company',
          type: 'text',
          paths: ['insuranceCompany', 'carrier', 'insurer'],
          importance: 'important',
          impact: 'Needed to verify coverage provider'
        }
      ],
      cdl: [
        {
          name: 'license_number',
          type: 'text',
          paths: ['licenseNumber', 'cdlNumber', 'license_number'],
          importance: 'critical',
          impact: 'Cannot verify driver authorization without license number'
        },
        {
          name: 'expiration_date',
          type: 'date',
          paths: ['expirationDate', 'expiry', 'cdl_expiry'],
          importance: 'critical',
          impact: 'Cannot determine if license is current without expiration date'
        },
        {
          name: 'license_class',
          type: 'text',
          paths: ['licenseClass', 'class', 'cdlClass'],
          importance: 'important',
          impact: 'Needed to verify vehicle operation authorization'
        }
      ]
    };

    return [...commonFields, ...(typeSpecificFields[documentType] || [])];
  }
}

// Interface definitions
interface FieldConfig {
  name: string;
  type: 'vin' | 'date' | 'license_plate' | 'policy_number' | 'state' | 'text' | 'number';
  paths: string[];
  importance: 'critical' | 'important' | 'optional';
  impact: string;
  alternatives?: string[];
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
}

interface FieldValidationResult {
  found: boolean;
  validatedField?: ValidatedField;
}

// Export singleton instance
export const flexibleValidator = new FlexibleValidator();