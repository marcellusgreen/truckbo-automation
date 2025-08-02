// Data Input Service
// Handles API calls with graceful fallbacks to file upload and manual entry

import { comprehensiveComplianceService } from './comprehensiveComplianceApi';
import { apiManager } from './apiManager';

export interface VehicleDataSource {
  method: 'api' | 'file' | 'manual' | 'incomplete';
  confidence: 'high' | 'medium' | 'low';
  lastUpdated: string;
  source: string;
}

export interface EnhancedVehicleData {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  fuelType?: string;
  maxWeight?: number;
  vehicleClass?: string;
  truckNumber?: string; // Auto-detected or manually specified
  dataSource: VehicleDataSource;
  missingFields: string[];
  needsReview: boolean;
}

export interface DataInputOptions {
  skipApi?: boolean;
  requireComplete?: boolean;
  allowPartial?: boolean;
}

export interface FileUploadResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  data: EnhancedVehicleData[];
}

export interface ManualEntryTemplate {
  vin: string;
  requiredFields: {
    field: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'date';
    options?: string[];
    validation?: {
      required: boolean;
      min?: number;
      max?: number;
      pattern?: string;
    };
  }[];
  optionalFields: {
    field: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'date';
    options?: string[];
  }[];
}

class DataInputService {
  /**
   * Primary method: Try API first, then provide fallback options
   */
  async getVehicleData(
    vin: string, 
    options: DataInputOptions = {}
  ): Promise<{
    data: EnhancedVehicleData | null;
    fallbackOptions: {
      canTryFile: boolean;
      canTryManual: boolean;
      template?: ManualEntryTemplate;
    };
  }> {
    const fallbackOptions = {
      canTryFile: true,
      canTryManual: true,
      template: undefined as ManualEntryTemplate | undefined
    };

    // Skip API if requested
    if (options.skipApi) {
      return {
        data: null,
        fallbackOptions: {
          ...fallbackOptions,
          template: this.createManualEntryTemplate(vin)
        }
      };
    }

    try {
      // Attempt comprehensive API call with all data sources
      const apiData = await apiManager.executeApiCall(
        `vin-comprehensive-${vin}`,
        () => comprehensiveComplianceService.getUnifiedComplianceData(vin),
        { cacheType: 'vinDecoding', rateLimitKey: 'nhtsa' }
      );

      if (apiData?.vehicleData && this.isValidVehicleData(apiData.vehicleData)) {
        const enhancedData = this.mapApiDataToVehicleData(vin, apiData);
        
        // Check if data meets requirements
        if (options.requireComplete && enhancedData.missingFields.length > 0) {
          return {
            data: enhancedData,
            fallbackOptions: {
              ...fallbackOptions,
              template: this.createManualEntryTemplate(vin, enhancedData)
            }
          };
        }

        return {
          data: enhancedData,
          fallbackOptions
        };
      }
    } catch (error) {
      console.warn(`API call failed for VIN ${vin}:`, error);
    }

    // API failed or returned invalid data
    return {
      data: null,
      fallbackOptions: {
        ...fallbackOptions,
        template: this.createManualEntryTemplate(vin)
      }
    };
  }

  /**
   * Process bulk file upload (CSV/Excel)
   */
  async processBulkFile(file: File): Promise<FileUploadResult> {
    try {
      const content = await this.readFileContent(file);
      const rows = this.parseFileContent(content, file.type);
      
      const results: EnhancedVehicleData[] = [];
      const errors: string[] = [];
      let processed = 0;
      let failed = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const vehicleData = this.mapRowToVehicleData(row, i + 1);
          if (vehicleData) {
            results.push(vehicleData);
            processed++;
          } else {
            errors.push(`Row ${i + 1}: Invalid or missing data`);
            failed++;
          }
        } catch (error) {
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Processing error'}`);
          failed++;
        }
      }

