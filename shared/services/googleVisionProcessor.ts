// Google Vision Processor - Environment Agnostic
// Handles document processing using Google Vision API

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { logger, LogContext } from './logger';

export interface GoogleVisionProcessingResult {
  success: boolean;
  text?: string;
  error?: string;
  confidence?: number;
  processingTime?: number;
  documentType?: 'registration' | 'insurance' | 'medical_certificate' | 'cdl_license' | 'inspection' | 'permit' | 'unknown';
  extractedData?: {
    vin?: string;
    licensePlate?: string;
    make?: string;
    model?: string;
    year?: string;
    driverName?: string;
    licenseNumber?: string;
    licenseClass?: string;
    endorsements?: string[];
    issueDate?: string;
    expirationDate?: string;
    effectiveDate?: string;
    policyNumber?: string;
    insuranceCompany?: string;
    coverageAmount?: string;
    medicalExaminerName?: string;
    medicalCertificateNumber?: string;
    restrictions?: string[];
    registrationNumber?: string;
    state?: string;
    ownerName?: string;
    documentNumber?: string;
    authority?: string;
    status?: string;
    rawText?: string;
  };
  fieldConfidence?: { [key: string]: number };
  dataQuality?: {
    isComplete: boolean;
    missingCriticalFields: string[];
    invalidFields: { field: string; issue: string; }[];
    qualityScore: number;
  };
  conflicts?: {
    hasConflicts: boolean;
    conflictDetails: {
      field: string;
      values: string[];
      recommendation: string;
    }[];
  };
  validationResults?: {
    vinValid: boolean;
    datesRealistic: boolean;
    documentsExpired: boolean;
    requiresImmediateAction: boolean;
  };
  requiresReview?: boolean;
  autoApprovalRecommended?: boolean;
  processingNotes?: string[];
  warnings?: string[];
  errors?: string[];
}

/**
 * Server-side Google Vision processor that uses the Google Vision API directly
 */
export class GoogleVisionProcessor {
  private readonly visionClient: ImageAnnotatorClient;
  private readonly context: LogContext = {
    layer: 'processor',
    component: 'GoogleVisionProcessor'
  };

  constructor() {
    this.visionClient = new ImageAnnotatorClient();
  }

  async processDocument(file: File | Buffer, options?: {
    maxRetries?: number;
    timeout?: number;
    expectedDocumentType?: string;
  }): Promise<GoogleVisionProcessingResult> {
    const startTime = Date.now();
    const processingOptions = {
      maxRetries: 3,
      timeout: 30000,
      ...options
    };

    logger.info('Starting Google Vision document processing', {
      ...this.context,
      operation: 'processDocument'
    }, {
      fileSize: file instanceof File ? file.size : file.length,
      expectedType: processingOptions.expectedDocumentType
    });

    try {
      // Check if we have Google Vision credentials
      const hasCredentials = this.checkCredentials();
      if (!hasCredentials) {
        return {
          success: false,
          error: 'Google Vision API credentials not configured',
          processingTime: Date.now() - startTime
        };
      }

      // Process with Google Vision API
      const visionResult = await this.callGoogleVisionAPI(file, processingOptions);
      
      if (!visionResult.success) {
        return {
          success: false,
          error: visionResult.error || 'Google Vision API processing failed',
          processingTime: Date.now() - startTime
        };
      }

      // Extract structured data from the raw text
      const structuredResult = await this.extractStructuredData(visionResult.text || '', processingOptions.expectedDocumentType);

      const result: GoogleVisionProcessingResult = {
        success: true,
        text: visionResult.text,
        confidence: visionResult.confidence,
        processingTime: Date.now() - startTime,
        ...structuredResult
      };

      logger.info('Google Vision processing completed successfully', {
        ...this.context,
        operation: 'processDocument'
      }, {
        processingTime: result.processingTime,
        confidence: result.confidence,
        documentType: result.documentType
      });

      return result;

    } catch (error) {
      logger.error('Google Vision processing failed', {
        ...this.context,
        operation: 'processDocument'
      }, error as Error, {
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Google Vision processing error',
        processingTime: Date.now() - startTime
      };
    }
  }

  private checkCredentials(): boolean {
    // Check for Google Cloud credentials
    const hasProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCLOUD_PROJECT;
    const hasKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const hasServiceAccount = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY;
    
    return !!(hasProjectId && (hasKeyFile || hasServiceAccount));
  }

  private async callGoogleVisionAPI(file: File | Buffer, options: any): Promise<{
    success: boolean;
    text?: string;
    error?: string;
    confidence?: number;
  }> {
    try {
      const content = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file;

      const request = {
        image: {
          content: content.toString('base64')
        },
        features: [{
          type: 'DOCUMENT_TEXT_DETECTION'
        }]
      };

      logger.info('Calling Google Vision API', {
        ...this.context,
        operation: 'callGoogleVisionAPI'
      });

      const [result] = await this.visionClient.documentTextDetection(request);
      const annotation = result.fullTextAnnotation;

      if (annotation?.text) {
        return {
          success: true,
          text: annotation.text,
          confidence: annotation.pages?.[0]?.confidence || 0.9
        };
      } else {
        logger.warn('Google Vision API returned no text annotation', {
          ...this.context,
          operation: 'callGoogleVisionAPI'
        }, { result });
        return {
          success: false,
          error: 'No text found in document by Google Vision API.'
        };
      }

    } catch (error) {
      logger.error('Google Vision API call failed', {
        ...this.context,
        operation: 'callGoogleVisionAPI'
      }, error as Error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google Vision API error'
      };
    }
  }

  private async extractStructuredData(text: string, expectedType?: string): Promise<Partial<GoogleVisionProcessingResult>> {
    // Placeholder for structured data extraction logic
    // This would contain the actual parsing logic for different document types
    
    logger.debug('Extracting structured data from text', {
      ...this.context,
      operation: 'extractStructuredData'
    }, {
      textLength: text.length,
      expectedType
    });

    return {
      documentType: 'unknown',
      extractedData: {
        rawText: text
      },
      dataQuality: {
        isComplete: false,
        missingCriticalFields: [],
        invalidFields: [],
        qualityScore: 0.5
      },
      requiresReview: true,
      autoApprovalRecommended: false,
      processingNotes: ['Structured data extraction is a placeholder.']
    };
  }
}

// Create and export singleton instance
export const googleVisionProcessor = new GoogleVisionProcessor();
