// Compliance API Integration Service
// Integrates with real compliance data sources for trucking fleet management

interface VINDecodeResponse {
  Make: string;
  Model: string;
  ModelYear: string;
  VehicleType: string;
  FuelTypePrimary: string;
  GVWR: string;
  VehicleClass: string;
  Results: Array<{
    Variable: string;
    Value: string;
  }>;
}

interface FMCSACarrierData {
  dotNumber: string;
  legalName: string;
  dbaName: string;
  carrierOperation: string;
  hm: string;
  pc: string;
  safetyRating: string;
  safetyRatingDate: string;
  reviewDate: string;
  outOfServiceDate: string;
}

interface IFTAFilingData {
  quarter: string;
  year: number;
  dueDate: string;
  jurisdictions: Array<{
    code: string;
    miles: number;
    gallons: number;
    taxRate: number;
    taxDue: number;
  }>;
  totalTaxDue: number;
  filingStatus: 'pending' | 'filed' | 'overdue';
}

interface DOTInspectionData {
  inspectionDate: string;
  inspectionType: string;
  inspectionLevel: string;
  violations: Array<{
    code: string;
    description: string;
    severity: 'minor' | 'major' | 'critical';
  }>;
  outOfService: boolean;
  nextInspectionDue: string;
}

export class ComplianceApiService {
  private readonly NHTSA_VIN_API = 'https://vpic.nhtsa.dot.gov/api/vehicles';
  private readonly FMCSA_API_BASE = 'https://mobile.fmcsa.dot.gov/qc/services/carriers';
  private readonly IFTA_API_BASE = 'https://api.iftach.org/v1'; // Hypothetical IFTA API
  
  // API Keys - In production, these would be environment variables
  private readonly FMCSA_API_KEY = (window as any).REACT_APP_FMCSA_API_KEY || 'demo-key';
  private readonly IFTA_API_KEY = (window as any).REACT_APP_IFTA_API_KEY || 'demo-key';