      return {
        success: processed > 0,
        processed,
        failed,
        errors,
        data: results
      };
    } catch (error) {
      return {
        success: false,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'File processing failed'],
        data: []
      };
    }
  }

  /**
   * Process manual entry data
   */
  processManualEntry(
    vin: string, 
    formData: Record<string, any>
  ): EnhancedVehicleData {
    const missingFields: string[] = [];
    
    // Validate required fields
    const requiredFields = ['make', 'model', 'year'];
    requiredFields.forEach(field => {
      if (!formData[field] || formData[field].toString().trim() === '') {
        missingFields.push(field);
      }
    });

    return {
      vin,
      year: formData.year ? parseInt(formData.year) : undefined,
      make: formData.make?.toString().trim(),
      model: formData.model?.toString().trim(),
      fuelType: formData.fuelType?.toString().trim() || 'Diesel',
      maxWeight: formData.maxWeight ? parseInt(formData.maxWeight) : undefined,
      vehicleClass: formData.vehicleClass?.toString().trim() || 'Unknown',
      dataSource: {
        method: 'manual',
        confidence: missingFields.length === 0 ? 'high' : 'medium',
        lastUpdated: new Date().toISOString(),
        source: 'Manual Entry'
      },
      missingFields,
      needsReview: missingFields.length > 0
    };
  }

  /**
   * Create template for manual entry
   */
  private createManualEntryTemplate(
    vin: string, 
    _existingData?: EnhancedVehicleData
  ): ManualEntryTemplate {
    return {
      vin,
      requiredFields: [
        {
          field: 'make',
          label: 'Vehicle Make',
          type: 'select',
          options: ['Peterbilt', 'Kenworth', 'Freightliner', 'Volvo', 'Mack', 'International', 'Other'],
          validation: { required: true }
        },
        {
          field: 'model',
          label: 'Vehicle Model',
          type: 'text',
          validation: { required: true }
        },
        {
          field: 'year',
          label: 'Model Year',
          type: 'number',
          validation: { 
            required: true, 
            min: 1990, 
            max: new Date().getFullYear() + 1 
          }
        }
      ],
      optionalFields: [
        {
          field: 'fuelType',
          label: 'Fuel Type',
          type: 'select',
          options: ['Diesel', 'Gasoline', 'CNG', 'Electric', 'Hybrid']
        },
        {
          field: 'maxWeight',
          label: 'Max Weight (lbs)',
          type: 'number'
        },
        {
          field: 'vehicleClass',
          label: 'Vehicle Class',
          type: 'select',
          options: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']
        }
      ]
    };
  }

  /**
   * Map API data to enhanced vehicle data
   */
  private mapApiDataToVehicleData(vin: string, apiData: any): EnhancedVehicleData {
    const vehicleData = apiData.vehicleData;
    const missingFields: string[] = [];

    if (!vehicleData.Make) missingFields.push('make');
    if (!vehicleData.Model) missingFields.push('model');
    if (!vehicleData.ModelYear) missingFields.push('year');

    return {
      vin,
      year: vehicleData.ModelYear ? parseInt(vehicleData.ModelYear) : undefined,
      make: vehicleData.Make || undefined,
      model: vehicleData.Model || undefined,
      fuelType: vehicleData.FuelTypePrimary || undefined,
      maxWeight: vehicleData.GVWR ? parseInt(vehicleData.GVWR) : undefined,
      vehicleClass: vehicleData.VehicleClass || undefined,
      dataSource: {
        method: 'api',
        confidence: missingFields.length === 0 ? 'high' : 'medium',
        lastUpdated: new Date().toISOString(),
        source: 'NHTSA vPIC API'
      },
      missingFields,
      needsReview: missingFields.length > 0
    };
  }

  /**
   * Validate API vehicle data
   */
  private isValidVehicleData(data: any): boolean {
    return data && (data.Make || data.Model || data.ModelYear);
  }

  /**
   * Read file content
   */
  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Parse file content based on type
   */
  private parseFileContent(content: string, _fileType: string): any[] {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length === 0) {
      throw new Error('File is empty');
    }

    // Simple CSV parsing
    const rows: any[] = [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, '').toLowerCase());
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      rows.push(row);
    }

    return rows;
  }

  /**
   * Map CSV row to vehicle data
   */
  private mapRowToVehicleData(row: any, rowNumber: number): EnhancedVehicleData | null {
    const vin = row.vin || row.vehicle_identification_number || '';
    
    if (!vin || vin.length !== 17) {
      throw new Error(`Invalid VIN: ${vin}`);
    }

    const missingFields: string[] = [];
    if (!row.make) missingFields.push('make');
    if (!row.model) missingFields.push('model');
    if (!row.year) missingFields.push('year');

    return {
      vin: vin.toUpperCase(),
      year: row.year ? parseInt(row.year) : undefined,
      make: row.make || undefined,
      model: row.model || undefined,
      fuelType: row.fuel_type || row.fueltype || 'Diesel',
      maxWeight: row.max_weight || row.gvwr ? parseInt(row.max_weight || row.gvwr) : undefined,
      vehicleClass: row.vehicle_class || row.class || 'Unknown',
      dataSource: {
        method: 'file',
        confidence: missingFields.length === 0 ? 'high' : 'medium',
        lastUpdated: new Date().toISOString(),
        source: `File Upload (Row ${rowNumber})`
      },
      missingFields,
      needsReview: missingFields.length > 0
    };
  }

  /**
   * Generate CSV template for bulk upload
   */
  generateBulkUploadTemplate(): string {
    const headers = [
      'vin',
      'make',
      'model',
      'year',
      'fuel_type',
      'max_weight',
      'vehicle_class'
    ];

    const sampleRows = [
      '1HGCM82633A123456,Freightliner,Cascadia,2022,Diesel,80000,Class 8',
      '1FTFW1ET5DKE96708,Peterbilt,579,2021,Diesel,80000,Class 8'
    ];

    return [headers.join(','), ...sampleRows].join('\n');
  }

  /**
   * Download CSV template
   */
  downloadBulkUploadTemplate(): void {
    const csvContent = this.generateBulkUploadTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'vehicle_data_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export const dataInputService = new DataInputService();