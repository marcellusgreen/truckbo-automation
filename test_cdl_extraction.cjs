const fs = require('fs');
const path = require('path');

// Test CDL data extraction patterns
function testCDLExtraction() {
  console.log('Testing CDL Data Extraction Patterns\n');
  
  const testFiles = [
    'mock-fleet-documents/cdl-licenses/driver_001_cdl.txt',
    'mock-fleet-documents/cdl-licenses/driver_002_cdl.txt'
  ];
  
  testFiles.forEach((filePath, index) => {
    console.log(`=== Testing CDL Document ${index + 1}: ${filePath} ===`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log('Content loaded successfully\n');
      
      // Test CDL Number extraction
      const cdlPatterns = [
        /(?:CDL\s+Number|License\s+Number|CDL\s+#)\s*[#:]?\s*([A-Z0-9\-]+)/gi,
        /Commercial\s+Driver\s+License\s*[#:]?\s*([A-Z0-9\-]+)/gi
      ];
      
      console.log('CDL Number Extraction:');
      cdlPatterns.forEach((pattern, i) => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          console.log(`  Pattern ${i + 1}: ${match[1]}`);
        });
      });
      
      // Test CDL Class extraction
      const classPatterns = [
        /Class:\s*([A-C](?:\s*-\s*[\w\s/]+)?)/gi,
        /License\s+Classification[^:]*Class:\s*([A-C](?:\s*-\s*[\w\s/]+)?)/gi
      ];
      
      console.log('CDL Class Extraction:');
      classPatterns.forEach((pattern, i) => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          console.log(`  Pattern ${i + 1}: ${match[1]}`);
        });
      });
      
      // Test Issue Date extraction
      const issueDatePatterns = [
        /(?:Issue\s+Date|Original\s+Issue)\s*[:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        /Issued?\s*[:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi
      ];
      
      console.log('Issue Date Extraction:');
      issueDatePatterns.forEach((pattern, i) => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          console.log(`  Pattern ${i + 1}: ${match[1]}`);
        });
      });
      
      // Test Expiration Date extraction
      const expirationPatterns = [
        /(?:Expiration\s+Date|Current\s+Expiration)\s*[:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        /Expires?\s*[:]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi
      ];
      
      console.log('Expiration Date Extraction:');
      expirationPatterns.forEach((pattern, i) => {
        const matches = [...content.matchAll(pattern)];
        matches.forEach(match => {
          console.log(`  Pattern ${i + 1}: ${match[1]}`);
        });
      });
      
      // Test Endorsements extraction
      const endorsementPatterns = [
        /([A-Z])\s*[-–]\s*([\w\s\/]+?)(?=\n|$|[A-Z]\s*[-–])/g,
        /ENDORSEMENTS([^]*?)(?=RESTRICTIONS|MEDICAL|DRIVER RECORD|$)/i
      ];
      
      console.log('Endorsements Extraction:');
      
      // Pattern 1: Individual endorsement lines
      const endorsementMatches = [...content.matchAll(endorsementPatterns[0])];
      if (endorsementMatches.length > 0) {
        console.log('  Individual endorsements found:');
        endorsementMatches.forEach(match => {
          console.log(`    ${match[1]}: ${match[2].trim()}`);
        });
      }
      
      // Pattern 2: Endorsements section
      const sectionMatch = content.match(endorsementPatterns[1]);
      if (sectionMatch) {
        console.log('  Endorsements section found:');
        const section = sectionMatch[1];
        const lines = section.split('\n').filter(line => line.trim());
        lines.forEach(line => {
          const match = line.match(/([A-Z])\s*[-–]\s*(.*)/);
          if (match) {
            console.log(`    ${match[1]}: ${match[2].trim()}`);
          }
        });
      }
      
      // Test Restrictions extraction
      const restrictionPatterns = [
        /RESTRICTIONS([^]*?)(?=MEDICAL|DRIVER RECORD|California DMV|Texas DPS|$)/i,
        /([A-Z])\s*[-–]\s*(No\s+[\w\s\/]+?)(?=\n|$|[A-Z]\s*[-–])/g
      ];
      
      console.log('Restrictions Extraction:');
      
      // Pattern 1: Restrictions section
      const restrictionSectionMatch = content.match(restrictionPatterns[0]);
      if (restrictionSectionMatch) {
        const section = restrictionSectionMatch[1];
        if (section.includes('NONE')) {
          console.log('  No restrictions found');
        } else {
          console.log('  Restrictions section found:');
          const lines = section.split('\n').filter(line => line.trim());
          lines.forEach(line => {
            const match = line.match(/([A-Z])\s*[-–]\s*(.*)/);
            if (match) {
              console.log(`    ${match[1]}: ${match[2].trim()}`);
            }
          });
        }
      }
      
      // Pattern 2: Individual restriction lines
      const restrictionMatches = [...content.matchAll(restrictionPatterns[1])];
      if (restrictionMatches.length > 0) {
        console.log('  Individual restrictions found:');
        restrictionMatches.forEach(match => {
          console.log(`    ${match[1]}: ${match[2].trim()}`);
        });
      }
      
      console.log('\n' + '='.repeat(60) + '\n');
      
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
    }
  });
}

// Run the test
testCDLExtraction();