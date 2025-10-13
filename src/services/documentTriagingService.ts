/**
 * Document Triaging Service
 * Routes documents to appropriate processing methods based on file type and content
 */

export interface TriagingResult {
  recommended_tool: 'CLAUDE_VISION' | 'CLAUDE_TEXT' | 'CLAUDE_CODE' | 'UNSUPPORTED';
  file_type_detected: string;
  reasoning: string;
  expected_compliance_data: string[];
  should_process: boolean;
}

export class DocumentTriagingService {
  
  /**
   * Analyze file and determine appropriate processing route
   */
  static analyzeFile(file: File): TriagingResult {
    const fileName = file.name.toLowerCase();
    const fileType = file.type;

    // Check for Excel/CSV files - route to CLAUDE_CODE
    if (this.isStructuredDataFile(fileType, fileName)) {
      return {
        recommended_tool: 'CLAUDE_CODE',
        file_type_detected: this.getStructuredFileDescription(fileType, fileName),
        reasoning: 'Structured data file requires data parsing and extraction rather than OCR',
        expected_compliance_data: this.getExpectedStructuredData(fileName),
        should_process: true
      };
    }

    // Check for PDF files - route to Claude Vision (better for compliance documents)
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return {
        recommended_tool: 'CLAUDE_VISION',
        file_type_detected: 'PDF document',
        reasoning: 'PDF document will be processed using Claude Vision API - superior for scanned compliance documents and forms',
        expected_compliance_data: this.getExpectedVisualData(fileName),
        should_process: true
      };
    }

    // Check for visual documents - route to CLAUDE_VISION
    if (this.isVisualDocument(fileType, fileName)) {
      return {
        recommended_tool: 'CLAUDE_VISION',
        file_type_detected: this.getVisualFileDescription(fileType, fileName),
        reasoning: 'Visual document requires OCR and image analysis for data extraction',
        expected_compliance_data: this.getExpectedVisualData(fileName),
        should_process: true
      };
    }