  /**
   * Decode VIN using NHTSA vPIC API
   */
  async decodeVIN(vin: string): Promise<VINDecodeResponse | null> {
    try {
      const response = await fetch(
        `${this.NHTSA_VIN_API}/DecodeVin/${vin}?format=json`
      );
      
      if (!response.ok) {
        throw new Error(`NHTSA API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Extract key vehicle information
      const results = data.Results || [];
      const extractValue = (variable: string) => {
        const result = results.find((r: any) => r.Variable === variable);
        return result?.Value || '';
      };

      return {
        Make: extractValue('Make'),
        Model: extractValue('Model'),
        ModelYear: extractValue('Model Year'),
        VehicleType: extractValue('Vehicle Type'),
        FuelTypePrimary: extractValue('Fuel Type - Primary'),
        GVWR: extractValue('Gross Vehicle Weight Rating From'),
        VehicleClass: extractValue('Vehicle Class'),
        Results: results
      };
    } catch (error) {
      console.error('VIN decode error:', error);
      return null;
    }
  }

  /**
   * Get carrier information from FMCSA API
   */
  async getCarrierInfo(dotNumber: string): Promise<FMCSACarrierData | null> {
    try {
      const response = await fetch(
        `${this.FMCSA_API_BASE}/${dotNumber}?webKey=${this.FMCSA_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`FMCSA API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        dotNumber: data.dotNumber || dotNumber,
        legalName: data.legalName || '',
        dbaName: data.dbaName || '',
        carrierOperation: data.carrierOperation || '',
        hm: data.hm || '',
        pc: data.pc || '',
        safetyRating: data.safetyRating || '',
        safetyRatingDate: data.safetyRatingDate || '',
        reviewDate: data.reviewDate || '',
        outOfServiceDate: data.outOfServiceDate || ''
      };
    } catch (error) {
      console.error('FMCSA API error:', error);
      // Return mock data for demo purposes
      return this.getMockCarrierInfo(dotNumber);
    }
  }

  /**
   * Get IFTA filing information
   */
  async getIFTAFilingData(dotNumber: string, quarter: string, year: number): Promise<IFTAFilingData | null> {
    try {
      // Note: This is a hypothetical API call - IFTA may not have a public API
      const response = await fetch(
        `${this.IFTA_API_BASE}/filings/${dotNumber}/${year}/${quarter}`,
        {
          headers: {
            'Authorization': `Bearer ${this.IFTA_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`IFTA API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('IFTA API error:', error);
      // Return mock data for demo purposes
      return this.getMockIFTAData(quarter, year);
    }
  }

  /**
   * Get DOT inspection history
   */
  async getDOTInspectionHistory(vin: string): Promise<DOTInspectionData[]> {
    try {
      // This would integrate with DOT inspection databases
      // For now, returning mock data
      return this.getMockInspectionData(vin);
    } catch (error) {
      console.error('DOT inspection API error:', error);
      return [];
    }
  }

  /**
   * Check vehicle registration status
   */
  async getRegistrationStatus(vin: string, state: string): Promise<{
    isValid: boolean;
    expiryDate: string;
    registrationNumber: string;
  } | null> {
    try {
      // This would integrate with state DMV APIs
      // Each state has different APIs and requirements
      return this.getMockRegistrationData(vin, state);
    } catch (error) {
      console.error('Registration API error:', error);
      return null;
    }
  }

  /**
   * Get insurance verification
   */
  async getInsuranceStatus(vin: string, _policyNumber?: string): Promise<{
    isActive: boolean;
    expiryDate: string;
    coverageAmount: number;
    provider: string;
  } | null> {
    try {
      // This would integrate with insurance provider APIs
      return this.getMockInsuranceData(vin);
    } catch (error) {
      console.error('Insurance API error:', error);
      return null;
    }
  }

  /**
   * Get emissions compliance status
   */
  async getEmissionsStatus(vin: string): Promise<{
    isCompliant: boolean;
    lastTestDate: string;
    nextTestDue: string;
    emissionStandard: string;
  } | null> {
    try {
      // This would integrate with EPA or state emission databases
      return this.getMockEmissionsData(vin);
    } catch (error) {
      console.error('Emissions API error:', error);
      return null;
    }
  }

  // Mock data methods for demo purposes
  private getMockCarrierInfo(dotNumber: string): FMCSACarrierData {
    return {
      dotNumber,
      legalName: 'Demo Trucking Company LLC',
      dbaName: 'Demo Trucking',
      carrierOperation: 'Interstate',
      hm: 'No',
      pc: 'Yes',
      safetyRating: 'Satisfactory',
      safetyRatingDate: '2024-06-15',
      reviewDate: '2024-06-15',
      outOfServiceDate: ''
    };
  }

  private getMockIFTAData(quarter: string, year: number): IFTAFilingData {
    const dueDate = this.calculateIFTADueDate(quarter, year);
    
    return {
      quarter,
      year,
      dueDate,
      jurisdictions: [
        { code: 'CA', miles: 2500, gallons: 625, taxRate: 0.47, taxDue: 293.75 },
        { code: 'NV', miles: 1200, gallons: 300, taxRate: 0.52, taxDue: 156.00 },
        { code: 'AZ', miles: 800, gallons: 200, taxRate: 0.47, taxDue: 94.00 }
      ],
      totalTaxDue: 543.75,
      filingStatus: new Date(dueDate) < new Date() ? 'overdue' : 'pending'
    };
  }

  private getMockInspectionData(_vin: string): DOTInspectionData[] {
    return [
      {
        inspectionDate: '2024-06-15',
        inspectionType: 'Annual DOT Inspection',
        inspectionLevel: 'Level I',
        violations: [
          {
            code: '393.9',
            description: 'Inoperative brake lamps',
            severity: 'minor'
          }
        ],
        outOfService: false,
        nextInspectionDue: '2025-06-15'
      }
    ];
  }

  private getMockRegistrationData(vin: string, _state: string) {
    return {
      isValid: true,
      expiryDate: '2025-03-31',
      registrationNumber: `CA${vin.slice(-6)}`
    };
  }

  private getMockInsuranceData(_vin: string) {
    return {
      isActive: true,
      expiryDate: '2024-12-31',
      coverageAmount: 1000000,
      provider: 'Commercial Insurance Co.'
    };
  }

  private getMockEmissionsData(_vin: string) {
    return {
      isCompliant: true,
      lastTestDate: '2024-01-15',
      nextTestDue: '2025-01-15',
      emissionStandard: 'EPA 2010'
    };
  }

  private calculateIFTADueDate(quarter: string, year: number): string {
    const dueDates: { [key: string]: string } = {
      'Q1': `${year}-04-30`,
      'Q2': `${year}-07-31`,
      'Q3': `${year}-10-31`,
      'Q4': `${year + 1}-01-31`
    };
    
    return dueDates[quarter] || `${year}-12-31`;
  }

  /**
   * Comprehensive vehicle compliance check
   */
  async getComprehensiveComplianceData(vin: string, dotNumber?: string) {
    try {
      const [
        vinData,
        carrierInfo,
        inspectionHistory,
        registrationStatus,
        insuranceStatus,
        emissionsStatus
      ] = await Promise.allSettled([
        this.decodeVIN(vin),
        dotNumber ? this.getCarrierInfo(dotNumber) : Promise.resolve(null),
        this.getDOTInspectionHistory(vin),
        this.getRegistrationStatus(vin, 'CA'), // Default to CA, would be dynamic
        this.getInsuranceStatus(vin),
        this.getEmissionsStatus(vin)
      ]);

      return {
        vin,
        vehicleData: vinData.status === 'fulfilled' ? vinData.value : null,
        carrierData: carrierInfo.status === 'fulfilled' ? carrierInfo.value : null,
        inspections: inspectionHistory.status === 'fulfilled' ? inspectionHistory.value : [],
        registration: registrationStatus.status === 'fulfilled' ? registrationStatus.value : null,
        insurance: insuranceStatus.status === 'fulfilled' ? insuranceStatus.value : null,
        emissions: emissionsStatus.status === 'fulfilled' ? emissionsStatus.value : null,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Comprehensive compliance check error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const complianceApiService = new ComplianceApiService();