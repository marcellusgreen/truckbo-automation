/**
 * Excel/CSV Processor Service
 * Processes structured data files using SheetJS/xlsx library
 */

import * as XLSX from 'xlsx';
import { ExtractedDocumentData, ClaudeProcessingResult } from './claudeVisionProcessor';

export interface ExcelData {
  sheets: string[];
  data: Record<string, any[]>;
  totalRows: number;
  summary: string[];
}

export class ExcelProcessor {

  /**
   * Process Excel/CSV file and extract structured data
   */
  async processExcel(file: File): Promise<ClaudeProcessingResult> {
    const startTime = Date.now();

    try {
      console.log(`📊 Processing Excel file: ${file.name}`);

      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Parse with SheetJS
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Extract data from all sheets
      const excelData = this.extractDataFromWorkbook(workbook, file.name);
      
      // Convert to compliance format
      const result = this.convertToComplianceFormat(excelData, file.name);

      console.log(`✅ Successfully processed Excel file: ${file.name}`);
      console.log(`📈 Found ${excelData.totalRows} total rows across ${excelData.sheets.length} sheets`);

      return {
        success: true,
        data: result,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Excel processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Excel processing error',
        processingTime: Date.now() - startTime,
        data: {
          documentType: 'unknown',
          confidence: 0,
          extractedData: {},
          dataQuality: {
            isComplete: false,
            missingCriticalFields: ['Excel processing failed'],
            qualityScore: 0
          },
          conflicts: {
            hasConflicts: false,
            conflictDetails: []
          },
          validationResults: {
            vinValid: false,
            datesRealistic: true,
            documentsExpired: false,
            requiresImmediateAction: false
          },
          rawText: '',
          processingNotes: ['Excel processing failed'],
          requiresReview: true,
          autoApprovalRecommended: false
        }
      };
    }
  }