    // Unsupported file type
    return {
      recommended_tool: 'UNSUPPORTED',
      file_type_detected: `${fileType || 'Unknown'} file`,
      reasoning: `File type ${fileType} is not supported for compliance document processing`,
      expected_compliance_data: [],
      should_process: false
    };
  }

  /**
   * Check if file is structured data (Excel, CSV, etc.)
   */
  private static isStructuredDataFile(fileType: string, fileName: string): boolean {
    const structuredTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
      'application/csv',
      'text/plain'
    ];

    const structuredExtensions = ['.xlsx', '.xls', '.csv', '.tsv'];

    return structuredTypes.includes(fileType) || 
           structuredExtensions.some(ext => fileName.endsWith(ext));
  }

  /**
   * Check if file is visual document (images only - Claude Vision API limitation)
   */
  private static isVisualDocument(fileType: string, fileName: string): boolean {
    const visualTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp'
    ];

    const visualExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

    return visualTypes.includes(fileType) || 
           visualExtensions.some(ext => fileName.endsWith(ext));
  }

  /**
   * Get description for structured data files
   */
  private static getStructuredFileDescription(fileType: string, fileName: string): string {
    if (fileType.includes('spreadsheet') || fileName.endsWith('.xlsx')) {
      return 'Excel spreadsheet (.xlsx)';
    }
    if (fileType.includes('ms-excel') || fileName.endsWith('.xls')) {
      return 'Excel legacy format (.xls)';
    }
    if (fileType.includes('csv') || fileName.endsWith('.csv')) {
      return 'Comma-separated values (.csv)';
    }
    return 'Structured data file';
  }

  /**
   * Get description for visual document files
   */
  private static getVisualFileDescription(fileType: string, fileName: string): string {
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return 'PDF document (may contain scanned images or text)';
    }
    if (fileType.startsWith('image/')) {
      return `${fileType.split('/')[1].toUpperCase()} image file`;
    }
    return 'Visual document file';
  }

  /**
   * Get expected compliance data for structured files
   */
  private static getExpectedStructuredData(fileName: string): string[] {
    const commonData = [
      'Vehicle fleet inventory',
      'Driver roster and qualifications',
      'Insurance policy listings',
      'Maintenance schedules',
      'Compliance tracking data'
    ];

    // Analyze filename for specific hints
    const filenameLower = fileName.toLowerCase();
    
    if (filenameLower.includes('driver') || filenameLower.includes('cdl')) {
      return [
        'Driver names and IDs',
        'CDL license numbers and classes',
        'License expiration dates',
        'Medical certificate status',
        'Training records',
        ...commonData
      ];
    }

    if (filenameLower.includes('vehicle') || filenameLower.includes('fleet') || filenameLower.includes('truck')) {
      return [
        'Vehicle identification numbers (VINs)',
        'License plate numbers',
        'Vehicle makes and models',
        'Registration information',
        'Insurance policy numbers',
        ...commonData
      ];
    }

    if (filenameLower.includes('insurance') || filenameLower.includes('policy')) {
      return [
        'Policy numbers',
        'Coverage amounts',
        'Effective dates',
        'Insurance company information',
        'Vehicle coverage details',
        ...commonData
      ];
    }

    return commonData;
  }

  /**
   * Get expected compliance data for visual documents
   */
  private static getExpectedVisualData(fileName: string): string[] {
    const commonData = [
      'Vehicle registration certificates',
      'Insurance certificates',
      'CDL licenses',
      'DOT inspection reports',
      'Medical certificates'
    ];

    // Analyze filename for specific document types
    const filenameLower = fileName.toLowerCase();

    if (filenameLower.includes('registration') || filenameLower.includes('reg')) {
      return [
        'Vehicle registration number',
        'VIN (Vehicle Identification Number)',
        'License plate number',
        'Vehicle make, model, year',
        'Owner information',
        'Registration expiration date',
        'State of registration'
      ];
    }

    if (filenameLower.includes('insurance') || filenameLower.includes('cert')) {
      return [
        'Insurance policy number',
        'Insurance company name',
        'Policy effective dates',
        'Coverage amounts',
        'Vehicle information',
        'Certificate number'
      ];
    }

    if (filenameLower.includes('cdl') || filenameLower.includes('license') || filenameLower.includes('driver')) {
      return [
        'Driver name',
        'CDL license number',
        'License class (A, B, C)',
        'Endorsements',
        'Issue and expiration dates',
        'State of issuance',
        'Restrictions'
      ];
    }

    if (filenameLower.includes('medical') || filenameLower.includes('dot')) {
      return [
        'Driver name',
        'Medical certificate number',
        'Medical examiner information',
        'Certificate expiration date',
        'Medical restrictions',
        'DOT physical status'
      ];
    }

    if (filenameLower.includes('inspection') || filenameLower.includes('safety')) {
      return [
        'Vehicle identification',
        'Inspection date',
        'Inspector information',
        'Safety violations',
        'Inspection results',
        'Next inspection due date'
      ];
    }

    return commonData;
  }

  /**
   * Batch analyze multiple files
   */
  static analyzeFiles(files: File[]): TriagingResult[] {
    return files.map(file => this.analyzeFile(file));
  }

  /**
   * Get processing statistics for a batch of files
   */
  static getProcessingStats(triageResults: TriagingResult[]) {
    const stats = {
      total: triageResults.length,
      claude_vision: triageResults.filter(r => r.recommended_tool === 'CLAUDE_VISION').length,
      claude_code: triageResults.filter(r => r.recommended_tool === 'CLAUDE_CODE').length,
      unsupported: triageResults.filter(r => r.recommended_tool === 'UNSUPPORTED').length,
      processable: triageResults.filter(r => r.should_process).length
    };

    return {
      ...stats,
      success_rate: stats.total > 0 ? (stats.processable / stats.total * 100).toFixed(1) + '%' : '0%'
    };
  }
}
