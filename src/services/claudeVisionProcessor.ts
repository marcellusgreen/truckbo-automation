import Anthropic from '@anthropic-ai/sdk';
import pdfParse from 'pdf-parse';

export interface ExtractedDocumentData {
  documentType: 'registration' | 'insurance' | 'medical_certificate' | 'cdl_license' | 'inspection' | 'permit' | 'unknown';
  confidence: number;
  extractedData: {
    // Vehicle Information
    vin?: string;
    licensePlate?: string;
    make?: string;
    model?: string;
    year?: string;
    
    // Driver Information
    driverName?: string;
    licenseNumber?: string;
    licenseClass?: string;
    endorsements?: string[];
    
    // Document Dates
    issueDate?: string;
    expirationDate?: string;
    effectiveDate?: string;
    
    // Insurance Specific
    policyNumber?: string;
    insuranceCompany?: string;
    coverageAmount?: string;
    
    // Medical Certificate Specific
    medicalExaminerName?: string;
    medicalCertificateNumber?: string;
    restrictions?: string[];
    
    // Registration Specific
    registrationNumber?: string;
    state?: string;
    ownerName?: string;
    
    // General
    documentNumber?: string;
    authority?: string;
    status?: string;
  };
  
  // Enhanced edge case handling
  fieldConfidence: {
    [key: string]: number; // Individual field confidence scores
  };
  dataQuality: {
    isComplete: boolean;
    missingCriticalFields: string[];
    invalidFields: { field: string; issue: string; }[];
    qualityScore: number; // 0-1 overall quality
  };
  conflicts: {
    hasConflicts: boolean;
    conflictDetails: {
      field: string;
      values: string[];
      recommendation: string;
    }[];
  };
  validationResults: {
    vinValid: boolean;
    datesRealistic: boolean;
    documentsExpired: boolean;
    requiresImmediateAction: boolean;
  };
  
  rawText?: string;
  processingNotes?: string[];
  requiresReview?: boolean;
  autoApprovalRecommended?: boolean;
}

export interface ClaudeProcessingResult {
  success: boolean;
  data?: ExtractedDocumentData;
  error?: string;
  processingTime?: number;
}

