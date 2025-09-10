// Smart Truck Number Parser Service
// Automatically detects truck numbers from existing vehicle data
// Reduces manual input burden for fleet managers

export interface TruckNumberResult {
  truckNumber: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'license_plate' | 'vin_pattern' | 'document_text' | 'document_license_plate' | 'dot_number' | 'generated';
  originalValue: string;
  needsReview: boolean;
}

export class TruckNumberParser {
  
  /**
   * Main parsing function - tries multiple strategies
   */
  parseTruckNumber(vehicle: {
    vin: string;
    licensePlate: string;
    dotNumber?: string;
    make?: string;
    model?: string;
    registrationNumber?: string;
    insuranceCarrier?: string;
    policyNumber?: string;
  }): TruckNumberResult {
    
    // Strategy 1: Parse from license plate (most reliable)
    const licenseResult = this.parseFromLicensePlate(vehicle.licensePlate);
    if (licenseResult.confidence === 'high') {
      return licenseResult;
    }
    
    // Strategy 2: Parse from DOT number if available
    if (vehicle.dotNumber) {
      const dotResult = this.parseFromDOTNumber(vehicle.dotNumber);
      if (dotResult.confidence === 'high') {
        return dotResult;
      }
    }
    
    // Strategy 3: Parse from VIN patterns
    const vinResult = this.parseFromVIN(vehicle.vin);
    if (vinResult.confidence === 'medium') {
      return vinResult;
    }
    
    // Strategy 4: Parse from registration number
    if (vehicle.registrationNumber) {
      const regResult = this.parseFromRegistrationNumber(vehicle.registrationNumber);
      if (regResult.confidence === 'medium') {
        return regResult;
      }
    }
    
    // Strategy 5: Last resort - generate from VIN ending
    return this.generateFromVIN(vehicle.vin);
  }

  /**
   * Parse truck number from license plate
   * Common patterns: TRK001, FLEET47, T-123, UNIT99, 001-TRK
   */
  private parseFromLicensePlate(licensePlate: string): TruckNumberResult {
    const plate = licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Pattern 1: TRK/TRUCK + number (e.g., TRK001, TRUCK47)
    let match = plate.match(/(?:TRK|TRUCK)(\d+)/);
    if (match) {
      const number = parseInt(match[1]);
      return {
        truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
        confidence: 'high',
        source: 'license_plate',
        originalValue: licensePlate,
        needsReview: false
      };
    }
    
    // Pattern 2: FLEET + number (e.g., FLEET47, FLT123)
    match = plate.match(/(?:FLEET|FLT)(\d+)/);
    if (match) {
      const number = parseInt(match[1]);
      return {
        truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
        confidence: 'high',
        source: 'license_plate',
        originalValue: licensePlate,
        needsReview: false
      };
    }
    
    // Pattern 3: UNIT + number (e.g., UNIT99, U123)
    match = plate.match(/(?:UNIT|U)(\d+)/);
    if (match) {
      const number = parseInt(match[1]);
      return {
        truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
        confidence: 'high',
        source: 'license_plate',
        originalValue: licensePlate,
        needsReview: false
      };
    }
    
    // Pattern 4: Just numbers at the end (e.g., ABC123, XYZ47)
    match = plate.match(/([A-Z]+)(\d{2,3})$/);
    if (match && parseInt(match[2]) <= 999) {
      const number = parseInt(match[2]);
      return {
        truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
        confidence: 'medium',
        source: 'license_plate',
        originalValue: licensePlate,
        needsReview: true
      };
    }
    
    // Pattern 5: Numbers at the beginning (e.g., 123ABC, 47TRK)
    match = plate.match(/^(\d{2,3})([A-Z]+)/);
    if (match && parseInt(match[1]) <= 999) {
      const number = parseInt(match[1]);
      return {
        truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
        confidence: 'medium',
        source: 'license_plate',
        originalValue: licensePlate,
        needsReview: true
      };
    }
    
    return {
      truckNumber: '',
      confidence: 'low',
      source: 'license_plate',
      originalValue: licensePlate,
      needsReview: true
    };
  }

  /**
   * Parse truck number from DOT number
   * Some fleets use sequential DOT numbers
   */
  private parseFromDOTNumber(dotNumber: string): TruckNumberResult {
    const cleanDOT = dotNumber.replace(/[^0-9]/g, '');
    
    // If DOT number ends with a reasonable truck number (001-999)
    const lastThreeDigits = cleanDOT.slice(-3);
    const number = parseInt(lastThreeDigits);
    
    if (number >= 1 && number <= 999) {
      return {
        truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
        confidence: 'medium',
        source: 'dot_number',
        originalValue: dotNumber,
        needsReview: true
      };
    }
    
    return {
      truckNumber: '',
      confidence: 'low',
      source: 'dot_number',
      originalValue: dotNumber,
      needsReview: true
    };
  }

  /**
   * Parse truck number from VIN patterns
   * VINs sometimes have sequential numbers embedded
   */
  private parseFromVIN(vin: string): TruckNumberResult {
    // Look for 2-3 digit numbers in the VIN that could be truck numbers
    const matches = vin.match(/(\d{2,3})/g);
    
    if (matches) {
      // Prefer numbers in positions that are commonly used for fleet sequence
      for (const match of matches) {
        const number = parseInt(match);
        if (number >= 1 && number <= 999) {
          return {
            truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
            confidence: 'low',
            source: 'vin_pattern',
            originalValue: vin,
            needsReview: true
          };
        }
      }
    }
    
    return {
      truckNumber: '',
      confidence: 'low',
      source: 'vin_pattern',
      originalValue: vin,
      needsReview: true
    };
  }

