/**
 * File Type Detection and Routing Service
 * Systematically routes files to appropriate processors
 */

export type ProcessorType = 'CLAUDE_VISION' | 'PDF_TEXT_EXTRACTOR' | 'STRUCTURED_DATA_PARSER' | 'UNKNOWN';

export interface FileAnalysis {
  processor: ProcessorType;
  fileType: string;
  extension: string;
  contentType: 'image' | 'pdf' | 'structured_data' | 'unknown';
  reasoning: string;
  expectedData: string[];
}

export class FileTypeDetector {
  
  /**
   * Analyze file and determine appropriate processor
   */
  static analyzeFile(file: File): FileAnalysis {
    const fileName = file.name.toLowerCase();
    const extension = fileName.split('.').pop() || '';
    const mimeType = file.type.toLowerCase();

    console.log(`🔍 Analyzing file: ${file.name} (${extension}, ${mimeType})`);

    // Excel and CSV files -> Structured Data Parser
    if (this.isStructuredDataFile(extension, mimeType)) {
      return {
        processor: 'STRUCTURED_DATA_PARSER',
        fileType: this.getStructuredDataDescription(extension),
        extension,
        contentType: 'structured_data',
        reasoning: 'Spreadsheet/CSV files require structured data parsing, not vision processing',
        expectedData: this.getStructuredDataExpectations(fileName)
      };
    }

    // PDF files -> Claude Vision (better for compliance documents which are often scanned)
    if (this.isPDFFile(extension, mimeType)) {
      return {
        processor: 'CLAUDE_VISION',
        fileType: 'PDF Document',
        extension,
        contentType: 'pdf',
        reasoning: 'PDF files processed with Claude Vision API - superior for scanned compliance documents',
        expectedData: this.getPDFDataExpectations(fileName)
      };
    }

    // Image files -> Claude Vision
    if (this.isImageFile(extension, mimeType)) {
      return {
        processor: 'CLAUDE_VISION',
        fileType: this.getImageDescription(extension, mimeType),
        extension,
        contentType: 'image',
        reasoning: 'Image files processed with Claude Vision API for OCR and content analysis',
        expectedData: this.getImageDataExpectations(fileName)
      };
    }

    // Unknown/Unsupported
    return {
      processor: 'UNKNOWN',
      fileType: `Unknown file type (${extension})`,
      extension,
      contentType: 'unknown',
      reasoning: `File type .${extension} is not supported for compliance document processing`,
      expectedData: []
    };
  }

  /**
   * Check if file is structured data (Excel, CSV)
   */
  private static isStructuredDataFile(extension: string, mimeType: string): boolean {
    const structuredExtensions = ['xlsx', 'xls', 'csv', 'tsv'];
    const structuredMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv'
    ];

    return structuredExtensions.includes(extension) || structuredMimeTypes.includes(mimeType);
  }

  /**
   * Check if file is PDF
   */
  private static isPDFFile(extension: string, mimeType: string): boolean {
    return extension === 'pdf' || mimeType === 'application/pdf';
  }

  /**
   * Check if file is supported image format
   */
  private static isImageFile(extension: string, mimeType: string): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'];
    const imageMimeTypes = [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/webp'
    ];

    return imageExtensions.includes(extension) || imageMimeTypes.some(type => mimeType.startsWith(type));
  }

  /**
   * Get description for structured data files
   */
  private static getStructuredDataDescription(extension: string): string {
    switch (extension) {
      case 'xlsx': return 'Excel Spreadsheet (.xlsx)';
      case 'xls': return 'Excel Legacy (.xls)';
      case 'csv': return 'CSV File (.csv)';
      case 'tsv': return 'Tab-Separated Values (.tsv)';
      default: return 'Structured Data File';
    }
  }

  /**
   * Get description for image files
   */
  private static getImageDescription(extension: string, mimeType: string): string {
    if (mimeType.startsWith('image/')) {
      return `${mimeType.split('/')[1].toUpperCase()} Image`;
    }
    return `${extension.toUpperCase()} Image File`;
  }

  /**
   * Get expected data for structured files
   */
  private static getStructuredDataExpectations(fileName: string): string[] {
    const baseExpectations = [
      'Vehicle fleet inventory',
      'Driver roster and information',
      'Insurance policy listings',
      'Maintenance schedules'
    ];

    const filenameLower = fileName.toLowerCase();

    if (filenameLower.includes('driver') || filenameLower.includes('cdl')) {
      return [
        'Driver names and IDs',
        'CDL license numbers',
        'License classes and endorsements',
        'Medical certificate status',
        'Training records',
        ...baseExpectations
      ];
    }

    if (filenameLower.includes('vehicle') || filenameLower.includes('fleet')) {
      return [
        'Vehicle identification numbers (VINs)',
        'License plate numbers',
        'Vehicle makes and models',
        'Registration dates',
        'Insurance policy numbers',
        ...baseExpectations
      ];
    }

    return baseExpectations;
  }

  /**
   * Get expected data for PDF files
   */
  private static getPDFDataExpectations(fileName: string): string[] {
    return this.getDocumentDataExpectations(fileName);
  }

  /**
   * Get expected data for image files
   */
  private static getImageDataExpectations(fileName: string): string[] {
    return this.getDocumentDataExpectations(fileName);
  }

  /**
   * Get expected data for document files (PDF/Images)
   */
  private static getDocumentDataExpectations(fileName: string): string[] {
    const filenameLower = fileName.toLowerCase();

    if (filenameLower.includes('registration')) {
      return [
        'Vehicle registration number',
        'VIN (Vehicle Identification Number)',
        'License plate number',
        'Vehicle make, model, year',
        'Owner information',
        'Registration expiration date'
      ];
    }

    if (filenameLower.includes('insurance') || filenameLower.includes('cert')) {
      return [
        'Insurance policy number',
        'Insurance company name',
        'Policy effective dates',
        'Coverage amounts',
        'Vehicle information'
      ];
    }

    if (filenameLower.includes('cdl') || filenameLower.includes('license')) {
      return [
        'Driver name',
        'CDL license number',
        'License class (A, B, C)',
        'Endorsements',
        'Issue and expiration dates'
      ];
    }

    if (filenameLower.includes('medical') || filenameLower.includes('dot')) {
      return [
        'Driver name',
        'Medical certificate number',
        'Medical examiner information',
        'Certificate expiration date'
      ];
    }

    // Default document expectations
    return [
      'Vehicle registration data',
      'Insurance certificates',
      'CDL license information',
      'Medical certificates',
      'DOT inspection records'
    ];
  }

  /**
   * Batch analyze multiple files
   */
  static analyzeFiles(files: File[]): FileAnalysis[] {
    console.log(`📊 Analyzing ${files.length} files for processing...`);
    
    const analyses = files.map(file => this.analyzeFile(file));
    
    // Log summary
    const summary = {
      total: files.length,
      vision: analyses.filter(a => a.processor === 'CLAUDE_VISION').length,
      pdf: analyses.filter(a => a.processor === 'PDF_TEXT_EXTRACTOR').length,
      structured: analyses.filter(a => a.processor === 'STRUCTURED_DATA_PARSER').length,
      unknown: analyses.filter(a => a.processor === 'UNKNOWN').length
    };
    
    console.log('📈 File Analysis Summary:', summary);
    
    return analyses;
  }
}

/**
 * Route files to appropriate processor based on analysis
 */
export function getFileProcessor(file: File): ProcessorType {
  const analysis = FileTypeDetector.analyzeFile(file);
  console.log(`🎯 File "${file.name}" routed to: ${analysis.processor}`);
  return analysis.processor;
}