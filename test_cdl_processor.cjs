const fs = require('fs');

// Simulate the enhanced CDL extraction logic from documentProcessor.ts
function extractCDLData(text) {
  const data = {
    extractionConfidence: 0.5
  };
  
  // CDL Number
  const cdlPatterns = [
    /(?:CDL\s+Number|License\s+Number|CDL\s+#)\s*[#:]?\s*([A-Z]{2}-CDL-[0-9]{8}|[A-Z0-9\-]+)/gi,
    /(?:COMMERCIAL\s+DRIVER\s+LICENSE)\s*[#:]?\s*([A-Z]{2}-CDL-[0-9]{8}|[A-Z0-9\-]+)/gi
  ];
  
  for (const pattern of cdlPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      // Take the first match that looks like a proper CDL number
      const cdlNumber = matches[0][1].trim();
      if (cdlNumber.length >= 8 && /[A-Z0-9\-]/.test(cdlNumber)) {
        data.cdlNumber = cdlNumber;
        data.extractionConfidence += 0.2;
        break;
      }
    }
  }

  // CDL Class
  const classPatterns = [
    /Class:\s*([ABC])(?:\s*-\s*[\w\s/]+)?/gi,
    /(?:CDL\s+CLASS|LICENSE\s+CLASSIFICATION[^:]*Class)\s*[#:]?\s*([ABC])(?:\s*-\s*[\w\s/]+)?/gi
  ];
  
  for (const pattern of classPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const cdlClass = matches[0][1].trim().toUpperCase();
      if (['A', 'B', 'C'].includes(cdlClass)) {
        data.cdlClass = cdlClass;
        data.extractionConfidence += 0.15;
        break;
      }
    }
  }

  // CDL Dates
  const cdlIssueDatePatterns = [
    /(?:Issue\s+Date|Original\s+Issue)\s*[#:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
    /(?:ISSUED)\s*[#:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi
  ];
  
  const cdlExpiryDatePatterns = [
    /(?:Expiration\s+Date|Current\s+Expiration)\s*[#:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
    /(?:EXPIRES?)\s*[#:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi
  ];
  
  for (const pattern of cdlIssueDatePatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      data.cdlIssueDate = matches[0][1].trim();
      data.extractionConfidence += 0.1;
      break;
    }
  }
  
  for (const pattern of cdlExpiryDatePatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      data.cdlExpirationDate = matches[0][1].trim();
      data.extractionConfidence += 0.15;
      break;
    }
  }

  // CDL Endorsements - Extract from structured sections
  const endorsements = [];
  
  // Look for endorsements section and extract individual endorsement lines
  const endorsementSectionPattern = /(?:COMMERCIAL\s+)?ENDORSEMENTS([^]*?)(?=RESTRICTIONS|MEDICAL|DRIVER RECORD|$)/i;
  const endorsementSection = text.match(endorsementSectionPattern);
  
  if (endorsementSection) {
    const section = endorsementSection[1];
    console.log(`DEBUG: Found endorsement section: "${section.substring(0, 100)}..."`);
    
    // Extract endorsement lines like "H - Hazardous Materials"
    const endorsementLinePattern = /([A-Z])\s*[-–]\s*([^\n\r]+)/g;
    const matches = [...section.matchAll(endorsementLinePattern)];
    
    console.log(`DEBUG: Found ${matches.length} endorsement matches`);
    matches.forEach((match, i) => {
      console.log(`DEBUG Match ${i + 1}: "${match[1]}" - "${match[2]}"`);
      const letter = match[1].trim();
      // Valid CDL endorsement letters - include all possible endorsements
      if (['H', 'N', 'P', 'S', 'T', 'X', 'W'].includes(letter)) {
        endorsements.push(letter);
      }
    });
  } else {
    console.log('DEBUG: No endorsement section found');
  }
  
  if (endorsements.length > 0) {
    data.cdlEndorsements = [...new Set(endorsements)]; // Remove duplicates
    data.extractionConfidence += 0.15;
  }
  
  // CDL Restrictions - Extract from structured sections  
  const restrictions = [];
  
  // Look for restrictions section
  const restrictionSectionPattern = /RESTRICTIONS([^]*?)(?=MEDICAL|DRIVER RECORD|California DMV|Texas DPS|$)/i;
  const restrictionSection = text.match(restrictionSectionPattern);
  
  if (restrictionSection) {
    const section = restrictionSection[1];
    if (section.includes('NONE')) {
      // No restrictions
    } else {
      // Extract restriction lines like "L - No Air Brake Equipped CMV"
      const restrictionLinePattern = /([A-Z])\s*[-–]\s*([^\n\r]+)/g;
      const matches = [...section.matchAll(restrictionLinePattern)];
      
      matches.forEach(match => {
        const letter = match[1].trim();
        const description = match[2].trim();
        restrictions.push(`${letter} - ${description}`);
      });
    }
  }
  
  if (restrictions.length > 0) {
    data.cdlRestrictions = restrictions;
    data.extractionConfidence += 0.1;
  }

  return data;
}

// Test the enhanced CDL extraction
function testEnhancedCDLExtraction() {
  console.log('Testing Enhanced CDL Data Extraction\n');
  
  const testFiles = [
    'mock-fleet-documents/cdl-licenses/driver_001_cdl.txt',
    'mock-fleet-documents/cdl-licenses/driver_002_cdl.txt'
  ];
  
  testFiles.forEach((filePath, index) => {
    console.log(`=== Testing CDL Document ${index + 1}: ${filePath} ===`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const extractedData = extractCDLData(content);
      
      console.log('Extracted CDL Data:');
      console.log(`  CDL Number: ${extractedData.cdlNumber || 'Not found'}`);
      console.log(`  CDL Class: ${extractedData.cdlClass || 'Not found'}`);
      console.log(`  Issue Date: ${extractedData.cdlIssueDate || 'Not found'}`);
      console.log(`  Expiration Date: ${extractedData.cdlExpirationDate || 'Not found'}`);
      console.log(`  Endorsements: ${extractedData.cdlEndorsements ? extractedData.cdlEndorsements.join(', ') : 'None found'}`);
      console.log(`  Restrictions: ${extractedData.cdlRestrictions ? extractedData.cdlRestrictions.join('; ') : 'None found'}`);
      console.log(`  Extraction Confidence: ${extractedData.extractionConfidence.toFixed(2)}`);
      
      console.log('\n' + '='.repeat(60) + '\n');
      
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
    }
  });
}

// Run the test
testEnhancedCDLExtraction();