  /**
   * Parse from registration number
   */
  private parseFromRegistrationNumber(registrationNumber: string): TruckNumberResult {
    const regNum = registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Look for patterns similar to license plates
    const match = regNum.match(/(\d{2,3})/);
    if (match) {
      const number = parseInt(match[1]);
      if (number >= 1 && number <= 999) {
        return {
          truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
          confidence: 'medium',
          source: 'document_text',
          originalValue: registrationNumber,
          needsReview: true
        };
      }
    }
    
    return {
      truckNumber: '',
      confidence: 'low',
      source: 'document_text',
      originalValue: registrationNumber,
      needsReview: true
    };
  }

  /**
   * Generate truck number from VIN ending as last resort
   */
  private generateFromVIN(vin: string): TruckNumberResult {
    // Use last 3 digits of VIN, but make it obvious it's auto-generated
    const lastDigits = vin.slice(-3);
    const number = parseInt(lastDigits.replace(/[^0-9]/g, ''));
    
    if (number > 0) {
      return {
        truckNumber: `Unit ${number.toString().padStart(3, '0')}`,
        confidence: 'low',
        source: 'generated',
        originalValue: vin,
        needsReview: true
      };
    }
    
    // Absolute fallback
    return {
      truckNumber: `Vehicle ${vin.slice(-4)}`,
      confidence: 'low',
      source: 'generated',
      originalValue: vin,
      needsReview: true
    };
  }

  /**
   * Parse truck numbers from document text (for AI document processing)
   */
  parseFromDocumentText(documentText: string): TruckNumberResult[] {
    const results: TruckNumberResult[] = [];
    const upperText = documentText.toUpperCase();
    
    // First, check for license plate patterns that contain truck numbers
    const licensePlateMatch = upperText.match(/LICENSE\s+PLATE:\s*([A-Z0-9]+)/);
    if (licensePlateMatch) {
      const plateResult = this.parseFromLicensePlate(licensePlateMatch[1]);
      if (plateResult.confidence !== 'low') {
        results.push({
          ...plateResult,
          source: 'document_license_plate'
        });
      }
    }
    
    // Common fleet ID patterns in documents
    const patterns = [
      /(?:TRUCK|VEHICLE|UNIT)\s*#?(\d{1,3})/g,
      /(?:FLEET)\s*#?(\d{1,3})/g,
      /(?:ID|IDENTIFIER)\s*#?(\d{1,3})/g,
      /(?:NUMBER|NO\.?)\s*(\d{1,3})/g,
      /TRK(\d{1,3})/g  // Direct TRK pattern matching
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(upperText)) !== null) {
        const number = parseInt(match[1]);
        if (number >= 1 && number <= 999) {
          results.push({
            truckNumber: `Truck #${number.toString().padStart(3, '0')}`,
            confidence: 'medium',
            source: 'document_text',
            originalValue: match[0],
            needsReview: false
          });
        }
      }
    });
    
    return results;
  }

  /**
   * Validate and clean truck number format
   */
  validateTruckNumber(truckNumber: string): { isValid: boolean; cleaned: string; suggestion?: string } {
    const cleaned = truckNumber.trim();
    
    // Accept various formats and normalize them
    const patterns = [
      { regex: /^(?:truck|unit|vehicle)\s*#?(\d{1,3})$/i, format: 'Truck #' },
      { regex: /^#?(\d{1,3})$/, format: 'Truck #' },
      { regex: /^t(\d{1,3})$/i, format: 'Truck #' }
    ];
    
    for (const pattern of patterns) {
      const match = cleaned.match(pattern.regex);
      if (match) {
        const number = parseInt(match[1]);
        if (number >= 1 && number <= 999) {
          return {
            isValid: true,
            cleaned: `${pattern.format}${number.toString().padStart(3, '0')}`
          };
        }
      }
    }
    
    return {
      isValid: false,
      cleaned,
      suggestion: 'Format: "Truck #001" or just "47" for Truck #047'
    };
  }

  /**
   * Get display-friendly truck number for UI
   */
  getDisplayNumber(truckNumber: string): string {
    // Extract just the number for quick reference
    const match = truckNumber.match(/(\d+)/);
    return match ? `#${match[1]}` : truckNumber;
  }

  /**
   * Check for duplicate truck numbers in a fleet
   */
  findDuplicates(vehicles: Array<{ truckNumber: string; vin: string }>): Array<{ truckNumber: string; vins: string[] }> {
    const numberMap = new Map<string, string[]>();
    
    vehicles.forEach(vehicle => {
      const existing = numberMap.get(vehicle.truckNumber) || [];
      existing.push(vehicle.vin);
      numberMap.set(vehicle.truckNumber, existing);
    });
    
    return Array.from(numberMap.entries())
      .filter(([_, vins]) => vins.length > 1)
      .map(([truckNumber, vins]) => ({ truckNumber, vins }));
  }
}

export const truckNumberParser = new TruckNumberParser();
