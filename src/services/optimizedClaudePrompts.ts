/**
 * Optimized Claude Vision Prompts for Fleet Document Processing
 * Enhanced for better VIN recognition, date extraction, and document type classification
 */

export class OptimizedClaudePrompts {

  /**
   * Build optimized extraction prompt for image documents with enhanced VIN and date recognition
   */
  static buildImageExtractionPrompt(expectedDocumentType?: string): string {
    return `FLEET COMPLIANCE DOCUMENT ANALYZER

You are analyzing a fleet management document. Extract the following information with high precision:

**PRIMARY OBJECTIVES:**
1. FIND VIN NUMBERS: Look for exactly 17-character alphanumeric sequences (no I, O, Q letters). These are critical identifiers.
2. FIND ALL DATES: Extract every date in the document, especially expiration dates
3. IDENTIFY DOCUMENT TYPE: Registration, Insurance, CDL, Inspection, etc.

**VIN EXTRACTION RULES:**
- VIN must be exactly 17 characters: [A-HJ-NPR-Z0-9]{17}
- CRITICAL: Read each character carefully and double-check uncertain characters
- Common OCR errors to correct: I→1, O→0, Q→0, S→5, G→6, B→8, C→G, A→8, M→N, rn→m, vv→w
- When extracting VIN, provide character-by-character confidence: "Position 1: '5' (confident), Position 2: 'V' (confident), Position 3: 'C' (uncertain - could be G)"
- Look for labels (including partial/cut-off versions): "VIN:", "Vehicle ID:", "Vehicle Identification Number:", "Vehicle Identification No:", "Vehicle Identification No.:", "Chassis Number:", "Serial Number:", "Vehicle Serial Number:", "V.I.N.:", or unlabeled 17-char sequences
- Be flexible with partial labels from OCR errors: "Vehic", "Identif", "V.I.N", "VIN", "Veh ID", "Serial", "Chassis", "Vehicle Iden", "Identification Nu", etc.
- Look for 17-character sequences near ANY vehicle-related text or in structured data areas, even without clear labels
- Use context clues: if you see "1HGBH41JXMN109186" near words like "Make:", "Model:", "Year:", assume it's likely a VIN
- Check ALL locations: headers, vehicle info sections, fine print, barcodes, registration blocks, form fields, table cells
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

${expectedDocumentType ? `**EXPECTED DOCUMENT TYPE:** ${expectedDocumentType} - Focus extraction on relevant fields for this type.` : ''}

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
   * Build optimized extraction prompt for text documents (PDFs)
   */
  static buildTextExtractionPrompt(documentText: string, expectedDocumentType?: string): string {
    const cleanedText = this.cleanDocumentText(documentText);
    
    return `FLEET COMPLIANCE TEXT DOCUMENT ANALYZER

You are analyzing extracted text from a fleet management document. Extract information with high precision:

**SEARCH STRATEGY:**
1. Scan for VIN patterns: Look for 17-character alphanumeric sequences
2. Date pattern recognition: Find all date formats throughout the text
3. Document type classification: Identify based on keywords and structure

**VIN EXTRACTION FROM TEXT:**
- Search for patterns: [A-HJ-NPR-Z0-9]{17} (no I, O, Q allowed)
- Look near keywords: "VIN", "Vehicle ID", "Chassis", "Serial Number"
- Check for spaced VINs: "1HG BH41J XMN 109186" → clean to "1HGBH41JXMN109186"
- Validate using context (should appear near vehicle information)

**DATE EXTRACTION FROM TEXT:**
- Search near: "expires", "expiration", "valid", "due", "issued", "effective"
- Multiple formats: MM/DD/YYYY, DD/MM/YYYY, Month DD YYYY, YYYY-MM-DD
- Context clues: registration expiry, insurance dates, license dates

**DOCUMENT TYPE INDICATORS:**
- Registration: "registration", "title", "DMV", "motor vehicle"
- Insurance: "insurance", "policy", "coverage", "liability", "premium"
- CDL: "commercial", "CDL", "driver license", "endorsement"
- Medical: "medical", "DOT physical", "examiner", "certificate"

${expectedDocumentType ? `**EXPECTED DOCUMENT TYPE:** ${expectedDocumentType}` : ''}

**DOCUMENT TEXT TO ANALYZE:**
${cleanedText}

Return analysis using the same JSON structure as image processing, focusing on text-specific extraction patterns.`;
  }

  /**
   * Clean and prepare document text for analysis
   */
  private static cleanDocumentText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove common OCR artifacts
      .replace(/[|\[\]]/g, '')
      // Normalize line breaks
      .replace(/\n+/g, '\n')
      // Limit length for token efficiency
      .substring(0, 3000)
      .trim();
  }

  /**
   * Build document type classification prompt
   */
  static buildDocumentClassificationPrompt(): string {
    return `DOCUMENT TYPE CLASSIFIER

Analyze this document and classify its type based on visual and textual cues:

**CLASSIFICATION CRITERIA:**

**REGISTRATION DOCUMENTS:**
- Keywords: "registration", "title", "DMV", "motor vehicle department"
- Visual: State seals, official forms, vehicle information blocks
- Data: VIN, license plate, owner information, expiration dates

**INSURANCE DOCUMENTS:**
- Keywords: "insurance", "policy", "coverage", "liability", "premium"
- Visual: Insurance company logos, policy cards, certificates
- Data: Policy numbers, coverage amounts, effective dates

**CDL DOCUMENTS:**
- Keywords: "commercial driver", "CDL", "license class", "endorsements"
- Visual: License format, DOT references, class indicators
- Data: Driver name, license number, restrictions, endorsements

**MEDICAL CERTIFICATES:**
- Keywords: "medical", "DOT physical", "examiner", "certificate"
- Visual: Medical forms, examiner signatures, DOT logos
- Data: Examination dates, examiner information, restrictions

**INSPECTION DOCUMENTS:**
- Keywords: "inspection", "safety", "DOT", "annual", "vehicle exam"
- Visual: Inspection forms, safety checklists, compliance stamps
- Data: Inspection dates, results, vehicle identification

Return classification with confidence level and reasoning.`;
  }

  /**
   * Build VIN-specific extraction prompt
   */
  static buildVINExtractionPrompt(): string {
    return `VIN EXTRACTION SPECIALIST

Your sole focus is finding Vehicle Identification Numbers (VINs) in this document:

**VIN REQUIREMENTS:**
- Exactly 17 characters
- Format: [A-HJ-NPR-Z0-9]{17} (no I, O, Q letters)
- Usually found near vehicle information

**SEARCH LOCATIONS:**
- Vehicle information blocks
- Registration sections
- Title areas
- Fine print and margins
- Barcode areas
- Identification boxes

**OCR ERROR CORRECTION:**
- I → 1, O → 0, Q → 0
- Remove spaces: "1HG BH41J XMN 109186" → "1HGBH41JXMN109186"
- Fix common substitutions: S→5, G→6, B→8

**OUTPUT FORMAT:**
Return ALL potential VINs found, even if uncertain, with:
- The VIN sequence
- Location where found
- Confidence level
- Any corrections made
- Surrounding context

Focus exclusively on VIN detection - ignore all other data.`;
  }

  /**
   * Build date-specific extraction prompt
   */
  static buildDateExtractionPrompt(): string {
    return `DATE EXTRACTION SPECIALIST

Your sole focus is finding ALL dates in this document, especially expiration dates:

**DATE FORMATS TO RECOGNIZE:**
- MM/DD/YYYY, MM/DD/YY
- DD/MM/YYYY, DD/MM/YY  
- Month DD, YYYY
- DD-MMM-YYYY
- YYYY-MM-DD
- MMM DD YYYY

**SEARCH NEAR KEYWORDS:**
- "expires", "expiration", "exp"
- "valid until", "valid through"
- "due date", "renewal date"
- "issued", "effective"
- "good until", "ends"

**DATE CATEGORIES:**
- Registration expiration
- Insurance policy dates
- License expiration
- Medical certificate dates
- Inspection due dates
- Issue dates
- Effective dates

**OUTPUT FORMAT:**
Return ALL dates found with:
- The date value
- What it refers to (registration expiry, etc.)
- Where found in document
- Confidence level
- Context/surrounding text

Focus exclusively on date detection - ignore all other data.`;
  }
}

export default OptimizedClaudePrompts;