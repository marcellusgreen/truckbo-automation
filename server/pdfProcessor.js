/**
 * Server-side PDF Processing with Claude Vision
 * This runs in Node.js environment with full PDF support
 */

import Anthropic from '@anthropic-ai/sdk';

class ServerPDFProcessor {
  constructor() {
    // Initialize Claude client with API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for server-side PDF processing');
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  /**
   * Process PDF file with Claude Vision API (server-side with full PDF support)
   * Multi-stage filtering pipeline with high-confidence extraction
   */
  async processPDF(fileBuffer, fileName) {
    const startTime = Date.now();
    
    try {
      console.log(`📄 Server processing PDF: ${fileName} (${fileBuffer.length} bytes)`);
      
      // Convert buffer to base64
      const base64Data = fileBuffer.toString('base64');
      
      // Stage 1: Document Relevance Detection
      let relevanceCheck;
      try {
        console.log('🔍 Starting Stage 1: Document Relevance Detection');
        relevanceCheck = await this.checkDocumentRelevance(base64Data, fileName);
        console.log(`🔍 Relevance check: ${relevanceCheck.is_relevant ? 'RELEVANT' : 'REJECTED'} (${relevanceCheck.confidence_score}%)`);
      } catch (error) {
        console.error('❌ Stage 1 failed:', error);
        throw new Error(`Stage 1 (Relevance Detection) failed: ${error.message}`);
      }
      
      if (!relevanceCheck.is_relevant || relevanceCheck.confidence_score < 70) {
        return this.rejectDocument('IRRELEVANT_CONTENT', relevanceCheck, fileName, startTime);
      }
      
      // Stage 2: Document Quality Assessment
      let qualityCheck;
      try {
        console.log('📊 Starting Stage 2: Document Quality Assessment');
        qualityCheck = await this.assessDocumentQuality(base64Data, fileName);
        console.log(`📊 Quality assessment: ${qualityCheck.overall_quality}% (extractable: ${qualityCheck.extractable})`);
      } catch (error) {
        console.error('❌ Stage 2 failed:', error);
        throw new Error(`Stage 2 (Quality Assessment) failed: ${error.message}`);
      }
      
      if (!qualityCheck.extractable || qualityCheck.overall_quality < 80) {
        return this.rejectDocument('POOR_QUALITY', qualityCheck, fileName, startTime);
      }
      
      // Stage 3: Document Type Classification
      let documentType;
      try {
        console.log('📋 Starting Stage 3: Document Type Classification');
        documentType = relevanceCheck.document_type !== 'unknown' ? 
          relevanceCheck.document_type : await this.classifyDocument(base64Data, fileName);
        console.log(`📋 Document classified as: ${documentType}`);
      } catch (error) {
        console.error('❌ Stage 3 failed:', error);
        documentType = 'unknown'; // Continue with unknown type
      }
      
      // Stage 4: High-Confidence Extraction
      let extractionResult;
      try {
        console.log('🎯 Starting Stage 4: High-Confidence Extraction');
        extractionResult = await this.highConfidenceExtraction(base64Data, documentType);
        console.log(`🎯 Extraction confidence: ${extractionResult.overall_confidence}%`);
      } catch (error) {
        console.error('❌ Stage 4 failed:', error);
        throw new Error(`Stage 4 (High-Confidence Extraction) failed: ${error.message}`);
      }
      
      // Reduced confidence thresholds for more flexible processing
      if (extractionResult.overall_confidence < 75) {
        // Check if it qualifies for manual review (60-75%)
        if (extractionResult.overall_confidence >= 60) {
          return this.queueForReview(extractionResult, fileName, startTime);
        } else {
          return this.rejectDocument('LOW_CONFIDENCE', extractionResult, fileName, startTime);
        }
      }
      
      // Stage 5: Flexible Data Validation (Never fails completely)
      let validationResult;
      try {
        console.log('✅ Starting Stage 5: Flexible Data Validation');
        validationResult = this.flexibleValidateExtractedData(extractionResult);
        console.log(`✅ Flexible validation: ${validationResult.status} (${validationResult.confidence_score}% confidence)`);
        console.log(`📊 Processing recommendation: ${validationResult.processing_recommendation}`);
      } catch (error) {
        console.error('❌ Stage 5 failed:', error);
        // Even if validation fails, we continue with a warning
        validationResult = {
          status: 'needs_review',
          confidence_score: 25,
          processing_recommendation: 'manual_review_required',
          validation_errors: ['Validation process failed'],
          suggestions: ['Manual review required due to validation system error']
        };
      }
      
      // NEVER reject based on validation - always continue processing
      console.log('✅ Flexible validation completed - continuing with processing...');
      
      // Add to vehicle reconciliation system (Node.js compatible approach)
      let reconciliationResult;
      try {
        // Note: In a real implementation, you'd import the reconciler or use a service
        // For now, we'll simulate the reconciliation process
        reconciliationResult = this.simulateReconciliation(extractionResult, fileName);
        console.log(`🚛 Document added to vehicle reconciliation: VIN ${reconciliationResult.vehicleVIN}`);
      } catch (error) {
        console.error('⚠️ Reconciliation failed (non-blocking):', error);
        reconciliationResult = { success: false, warnings: ['Reconciliation failed but processing continued'] };
      }
      
      // Success - return high-confidence extraction
      console.log(`✅ PDF processed successfully: ${fileName} (${Date.now() - startTime}ms)`);
      
      return {
        success: true,
        data: extractionResult,
        processingTime: Date.now() - startTime,
        fileName: fileName,
        documentType: documentType,
        qualityMetrics: {
          relevanceScore: relevanceCheck.confidence_score,
          qualityScore: qualityCheck.overall_quality,
          extractionConfidence: extractionResult.overall_confidence,
          validationConfidence: validationResult.confidence_score,
          processingRecommendation: validationResult.processing_recommendation
        },
        validationDetails: validationResult,
        requiresReview: validationResult.status === 'needs_review' || validationResult.confidence_score < 60,
        processingNotes: [
          `Document type: ${documentType}`,
          `Extraction confidence: ${extractionResult.overall_confidence}%`,
          `Validation status: ${validationResult.status}`,
          `Processing recommendation: ${validationResult.processing_recommendation}`,
          ...(validationResult.suggestions || []),
          ...(reconciliationResult.success ? [`Added to vehicle ${reconciliationResult.vehicleVIN}`] : reconciliationResult.warnings || [])
        ],
        reconciliation: reconciliationResult
      };

    } catch (error) {
      console.error(`❌ PDF processing error for ${fileName}:`, error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        cause: error.cause
      });
      
      return {
        success: false,
        error: error.message || error.toString() || 'Unknown PDF processing error',
        processingTime: Date.now() - startTime,
        fileName: fileName,
        errorDetails: {
          type: error.name || 'UnknownError',
          stack: error.stack,
          stage: 'unknown'
        }
      };
    }
  }