  /**
   * Extract data from Excel workbook
   */
  private extractDataFromWorkbook(workbook: XLSX.WorkBook, fileName: string): ExcelData {
    const sheets = workbook.SheetNames;
    const data: Record<string, any[]> = {};
    let totalRows = 0;
    const summary: string[] = [];

    sheets.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetData = XLSX.utils.sheet_to_json(worksheet);
      
      data[sheetName] = sheetData;
      totalRows += sheetData.length;
      
      summary.push(`Sheet "${sheetName}": ${sheetData.length} rows`);
      
      // Log first few column headers for debugging
      if (sheetData.length > 0) {
        const headers = Object.keys(sheetData[0]).slice(0, 5);
        console.log(`📋 Sheet "${sheetName}" headers: ${headers.join(', ')}`);
      }
    });

    return {
      sheets,
      data,
      totalRows,
      summary
    };
  }

  /**
   * Convert Excel data to compliance document format
   */
  private convertToComplianceFormat(excelData: ExcelData, fileName: string): ExtractedDocumentData {
    // Analyze data and extract compliance information
    const extractedData = this.extractComplianceData(excelData);
    
    return {
      documentType: this.determineDocumentType(fileName, excelData),
      confidence: 0.8, // High confidence for structured data
      extractedData,
      dataQuality: {
        isComplete: excelData.totalRows > 0,
        missingCriticalFields: this.findMissingFields(excelData),
        qualityScore: excelData.totalRows > 0 ? 0.8 : 0.2
      },
      conflicts: {
        hasConflicts: false,
        conflictDetails: []
      },
      validationResults: {
        vinValid: false, // Will be validated if VINs are found
        datesRealistic: true,
        documentsExpired: false,
        requiresImmediateAction: false
      },
      rawText: JSON.stringify(excelData.data, null, 2),
      processingNotes: [
        `Processed ${excelData.sheets.length} sheets`,
        `Total ${excelData.totalRows} rows`,
        ...excelData.summary
      ],
      requiresReview: excelData.totalRows === 0,
      autoApprovalRecommended: excelData.totalRows > 0 && excelData.totalRows < 1000
    };
  }

  /**
   * Extract compliance-specific data from Excel
   */
  private extractComplianceData(excelData: ExcelData): any {
    const compliance: any = {};
    
    // Search all sheets for compliance data
    Object.entries(excelData.data).forEach(([sheetName, rows]) => {
      rows.forEach((row: any) => {
        // Look for VINs
        Object.entries(row).forEach(([key, value]) => {
          const keyLower = key.toLowerCase();
          const valueStr = String(value || '').toUpperCase();
          
          // VIN detection (17 characters, alphanumeric)
          if ((keyLower.includes('vin') || keyLower.includes('vehicle id')) && 
              valueStr.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(valueStr)) {
            if (!compliance.vins) compliance.vins = [];
            if (!compliance.vins.includes(valueStr)) {
              compliance.vins.push(valueStr);
            }
          }
          
          // License plate detection
          if (keyLower.includes('plate') || keyLower.includes('license')) {
            if (!compliance.licensePlates) compliance.licensePlates = [];
            if (valueStr && !compliance.licensePlates.includes(valueStr)) {
              compliance.licensePlates.push(valueStr);
            }
          }
          
          // Driver information
          if (keyLower.includes('driver') || keyLower.includes('name')) {
            if (!compliance.drivers) compliance.drivers = [];
            if (valueStr && !compliance.drivers.includes(valueStr)) {
              compliance.drivers.push(valueStr);
            }
          }
          
          // CDL information
          if (keyLower.includes('cdl') || keyLower.includes('license number')) {
            if (!compliance.cdlNumbers) compliance.cdlNumbers = [];
            if (valueStr && !compliance.cdlNumbers.includes(valueStr)) {
              compliance.cdlNumbers.push(valueStr);
            }
          }
        });
      });
    });
    
    return compliance;
  }

  /**
   * Determine document type based on filename and content
   */
  private determineDocumentType(fileName: string, excelData: ExcelData): any {
    const filenameLower = fileName.toLowerCase();
    
    if (filenameLower.includes('driver') || filenameLower.includes('cdl')) {
      return 'cdl_license';
    }
    if (filenameLower.includes('vehicle') || filenameLower.includes('registration')) {
      return 'registration';
    }
    if (filenameLower.includes('insurance')) {
      return 'insurance';
    }
    
    // Analyze content
    const allData = Object.values(excelData.data).flat();
    const headers = allData.length > 0 ? Object.keys(allData[0]).join(' ').toLowerCase() : '';
    
    if (headers.includes('vin') || headers.includes('vehicle')) {
      return 'registration';
    }
    if (headers.includes('driver') || headers.includes('cdl')) {
      return 'cdl_license';
    }
    if (headers.includes('insurance') || headers.includes('policy')) {
      return 'insurance';
    }
    
    return 'unknown';
  }

  /**
   * Find missing critical fields
   */
  private findMissingFields(excelData: ExcelData): string[] {
    const missing: string[] = [];
    
    if (excelData.totalRows === 0) {
      missing.push('No data found');
    }
    
    // Check for common compliance fields
    const allData = Object.values(excelData.data).flat();
    if (allData.length > 0) {
      const headers = Object.keys(allData[0]).join(' ').toLowerCase();
      
      if (!headers.includes('vin') && !headers.includes('vehicle')) {
        missing.push('Vehicle identification data');
      }
      if (!headers.includes('driver') && !headers.includes('name')) {
        missing.push('Driver information');
      }
    }
    
    return missing;
  }

  /**
   * Process multiple Excel files
   */
  async processExcelBatch(files: File[]): Promise<ClaudeProcessingResult[]> {
    const results: ClaudeProcessingResult[] = [];
    
    for (const file of files) {
      try {
        const result = await this.processExcel(file);
        results.push(result);
        
        // Small delay between files
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: 0
        });
      }
    }
    
    return results;
  }
}