import Anthropic from '@anthropic-ai/sdk';
import { DocumentTriagingService, type TriagingResult } from './documentTriagingService';
import { FileTypeDetector } from './fileTypeDetector';
import { serverPDFService } from './serverPDFService';
import OptimizedClaudePrompts from './optimizedClaudePrompts';
import { flexibleValidator, type FlexibleValidationResult } from './flexibleValidator';
import { vehicleReconciler } from './vehicleReconciler';


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
  
  // Flexible validation results
  flexibleValidation?: FlexibleValidationResult;
  
  // Vehicle reconciliation results
  reconciliation?: {
    vehicleVIN: string;
    success: boolean;
    conflicts?: any[];
    warnings?: string[];
    vehicleDocumentCount?: number;
    complianceStatus?: string;
  };
}

export interface ClaudeProcessingResult {
  success: boolean;
  data?: ExtractedDocumentData;
  error?: string;
  processingTime?: number;
  triageInfo?: TriagingResult;
}

class ClaudeVisionProcessor {
  private anthropic?: Anthropic;
  private isInitialized = false;

  constructor() {
    // Get API key from environment variables (browser-compatible)
    const apiKey = (typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY) || import.meta.env.VITE_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.warn('Claude API key not found. Document processing will be limited.');
      return;
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
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

      // Step 1: Analyze file for appropriate processing route
      let triageResult: TriagingResult | null = null;
      if (file instanceof File) {
        triageResult = DocumentTriagingService.analyzeFile(file);
        
        // Log triaging decision
        console.log(`📋 Document Triage Result for "${file.name}":`, {
          tool: triageResult.recommended_tool,
          type: triageResult.file_type_detected,
          reasoning: triageResult.reasoning,
          expectedData: triageResult.expected_compliance_data
        });

        // Handle unsupported files
        if (!triageResult.should_process) {
          return {
            success: false,
            error: triageResult.reasoning,
            processingTime: Date.now() - startTime,
            triageInfo: triageResult
          };
        }

        // Handle files that should go to CLAUDE_CODE instead
        if (triageResult.recommended_tool === 'CLAUDE_CODE') {
          return {
            success: false,
            error: `${triageResult.file_type_detected} should be processed with structured data parser, not vision AI. ${triageResult.reasoning}`,
            processingTime: Date.now() - startTime,
            triageInfo: triageResult
          };
        }

        // Handle PDF files that were routed to CLAUDE_TEXT (now deprecated)
        if (triageResult.recommended_tool === 'CLAUDE_TEXT') {
          console.log(`⚠️ CLAUDE_TEXT routing is deprecated for ${file.name}. PDFs not supported in browser.`);
          return {
            success: false,
            error: `PDF processing not supported. Please convert "${file.name}" to JPG or PNG format.`,
            processingTime: Date.now() - startTime,
            triageInfo: triageResult
          };
        }

        // Continue with CLAUDE_VISION processing for visual documents
        if (triageResult.recommended_tool !== 'CLAUDE_VISION') {
          return {
            success: false,
            error: 'File type not suitable for vision processing',
            processingTime: Date.now() - startTime,
            triageInfo: triageResult
          };
        }
      }

      if (!this.anthropic) {
        throw new Error('Claude API client not initialized.');
      }

      // Convert file to base64
      let base64Data: string;
      let mimeType: string;

      if (file.type === 'application/pdf') {
        // Use server-side processing for PDFs (full Claude Vision PDF support)
        console.log(`📄 PDF file detected: ${file.name} - routing to server for processing`);
        
        try {
          // Check if server is available
          const serverAvailable = await serverPDFService.checkServerHealth();
          
          if (!serverAvailable) {
            return {
              success: false,
              error: `PDF processing server is not available. "${file.name}" cannot be processed.\n\n📋 Options:\n• Start the PDF processing server (npm run server)\n• Convert PDF to JPG/PNG and upload as image\n• Use server-side deployment for full PDF support`,
              processingTime: Date.now() - startTime
            };
          }
          
          // Process PDF on server with Claude Vision
          const serverResult = await serverPDFService.processPDF(file);
          
          if (!serverResult.success) {
            return {
              success: false,
              error: `Server PDF processing failed: ${serverResult.error}`,
              processingTime: Date.now() - startTime
            };
          }
          
          // Process server result and add to reconciliation system
          const extractedData = serverResult.data || {};
          
          // Add document to reconciliation system
          console.log('🔄 Adding PDF document to vehicleReconciler:', {
            fileName: file?.name || 'unknown_document',
            extractedVIN: extractedData.vin || 'No VIN found',
            serverProcessing: true
          });
          
          const reconciliationResult = await vehicleReconciler.addDocument(
            extractedData, 
            { 
              fileName: file?.name || 'unknown_document',
              source: 'server_pdf_processing',
              uploadDate: new Date().toISOString()
            }
          );
          
          console.log('✅ PDF Reconciliation result:', reconciliationResult);

          // Sync the successfully added vehicle data to persistentFleetStorage
          if (reconciliationResult.success && reconciliationResult.vehicleVIN) {
            console.log('🔄 Syncing reconciler data to persistentFleetStorage for VIN:', reconciliationResult.vehicleVIN);
            try {
              const { persistentFleetStorage } = await import('./persistentFleetStorage');
              
              // Get the vehicle data from vehicleReconciler
              const vehicleRecord = vehicleReconciler.getVehicleSummary(reconciliationResult.vehicleVIN);
              
              if (vehicleRecord) {
                // Convert vehicle data from reconciler format to persistentFleetStorage format  
                const vehicleToSync = {
                  vin: vehicleRecord.vin || 'UNKNOWN',
                  make: vehicleRecord.make || 'Unknown',
                  model: vehicleRecord.model || 'Unknown',
                  year: vehicleRecord.year || new Date().getFullYear(),
                  licensePlate: vehicleRecord.licensePlate || 'Unknown', 
                  truckNumber: vehicleRecord.truckNumber || `Truck-${vehicleRecord.vin?.slice(-4) || 'XXXX'}`,
                  status: 'active' as const,
                  
                  // Registration data from documents
                  registrationNumber: vehicleRecord.registrationNumber,
                  registrationState: vehicleRecord.registrationState, 
                  registrationExpirationDate: vehicleRecord.registrationExpirationDate,
                  registeredOwner: vehicleRecord.registeredOwner,
                  
                  // Insurance data from documents
                  insuranceCarrier: vehicleRecord.insuranceCarrier,
                  policyNumber: vehicleRecord.policyNumber,
                  insuranceExpirationDate: vehicleRecord.insuranceExpirationDate,
                  coverageAmount: vehicleRecord.coverageAmount,
                  
                  // DOT compliance
                  dotNumber: vehicleRecord.dotNumber,
                  
                  // Metadata
                  dataSource: 'document_processing' as const,
                  lastUpdated: new Date().toISOString()
                };

                // Add vehicle to persistent storage (handle both sync and async)
                try {
                  let syncResult;
                  if (typeof persistentFleetStorage.addVehicle === 'function') {
                    // Try async first (PostgreSQL), then sync (localStorage)
                    const result = persistentFleetStorage.addVehicle(vehicleToSync);
                    if (result && typeof result.then === 'function') {
                      syncResult = await result;
                    } else {
                      syncResult = result;
                    }
                  }
                  
                  // Also try the async method if available
                  if (!syncResult && typeof (persistentFleetStorage as any).addVehicleAsync === 'function') {
                    syncResult = await (persistentFleetStorage as any).addVehicleAsync(vehicleToSync);
                  }
                  
                  console.log('✅ Successfully synced vehicle to persistentFleetStorage:', syncResult);
                } catch (addVehicleError) {
                  console.warn('⚠️ Failed to add vehicle to storage:', addVehicleError);
                  // Try alternative sync method for async storage
                  try {
                    if (typeof (persistentFleetStorage as any).getFleetAsync === 'function') {
                      console.log('🔄 Attempting async fleet sync...');
                      const currentFleet = await (persistentFleetStorage as any).getFleetAsync();
                      // Add to current fleet and save
                      const updatedFleet = [...currentFleet, { ...vehicleToSync, id: `vehicle_${Date.now()}`, dateAdded: new Date().toISOString() }];
                      if (typeof (persistentFleetStorage as any).saveFleetAsync === 'function') {
                        await (persistentFleetStorage as any).saveFleetAsync(updatedFleet);
                        console.log('✅ Vehicle synced via async fleet save');
                      }
                    }
                  } catch (asyncError) {
                    console.warn('⚠️ Async sync also failed:', asyncError);
                  }
                }
              } else {
                console.warn('⚠️ Could not retrieve vehicle record from reconciler for VIN:', reconciliationResult.vehicleVIN);
              }
              
            } catch (syncError) {
              console.warn('⚠️ Could not sync to persistentFleetStorage:', syncError);
              // Don't fail the whole operation if sync fails
            }
          }

          // Convert server result to expected format
          return {
            success: true,
            data: serverResult.data,
            processingTime: serverResult.processingTime,
            triageInfo: triageResult,
            reconciliationResult: reconciliationResult
          };
          
        } catch (error) {
          console.error('Server PDF processing error:', error);
          return {
            success: false,
            error: `PDF processing failed: ${error instanceof Error ? error.message : 'Server error'}. Try converting to JPG/PNG or check server status.`,
            processingTime: Date.now() - startTime
          };
        }
        
      } else if (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp') {
        // Handle supported image files - Use browser-compatible base64 conversion
        mimeType = file.type;
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to base64 for processing
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        base64Data = btoa(binaryString);
        
        return await this.processImageDocument(base64Data, mimeType, options, startTime);
        
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel') {
        // Handle Excel files - Claude Vision can't process these directly
        throw new Error('Excel files cannot be processed with vision AI. Please convert to PDF format first.');
        
      } else {
        throw new Error(`Unsupported file type: ${file.type}. Supported formats: PDF, JPG, PNG, GIF, WEBP.`);
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
    
    const prompt = OptimizedClaudePrompts.buildImageExtractionPrompt(options.expectedDocumentType);
    
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

      // Parse Claude's optimized response
      const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const extractedData = await this.parseOptimizedClaudeResponse(responseText);

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
   * Process text document (from PDF) with optimized prompts
   */
  private async processTextDocument(
    text: string,
    options: any,
    startTime: number
  ): Promise<ClaudeProcessingResult> {
    
    const prompt = OptimizedClaudePrompts.buildTextExtractionPrompt(text, options.expectedDocumentType);
    
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
      const extractedData = await this.parseOptimizedClaudeResponse(responseText);

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
    return `You are an expert document processor specializing in commercial trucking compliance documents with advanced noise filtering and OCR error correction.

CRITICAL MISSION: Extract ONLY compliance-relevant data while filtering noise and correcting OCR errors to minimize manual review.

🔍 DOCUMENT NOISE FILTERING - IGNORE:
- Headers/footers with page numbers, watermarks, logos
- Navigation elements, form instructions, disclaimers  
- Boilerplate text like "For office use only", "Do not write below this line"
- Repeated legal text, terms and conditions, privacy notices
- Barcode data, QR codes, reference numbers unless they're document IDs
- Form field labels that don't contain actual data
- Administrative stamps that don't affect compliance status

⚡ OCR ERROR CORRECTION - APPLY:
- Common character substitutions: 0↔O, 1↔I↔l, 5↔S, 8↔B, 6↔G
- Fix "rn" → "m", "vv" → "w", "cl" → "d" patterns
- Correct space insertions in VINs, license plates, policy numbers
- Fix date format corruptions (slashes, dots, spaces)
- Repair partial words in vehicle makes/models using context

📋 FOCUS ONLY ON COMPLIANCE DATA:
- Vehicle identification (VIN, license plate, make/model/year)
- Driver information (name, license number, endorsements)
- Document dates (issue, expiration, effective dates)
- Insurance details (policy number, company, coverage amounts)
- Medical certificate information
- Registration details and authority information
- DOT numbers and permit information

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

🎯 COMPLIANCE-FOCUSED EXTRACTION RULES:
1. **VIN Validation**: Must be exactly 17 characters, alphanumeric (no I, O, Q)
2. **Date Validation**: 
   - Issue dates should be in the past
   - Expiry dates should be future but realistic (not >10 years out)
   - Flag dates before 2020 or after 2030 as suspicious
3. **Data Completeness**:
   - Registration MUST have: VIN, licensePlate, expirationDate, state
   - Insurance MUST have: VIN or licensePlate, policyNumber, expirationDate, coverageAmount
   - CDL MUST have: driverName, licenseNumber, expirationDate, state, licenseClass
   - Medical MUST have: driverName, expirationDate, medicalCertificateNumber

📋 PRIORITIZED FIELD EXTRACTION (extract in order of importance):
**CRITICAL FIELDS (always extract):**
- VIN numbers (17 characters, check for spaces/OCR errors)
- License plates (state format validation)
- Expiration dates (MM/DD/YYYY, MM-DD-YYYY, Month DD, YYYY)
- Driver names (First Last format for CDL/Medical docs)
- Policy numbers (alphanumeric, often with hyphens)

**HIGH PRIORITY (extract if clearly visible):**
- Issue dates, effective dates
- Vehicle make/model/year (validate against known commercial brands)
- Insurance company names, coverage amounts
- State codes (2-letter abbreviations)
- DOT numbers, Medical examiner information

**MEDIUM PRIORITY (extract if confident):**
- License classes, endorsements, restrictions
- Registration numbers, owner names
- Document numbers, authority information

🔍 CONFLICT DETECTION:
- Multiple values for same field in document (choose most confident)
- Contradictory information (flag for review)
- Cross-field validation failures (VIN format vs year mismatch)

✅ SMART AUTO-APPROVAL CRITERIA:
- Overall confidence > 90%
- No missing critical fields
- No validation failures  
- Document quality score > 80%
- No significant conflicts detected
→ Set autoApprovalRecommended: true

⚠️ REQUIRE REVIEW IF:
- Confidence < 80%
- Missing critical fields
- Invalid VIN format
- Expired documents (unless insurance renewal)
- Conflicting data within document
- Poor image quality affecting extraction
→ Set requiresReview: true, autoApprovalRecommended: false

📊 FIELD CONFIDENCE SCORING:
Rate each extracted field 0.0-1.0 based on:
- Text clarity in image/document
- Data validation success (format, realistic values)
- Cross-field consistency (dates align, VIN matches year)
- Format correctness (proper patterns for field type)
- Context validation (field appears in appropriate section)

Only include fields actually present in document. Use null for missing fields.`;
  }

  /**
   * Build extraction prompt for text documents
   */
  private buildTextExtractionPrompt(text: string, expectedDocumentType?: string): string {
    // Apply text preprocessing to filter noise and correct OCR errors
    const cleanedText = this.preprocessDocumentText(text);
    
    return `You are an expert document processor specializing in commercial trucking compliance documents with advanced noise filtering and OCR error correction.

CRITICAL MISSION: Extract ONLY compliance-relevant data while filtering noise and correcting OCR errors to minimize manual review.

🔍 DOCUMENT NOISE FILTERING - IGNORE:
- Headers/footers with page numbers, watermarks, company logos
- Navigation elements, form instructions, legal disclaimers  
- Boilerplate text like "For office use only", "Do not write below this line"
- Repeated legal text, terms and conditions, privacy notices
- Barcode data, QR codes, reference numbers unless they're document IDs
- Form field labels that don't contain actual data
- Administrative stamps that don't affect compliance status

⚡ OCR ERROR CORRECTION - APPLY:
- Common character substitutions: 0↔O, 1↔I↔l, 5↔S, 8↔B, 6↔G
- Fix "rn" → "m", "vv" → "w", "cl" → "d" patterns
- Correct space insertions in VINs, license plates, policy numbers
- Fix date format corruptions (slashes, dots, spaces)
- Repair partial words in vehicle makes/models using context

📋 FOCUS ONLY ON COMPLIANCE DATA:
- Vehicle identification (VIN, license plate, make/model/year)
- Driver information (name, license number, endorsements)
- Document dates (issue, expiration, effective dates)
- Insurance details (policy number, company, coverage amounts)
- Medical certificate information
- Registration details and authority information
- DOT numbers and permit information

Analyze this cleaned document text and extract all relevant information:

CLEANED DOCUMENT TEXT:
${cleanedText}

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
   * Parse Claude's optimized JSON response with enhanced VIN and date recognition
   */
  private async parseOptimizedClaudeResponse(responseText: string): Promise<ExtractedDocumentData> {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Handle the new optimized response structure
      const extractedData = this.convertOptimizedResponseToStandard(parsed);
      
      // Apply flexible validation (never fails completely)
      const flexibleValidation = flexibleValidator.validateExtraction(
        extractedData.extractedData, 
        extractedData.documentType
      );
      
      // Apply legacy validation for backward compatibility
      const validationResult = this.validateAndScoreExtractedData(extractedData);
      
      // Use flexible validation results to override strict validation when beneficial
      const finalConfidence = Math.max(
        flexibleValidation.confidence_score / 100, 
        validationResult.adjustedConfidence
      );
      
      const requiresReview = flexibleValidation.status === 'needs_review' || 
                           (flexibleValidation.status === 'success_with_warnings' && flexibleValidation.confidence_score < 70);
      
      const autoApprovalRecommended = flexibleValidation.validation_summary.processing_recommendation === 'auto_approve';

      // Add document to reconciliation system
      console.log('🔄 Adding document to vehicleReconciler:', {
        fileName: file?.name || 'unknown_document',
        extractedVIN: extractedData.vin || 'No VIN found',
        flexibleValidation: flexibleValidation.status
      });
      
      const reconciliationResult = await vehicleReconciler.addDocument(
        { ...extractedData, flexibleValidation }, 
        { 
          fileName: file?.name || 'unknown_document',
          source: 'claude_vision_processing',
          uploadDate: new Date().toISOString()
        }
      );
      
      console.log('✅ Reconciliation result:', reconciliationResult);

      const result: ExtractedDocumentData = {
        documentType: extractedData.documentType || 'unknown',
        confidence: finalConfidence,
        extractedData: validationResult.validatedData,
        
        // Enhanced validation results
        fieldConfidence: validationResult.fieldConfidence,
        dataQuality: validationResult.dataQuality,
        conflicts: {
          hasConflicts: parsed.conflicts?.hasConflicts ?? false,
          conflictDetails: parsed.conflicts?.conflictDetails || []
        },
        validationResults: validationResult.validationResults,
        
        rawText: responseText,
        processingNotes: [
          ...validationResult.processingNotes,
          `Flexible validation: ${flexibleValidation.status} (${flexibleValidation.confidence_score}% confidence)`,
          ...flexibleValidation.suggestions
        ],
        requiresReview,
        autoApprovalRecommended,
        
        // Include flexible validation results
        flexibleValidation,
        
        // Include reconciliation results
        reconciliation: reconciliationResult.success ? {
          vehicleVIN: reconciliationResult.vehicleVIN!,
          success: true,
          conflicts: reconciliationResult.conflicts,
          warnings: reconciliationResult.warnings,
          vehicleDocumentCount: reconciliationResult.vehicleVIN ? 
            vehicleReconciler.getVehicleSummary(reconciliationResult.vehicleVIN)?.documentCount : undefined,
          complianceStatus: reconciliationResult.vehicleVIN ?
            vehicleReconciler.getVehicleSummary(reconciliationResult.vehicleVIN)?.complianceStatus.overall : undefined
        } : {
          vehicleVIN: 'unknown',
          success: false,
          warnings: reconciliationResult.warnings
        }
      };

      return result;

    } catch (error) {
      console.error('Error parsing optimized Claude response:', error);
      
      // Return fallback result
      return this.createFallbackResponse(responseText);
    }
  }

  /**
   * Parse legacy Claude response format for backward compatibility
   */
  private parseClaudeResponse(responseText: string): ExtractedDocumentData {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Apply comprehensive validation and confidence scoring
      const validationResult = this.validateAndScoreExtractedData(parsed);
      
      const result: ExtractedDocumentData = {
        documentType: parsed.documentType || 'unknown',
        confidence: validationResult.adjustedConfidence,
        extractedData: validationResult.validatedData,
        
        // Enhanced validation results
        fieldConfidence: validationResult.fieldConfidence,
        dataQuality: validationResult.dataQuality,
        conflicts: {
          hasConflicts: parsed.conflicts?.hasConflicts ?? false,
          conflictDetails: parsed.conflicts?.conflictDetails || []
        },
        validationResults: validationResult.validationResults,
        
        rawText: responseText,
        processingNotes: validationResult.processingNotes,
        requiresReview: validationResult.requiresReview,
        autoApprovalRecommended: validationResult.autoApprovalRecommended
      };

      return result;

    } catch (error) {
      console.error('Error parsing legacy Claude response:', error);
      return this.createFallbackResponse(responseText);
    }
  }

  /**
   * Convert optimized Claude response structure to standard format
   */
  private convertOptimizedResponseToStandard(parsed: any): any {
    const extractedData: any = {};
    
    // Extract VINs - use the first high-confidence VIN
    if (parsed.vins && parsed.vins.length > 0) {
      const bestVin = parsed.vins.find((v: any) => v.confidence === 'high') || parsed.vins[0];
      extractedData.vin = bestVin.vin;
    }
    
    // Extract dates - categorize by type
    if (parsed.dates && parsed.dates.length > 0) {
      parsed.dates.forEach((dateObj: any) => {
        switch (dateObj.type) {
          case 'registration_expiry':
            extractedData.expirationDate = dateObj.date;
            break;
          case 'insurance_expiry':
            extractedData.expirationDate = dateObj.date;
            break;
          case 'license_expiry':
            extractedData.expirationDate = dateObj.date;
            break;
          case 'inspection_due':
            extractedData.expirationDate = dateObj.date;
            break;
          case 'issue_date':
            extractedData.issueDate = dateObj.date;
            break;
          case 'effective_date':
            extractedData.effectiveDate = dateObj.date;
            break;
          default:
            // Use the first date as fallback
            if (!extractedData.expirationDate) {
              extractedData.expirationDate = dateObj.date;
            }
        }
      });
    }
    
    // Extract vehicle information
    if (parsed.vehicle_info) {
      extractedData.make = parsed.vehicle_info.make;
      extractedData.model = parsed.vehicle_info.model;
      extractedData.year = parsed.vehicle_info.year;
      extractedData.licensePlate = parsed.vehicle_info.license_plate;
      extractedData.state = parsed.vehicle_info.state;
    }
    
    // Extract document-specific information
    if (parsed.document_specific) {
      const docData = parsed.document_specific;
      
      // Registration data
      if (docData.registration) {
        extractedData.registrationNumber = docData.registration.registration_number;
        extractedData.ownerName = docData.registration.owner_name;
      }
      
      // Insurance data
      if (docData.insurance) {
        extractedData.policyNumber = docData.insurance.policy_number;
        extractedData.insuranceCompany = docData.insurance.insurance_company;
        extractedData.coverageAmount = docData.insurance.coverage_amount;
      }
      
      // CDL data
      if (docData.cdl) {
        extractedData.driverName = docData.cdl.driver_name;
        extractedData.licenseNumber = docData.cdl.license_number;
        extractedData.licenseClass = docData.cdl.license_class;
        extractedData.endorsements = docData.cdl.endorsements;
      }
      
      // Medical data
      if (docData.medical) {
        extractedData.driverName = docData.medical.driver_name;
        extractedData.medicalExaminerName = docData.medical.examiner_name;
        extractedData.medicalCertificateNumber = docData.medical.certificate_number;
      }
    }
    
    return {
      documentType: parsed.document_type,
      confidence: this.convertConfidenceToNumeric(parsed.confidence),
      extractedData
    };
  }
  
  /**
   * Convert confidence strings to numeric values
   */
  private convertConfidenceToNumeric(confidence: string): number {
    switch (confidence?.toLowerCase()) {
      case 'high': return 0.9;
      case 'medium': return 0.7;
      case 'low': return 0.5;
      default: return 0.5;
    }
  }
  
  /**
   * Create standardized fallback response for parsing errors
   */
  private createFallbackResponse(responseText: string): ExtractedDocumentData {
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

  /**
   * Comprehensive validation and confidence scoring for extracted data
   */
  private validateAndScoreExtractedData(parsed: any): {
    validatedData: any;
    fieldConfidence: { [key: string]: number };
    dataQuality: {
      isComplete: boolean;
      missingCriticalFields: string[];
      invalidFields: { field: string; issue: string }[];
      qualityScore: number;
    };
    validationResults: {
      vinValid: boolean;
      datesRealistic: boolean;
      documentsExpired: boolean;
      requiresImmediateAction: boolean;
    };
    adjustedConfidence: number;
    processingNotes: string[];
    requiresReview: boolean;
    autoApprovalRecommended: boolean;
  } {
    console.log('🔍 Starting comprehensive field validation and scoring...');
    
    const extractedData = parsed.extractedData || {};
    const validatedData: any = {};
    const fieldConfidence: { [key: string]: number } = {};
    const invalidFields: { field: string; issue: string }[] = [];
    const processingNotes: string[] = [];
    const suspiciousFlags: string[] = [];
    
    // Document type for context-specific validation
    const documentType = parsed.documentType || 'unknown';
    
    // VIN Validation
    if (extractedData.vin) {
      const vinValidation = this.validateVIN(extractedData.vin);
      validatedData.vin = vinValidation.cleanedValue;
      fieldConfidence.vin = vinValidation.confidence;
      if (!vinValidation.isValid) {
        invalidFields.push({ field: 'vin', issue: vinValidation.issue });
      }
      if (vinValidation.isSuspicious) {
        suspiciousFlags.push(`VIN: ${vinValidation.suspiciousReason}`);
      }
    }
    
    // License Plate Validation
    if (extractedData.licensePlate) {
      const plateValidation = this.validateLicensePlate(extractedData.licensePlate);
      validatedData.licensePlate = plateValidation.cleanedValue;
      fieldConfidence.licensePlate = plateValidation.confidence;
      if (!plateValidation.isValid) {
        invalidFields.push({ field: 'licensePlate', issue: plateValidation.issue });
      }
    }
    
    // Vehicle Details Validation
    if (extractedData.make) {
      const makeValidation = this.validateVehicleMake(extractedData.make);
      validatedData.make = makeValidation.cleanedValue;
      fieldConfidence.make = makeValidation.confidence;
      if (!makeValidation.isValid) {
        invalidFields.push({ field: 'make', issue: makeValidation.issue });
      }
    }
    
    if (extractedData.model) {
      const modelValidation = this.validateVehicleModel(extractedData.model);
      validatedData.model = modelValidation.cleanedValue;
      fieldConfidence.model = modelValidation.confidence;
      if (!modelValidation.isValid) {
        invalidFields.push({ field: 'model', issue: modelValidation.issue });
      }
    }
    
    if (extractedData.year) {
      const yearValidation = this.validateYear(extractedData.year);
      validatedData.year = yearValidation.cleanedValue;
      fieldConfidence.year = yearValidation.confidence;
      if (!yearValidation.isValid) {
        invalidFields.push({ field: 'year', issue: yearValidation.issue });
      }
      if (yearValidation.isSuspicious) {
        suspiciousFlags.push(`Year: ${yearValidation.suspiciousReason}`);
      }
    }
    
    // Date Validation (comprehensive)
    const dateFields = ['issueDate', 'expirationDate', 'effectiveDate'];
    const dateValidationResults: { [key: string]: boolean } = {};
    let hasExpiredDocs = false;
    
    dateFields.forEach(dateField => {
      if (extractedData[dateField]) {
        const dateValidation = this.validateDate(extractedData[dateField], dateField);
        validatedData[dateField] = dateValidation.cleanedValue;
        fieldConfidence[dateField] = dateValidation.confidence;
        dateValidationResults[dateField] = dateValidation.isValid;
        
        if (!dateValidation.isValid) {
          invalidFields.push({ field: dateField, issue: dateValidation.issue });
        }
        if (dateValidation.isExpired) {
          hasExpiredDocs = true;
        }
        if (dateValidation.isSuspicious) {
          suspiciousFlags.push(`${dateField}: ${dateValidation.suspiciousReason}`);
        }
      }
    });
    
    // Driver Name Validation
    if (extractedData.driverName) {
      const nameValidation = this.validateDriverName(extractedData.driverName);
      validatedData.driverName = nameValidation.cleanedValue;
      fieldConfidence.driverName = nameValidation.confidence;
      if (!nameValidation.isValid) {
        invalidFields.push({ field: 'driverName', issue: nameValidation.issue });
      }
    }
    
    // License Number Validation (CDL)
    if (extractedData.licenseNumber) {
      const licenseValidation = this.validateLicenseNumber(extractedData.licenseNumber);
      validatedData.licenseNumber = licenseValidation.cleanedValue;
      fieldConfidence.licenseNumber = licenseValidation.confidence;
      if (!licenseValidation.isValid) {
        invalidFields.push({ field: 'licenseNumber', issue: licenseValidation.issue });
      }
    }
    
    // Policy Number Validation
    if (extractedData.policyNumber) {
      const policyValidation = this.validatePolicyNumber(extractedData.policyNumber);
      validatedData.policyNumber = policyValidation.cleanedValue;
      fieldConfidence.policyNumber = policyValidation.confidence;
      if (!policyValidation.isValid) {
        invalidFields.push({ field: 'policyNumber', issue: policyValidation.issue });
      }
    }
    
    // Coverage Amount Validation
    if (extractedData.coverageAmount) {
      const coverageValidation = this.validateCoverageAmount(extractedData.coverageAmount);
      validatedData.coverageAmount = coverageValidation.cleanedValue;
      fieldConfidence.coverageAmount = coverageValidation.confidence;
      if (!coverageValidation.isValid) {
        invalidFields.push({ field: 'coverageAmount', issue: coverageValidation.issue });
      }
      if (coverageValidation.isSuspicious) {
        suspiciousFlags.push(`Coverage: ${coverageValidation.suspiciousReason}`);
      }
    }
    
    // State Validation
    if (extractedData.state) {
      const stateValidation = this.validateState(extractedData.state);
      validatedData.state = stateValidation.cleanedValue;
      fieldConfidence.state = stateValidation.confidence;
      if (!stateValidation.isValid) {
        invalidFields.push({ field: 'state', issue: stateValidation.issue });
      }
    }
    
    // Copy other fields with basic validation
    const otherFields = ['registrationNumber', 'insuranceCompany', 'medicalExaminerName', 
                         'medicalCertificateNumber', 'restrictions', 'endorsements', 
                         'ownerName', 'documentNumber', 'authority', 'status', 'licenseClass'];
    
    otherFields.forEach(field => {
      if (extractedData[field]) {
        const basicValidation = this.validateGenericField(extractedData[field], field);
        validatedData[field] = basicValidation.cleanedValue;
        fieldConfidence[field] = basicValidation.confidence;
        if (!basicValidation.isValid) {
          invalidFields.push({ field, issue: basicValidation.issue });
        }
      }
    });
    
    // Calculate critical fields for document type
    const criticalFields = this.getCriticalFields(documentType);
    const missingCriticalFields = criticalFields.filter(field => !validatedData[field] || validatedData[field] === '');
    
    // Calculate overall quality score
    const totalFields = Object.keys(validatedData).length;
    const validFields = Object.keys(validatedData).filter(field => fieldConfidence[field] > 0.6).length;
    const completenessScore = totalFields > 0 ? validFields / totalFields : 0;
    const confidenceScore = Object.values(fieldConfidence).reduce((sum, conf) => sum + conf, 0) / Object.keys(fieldConfidence).length || 0;
    const qualityScore = (completenessScore * 0.4 + confidenceScore * 0.6);
    
    // Adjust overall confidence based on validation results
    const originalConfidence = parsed.confidence || 0.5;
    let adjustedConfidence = originalConfidence;
    
    // Reduce confidence for invalid fields
    if (invalidFields.length > 0) {
      adjustedConfidence *= Math.max(0.3, 1 - (invalidFields.length * 0.1));
    }
    
    // Reduce confidence for missing critical fields
    if (missingCriticalFields.length > 0) {
      adjustedConfidence *= Math.max(0.4, 1 - (missingCriticalFields.length * 0.15));
    }
    
    // Reduce confidence for suspicious data
    if (suspiciousFlags.length > 0) {
      adjustedConfidence *= Math.max(0.5, 1 - (suspiciousFlags.length * 0.1));
    }
    
    // Generate processing notes
    if (invalidFields.length > 0) {
      processingNotes.push(`Validation issues found: ${invalidFields.map(f => f.field).join(', ')}`);
    }
    if (missingCriticalFields.length > 0) {
      processingNotes.push(`Missing critical fields: ${missingCriticalFields.join(', ')}`);
    }
    if (suspiciousFlags.length > 0) {
      processingNotes.push(`Suspicious data detected: ${suspiciousFlags.join('; ')}`);
    }
    if (hasExpiredDocs) {
      processingNotes.push('Document appears to be expired - requires immediate attention');
    }
    
    // Determine if review is required
    const requiresReview = adjustedConfidence < 0.7 || 
                          invalidFields.length > 2 || 
                          missingCriticalFields.length > 1 || 
                          hasExpiredDocs ||
                          suspiciousFlags.length > 0;
    
    // Determine auto-approval eligibility
    const autoApprovalRecommended = adjustedConfidence >= 0.9 && 
                                   invalidFields.length === 0 && 
                                   missingCriticalFields.length === 0 && 
                                   !hasExpiredDocs && 
                                   suspiciousFlags.length === 0;
    
    console.log(`✅ Validation complete: ${Object.keys(fieldConfidence).length} fields validated, ${invalidFields.length} invalid, confidence: ${originalConfidence.toFixed(2)} → ${adjustedConfidence.toFixed(2)}`);
    
    return {
      validatedData,
      fieldConfidence,
      dataQuality: {
        isComplete: missingCriticalFields.length === 0,
        missingCriticalFields,
        invalidFields,
        qualityScore
      },
      validationResults: {
        vinValid: !invalidFields.some(f => f.field === 'vin'),
        datesRealistic: !invalidFields.some(f => dateFields.includes(f.field)),
        documentsExpired: hasExpiredDocs,
        requiresImmediateAction: hasExpiredDocs || suspiciousFlags.length > 2
      },
      adjustedConfidence,
      processingNotes,
      requiresReview,
      autoApprovalRecommended
    };
  }

  /**
   * Get critical fields for a document type
   */
  private getCriticalFields(documentType: string): string[] {
    switch (documentType) {
      case 'registration':
        return ['vin', 'licensePlate', 'expirationDate', 'state'];
      case 'insurance':
        return ['vin', 'policyNumber', 'expirationDate', 'insuranceCompany'];
      case 'medical_certificate':
        return ['driverName', 'expirationDate', 'medicalCertificateNumber'];
      case 'cdl_license':
        return ['driverName', 'licenseNumber', 'expirationDate', 'state'];
      case 'inspection':
        return ['vin', 'expirationDate'];
      case 'permit':
        return ['vin', 'expirationDate'];
      default:
        return ['vin', 'expirationDate'];
    }
  }

  // =================================
  // INDIVIDUAL FIELD VALIDATION METHODS
  // =================================

  /**
   * Validate VIN format and detect suspicious patterns
   */
  private validateVIN(vin: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
    isSuspicious?: boolean;
    suspiciousReason?: string;
  } {
    const cleaned = vin.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // VIN must be exactly 17 characters
    if (cleaned.length !== 17) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: `VIN must be 17 characters, got ${cleaned.length}`
      };
    }
    
    // VIN cannot contain I, O, Q
    if (/[IOQ]/.test(cleaned)) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.3,
        issue: 'VIN cannot contain letters I, O, or Q'
      };
    }
    
    // Check for suspicious patterns
    let isSuspicious = false;
    let suspiciousReason = '';
    
    // All same character (fake VIN)
    if (/^(.)\1{16}$/.test(cleaned)) {
      isSuspicious = true;
      suspiciousReason = 'All characters are identical';
    }
    
    // Sequential characters
    else if (cleaned === '12345678901234567' || cleaned === 'ABCDEFGHIJKLMNOPQ') {
      isSuspicious = true;
      suspiciousReason = 'Sequential pattern detected';
    }
    
    // Very common test VINs
    else if (['1HGCM82633A004352', '1GTCS14E3Y8123456', 'JH4TB2H26CC000000'].includes(cleaned)) {
      isSuspicious = true;
      suspiciousReason = 'Common test/dummy VIN';
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence: isSuspicious ? 0.7 : 0.95,
      isSuspicious,
      suspiciousReason
    };
  }

  /**
   * Validate license plate format
   */
  private validateLicensePlate(plate: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = plate.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // License plates are typically 2-8 characters
    if (cleaned.length < 2 || cleaned.length > 8) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.3,
        issue: `License plate length invalid: ${cleaned.length} characters`
      };
    }
    
    // Must contain at least one letter or number
    if (!/[A-Z0-9]/.test(cleaned)) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: 'License plate must contain letters or numbers'
      };
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence: 0.9
    };
  }

  /**
   * Validate vehicle make
   */
  private validateVehicleMake(make: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = make.toString().trim().toUpperCase();
    
    if (cleaned.length < 2) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: 'Vehicle make too short'
      };
    }
    
    // Known commercial vehicle manufacturers
    const knownMakes = [
      'FREIGHTLINER', 'PETERBILT', 'KENWORTH', 'VOLVO', 'MACK', 'INTERNATIONAL', 
      'STERLING', 'WESTERN STAR', 'ISUZU', 'HINO', 'FORD', 'CHEVROLET', 'GMC', 
      'DODGE', 'RAM', 'NAVISTAR', 'PACCAR'
    ];
    
    const confidence = knownMakes.some(known => cleaned.includes(known)) ? 0.95 : 0.7;
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence
    };
  }

  /**
   * Validate vehicle model
   */
  private validateVehicleModel(model: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = model.toString().trim().toUpperCase();
    
    if (cleaned.length < 1) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: 'Vehicle model cannot be empty'
      };
    }
    
    // Known commercial vehicle models
    const knownModels = [
      'CASCADIA', 'CENTURY', 'COLUMBIA', 'CORONADO', 'W900', 'T800', 'T680', 
      'VNL', 'VNM', 'ANTHEM', 'PINNACLE', 'LR', 'MR', 'WX', 'GRANITE'
    ];
    
    const confidence = knownModels.some(known => cleaned.includes(known)) ? 0.95 : 0.7;
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence
    };
  }

  /**
   * Validate vehicle year
   */
  private validateYear(year: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
    isSuspicious?: boolean;
    suspiciousReason?: string;
  } {
    const cleaned = year.toString().replace(/[^0-9]/g, '');
    const yearNum = parseInt(cleaned);
    const currentYear = new Date().getFullYear();
    
    if (isNaN(yearNum) || cleaned.length !== 4) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: 'Year must be a 4-digit number'
      };
    }
    
    // Valid range for commercial vehicles
    if (yearNum < 1990 || yearNum > currentYear + 1) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.3,
        issue: `Year ${yearNum} outside valid range (1990-${currentYear + 1})`
      };
    }
    
    // Check for suspicious years
    let isSuspicious = false;
    let suspiciousReason = '';
    
    if (yearNum > currentYear) {
      isSuspicious = true;
      suspiciousReason = 'Future year detected';
    } else if (yearNum < 2000) {
      isSuspicious = true;
      suspiciousReason = 'Very old vehicle (pre-2000)';
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence: isSuspicious ? 0.7 : 0.9,
      isSuspicious,
      suspiciousReason
    };
  }

  /**
   * Validate date fields
   */
  private validateDate(dateStr: string, fieldType: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
    isExpired?: boolean;
    isSuspicious?: boolean;
    suspiciousReason?: string;
  } {
    const cleaned = dateStr.toString().trim();
    const date = new Date(cleaned);
    const now = new Date();
    
    if (isNaN(date.getTime())) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: 'Invalid date format'
      };
    }
    
    const year = date.getFullYear();
    if (year < 1990 || year > 2050) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.3,
        issue: `Date year ${year} outside reasonable range`
      };
    }
    
    // Check if expired
    const isExpired = fieldType === 'expirationDate' && date < now;
    
    // Check for suspicious dates
    let isSuspicious = false;
    let suspiciousReason = '';
    
    if (fieldType === 'expirationDate') {
      const yearsFromNow = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (yearsFromNow > 10) {
        isSuspicious = true;
        suspiciousReason = 'Expiration date more than 10 years in future';
      } else if (yearsFromNow < -5) {
        isSuspicious = true;
        suspiciousReason = 'Expiration date more than 5 years in past';
      }
    }
    
    if (fieldType === 'issueDate' && date > now) {
      isSuspicious = true;
      suspiciousReason = 'Issue date is in the future';
    }
    
    return {
      isValid: true,
      cleanedValue: date.toISOString().split('T')[0], // YYYY-MM-DD format
      confidence: isSuspicious ? 0.6 : (isExpired ? 0.7 : 0.9),
      isExpired,
      isSuspicious,
      suspiciousReason
    };
  }

  /**
   * Validate driver name
   */
  private validateDriverName(name: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = name.toString().trim().replace(/\s+/g, ' ');
    
    if (cleaned.length < 2) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: 'Driver name too short'
      };
    }
    
    // Must contain at least one space (first and last name)
    if (!cleaned.includes(' ')) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.4,
        issue: 'Driver name should include first and last name'
      };
    }
    
    // Should only contain letters, spaces, apostrophes, hyphens
    if (!/^[A-Za-z\s'\-\.]+$/.test(cleaned)) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.3,
        issue: 'Driver name contains invalid characters'
      };
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned.toUpperCase(),
      confidence: 0.9
    };
  }

  /**
   * Validate license number (CDL)
   */
  private validateLicenseNumber(license: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = license.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (cleaned.length < 6 || cleaned.length > 15) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.3,
        issue: `License number length invalid: ${cleaned.length} characters`
      };
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence: 0.9
    };
  }

  /**
   * Validate policy number
   */
  private validatePolicyNumber(policy: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = policy.toString().trim();
    
    if (cleaned.length < 3) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.2,
        issue: 'Policy number too short'
      };
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned.toUpperCase(),
      confidence: 0.85
    };
  }

  /**
   * Validate coverage amount
   */
  private validateCoverageAmount(coverage: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
    isSuspicious?: boolean;
    suspiciousReason?: string;
  } {
    // Extract numeric value from string
    const numericStr = coverage.toString().replace(/[^0-9.]/g, '');
    const amount = parseFloat(numericStr);
    
    if (isNaN(amount) || amount <= 0) {
      return {
        isValid: false,
        cleanedValue: coverage.toString(),
        confidence: 0.2,
        issue: 'Coverage amount must be a positive number'
      };
    }
    
    // Check for suspicious amounts
    let isSuspicious = false;
    let suspiciousReason = '';
    
    // Commercial vehicles typically need $750K+ coverage
    if (amount < 750000) {
      isSuspicious = true;
      suspiciousReason = 'Coverage amount below commercial minimum ($750K)';
    } else if (amount > 10000000) {
      isSuspicious = true;
      suspiciousReason = 'Unusually high coverage amount (>$10M)';
    }
    
    return {
      isValid: true,
      cleanedValue: amount.toString(),
      confidence: isSuspicious ? 0.6 : 0.9,
      isSuspicious,
      suspiciousReason
    };
  }

  /**
   * Validate US state codes
   */
  private validateState(state: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = state.toString().toUpperCase().trim();
    
    const validStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 
      'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 
      'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 
      'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 
      'WI', 'WY', 'DC'
    ];
    
    if (cleaned.length !== 2 || !validStates.includes(cleaned)) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.3,
        issue: 'Invalid US state code'
      };
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence: 0.95
    };
  }

  /**
   * Generic field validation for other fields
   */
  private validateGenericField(value: any, fieldName: string): {
    isValid: boolean;
    cleanedValue: string;
    confidence: number;
    issue?: string;
  } {
    const cleaned = value.toString().trim();
    
    if (cleaned.length === 0) {
      return {
        isValid: false,
        cleanedValue: cleaned,
        confidence: 0.1,
        issue: 'Field cannot be empty'
      };
    }
    
    // Basic length validation
    if (cleaned.length > 200) {
      return {
        isValid: false,
        cleanedValue: cleaned.substring(0, 200),
        confidence: 0.4,
        issue: 'Field value too long'
      };
    }
    
    return {
      isValid: true,
      cleanedValue: cleaned,
      confidence: 0.8
    };
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
   * Preprocess document text to filter noise and correct OCR errors
   */
  private preprocessDocumentText(text: string): string {
    console.log('🧹 Preprocessing document text to filter noise and correct OCR errors...');
    
    let cleanedText = text;
    
    // Step 1: Filter out common document noise patterns
    cleanedText = this.filterDocumentNoise(cleanedText);
    
    // Step 2: Apply OCR error corrections
    cleanedText = this.correctOCRErrors(cleanedText);
    
    // Step 3: Clean up whitespace and formatting
    cleanedText = this.normalizeWhitespace(cleanedText);
    
    console.log(`✅ Text preprocessing complete: ${text.length} → ${cleanedText.length} characters`);
    return cleanedText;
  }

  /**
   * Filter out common document noise (headers, footers, boilerplate)
   */
  private filterDocumentNoise(text: string): string {
    const lines = text.split('\n');
    const filteredLines: string[] = [];
    
    // Patterns to identify noise
    const noisePatterns = [
      // Page numbers and headers
      /^\s*Page\s+\d+\s+of\s+\d+\s*$/i,
      /^\s*\d+\s*$/,  // Standalone numbers (likely page numbers)
      /^\s*\d+\s*\/\s*\d+\s*$/,  // Page numbers like "1/2"
      
      // Common form boilerplate
      /for\s+office\s+use\s+only/i,
      /do\s+not\s+write\s+(below|above)\s+this\s+line/i,
      /^\s*instructions:\s*/i,
      /^\s*please\s+(print|type)\s+(clearly|legibly)/i,
      
      // Legal disclaimers and privacy notices
      /privacy\s+(policy|notice|statement)/i,
      /terms\s+(and|&)\s+conditions/i,
      /^\s*disclaimer:\s*/i,
      /confidential\s+and\s+proprietary/i,
      
      // Watermarks and stamps
      /^\s*(copy|duplicate|original|certified)\s*$/i,
      /^\s*watermark\s*$/i,
      /^\s*void\s+if\s+altered\s*$/i,
      
      // Form field labels without data
      /^\s*_+\s*$/,  // Lines with only underscores
      /^\s*\[\s*\]\s*$/,  // Empty checkboxes
      /^\s*signature:\s*_*\s*$/i,
      /^\s*date:\s*_*\s*$/i,
      
      // Barcode and reference data
      /^\s*barcode[:;]?\s*[\d\*]+\s*$/i,
      /^\s*\*[\d\*]+\*\s*$/,  // Barcode format
      /^\s*control\s+(number|#)[:;]?\s*[\w\d]+\s*$/i,
      
      // Very short lines (likely fragments)
      /^\s*.{1,2}\s*$/  // Lines with 1-2 characters only
    ];
    
    // Common noise phrases to remove entirely
    const noisePhrases = [
      'For office use only',
      'Do not write below this line',
      'Please print clearly',
      'Form approved',
      'OMB No.',
      'Paperwork Reduction Act',
      'Public reporting burden',
      'Privacy Act Statement',
      'Federal Register'
    ];
    
    for (const line of lines) {
      // Skip if line matches noise patterns
      const isNoise = noisePatterns.some(pattern => pattern.test(line));
      
      if (!isNoise) {
        // Remove noise phrases from the line
        let cleanLine = line;
        for (const phrase of noisePhrases) {
          cleanLine = cleanLine.replace(new RegExp(phrase, 'gi'), '');
        }
        
        // Keep the line if it has meaningful content after cleanup
        cleanLine = cleanLine.trim();
        if (cleanLine.length > 3) {  // Minimum meaningful content
          filteredLines.push(cleanLine);
        }
      }
    }
    
    return filteredLines.join('\n');
  }

  /**
   * Correct common OCR errors
   */
  private correctOCRErrors(text: string): string {
    let correctedText = text;
    
    // Character substitution patterns (most common OCR errors)
    const ocrCorrections = [
      // Number/letter confusion
      { pattern: /(?<!\d)0(?=\d{2,})/g, replacement: 'O' },  // 0 → O in letter contexts
      { pattern: /(?<=\d)O(?=\d)/g, replacement: '0' },      // O → 0 in number contexts
      { pattern: /(?<!\w)1(?=\w{2,})/g, replacement: 'I' },  // 1 → I in letter contexts
      { pattern: /(?<=\w)I(?=\d)/g, replacement: '1' },      // I → 1 in number contexts
      { pattern: /(?<!\w)l(?=\w{2,})/g, replacement: 'I' },  // l → I in letter contexts
      
      // Common character misreads
      { pattern: /5(?=[A-Z]{2,})/g, replacement: 'S' },     // 5 → S in letter contexts
      { pattern: /8(?=[A-Z]{2,})/g, replacement: 'B' },     // 8 → B in letter contexts
      { pattern: /6(?=[A-Z]{2,})/g, replacement: 'G' },     // 6 → G in letter contexts
      
      // Letter combination fixes
      { pattern: /\brn\b/g, replacement: 'm' },            // rn → m
      { pattern: /\bvv\b/g, replacement: 'w' },            // vv → w
      { pattern: /\bcl\b/g, replacement: 'd' },            // cl → d
      { pattern: /\bii\b/g, replacement: 'll' },           // ii → ll
      
      // Fix spaced-out VINs (common OCR issue)
      { pattern: /\b([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\b/g, 
        replacement: '$1$2$3$4$5$6$7$8$9$10$11$12$13$14$15$16$17' },
      
      // Fix spaced license plates
      { pattern: /\b([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])\b/g, 
        replacement: '$1$2$3$4$5$6' },
      
      // Date format corrections
      { pattern: /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, replacement: '$1/$2/$3' },
      { pattern: /(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{2,4})/g, replacement: '$1-$2-$3' },
      { pattern: /(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{2,4})/g, replacement: '$1/$2/$3' },
      
      // Policy number spacing fixes
      { pattern: /policy\s*#?:?\s*([A-Z0-9])\s+([A-Z0-9])\s+([A-Z0-9])/gi, 
        replacement: 'Policy: $1$2$3' },
      
      // VIN label fixes
      { pattern: /VlN\s*[:;]?/gi, replacement: 'VIN:' },     // VlN → VIN
      { pattern: /V1N\s*[:;]?/gi, replacement: 'VIN:' },     // V1N → VIN
      
      // State code fixes
      { pattern: /\bCA\s+L\b/g, replacement: 'CAL' },       // CA L → CAL (California)
      { pattern: /\bN\s+Y\b/g, replacement: 'NY' },         // N Y → NY
      { pattern: /\bF\s+L\b/g, replacement: 'FL' },         // F L → FL
      
      // Vehicle make corrections
      { pattern: /FREIGHTL1NER/gi, replacement: 'FREIGHTLINER' },
      { pattern: /PETERBILT/gi, replacement: 'PETERBILT' },
      { pattern: /KENW0RTH/gi, replacement: 'KENWORTH' },
      { pattern: /V0LV0/gi, replacement: 'VOLVO' },
      { pattern: /INTERNATI0NAL/gi, replacement: 'INTERNATIONAL' },
    ];
    
    // Apply all corrections
    for (const correction of ocrCorrections) {
      correctedText = correctedText.replace(correction.pattern, correction.replacement);
    }
    
    return correctedText;
  }

  /**
   * Normalize whitespace and formatting
   */
  private normalizeWhitespace(text: string): string {
    return text
      // Convert multiple spaces to single space
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace from each line
      .split('\n')
      .map(line => line.trim())
      // Remove empty lines
      .filter(line => line.length > 0)
      // Rejoin with single newlines
      .join('\n')
      .trim();
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
        sum + (r.data?.dataQuality?.qualityScore || 0), 0) / successfulResults.length;
        
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
            
            // Categorize review reasons (with safe array access)
            if (data.confidence < 0.8) stats.reviewReasons.lowConfidence++;
            if ((data.dataQuality?.missingCriticalFields?.length || 0) > 0) stats.reviewReasons.missingFields++;
            if ((data.dataQuality?.invalidFields?.length || 0) > 0) stats.reviewReasons.invalidData++;
            if (data.conflicts?.hasConflicts) stats.reviewReasons.conflicts++;
            if (data.validationResults?.documentsExpired) stats.reviewReasons.expiredDocs++;
            if ((data.dataQuality?.qualityScore || 0) < 0.6) stats.reviewReasons.poorQuality++;
          }
          
          if (data.autoApprovalRecommended) stats.autoApprovalRecommended++;
          if (data.conflicts?.hasConflicts) stats.conflictsDetected++;
          if ((data.dataQuality?.invalidFields?.length || 0) > 0) stats.invalidDataFound++;
          if ((data.dataQuality?.missingCriticalFields?.length || 0) > 0) stats.missingCriticalFields++;
          if (data.validationResults?.documentsExpired) stats.expiredDocuments++;
          
          // Quality metrics
          if (data.confidence >= 0.9 && data.dataQuality?.isComplete) {
            stats.highQualityDocuments++;
          }
          
          // Validation metrics
          if (!data.validationResults?.vinValid) stats.vinValidationFailures++;
          if (!data.validationResults?.datesRealistic) stats.dateValidationFailures++;
          
          // Completeness
          if (data.dataQuality?.isComplete) {
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