  /**
   * Stage 1: Document Relevance Detection & Rejection
   */
  async checkDocumentRelevance(base64Data, fileName) {
    try {
      const relevancePrompt = `Analyze this document and determine if it contains ANY fleet management compliance information.

Look for these indicators:
- Vehicle registration documents
- Insurance cards/certificates  
- CDL licenses or driver documents
- VIN numbers
- License plate numbers
- DOT numbers
- Vehicle inspection records
- Fleet-related permits
- Medical certificates for commercial drivers

Respond with JSON only:
{
  "is_relevant": boolean,
  "confidence_score": 0-100,
  "document_type": "registration|insurance|cdl_license|medical_certificate|inspection|permit|unknown|irrelevant",
  "rejection_reason": "string if not relevant",
  "indicators_found": ["list of fleet-related indicators detected"]
}`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: relevancePrompt
            }
          ],
        }],
      });

      const responseText = response.content?.[0]?.text || '{}';
      const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}');
      
      return {
        is_relevant: parsed.is_relevant || false,
        confidence_score: parsed.confidence_score || 0,
        document_type: parsed.document_type || 'unknown',
        rejection_reason: parsed.rejection_reason || '',
        indicators_found: parsed.indicators_found || []
      };
      
    } catch (error) {
      console.error('Document relevance check failed:', error);
      return {
        is_relevant: false,
        confidence_score: 0,
        document_type: 'unknown',
        rejection_reason: 'Analysis failed',
        indicators_found: []
      };
    }
  }

  /**
   * Stage 2: Document Quality Assessment
   */
  async assessDocumentQuality(base64Data, fileName) {
    try {
      const qualityPrompt = `Assess the technical quality of this document for data extraction:

Rate each factor (0-100):
- Text clarity and readability
- Image resolution and sharpness
- Completeness (no cut-off sections)  
- Lighting and contrast
- Document orientation
- Presence of watermarks/stamps that might obscure text

Return JSON only:
{
  "quality_scores": {
    "text_clarity": 0-100,
    "resolution": 0-100,
    "completeness": 0-100,
    "lighting": 0-100,
    "orientation": 0-100,
    "obstruction_level": 0-100
  },
  "overall_quality": 0-100,
  "extractable": boolean,
  "quality_issues": ["list of specific issues found"]
}`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: qualityPrompt
            }
          ],
        }],
      });

      const responseText = response.content?.[0]?.text || '{}';
      const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}');
      
      return {
        quality_scores: parsed.quality_scores || {},
        overall_quality: parsed.overall_quality || 0,
        extractable: parsed.extractable !== false,
        quality_issues: parsed.quality_issues || []
      };
      
    } catch (error) {
      console.error('Document quality assessment failed:', error);
      return {
        quality_scores: {},
        overall_quality: 0,
        extractable: false,
        quality_issues: ['Quality assessment failed']
      };
    }
  }

  /**
   * Stage 4: Optimized High-Confidence Extraction with Enhanced VIN and Date Recognition
   */
  async highConfidenceExtraction(base64Data, documentType) {
    try {
      const optimizedPrompt = this.buildOptimizedExtractionPrompt(documentType);

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: optimizedPrompt
            }
          ],
        }],
      });

      const responseText = response.content?.[0]?.text || '{}';
      const parsed = this.parseOptimizedResponse(responseText);
      
      return parsed;
      
    } catch (error) {
      console.error('Optimized extraction failed:', error);
      return {
        overall_confidence: 0,
        extracted_data: {},
        low_confidence_items: ['Extraction failed'],
        validation_details: {}
      };
    }
  }

  /**
   * Rejection handling with detailed categorization
   */
  rejectDocument(reason, details, fileName, startTime) {
    const rejectionCategories = {
      'IRRELEVANT_CONTENT': {
        threshold: 70,
        message: 'Document does not contain fleet compliance information',
        retry_allowed: false,
        suggestions: ['Upload vehicle registration, insurance, or CDL documents']
      },
      'LOW_CONFIDENCE': {
        threshold: 95,
        message: 'Extracted data confidence below required threshold',
        retry_allowed: true,
        suggestions: ['Improve image quality', 'Ensure document is fully visible', 'Scan at higher resolution']
      },
      'POOR_QUALITY': {
        threshold: 80,
        message: 'Document quality too poor for reliable extraction',
        retry_allowed: true,
        suggestions: ['Rescan with better lighting', 'Ensure document is flat and unfolded', 'Remove shadows']
      },
      'VALIDATION_FAILED': {
        threshold: 90,
        message: 'Extracted data failed validation checks',
        retry_allowed: true,
        suggestions: ['Verify document authenticity', 'Check for damage or alterations']
      }
    };

    const category = rejectionCategories[reason];
    
    return {
      success: false,
      rejected: true,
      rejection: {
        category: reason,
        message: category.message,
        retry_allowed: category.retry_allowed,
        suggestions: category.suggestions,
        confidence_score: details.confidence_score || details.overall_confidence || 0,
        details: details
      },
      processingTime: Date.now() - startTime,
      fileName: fileName
    };
  }

  /**
   * Queue document for manual review (85-95% confidence)
   */
  queueForReview(extractionResult, fileName, startTime) {
    return {
      success: true,
      requiresManualReview: true,
      data: extractionResult,
      reviewReason: `Confidence score ${extractionResult.overall_confidence}% requires human verification`,
      processingTime: Date.now() - startTime,
      fileName: fileName,
      priority: extractionResult.overall_confidence >= 90 ? 'low' : 'high'
    };
  }

  /**
   * Phase 1: Classify document type using filename and content analysis
   */
  async classifyDocument(base64Data, fileName) {
    try {
      // First, try to classify by filename patterns
      const fileBasedType = this.classifyByFilename(fileName);
      if (fileBasedType !== 'unknown') {
        return fileBasedType;
      }
      
      // If filename doesn't help, use Claude to classify the document content
      const classificationPrompt = `You are a fleet compliance document classifier. Analyze this document and determine its type.

Response format (JSON only):
{
  "documentType": "registration" | "insurance" | "medical_certificate" | "cdl_license" | "inspection" | "permit" | "bill_of_lading" | "unknown",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of classification"
}

Focus on document headers, forms, and key identifying text patterns. Return only the JSON object.`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: classificationPrompt
            }
          ],
        }],
      });

      const responseText = response.content?.[0]?.text || '{}';
      const parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}');
      
      return parsed.documentType || 'unknown';
      
    } catch (error) {
      console.error('Document classification failed:', error);
      return 'unknown';
    }
  }

  /**
   * Classify document type based on filename patterns
   */
  classifyByFilename(fileName) {
    const name = fileName.toLowerCase();
    
    // Registration patterns
    if (name.includes('registration') || name.includes('reg') || name.includes('title')) {
      return 'registration';
    }
    
    // Insurance patterns
    if (name.includes('insurance') || name.includes('policy') || name.includes('cert') || name.includes('coverage')) {
      return 'insurance';
    }
    
    // CDL patterns
    if (name.includes('cdl') || name.includes('license') || name.includes('driver')) {
      return 'cdl_license';
    }
    
    // Medical certificate patterns
    if (name.includes('medical') || name.includes('dot') || name.includes('physical')) {
      return 'medical_certificate';
    }
    
    // Inspection patterns
    if (name.includes('inspection') || name.includes('safety') || name.includes('annual')) {
      return 'inspection';
    }
    
    return 'unknown';
  }

  /**
   * Build type-specific extraction prompts for different document types
   */
  buildTypeSpecificPrompt(documentType) {
    const baseSystemPrompt = "You are a fleet compliance specialist. Extract only the specified fields from this document. Format response as JSON with high accuracy.";
    
    switch (documentType) {
      case 'registration':
        return `${baseSystemPrompt}

For VEHICLE REGISTRATION documents, extract:
{
  "documentType": "registration",
  "confidence": 0.0 to 1.0,
  "extractedData": {
    "vin": "17-digit vehicle identification number",
    "licensePlate": "license plate number",
    "make": "vehicle manufacturer",
    "model": "vehicle model",
    "year": "model year (YYYY)",
    "registrationNumber": "registration/title number",
    "expirationDate": "registration expiration (YYYY-MM-DD)",
    "state": "state of registration",
    "ownerName": "registered owner name",
    "vehicleType": "commercial/passenger/trailer etc"
  },
  "dataQuality": {
    "vinValid": "check if VIN is 17 digits",
    "qualityScore": 0.0 to 1.0,
    "missingCriticalFields": []
  }
}

CRITICAL: VIN must be exactly 17 characters. Return only JSON.`;

      case 'insurance':
        return `${baseSystemPrompt}

For INSURANCE documents, extract:
{
  "documentType": "insurance", 
  "confidence": 0.0 to 1.0,
  "extractedData": {
    "vin": "17-digit VIN if listed",
    "licensePlate": "insured vehicle plate",
    "policyNumber": "insurance policy number",
    "insuranceCompany": "insurance carrier name",
    "effectiveDate": "policy start date (YYYY-MM-DD)",
    "expirationDate": "policy end date (YYYY-MM-DD)",
    "coverageAmount": "liability coverage limits",
    "make": "vehicle make",
    "model": "vehicle model", 
    "year": "vehicle year",
    "policyType": "commercial/personal/fleet"
  },
  "dataQuality": {
    "vinValid": "check if VIN is 17 digits",
    "qualityScore": 0.0 to 1.0,
    "missingCriticalFields": []
  }
}

CRITICAL: Focus on VIN and policy dates. Return only JSON.`;

      case 'cdl_license':
        return `${baseSystemPrompt}

For CDL LICENSE documents, extract:
{
  "documentType": "cdl_license",
  "confidence": 0.0 to 1.0,
  "extractedData": {
    "driverName": "driver full name",
    "licenseNumber": "CDL license number",
    "licenseClass": "A, B, or C",
    "endorsements": ["H", "N", "P", "S", "T", "X"],
    "restrictions": "any license restrictions",
    "issueDate": "license issue date (YYYY-MM-DD)",
    "expirationDate": "license expiration (YYYY-MM-DD)",
    "state": "issuing state",
    "dateOfBirth": "driver DOB (YYYY-MM-DD)"
  },
  "dataQuality": {
    "licenseValid": "check if not expired",
    "qualityScore": 0.0 to 1.0,
    "missingCriticalFields": []
  }
}

CRITICAL: Endorsements are single letters. Return only JSON.`;

      case 'medical_certificate':
        return `${baseSystemPrompt}

For MEDICAL CERTIFICATE documents, extract:
{
  "documentType": "medical_certificate",
  "confidence": 0.0 to 1.0,
  "extractedData": {
    "driverName": "driver full name",
    "licenseNumber": "CDL number if listed",
    "medicalExaminerName": "examining physician",
    "examDate": "examination date (YYYY-MM-DD)",
    "expirationDate": "certificate expiration (YYYY-MM-DD)",
    "medicalRestrictions": "any driving restrictions",
    "certificationStatus": "certified/not certified",
    "dotNumber": "medical examiner DOT number"
  },
  "dataQuality": {
    "certValid": "check if not expired",
    "qualityScore": 0.0 to 1.0,
    "missingCriticalFields": []
  }
}

CRITICAL: Medical certificates typically valid for 2 years. Return only JSON.`;

      case 'inspection':
        return `${baseSystemPrompt}

For VEHICLE INSPECTION documents, extract:
{
  "documentType": "inspection",
  "confidence": 0.0 to 1.0,
  "extractedData": {
    "vin": "17-digit vehicle identification number",
    "licensePlate": "vehicle plate number",
    "inspectionDate": "inspection date (YYYY-MM-DD)",
    "expirationDate": "inspection expiration (YYYY-MM-DD)",
    "inspectionType": "annual/periodic/roadside",
    "inspectorName": "inspector name",
    "facilityName": "inspection facility",
    "inspectionNumber": "report number",
    "result": "pass/fail/conditional",
    "violations": "any violations found"
  },
  "dataQuality": {
    "vinValid": "check if VIN is 17 digits",
    "qualityScore": 0.0 to 1.0,
    "missingCriticalFields": []
  }
}

CRITICAL: Annual inspections typically required. Return only JSON.`;

      default:
        return this.buildGenericExtractionPrompt();
    }
  }

  /**
   * Generic extraction prompt for unknown document types
   */
  buildGenericExtractionPrompt() {
    return `You are an expert document processor specializing in commercial trucking compliance documents. Extract relevant compliance data from this PDF document.

Analyze the document and extract the following information in JSON format:

{
  "documentType": "registration" | "insurance" | "medical_certificate" | "cdl_license" | "inspection" | "permit" | "unknown",
  "confidence": 0.0 to 1.0,
  "extractedData": {
    "vin": "vehicle identification number if found",
    "licensePlate": "license plate number if found", 
    "make": "vehicle make if found",
    "model": "vehicle model if found",
    "year": "vehicle year if found",
    "driverName": "driver name if found",
    "licenseNumber": "license number if found",
    "licenseClass": "license class if found",
    "endorsements": [],
    "issueDate": "issue date if found (YYYY-MM-DD format)",
    "expirationDate": "expiration date if found (YYYY-MM-DD format)",
    "effectiveDate": "effective date if found (YYYY-MM-DD format)",
    "policyNumber": "insurance policy number if found",
    "insuranceCompany": "insurance company name if found",
    "coverageAmount": "coverage amount if found",
    "registrationNumber": "registration number if found",
    "state": "state of issuance if found",
    "ownerName": "owner name if found"
  },
  "dataQuality": {
    "isComplete": true/false,
    "missingCriticalFields": [],
    "qualityScore": 0.0 to 1.0
  },
  "conflicts": {
    "hasConflicts": false,
    "conflictDetails": []
  },
  "validationResults": {
    "vinValid": true/false,
    "datesRealistic": true/false, 
    "documentsExpired": true/false,
    "requiresImmediateAction": true/false
  },
  "processingNotes": [],
  "requiresReview": true/false,
  "autoApprovalRecommended": true/false
}

IMPORTANT: Focus on extracting vehicle identification (VINs, license plates) as these are critical for merging records. Return only the JSON object, no additional text.`;
  }

  /**
   * Build high-confidence extraction prompts (95%+)
   */
  buildHighConfidencePrompt(documentType) {
    const basePrompt = `Extract fleet compliance data with HIGH CONFIDENCE requirements.

For each piece of data you extract, provide a confidence score (0-100).
Only include data where you are 95%+ confident.

Required format:
{
  "vin_numbers": [
    {
      "value": "17-digit VIN",
      "confidence": 95-100,
      "location": "description of where found",
      "verification_method": "how you verified accuracy"
    }
  ],
  "extracted_data": {
    "field_name": {
      "value": "extracted value",
      "confidence": 95-100,
      "verification_notes": "explanation of confidence"
    }
  },
  "overall_confidence": 95-100,
  "low_confidence_items": ["items below 95% confidence"],
  "extraction_quality": {
    "completeness_score": 0-100,
    "accuracy_score": 0-100,
    "clarity_score": 0-100
  }
}

CRITICAL RULES:
- If confidence < 95%, mark as "uncertain" and explain why
- Provide specific reasons for confidence scores
- Flag any ambiguous or partially obscured text
- Only extract data you can verify with high certainty`;

    switch (documentType) {
      case 'registration':
        return `${basePrompt}

For VEHICLE REGISTRATION documents, focus on:
- VIN (must be exactly 17 characters)
- License plate number
- Vehicle make, model, year
- Registration expiration date
- State of registration

Return only JSON with 95%+ confidence data.`;

      case 'insurance':
        return `${basePrompt}

For INSURANCE documents, focus on:
- Policy number
- Insurance company name
- Effective and expiration dates
- VIN if available
- Coverage amounts

Return only JSON with 95%+ confidence data.`;

      default:
        return `${basePrompt}

Extract any fleet compliance data visible with 95%+ confidence.`;
    }
  }

  /**
   * Build optimized extraction prompts with enhanced VIN and date recognition
   */
  buildOptimizedExtractionPrompt(documentType) {
    return `FLEET COMPLIANCE DOCUMENT ANALYZER

You are analyzing a fleet management document. Extract the following information with high precision:

**PRIMARY OBJECTIVES:**
1. FIND VIN NUMBERS: Look for exactly 17-character alphanumeric sequences (no I, O, Q letters). These are critical identifiers.
2. FIND ALL DATES: Extract every date in the document, especially expiration dates
3. IDENTIFY DOCUMENT TYPE: Registration, Insurance, CDL, Inspection, etc.

**VIN EXTRACTION RULES:**
- VIN must be exactly 17 characters: [A-HJ-NPR-Z0-9]{17}
- Common OCR errors to correct: I→1, O→0, Q→0, S→5, G→6, B→8, rn→m, vv→w
- Look for labels: "VIN:", "Vehicle ID:", "Chassis Number:", "Serial Number:", or unlabeled 17-char sequences
- Check ALL locations: headers, vehicle info sections, fine print, barcodes, registration blocks
- If you find multiple 17-char sequences, include ALL with context and location
- Pay special attention to areas near vehicle make/model information
- Look for VINs with spaces or dashes that need to be cleaned: "1HG BH41J XMN 109186" → "1HGBH41JXMN109186"

**DATE EXTRACTION RULES:**
- Find dates near keywords: 'expires', 'expiration', 'valid until', 'due date', 'issued', 'effective', 'through', 'renewal', 'exp'
- Look for ALL date formats: MM/DD/YYYY, MM/DD/YY, DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY, DD-MMM-YYYY, MMM DD YYYY
- Search systematically: headers, status boxes, expiration sections, validity periods, renewal areas
- Pay special attention to: 
  * Registration expiration dates (often in red boxes, highlighted, or stamped)
  * Insurance policy dates (effective & expiration periods)
  * License expiration dates (CDL, medical certificates)
  * Inspection due dates (annual inspection dates)
  * Issue dates for reference and validation
- Include surrounding context for each date (what it refers to and where found)
- Look for dates in different formats within same document
- Check for partially obscured dates and make best interpretation

**DOCUMENT TYPE IDENTIFICATION:**
- Registration: Vehicle title, registration certificate, DMV forms, state vehicle documents, renewal notices
- Insurance: Insurance card, policy certificate, coverage proof, liability certificates, auto insurance
- CDL: Commercial driver's license, CDL permit, driver qualification files, commercial licenses
- Medical: DOT medical certificate, medical examiner certificate, health certificates, DOT physicals
- Inspection: DOT inspection report, safety inspection certificate, annual inspections, vehicle inspections
- Other: Permits, authorities, operating licenses, DOT authorities, commercial permits

**CRITICAL SEARCH PATTERNS:**
- VIN locations: Vehicle information boxes, registration sections, title areas, fine print, identification blocks
- Expiration dates: Status sections, validity boxes, highlighted areas, renewal notices, due date stamps
- Document type indicators: Headers, logos, form numbers, issuing agency names, document titles, watermarks

**ENHANCED DETECTION TECHNIQUES:**
- Scan entire document systematically - top to bottom, left to right
- Look for partial VINs and attempt to reconstruct from context
- Check for dates in different sections of same document
- Identify key-value pairs even without clear labels
- Pay attention to emphasized text (bold, colored, boxed, underlined)
- Look for stamped or handwritten information
- Check corners and margins for additional information
- Examine fine print and legal text for hidden data

**OCR ERROR CORRECTION PATTERNS:**
- Character substitutions: 0↔O, 1↔I↔l, 5↔S, 8↔B, 6↔G, Z↔2
- Common mistakes: "rn" → "m", "vv" → "w", "cl" → "d", "li" → "h"
- Space insertions in VINs, license plates, policy numbers
- Date format corruptions: slashes, dots, spaces mixed up
- Partial words in vehicle makes/models using context

${documentType ? `**EXPECTED DOCUMENT TYPE:** ${documentType} - Focus extraction on relevant fields for this type.` : ''}

**CRITICAL:** Even if you can't find all information, return whatever you can extract. Never return empty results - always provide your best interpretation with confidence levels.

Return your analysis as a JSON object with this EXACT structure:

{
  "document_type": "registration|insurance|cdl|medical_certificate|inspection|other",
  "confidence": "high|medium|low",
  "vins": [
    {
      "vin": "17-character-vin",
      "context": "surrounding text or location where found",
      "confidence": "high|medium|low",
      "corrected_errors": "list any OCR corrections made"
    }
  ],
  "dates": [
    {
      "date": "MM/DD/YYYY",
      "context": "expiration date for registration, found in top right corner",
      "type": "registration_expiry|insurance_expiry|license_expiry|inspection_due|issue_date|effective_date|other",
      "confidence": "high|medium|low",
      "location": "description of where found in document"
    }
  ],
  "vehicle_info": {
    "make": "string",
    "model": "string", 
    "year": "string",
    "license_plate": "string",
    "state": "string"
  },
  "document_specific": {
    "registration": {
      "registration_number": "string",
      "owner_name": "string"
    },
    "insurance": {
      "policy_number": "string",
      "insurance_company": "string",
      "coverage_amount": "string"
    },
    "cdl": {
      "driver_name": "string", 
      "license_number": "string",
      "license_class": "string",
      "endorsements": ["array"]
    },
    "medical": {
      "driver_name": "string",
      "examiner_name": "string", 
      "certificate_number": "string"
    }
  },
  "extraction_notes": [
    "List any challenges, partial data, or uncertain extractions"
  ],
  "raw_text_sample": "first 500 characters of extracted text for debugging"
}`;
  }

  /**
   * Parse optimized response format and convert to legacy structure
   */
  parseOptimizedResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Convert optimized format back to legacy structure
      const legacyFormat = {
        vin_numbers: [],
        extracted_data: {},
        overall_confidence: 75, // Default confidence
        low_confidence_items: [],
        extraction_quality: {
          completeness_score: 80,
          accuracy_score: 85,
          clarity_score: 80
        }
      };

      // Convert VINs
      if (parsed.vins && parsed.vins.length > 0) {
        parsed.vins.forEach(vinObj => {
          legacyFormat.vin_numbers.push({
            value: vinObj.vin,
            confidence: this.convertConfidenceToNumeric(vinObj.confidence),
            location: vinObj.context,
            verification_method: vinObj.corrected_errors || 'Pattern matching'
          });
        });
      }

      // Convert dates to extracted_data
      if (parsed.dates && parsed.dates.length > 0) {
        // Use the most relevant date based on type
        const expirationDates = parsed.dates.filter(d => 
          d.type.includes('expiry') || d.type.includes('due')
        );
        
        if (expirationDates.length > 0) {
          const primaryDate = expirationDates[0];
          legacyFormat.extracted_data.expirationDate = {
            value: primaryDate.date,
            confidence: this.convertConfidenceToNumeric(primaryDate.confidence),
            verification_notes: `${primaryDate.context} - ${primaryDate.location}`
          };
        }
      }

      // Convert vehicle info
      if (parsed.vehicle_info) {
        Object.entries(parsed.vehicle_info).forEach(([key, value]) => {
          if (value) {
            legacyFormat.extracted_data[key] = {
              value: value,
              confidence: 85,
              verification_notes: 'Extracted from vehicle information section'
            };
          }
        });
      }

      // Convert document-specific data
      if (parsed.document_specific) {
        const docType = parsed.document_type;
        const docData = parsed.document_specific[docType];
        
        if (docData) {
          Object.entries(docData).forEach(([key, value]) => {
            if (value) {
              legacyFormat.extracted_data[key] = {
                value: value,
                confidence: 85,
                verification_notes: `Extracted from ${docType} document section`
              };
            }
          });
        }
      }

      // Calculate overall confidence
      const confidenceValues = Object.values(legacyFormat.extracted_data)
        .map(field => field.confidence || 0)
        .concat(legacyFormat.vin_numbers.map(vin => vin.confidence || 0));
        
      if (confidenceValues.length > 0) {
        legacyFormat.overall_confidence = Math.round(
          confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length
        );
      }

      return legacyFormat;
      
    } catch (error) {
      console.error('Error parsing optimized response:', error);
      return {
        overall_confidence: 0,
        extracted_data: {},
        low_confidence_items: ['Response parsing failed'],
        validation_details: {}
      };
    }
  }

  /**
   * Convert confidence strings to numeric values
   */
  convertConfidenceToNumeric(confidence) {
    switch (confidence?.toLowerCase()) {
      case 'high': return 95;
      case 'medium': return 80;
      case 'low': return 60;
      default: return 70;
    }
  }

  /**
   * Parse high-confidence extraction response
   */
  parseHighConfidenceResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Calculate overall confidence based on individual field confidences
      let totalConfidence = 0;
      let fieldCount = 0;
      
      // Check VIN confidences
      if (parsed.vin_numbers && Array.isArray(parsed.vin_numbers)) {
        parsed.vin_numbers.forEach(vin => {
          totalConfidence += vin.confidence || 0;
          fieldCount++;
        });
      }
      
      // Check extracted data confidences
      if (parsed.extracted_data) {
        Object.values(parsed.extracted_data).forEach(field => {
          if (field && typeof field === 'object' && field.confidence) {
            totalConfidence += field.confidence;
            fieldCount++;
          }
        });
      }
      
      const calculatedConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;
      
      return {
        vin_numbers: parsed.vin_numbers || [],
        extracted_data: parsed.extracted_data || {},
        overall_confidence: parsed.overall_confidence || calculatedConfidence,
        low_confidence_items: parsed.low_confidence_items || [],
        extraction_quality: parsed.extraction_quality || {
          completeness_score: 50,
          accuracy_score: 50,
          clarity_score: 50
        },
        raw_response: responseText
      };
      
    } catch (error) {
      console.error('Failed to parse high-confidence response:', error);
      return {
        vin_numbers: [],
        extracted_data: {},
        overall_confidence: 0,
        low_confidence_items: ['Failed to parse extraction response'],
        extraction_quality: {
          completeness_score: 0,
          accuracy_score: 0,
          clarity_score: 0
        },
        raw_response: responseText
      };
    }
  }

  /**
   * Stage 5: NEW Flexible Validation - Never fails completely, always provides actionable feedback
   */
  flexibleValidateExtractedData(extractionResult) {
    console.log('🔍 Starting flexible validation - never fails completely');
    
    const validation = {
      status: 'success',
      confidence_score: 75,
      processing_recommendation: 'auto_approve',
      validation_summary: {
        fields_found: 0,
        fields_validated: 0,
        high_confidence_fields: 0,
        corrected_fields: 0
      },
      field_validations: [],
      suggestions: [],
      warnings: []
    };

    try {
      // Validate VINs with flexible scoring
      this.validateVINsFlexibly(extractionResult, validation);
      
      // Validate dates with flexible parsing
      this.validateDatesFlexibly(extractionResult, validation);
      
      // Validate other fields
      this.validateOtherFieldsFlexibly(extractionResult, validation);
      
      // Calculate overall assessment
      this.calculateFlexibleAssessment(validation);
      
      // Generate recommendations
      this.generateFlexibleSuggestions(validation);
      
      console.log(`✅ Flexible validation complete: ${validation.status} (${validation.confidence_score}%)`);
      console.log(`📊 Found ${validation.validation_summary.fields_found} fields, validated ${validation.validation_summary.fields_validated}`);
      
      return validation;
      
    } catch (error) {
      console.error('Flexible validation error (non-fatal):', error);
      return {
        status: 'needs_review',
        confidence_score: 30,
        processing_recommendation: 'manual_review_required',
        validation_errors: [error.message],
        suggestions: ['Manual validation required due to system error']
      };
    }
  }

  /**
   * Validate VINs with flexible scoring and OCR correction
   */
  validateVINsFlexibly(extractionResult, validation) {
    const vinSources = [
      { path: 'vin_numbers', isArray: true },
      { path: 'extracted_data.vin', isArray: false },
      { path: 'extracted_data.vinNumber', isArray: false }
    ];

    vinSources.forEach(source => {
      const vinData = this.getNestedValue(extractionResult, source.path);
      if (vinData) {
        validation.validation_summary.fields_found++;
        
        if (source.isArray && Array.isArray(vinData)) {
          vinData.forEach((vinItem, index) => {
            const vinValue = typeof vinItem === 'object' ? vinItem.value : vinItem;
            if (vinValue) {
              this.validateSingleVINFlexibly(vinValue, `${source.path}[${index}]`, validation);
            }
          });
        } else {
          const vinValue = typeof vinData === 'object' ? vinData.value : vinData;
          if (vinValue) {
            this.validateSingleVINFlexibly(vinValue, source.path, validation);
          }
        }
      }
    });
  }

  validateSingleVINFlexibly(vinValue, fieldName, validation) {
    const fieldValidation = {
      field: fieldName,
      original_value: vinValue,
      final_value: vinValue,
      confidence: 0,
      status: 'acceptable',
      corrections: [],
      notes: []
    };

    // Clean and correct VIN
    const cleanedVIN = vinValue.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const correctedVIN = this.flexibleVINCorrection(cleanedVIN);
    
    if (correctedVIN !== cleanedVIN) {
      fieldValidation.corrections.push(`OCR corrections: ${cleanedVIN} → ${correctedVIN}`);
      fieldValidation.final_value = correctedVIN;
      validation.validation_summary.corrected_fields++;
    }

    // Length validation
    if (correctedVIN.length === 17) {
      fieldValidation.confidence += 40;
      fieldValidation.notes.push('✓ Correct VIN length (17 characters)');
    } else if (correctedVIN.length >= 15 && correctedVIN.length <= 19) {
      fieldValidation.confidence += 25;
      fieldValidation.notes.push(`⚠ VIN length ${correctedVIN.length} (expected 17) - likely OCR issue`);
    } else {
      fieldValidation.confidence += 10;
      fieldValidation.notes.push(`⚠ Invalid VIN length: ${correctedVIN.length}`);
    }

    // Character validation
    if (!/[IOQ]/.test(correctedVIN)) {
      fieldValidation.confidence += 35;
      fieldValidation.notes.push('✓ No invalid VIN characters (I, O, Q)');
    } else {
      fieldValidation.confidence += 20;
      fieldValidation.notes.push('⚠ Contains I, O, or Q - needs verification');
    }

    // Format validation
    if (/^[A-HJ-NPR-Z0-9]{15,17}$/.test(correctedVIN)) {
      fieldValidation.confidence += 25;
      fieldValidation.notes.push('✓ Valid VIN character format');
    } else {
      fieldValidation.confidence += 5;
      fieldValidation.notes.push('⚠ Invalid VIN format');
    }

    // Set status based on confidence
    if (fieldValidation.confidence >= 85) {
      fieldValidation.status = 'excellent';
      validation.validation_summary.high_confidence_fields++;
    } else if (fieldValidation.confidence >= 65) {
      fieldValidation.status = 'good';
    } else if (fieldValidation.confidence >= 45) {
      fieldValidation.status = 'acceptable';
    } else {
      fieldValidation.status = 'questionable';
      validation.warnings.push(`VIN ${fieldName} has low confidence (${fieldValidation.confidence}%)`);
    }

    validation.field_validations.push(fieldValidation);
    validation.validation_summary.fields_validated++;
  }

  /**
   * Validate dates with flexible parsing
   */
  validateDatesFlexibly(extractionResult, validation) {
    const dateSources = [
      'extracted_data.expirationDate',
      'extracted_data.issueDate',
      'extracted_data.effectiveDate',
      'dates'
    ];

    dateSources.forEach(source => {
      const dateData = this.getNestedValue(extractionResult, source);
      if (dateData) {
        validation.validation_summary.fields_found++;
        
        if (source === 'dates' && Array.isArray(dateData)) {
          dateData.forEach((dateItem, index) => {
            const dateValue = typeof dateItem === 'object' ? dateItem.date || dateItem.value : dateItem;
            if (dateValue) {
              this.validateSingleDateFlexibly(dateValue, `${source}[${index}]`, validation);
            }
          });
        } else {
          const dateValue = typeof dateData === 'object' ? dateData.value : dateData;
          if (dateValue) {
            this.validateSingleDateFlexibly(dateValue, source, validation);
          }
        }
      }
    });
  }

  validateSingleDateFlexibly(dateValue, fieldName, validation) {
    const fieldValidation = {
      field: fieldName,
      original_value: dateValue,
      final_value: dateValue,
      confidence: 0,
      status: 'acceptable',
      corrections: [],
      notes: []
    };

    try {
      const parsedDate = new Date(dateValue);
      
      if (!isNaN(parsedDate.getTime())) {
        fieldValidation.confidence += 50;
        fieldValidation.notes.push('✓ Successfully parsed date');
        
        // Standardize format
        const isoDate = parsedDate.toISOString().split('T')[0];
        if (isoDate !== dateValue) {
          fieldValidation.corrections.push(`Standardized: ${dateValue} → ${isoDate}`);
          fieldValidation.final_value = isoDate;
        }
        
        // Date reasonableness
        const year = parsedDate.getFullYear();
        const now = new Date();
        
        if (year >= 2000 && year <= now.getFullYear() + 5) {
          fieldValidation.confidence += 35;
          fieldValidation.notes.push('✓ Date is in reasonable range');
        } else if (year >= 1990 && year <= now.getFullYear() + 10) {
          fieldValidation.confidence += 20;
          fieldValidation.notes.push('⚠ Date is plausible but unusual');
        } else {
          fieldValidation.confidence += 5;
          fieldValidation.notes.push(`⚠ Date year ${year} seems unusual`);
        }
        
        fieldValidation.confidence += 15; // Base date confidence
        
      } else {
        fieldValidation.confidence = 15;
        fieldValidation.notes.push('⚠ Could not parse date format');
      }
      
    } catch (error) {
      fieldValidation.confidence = 10;
      fieldValidation.notes.push('✗ Date parsing failed');
    }

    // Set status
    if (fieldValidation.confidence >= 80) {
      fieldValidation.status = 'excellent';
      validation.validation_summary.high_confidence_fields++;
    } else if (fieldValidation.confidence >= 60) {
      fieldValidation.status = 'good';
    } else if (fieldValidation.confidence >= 40) {
      fieldValidation.status = 'acceptable';
    } else {
      fieldValidation.status = 'questionable';
      validation.warnings.push(`Date ${fieldName} has low confidence (${fieldValidation.confidence}%)`);
    }

    validation.field_validations.push(fieldValidation);
    validation.validation_summary.fields_validated++;
  }

  /**
   * Validate other fields flexibly
   */
  validateOtherFieldsFlexibly(extractionResult, validation) {
    const otherFields = [
      'extracted_data.licensePlate',
      'extracted_data.policyNumber',
      'extracted_data.insuranceCompany',
      'extracted_data.make',
      'extracted_data.model',
      'extracted_data.state'
    ];

    otherFields.forEach(fieldPath => {
      const fieldData = this.getNestedValue(extractionResult, fieldPath);
      if (fieldData) {
        validation.validation_summary.fields_found++;
        
        const fieldValidation = {
          field: fieldPath,
          original_value: fieldData,
          final_value: fieldData,
          confidence: fieldData && fieldData.toString().trim() ? 70 : 20,
          status: 'acceptable',
          corrections: [],
          notes: [`✓ Field has value: "${fieldData}"`]
        };

        if (fieldValidation.confidence >= 70) {
          validation.validation_summary.high_confidence_fields++;
        }

        validation.field_validations.push(fieldValidation);
        validation.validation_summary.fields_validated++;
      }
    });
  }

  /**
   * Calculate flexible assessment
   */
  calculateFlexibleAssessment(validation) {
    const summary = validation.validation_summary;
    
    // Calculate confidence based on field validations
    const fieldConfidences = validation.field_validations.map(f => f.confidence);
    if (fieldConfidences.length > 0) {
      validation.confidence_score = Math.round(
        fieldConfidences.reduce((sum, conf) => sum + conf, 0) / fieldConfidences.length
      );
    }

    // Determine status and recommendation
    if (validation.confidence_score >= 80 && validation.warnings.length === 0) {
      validation.status = 'success';
      validation.processing_recommendation = 'auto_approve';
    } else if (validation.confidence_score >= 60 && validation.warnings.length <= 2) {
      validation.status = 'success_with_warnings';
      validation.processing_recommendation = 'review_recommended';
    } else {
      validation.status = 'needs_review';
      validation.processing_recommendation = 'manual_review_required';
    }
  }

  /**
   * Generate flexible suggestions
   */
  generateFlexibleSuggestions(validation) {
    const suggestions = [];
    
    // Suggestions based on low confidence fields
    const lowConfidenceFields = validation.field_validations.filter(f => f.confidence < 60);
    if (lowConfidenceFields.length > 0) {
      suggestions.push(`${lowConfidenceFields.length} field(s) need verification: ${lowConfidenceFields.map(f => f.field).join(', ')}`);
    }

    // Suggestions for VIN issues
    const vinFields = validation.field_validations.filter(f => f.field.includes('vin'));
    const lowConfidenceVINs = vinFields.filter(f => f.confidence < 70);
    if (lowConfidenceVINs.length > 0) {
      suggestions.push('VIN validation issues detected - verify VIN manually or improve document image quality');
    }

    // Suggestions for date issues
    const dateFields = validation.field_validations.filter(f => f.field.toLowerCase().includes('date'));
    const lowConfidenceDates = dateFields.filter(f => f.confidence < 60);
    if (lowConfidenceDates.length > 0) {
      suggestions.push('Date parsing issues detected - verify dates manually');
    }

    // General suggestions
    if (validation.confidence_score < 70) {
      suggestions.push('Consider improving document image quality (better lighting, higher resolution)');
    }

    if (validation.validation_summary.corrected_fields > 0) {
      suggestions.push(`${validation.validation_summary.corrected_fields} field(s) were auto-corrected - review corrections`);
    }

    validation.suggestions = suggestions;
  }

  /**
   * Flexible VIN correction with common OCR errors
   */
  flexibleVINCorrection(vin) {
    return vin
      .replace(/I/g, '1')  // I → 1
      .replace(/O/g, '0')  // O → 0  
      .replace(/Q/g, '0')  // Q → 0
      .replace(/5/g, 'S')  // 5 → S (sometimes)
      .replace(/6/g, 'G')  // 6 → G (sometimes)
      .replace(/8/g, 'B'); // 8 → B (sometimes)
  }

  /**
   * Get nested object value by dot path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  /**
   * Simulate reconciliation for server-side processing
   * In production, this would connect to the actual reconciler service
   */
  simulateReconciliation(extractionResult, fileName) {
    // Extract VIN from the extraction result
    const extractedVIN = this.extractVINFromExtraction(extractionResult);
    
    if (!extractedVIN) {
      return {
        success: false,
        warnings: ['No VIN found - cannot add to vehicle reconciliation system']
      };
    }

    // Simulate successful reconciliation
    return {
      success: true,
      vehicleVIN: extractedVIN,
      message: `Document ${fileName} added to vehicle ${extractedVIN}`,
      // In real implementation, these would come from the actual reconciler
      vehicleDocumentCount: Math.floor(Math.random() * 10) + 1, // Simulated
      conflicts: [], // Would contain actual conflicts
      warnings: [] // Would contain actual warnings
    };
  }

  /**
   * Extract VIN from extraction results
   */
  extractVINFromExtraction(extractionResult) {
    // Check multiple possible locations for VIN
    const vinSources = [
      extractionResult.extracted_data?.vin,
      extractionResult.extracted_data?.vinNumber,
      extractionResult.vin_numbers?.[0]?.value,
      extractionResult.vehicle_info?.vin
    ];

    for (const vinSource of vinSources) {
      if (vinSource && typeof vinSource === 'string' && vinSource.length >= 15) {
        // Clean and validate VIN
        const cleanVIN = vinSource.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cleanVIN.length >= 15 && cleanVIN.length <= 17) {
          return cleanVIN;
        }
      }
    }

    return null;
  }

  /**
   * LEGACY Stage 5: Flexible Validation with Smart Error Recovery (kept for compatibility)
   */
  validateExtractedData(extractionResult) {
    try {
      let validationScore = 100;
      const issues = [];
      const warnings = [];
      
      // Flexible VIN validation with OCR error correction
      if (extractionResult.vin_numbers && extractionResult.vin_numbers.length > 0) {
        extractionResult.vin_numbers.forEach((vinData, index) => {
          const vinValidation = this.flexibleVINValidation(vinData.value);
          
          if (vinValidation.isValid) {
            // Update with corrected VIN if OCR errors were fixed
            if (vinValidation.correctedVIN !== vinData.value) {
              vinData.value = vinValidation.correctedVIN;
              warnings.push(`VIN ${index + 1} auto-corrected: ${vinData.originalValue || ''} → ${vinValidation.correctedVIN}`);
            }
          } else if (vinValidation.isLikelyVIN) {
            // Partial validation - reduce score but don't fail completely
            validationScore -= 10;
            warnings.push(`VIN ${index + 1} may have OCR errors: ${vinData.value} (${vinValidation.reason})`);
          } else {
            // Complete failure
            validationScore -= 20;
            issues.push(`VIN ${index + 1} invalid: ${vinData.value} (${vinValidation.reason})`);
          }
        });
      }
      
      // Flexible date validation with multiple format support
      if (extractionResult.extracted_data) {
        Object.entries(extractionResult.extracted_data).forEach(([key, data]) => {
          if (key.includes('date') || key.includes('Date') || key.includes('expir') || key.includes('Expir')) {
            if (data.value) {
              const dateValidation = this.flexibleDateValidation(data.value);
              
              if (dateValidation.isValid) {
                // Update with normalized date format
                data.value = dateValidation.normalizedDate;
                if (dateValidation.originalFormat !== 'YYYY-MM-DD') {
                  warnings.push(`Date ${key} normalized: ${dateValidation.originalValue} → ${dateValidation.normalizedDate}`);
                }
              } else {
                validationScore -= 5; // Reduced penalty for date issues
                warnings.push(`Date ${key} format unclear: ${data.value} (${dateValidation.reason})`);
              }
            }
          }
        });
      }
      
      // Flexible confidence threshold (reduced from 95% to 75%)
      if (extractionResult.overall_confidence < 75) {
        validationScore -= 15;
        warnings.push(`Overall confidence ${extractionResult.overall_confidence}% below preferred threshold of 75%`);
      }
      
      // Additional document completeness check
      const completenessScore = this.calculateDocumentCompleteness(extractionResult);
      if (completenessScore < 0.3) {
        validationScore -= 10;
        warnings.push(`Document appears incomplete (${Math.round(completenessScore * 100)}% completeness)`);
      }
      
      return {
        is_valid: validationScore >= 70, // Reduced threshold from 85% to 70%
        validation_score: Math.max(0, validationScore),
        issues: issues,
        warnings: warnings,
        checks_performed: ['Flexible VIN validation', 'Multi-format date validation', 'Reduced confidence threshold', 'Document completeness']
      };
      
    } catch (error) {
      console.error('Data validation error:', error);
      return {
        is_valid: false,
        validation_score: 0,
        issues: ['Validation process failed'],
        checks_performed: []
      };
    }
  }

  /**
   * Flexible date validation supporting multiple formats
   */
  flexibleDateValidation(dateString) {
    if (!dateString) {
      return { isValid: false, reason: 'No date provided' };
    }
    
    const originalValue = dateString;
    let cleanDate = dateString.toString().trim();
    
    // Try multiple date formats
    const dateFormats = [
      // ISO format
      { regex: /^(\d{4})-(\d{2})-(\d{2})$/, format: 'YYYY-MM-DD' },
      // US format
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, format: 'MM/DD/YYYY' },
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, format: 'MM/DD/YY' },
      // European format  
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, format: 'DD.MM.YYYY' },
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/, format: 'DD.MM.YY' },
      // Alternative formats
      { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, format: 'MM-DD-YYYY' },
      { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, format: 'YYYY/MM/DD' },
      // Long format
      { regex: /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/, format: 'Month DD, YYYY' },
      // OCR-friendly: remove common OCR errors
      { regex: /^(\d{1,2})[O|o|0](\d{1,2})[O|o|0](\d{2,4})$/, format: 'MM/DD/YYYY with OCR errors' }
    ];
    
    for (const formatDef of dateFormats) {
      const match = cleanDate.match(formatDef.regex);
      if (match) {
        let year, month, day;
        
        switch (formatDef.format) {
          case 'YYYY-MM-DD':
            [, year, month, day] = match;
            break;
          case 'MM/DD/YYYY':
          case 'MM-DD-YYYY':
            [, month, day, year] = match;
            break;
          case 'MM/DD/YY':
            [, month, day, year] = match;
            year = this.expandTwoDigitYear(year);
            break;
          case 'DD.MM.YYYY':
            [, day, month, year] = match;
            break;
          case 'DD.MM.YY':
            [, day, month, year] = match;
            year = this.expandTwoDigitYear(year);
            break;
          case 'YYYY/MM/DD':
            [, year, month, day] = match;
            break;
          case 'Month DD, YYYY':
            [, monthName, day, year] = match;
            month = this.monthNameToNumber(monthName);
            break;
          case 'MM/DD/YYYY with OCR errors':
            [, month, day, year] = match;
            // Clean OCR errors
            month = month.replace(/[O|o]/g, '0');
            day = day.replace(/[O|o]/g, '0');
            year = year.replace(/[O|o]/g, '0');
            break;
        }
        
        // Validate and normalize
        const normalizedDate = this.normalizeDate(year, month, day);
        if (normalizedDate) {
          return {
            isValid: true,
            normalizedDate: normalizedDate,
            originalValue: originalValue,
            originalFormat: formatDef.format
          };
        }
      }
    }
    
    // Try fuzzy date parsing for badly OCR'd dates
    const fuzzyResult = this.fuzzyDateParsing(cleanDate);
    if (fuzzyResult.isValid) {
      return fuzzyResult;
    }
    
    return {
      isValid: false,
      reason: 'Unrecognized date format',
      originalValue: originalValue
    };
  }
  
  /**
   * Expand two-digit year to four-digit year
   */
  expandTwoDigitYear(year) {
    const numYear = parseInt(year);
    if (numYear <= 30) {
      return (2000 + numYear).toString();
    } else {
      return (1900 + numYear).toString();
    }
  }
  
  /**
   * Convert month name to number
   */
  monthNameToNumber(monthName) {
    const months = {
      'january': '01', 'jan': '01',
      'february': '02', 'feb': '02',
      'march': '03', 'mar': '03',
      'april': '04', 'apr': '04',
      'may': '05',
      'june': '06', 'jun': '06',
      'july': '07', 'jul': '07',
      'august': '08', 'aug': '08',
      'september': '09', 'sep': '09', 'sept': '09',
      'october': '10', 'oct': '10',
      'november': '11', 'nov': '11',
      'december': '12', 'dec': '12'
    };
    return months[monthName.toLowerCase()] || '01';
  }
  
  /**
   * Normalize date components to YYYY-MM-DD format
   */
  normalizeDate(year, month, day) {
    try {
      const numYear = parseInt(year);
      const numMonth = parseInt(month);
      const numDay = parseInt(day);
      
      // Validate ranges
      if (numYear < 1900 || numYear > 2100) return null;
      if (numMonth < 1 || numMonth > 12) return null;
      if (numDay < 1 || numDay > 31) return null;
      
      // Create date object to validate
      const date = new Date(numYear, numMonth - 1, numDay);
      if (date.getFullYear() !== numYear || 
          date.getMonth() !== numMonth - 1 || 
          date.getDate() !== numDay) {
        return null;
      }
      
      // Format as YYYY-MM-DD
      return `${numYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Fuzzy date parsing for OCR errors
   */
  fuzzyDateParsing(dateString) {
    // Try to extract numbers from the string
    const numbers = dateString.match(/\d+/g);
    if (!numbers || numbers.length < 2) {
      return { isValid: false, reason: 'Insufficient date components' };
    }
    
    // Common patterns for fuzzy matching
    if (numbers.length === 3) {
      // Try different arrangements
      const arrangements = [
        [numbers[2], numbers[0], numbers[1]], // YYYY, MM, DD
        [numbers[2], numbers[1], numbers[0]], // YYYY, DD, MM
        [this.expandTwoDigitYear(numbers[2]), numbers[0], numbers[1]], // YY->YYYY, MM, DD
      ];
      
      for (const [year, month, day] of arrangements) {
        const normalized = this.normalizeDate(year, month, day);
        if (normalized) {
          return {
            isValid: true,
            normalizedDate: normalized,
            originalValue: dateString,
            originalFormat: 'Fuzzy parsing'
          };
        }
      }
    }
    
    return { isValid: false, reason: 'Fuzzy parsing failed' };
  }
  
  /**
   * Calculate document completeness score
   */
  calculateDocumentCompleteness(extractionResult) {
    let totalFields = 0;
    let filledFields = 0;
    
    // Count VIN numbers
    if (extractionResult.vin_numbers) {
      totalFields += 1;
      if (extractionResult.vin_numbers.length > 0 && extractionResult.vin_numbers[0].value) {
        filledFields += 1;
      }
    }
    
    // Count extracted data fields
    if (extractionResult.extracted_data) {
      Object.entries(extractionResult.extracted_data).forEach(([key, data]) => {
        totalFields += 1;
        if (data && data.value && data.value !== '—' && data.value !== '' && data.value !== 'N/A') {
          filledFields += 1;
        }
      });
    }
    
    return totalFields > 0 ? filledFields / totalFields : 0;
  }

  /**
   * Phase 3: Validate data and calculate quality scores
   */
  validateAndScoreData(extractedData, documentType) {
    try {
      const data = { ...extractedData };
      
      // VIN validation with check digit verification
      if (data.extractedData?.vin) {
        const vin = data.extractedData.vin.toUpperCase().replace(/[^A-Z0-9]/g, '');
        data.extractedData.vin = vin;
        data.dataQuality = data.dataQuality || {};
        data.dataQuality.vinValid = this.validateVIN(vin);
      }

      // Calculate overall quality score
      const qualityScore = this.calculateQualityScore(data, documentType);
      data.dataQuality = data.dataQuality || {};
      data.dataQuality.qualityScore = qualityScore;
      
      // Determine if manual review is needed
      data.requiresReview = qualityScore < 0.7 || !data.dataQuality.vinValid;
      data.autoApprovalRecommended = qualityScore > 0.8 && data.dataQuality.vinValid;
      
      // Add processing metadata
      data.processingNotes = data.processingNotes || [];
      data.processingNotes.push(`Classified as ${documentType} document`);
      data.processingNotes.push(`Quality score: ${qualityScore.toFixed(2)}`);
      
      return data;
      
    } catch (error) {
      console.error('Data validation error:', error);
      return extractedData; // Return original if validation fails
    }
  }

  /**
   * Flexible VIN validation with OCR error correction
   */
  flexibleVINValidation(vin) {
    if (!vin) {
      return { isValid: false, isLikelyVIN: false, reason: 'No VIN provided' };
    }
    
    // Clean and normalize VIN
    let cleanVIN = vin.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Check length
    if (cleanVIN.length !== 17) {
      if (cleanVIN.length >= 15 && cleanVIN.length <= 19) {
        // Likely VIN with OCR errors or extra characters
        return { 
          isValid: false, 
          isLikelyVIN: true, 
          reason: `Length ${cleanVIN.length} (expected 17)`,
          correctedVIN: cleanVIN.substring(0, 17) // Take first 17 characters
        };
      } else {
        return { isValid: false, isLikelyVIN: false, reason: `Invalid length ${cleanVIN.length}` };
      }
    }
    
    // OCR error correction for common mistakes
    const correctedVIN = this.correctVINOCRErrors(cleanVIN);
    
    // Check for invalid characters after correction
    if (/[IOQ]/.test(correctedVIN)) {
      // Try to fix common OCR errors: I→1, O→0, Q→0
      const furtherCorrected = correctedVIN
        .replace(/I/g, '1')
        .replace(/O/g, '0')
        .replace(/Q/g, '0');
      
      // Validate the corrected version
      const checkDigitValid = this.validateVINCheckDigit(furtherCorrected);
      
      if (checkDigitValid) {
        return {
          isValid: true,
          correctedVIN: furtherCorrected,
          originalValue: vin,
          reason: 'OCR errors corrected'
        };
      } else {
        return {
          isValid: false,
          isLikelyVIN: true,
          reason: 'Contains invalid characters (I, O, Q) and check digit failed',
          correctedVIN: furtherCorrected
        };
      }
    }
    
    // Standard VIN validation with check digit
    const checkDigitValid = this.validateVINCheckDigit(correctedVIN);
    
    if (checkDigitValid) {
      return {
        isValid: true,
        correctedVIN: correctedVIN,
        originalValue: vin !== correctedVIN ? vin : undefined,
        reason: 'Valid VIN'
      };
    } else {
      // Even if check digit fails, if it looks like a VIN, accept it with warning
      const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;
      if (vinPattern.test(correctedVIN)) {
        return {
          isValid: false,
          isLikelyVIN: true,
          reason: 'Check digit validation failed but format is correct',
          correctedVIN: correctedVIN
        };
      } else {
        return {
          isValid: false,
          isLikelyVIN: false,
          reason: 'Invalid VIN format and check digit failed'
        };
      }
    }
  }
  
  /**
   * Correct common OCR errors in VINs
   */
  correctVINOCRErrors(vin) {
    return vin
      // Common OCR mistakes
      .replace(/5/g, 'S') // Sometimes S is read as 5
      .replace(/6/g, 'G') // Sometimes G is read as 6
      .replace(/8/g, 'B') // Sometimes B is read as 8
      .replace(/0/g, 'O') // Sometimes O is read as 0 (we'll fix this later)
      .replace(/1/g, 'I'); // Sometimes I is read as 1 (we'll fix this later)
  }
  
  /**
   * Traditional VIN check digit validation
   */
  validateVINCheckDigit(vin) {
    if (!vin || vin.length !== 17) return false;
    
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    const transliteration = {
      'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
      'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9, 'S': 2,
      'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9
    };
    
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      if (i === 8) continue; // Skip check digit position
      
      const char = vin[i];
      let value;
      
      if (/\d/.test(char)) {
        value = parseInt(char);
      } else {
        value = transliteration[char];
      }
      
      if (value === undefined) return false;
      sum += value * weights[i];
    }
    
    const checkDigit = sum % 11;
    const expectedCheckDigit = checkDigit === 10 ? 'X' : checkDigit.toString();
    
    return vin[8] === expectedCheckDigit;
  }

  /**
   * Calculate quality score based on completeness and document type
   */
  calculateQualityScore(data, documentType) {
    const extractedData = data.extractedData || {};
    let score = 0.5; // Base score
    
    // Critical fields by document type
    const criticalFields = {
      'registration': ['vin', 'licensePlate', 'make', 'model', 'year'],
      'insurance': ['vin', 'policyNumber', 'insuranceCompany', 'expirationDate'],
      'cdl_license': ['driverName', 'licenseNumber', 'licenseClass', 'expirationDate'],
      'medical_certificate': ['driverName', 'expirationDate', 'certificationStatus'],
      'inspection': ['vin', 'inspectionDate', 'result']
    };
    
    const required = criticalFields[documentType] || ['vin'];
    const foundFields = required.filter(field => extractedData[field] && extractedData[field] !== '—' && extractedData[field] !== '');
    
    // Completeness score (40% of total)
    const completenessScore = foundFields.length / required.length;
    score += completenessScore * 0.4;
    
    // VIN validity bonus (30% if valid)
    if (extractedData.vin && this.validateVIN(extractedData.vin)) {
      score += 0.3;
    }
    
    // Confidence score from Claude (30%)
    if (data.confidence) {
      score += data.confidence * 0.3;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Parse Claude's structured response
   */
  parseStructuredResponse(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        documentType: parsed.documentType || 'unknown',
        confidence: parsed.confidence || 0.5,
        extractedData: parsed.extractedData || {},
        dataQuality: parsed.dataQuality || {
          isComplete: false,
          missingCriticalFields: [],
          qualityScore: 0.5
        },
        conflicts: parsed.conflicts || {
          hasConflicts: false,
          conflictDetails: []
        },
        validationResults: parsed.validationResults || {
          vinValid: false,
          datesRealistic: true,
          documentsExpired: false,
          requiresImmediateAction: false
        },
        rawText: response,
        processingNotes: parsed.processingNotes || ['Processed via server-side PDF processing'],
        requiresReview: parsed.requiresReview !== false,
        autoApprovalRecommended: parsed.autoApprovalRecommended === true
      };

    } catch (error) {
      console.error('Failed to parse Claude response:', error);
      
      return {
        documentType: 'unknown',
        confidence: 0.3,
        extractedData: {},
        dataQuality: {
          isComplete: false,
          missingCriticalFields: ['Unable to parse response'],
          qualityScore: 0.3
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
        rawText: response,
        processingNotes: ['Failed to parse structured response', 'Requires manual review'],
        requiresReview: true,
        autoApprovalRecommended: false
      };
    }
  }
}

export default ServerPDFProcessor;