class ClaudeVisionProcessor {
  private anthropic?: Anthropic;
  private isInitialized = false;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY || import.meta.env.VITE_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.warn('Claude API key not found. Document processing will be limited.');
      return;
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
    this.isInitialized = true;
  }

  /**
   * Process document using Claude Vision API
   */
  async processDocument(
    file: File | Blob,
    options: {
      maxRetries?: number;
      timeout?: number;
      expectedDocumentType?: string;
    } = {}
  ): Promise<ClaudeProcessingResult> {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        throw new Error('Claude Vision processor not initialized. Check API key.');
      }

      if (!this.anthropic) {
        throw new Error('Claude API client not initialized.');
      }

      // Convert file to base64
      let base64Data: string;
      let mimeType: string;

      if (file.type === 'application/pdf') {
        // Handle PDF files
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Extract text from PDF first
        const pdfData = await pdfParse(buffer);
        
        // Convert PDF to image for vision processing (simplified approach)
        // In production, you might want to use pdf2pic or similar
        mimeType = 'text/plain';
        base64Data = Buffer.from(pdfData.text).toString('base64');
        
        // For now, process as text
        return await this.processTextDocument(pdfData.text, options, startTime);
        
      } else if (file.type.startsWith('image/')) {
        // Handle image files
        mimeType = file.type;
        const arrayBuffer = await file.arrayBuffer();
        base64Data = Buffer.from(arrayBuffer).toString('base64');
        
        return await this.processImageDocument(base64Data, mimeType, options, startTime);
        
      } else {
        throw new Error(`Unsupported file type: ${file.type}`);
      }
      
    } catch (error) {
      console.error('Claude Vision processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process image document with Claude Vision
   */
  private async processImageDocument(
    base64Data: string,
    mimeType: string,
    options: any,
    startTime: number
  ): Promise<ClaudeProcessingResult> {
    
    const prompt = this.buildExtractionPrompt(options.expectedDocumentType);
    
    try {
      const response = await this.anthropic!.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as any,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: prompt
            }
          ],
        }],
      });

      // Parse Claude's response
      const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const extractedData = this.parseClaudeResponse(responseText);

      return {
        success: true,
        data: extractedData,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Claude API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Claude API error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process text document (from PDF)
   */
  private async processTextDocument(
    text: string,
    options: any,
    startTime: number
  ): Promise<ClaudeProcessingResult> {
    
    const prompt = this.buildTextExtractionPrompt(text, options.expectedDocumentType);
    
    try {
      const response = await this.anthropic!.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: prompt
        }],
      });

      const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const extractedData = this.parseClaudeResponse(responseText);

      return {
        success: true,
        data: extractedData,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Claude API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Claude API error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Build extraction prompt for image documents
   */
  private buildExtractionPrompt(expectedDocumentType?: string): string {
    return `You are an expert document processor specializing in commercial trucking compliance documents with advanced edge case detection.

CRITICAL MISSION: Extract data while identifying conflicts, validation issues, and edge cases to minimize manual review.

Analyze this document image and extract all relevant information. The document could be:
- Vehicle registration
- Commercial insurance policy  
- DOT medical certificate
- CDL (Commercial Driver's License)
- DOT inspection report
- Operating permit
- Or any other trucking-related document

${expectedDocumentType ? `The user expects this to be a ${expectedDocumentType} document.` : ''}

Return your analysis as a JSON object with this EXACT structure:
{
  "documentType": "registration|insurance|medical_certificate|cdl_license|inspection|permit|unknown",
  "confidence": 0.95,
  "extractedData": {
    "vin": "string",
    "licensePlate": "string", 
    "make": "string",
    "model": "string",
    "year": "string",
    "driverName": "string",
    "licenseNumber": "string",
    "licenseClass": "string",
    "endorsements": ["array", "of", "strings"],
    "issueDate": "YYYY-MM-DD",
    "expirationDate": "YYYY-MM-DD", 
    "effectiveDate": "YYYY-MM-DD",
    "policyNumber": "string",
    "insuranceCompany": "string",
    "coverageAmount": "string",
    "medicalExaminerName": "string",
    "medicalCertificateNumber": "string",
    "restrictions": ["array", "of", "restrictions"],
    "registrationNumber": "string",
    "state": "string",
    "ownerName": "string",
    "documentNumber": "string",
    "authority": "string",
    "status": "string"
  },
  "fieldConfidence": {
    "vin": 0.95,
    "expirationDate": 0.90,
    "licensePlate": 0.85
  },
  "dataQuality": {
    "isComplete": true,
    "missingCriticalFields": ["vin", "expirationDate"],
    "invalidFields": [
      {"field": "vin", "issue": "Too short (12 chars, need 17)"},
      {"field": "year", "issue": "Year 2030 is unrealistic"}
    ],
    "qualityScore": 0.85
  },
  "conflicts": {
    "hasConflicts": false,
    "conflictDetails": [
      {
        "field": "expirationDate", 
        "values": ["2024-12-31", "2025-01-15"],
        "recommendation": "Use 2025-01-15 (clearer text, higher confidence)"
      }
    ]
  },
  "validationResults": {
    "vinValid": true,
    "datesRealistic": true,
    "documentsExpired": false,
    "requiresImmediateAction": false
  },
  "processingNotes": ["Document quality excellent", "All critical fields present"],
  "requiresReview": false,
  "autoApprovalRecommended": true
}

ENHANCED VALIDATION RULES:
1. **VIN Validation**: Must be exactly 17 characters, alphanumeric (no I, O, Q)
2. **Date Validation**: 
   - Issue dates should be in the past
   - Expiry dates should be future but realistic (not >10 years out)
   - Flag dates before 2020 or after 2030 as suspicious
3. **Data Completeness**:
   - Registration MUST have: VIN, licensePlate, expirationDate
   - Insurance MUST have: VIN or licensePlate, policyNumber, expirationDate
   - CDL MUST have: driverName, licenseNumber, expirationDate
   - Medical MUST have: driverName, expirationDate, medicalCertificateNumber

CONFLICT DETECTION:
- Multiple values for same field in document (choose most confident)
- Contradictory information (flag for review)
- Cross-field validation failures (VIN format vs year mismatch)

SMART AUTO-APPROVAL CRITERIA:
- Overall confidence > 90%
- No missing critical fields
- No validation failures  
- Document quality score > 80%
- No significant conflicts detected
→ Set autoApprovalRecommended: true

REQUIRE REVIEW IF:
- Confidence < 80%
- Missing critical fields
- Invalid VIN format
- Expired documents (unless insurance renewal)
- Conflicting data within document
- Poor image quality affecting extraction
→ Set requiresReview: true, autoApprovalRecommended: false

FIELD CONFIDENCE SCORING:
Rate each extracted field 0.0-1.0 based on:
- Text clarity in image
- Data validation success
- Cross-field consistency
- Format correctness

Only include fields actually present in document. Use null for missing fields.`;
  }

  /**
   * Build extraction prompt for text documents
   */
  private buildTextExtractionPrompt(text: string, expectedDocumentType?: string): string {
    return `You are an expert document processor specializing in commercial trucking compliance documents with advanced edge case detection.

CRITICAL MISSION: Extract data while identifying conflicts, validation issues, and edge cases to minimize manual review.

Analyze this document text and extract all relevant information:

DOCUMENT TEXT:
${text}

${expectedDocumentType ? `The user expects this to be a ${expectedDocumentType} document.` : ''}

Return your analysis as a JSON object with the EXACT same structure as the image processing prompt, including:
- Enhanced fieldConfidence scoring
- dataQuality assessment  
- conflicts detection
- validationResults
- autoApprovalRecommended flag

Apply the same ENHANCED VALIDATION RULES:
1. **VIN Validation**: Must be exactly 17 characters, alphanumeric (no I, O, Q)
2. **Date Validation**: Realistic date ranges, proper formatting
3. **Data Completeness**: All critical fields for document type
4. **Conflict Detection**: Multiple values, contradictory info
5. **Smart Auto-Approval**: High confidence + complete + valid data

Focus on:
- Identifying the document type accurately with confidence scoring
- Extracting all compliance-relevant dates with validation
- Finding vehicle and driver identification with format checking
- Detecting any internal conflicts or inconsistencies
- Providing field-level confidence for each extracted value
- Recommending auto-approval only for high-quality, complete documents`;
  }

  /**
   * Parse Claude's JSON response with enhanced edge case handling
   */
  private parseClaudeResponse(responseText: string): ExtractedDocumentData {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and structure the enhanced response
      const result: ExtractedDocumentData = {
        documentType: parsed.documentType || 'unknown',
        confidence: parsed.confidence || 0.5,
        extractedData: parsed.extractedData || {},
        
        // Enhanced edge case handling fields
        fieldConfidence: parsed.fieldConfidence || {},
        dataQuality: {
          isComplete: parsed.dataQuality?.isComplete ?? false,
          missingCriticalFields: parsed.dataQuality?.missingCriticalFields || [],
          invalidFields: parsed.dataQuality?.invalidFields || [],
          qualityScore: parsed.dataQuality?.qualityScore || 0.5
        },
        conflicts: {
          hasConflicts: parsed.conflicts?.hasConflicts ?? false,
          conflictDetails: parsed.conflicts?.conflictDetails || []
        },
        validationResults: {
          vinValid: parsed.validationResults?.vinValid ?? true,
          datesRealistic: parsed.validationResults?.datesRealistic ?? true,
          documentsExpired: parsed.validationResults?.documentsExpired ?? false,
          requiresImmediateAction: parsed.validationResults?.requiresImmediateAction ?? false
        },
        
        rawText: responseText,
        processingNotes: parsed.processingNotes || [],
        requiresReview: parsed.requiresReview || false,
        autoApprovalRecommended: parsed.autoApprovalRecommended || false
      };

      // Additional validation logic
      result.requiresReview = this.shouldRequireReview(result);
      result.autoApprovalRecommended = this.shouldAutoApprove(result);

      return result;

    } catch (error) {
      console.error('Error parsing Claude response:', error);
      
      // Return fallback result with enhanced structure
      return {
        documentType: 'unknown',
        confidence: 0.1,
        extractedData: {},
        fieldConfidence: {},
        dataQuality: {
          isComplete: false,
          missingCriticalFields: ['ALL'],
          invalidFields: [{ field: 'parsing', issue: 'Failed to parse Claude response' }],
          qualityScore: 0.1
        },
        conflicts: {
          hasConflicts: false,
          conflictDetails: []
        },
        validationResults: {
          vinValid: false,
          datesRealistic: false,
          documentsExpired: false,
          requiresImmediateAction: true
        },
        rawText: responseText,
        processingNotes: ['Failed to parse structured response', 'Requires manual review'],
        requiresReview: true,
        autoApprovalRecommended: false
      };
    }
  }

  /**
   * Determine if document requires manual review based on enhanced criteria
   */
  private shouldRequireReview(data: ExtractedDocumentData): boolean {
    // High confidence, complete data = no review needed
    if (data.confidence >= 0.9 && 
        data.dataQuality.isComplete && 
        data.dataQuality.qualityScore >= 0.8 &&
        !data.conflicts.hasConflicts &&
        data.validationResults.vinValid &&
        data.validationResults.datesRealistic) {
      return false;
    }

    // Require review if:
    return (
      data.confidence < 0.8 ||                              // Low confidence
      data.dataQuality.missingCriticalFields.length > 0 ||  // Missing critical data
      data.dataQuality.invalidFields.length > 0 ||          // Invalid data detected
      data.conflicts.hasConflicts ||                        // Internal conflicts
      !data.validationResults.vinValid ||                   // Invalid VIN
      !data.validationResults.datesRealistic ||             // Unrealistic dates
      data.validationResults.documentsExpired ||            // Expired documents
      data.dataQuality.qualityScore < 0.6                   // Poor overall quality
    );
  }

  /**
   * Determine if document can be auto-approved based on enhanced criteria
   */
  private shouldAutoApprove(data: ExtractedDocumentData): boolean {
    // Only auto-approve if ALL criteria are met
    return (
      data.confidence >= 0.9 &&                      // High confidence
      data.dataQuality.isComplete &&                 // All required fields present
      data.dataQuality.invalidFields.length === 0 && // No invalid data
      !data.conflicts.hasConflicts &&                // No conflicts
      data.validationResults.vinValid &&             // Valid VIN format
      data.validationResults.datesRealistic &&       // Realistic dates  
      !data.validationResults.documentsExpired &&    // Not expired
      data.dataQuality.qualityScore >= 0.85 &&       // High quality score
      !data.requiresReview                           // Not flagged for review
    );
  }

  /**
   * Batch process multiple documents
   */
  async processDocuments(files: File[]): Promise<ClaudeProcessingResult[]> {
    const results: ClaudeProcessingResult[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      const batchPromises = batch.map(file => 
        this.processDocument(file)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: `Failed to process ${batch[index].name}: ${result.reason}`,
          });
        }
      });
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Get enhanced processing statistics with edge case metrics
   */
  getProcessingStats(results: ClaudeProcessingResult[]) {
    const stats = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      averageProcessingTime: 0,
      documentTypes: {} as Record<string, number>,
      
      // Enhanced edge case metrics
      requiresReview: 0,
      autoApprovalRecommended: 0,
      conflictsDetected: 0,
      invalidDataFound: 0,
      missingCriticalFields: 0,
      expiredDocuments: 0,
      
      // Quality metrics
      averageConfidence: 0,
      averageQualityScore: 0,
      highQualityDocuments: 0, // >90% confidence, complete
      
      // Validation metrics
      vinValidationFailures: 0,
      dateValidationFailures: 0,
      
      // Document completeness
      completeDocuments: 0,
      incompleteDocuments: 0,
      
      // Review breakdown
      reviewReasons: {
        lowConfidence: 0,
        missingFields: 0,
        invalidData: 0,
        conflicts: 0,
        expiredDocs: 0,
        poorQuality: 0
      }
    };

    const successfulResults = results.filter(r => r.success && r.data);
    
    if (successfulResults.length > 0) {
      // Calculate averages
      stats.averageProcessingTime = successfulResults.reduce((sum, r) => 
        sum + (r.processingTime || 0), 0) / successfulResults.length;
        
      stats.averageConfidence = successfulResults.reduce((sum, r) => 
        sum + (r.data?.confidence || 0), 0) / successfulResults.length;
        
      stats.averageQualityScore = successfulResults.reduce((sum, r) => 
        sum + (r.data?.dataQuality.qualityScore || 0), 0) / successfulResults.length;
        
      // Analyze each successful result
      successfulResults.forEach(r => {
        if (r.data) {
          const data = r.data;
          
          // Document type distribution
          const docType = data.documentType;
          stats.documentTypes[docType] = (stats.documentTypes[docType] || 0) + 1;
          
          // Edge case metrics
          if (data.requiresReview) {
            stats.requiresReview++;
            
            // Categorize review reasons
            if (data.confidence < 0.8) stats.reviewReasons.lowConfidence++;
            if (data.dataQuality.missingCriticalFields.length > 0) stats.reviewReasons.missingFields++;
            if (data.dataQuality.invalidFields.length > 0) stats.reviewReasons.invalidData++;
            if (data.conflicts.hasConflicts) stats.reviewReasons.conflicts++;
            if (data.validationResults.documentsExpired) stats.reviewReasons.expiredDocs++;
            if (data.dataQuality.qualityScore < 0.6) stats.reviewReasons.poorQuality++;
          }
          
          if (data.autoApprovalRecommended) stats.autoApprovalRecommended++;
          if (data.conflicts.hasConflicts) stats.conflictsDetected++;
          if (data.dataQuality.invalidFields.length > 0) stats.invalidDataFound++;
          if (data.dataQuality.missingCriticalFields.length > 0) stats.missingCriticalFields++;
          if (data.validationResults.documentsExpired) stats.expiredDocuments++;
          
          // Quality metrics
          if (data.confidence >= 0.9 && data.dataQuality.isComplete) {
            stats.highQualityDocuments++;
          }
          
          // Validation metrics
          if (!data.validationResults.vinValid) stats.vinValidationFailures++;
          if (!data.validationResults.datesRealistic) stats.dateValidationFailures++;
          
          // Completeness
          if (data.dataQuality.isComplete) {
            stats.completeDocuments++;
          } else {
            stats.incompleteDocuments++;
          }
        }
      });
    }

    return stats;
  }
}

// Export singleton instance
export const claudeVisionProcessor = new ClaudeVisionProcessor();
export default ClaudeVisionProcessor;