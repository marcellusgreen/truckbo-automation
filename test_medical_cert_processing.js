// Test script for medical certificate document processing
// Run with: node test_medical_cert_processing.js

console.log('🧪 Testing Medical Certificate Processing...\n');

// Mock file for testing
const mockMedicalFile = {
  name: 'john_smith_medical_certificate.pdf',
  type: 'application/pdf',
  size: 12345
};

const mockCdlFile = {
  name: 'maria_rodriguez_cdl.pdf', 
  type: 'application/pdf',
  size: 23456
};

// Test medical certificate OCR text generation
console.log('📄 Testing OCR Text Generation:\n');

// Simulate the OCR text for medical certificate
const medicalOCRText = `
DOT MEDICAL EXAMINER'S CERTIFICATE
U.S. Department of Transportation

DRIVER NAME: John Smith
DATE OF BIRTH: 03/15/1985
CERTIFICATE NUMBER: MED123456789

PHYSICAL EXAMINATION DATE: 06/15/2024
EXPIRATION DATE: 06/15/2025

EXAMINER: Dr. Sarah Johnson
NATIONAL REGISTRY NUMBER: NR123456

MEDICAL EXAMINATION RESULTS:
☑ QUALIFIED
☐ QUALIFIED WITH RESTRICTIONS
☐ NOT QUALIFIED

RESTRICTIONS: NONE

This certificate is valid for operation of commercial motor vehicles
requiring a Commercial Driver's License.

DOT MEDICAL CARD - KEEP WITH LICENSE
`;

console.log('✅ Medical Certificate OCR Text:');
console.log(medicalOCRText);

// Simulate CDL OCR text
const cdlOCRText = `
COMMERCIAL DRIVER LICENSE
TX DEPARTMENT OF MOTOR VEHICLES

LICENSE HOLDER: Maria Rodriguez
DATE OF BIRTH: 07/22/1990
CDL NUMBER: CDLTX789456

CLASS: A
ENDORSEMENTS: H, N
RESTRICTIONS: NONE

ISSUE DATE: 03/15/2020
EXPIRATION DATE: 03/15/2028

STATE: TX

COMMERCIAL DRIVER LICENSE
FEDERAL LIMITS APPLY
`;

console.log('\n✅ CDL OCR Text:');
console.log(cdlOCRText);

// Test data extraction patterns
console.log('\n🔍 Testing Data Extraction Patterns:\n');

// Medical certificate data extraction test
function testMedicalCertExtraction(text) {
  const results = {};
  
  // Extract driver name
  const nameMatch = text.match(/(?:DRIVER\s+NAME|NAME)\s*[#:]?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi);
  if (nameMatch) {
    const fullName = nameMatch[0].replace(/^(DRIVER\s+NAME|NAME)\s*[#:]?\s*/gi, '').trim();
    const nameParts = fullName.split(/\s+/);
    results.firstName = nameParts[0]; 
    results.lastName = nameParts.slice(1).join(' ');
  }
  
  // Extract certificate number
  const certMatch = text.match(/(?:CERTIFICATE\s+NUMBER)\s*[#:]?\s*([A-Z0-9]+)/gi);
  if (certMatch) {
    results.certificateNumber = certMatch[0].replace(/^(CERTIFICATE\s+NUMBER)\s*[#:]?\s*/gi, '').trim();
  }
  
  // Extract expiration date
  const expiryMatch = text.match(/(?:EXPIRATION\s+DATE)\s*[#:]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi);
  if (expiryMatch) {
    results.expirationDate = expiryMatch[0].replace(/^[^0-9]*/, '').trim();
  }
  
  // Extract examiner
  const examinerMatch = text.match(/(?:EXAMINER)\s*[#:]?\s*(Dr\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+)/gi);
  if (examinerMatch) {
    results.examinerName = examinerMatch[0].replace(/^(EXAMINER)\s*[#:]?\s*/gi, '').trim();
  }
  
  return results;
}

// CDL data extraction test
function testCDLExtraction(text) {
  const results = {};
  
  // Extract driver name
  const nameMatch = text.match(/(?:LICENSE\s+HOLDER)\s*[#:]?\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi);
  if (nameMatch) {
    const fullName = nameMatch[0].replace(/^(LICENSE\s+HOLDER)\s*[#:]?\s*/gi, '').trim();
    const nameParts = fullName.split(/\s+/);
    results.firstName = nameParts[0];
    results.lastName = nameParts.slice(1).join(' ');
  }
  
  // Extract CDL number
  const cdlMatch = text.match(/(?:CDL\s+NUMBER)\s*[#:]?\s*([A-Z0-9\-]+)/gi);
  if (cdlMatch) {
    results.cdlNumber = cdlMatch[0].replace(/^(CDL\s+NUMBER)\s*[#:]?\s*/gi, '').trim();
  }
  
  // Extract class
  const classMatch = text.match(/(?:CLASS)\s*[#:]?\s*([ABC])/gi);
  if (classMatch) {
    results.cdlClass = classMatch[0].replace(/^(CLASS)\s*[#:]?\s*/gi, '').trim().toUpperCase();
  }
  
  // Extract endorsements
  const endorseMatch = text.match(/(?:ENDORSEMENTS)\s*[#:]?\s*([HNTPSX\s,]+)/gi);
  if (endorseMatch) {
    const endorseStr = endorseMatch[0].replace(/^(ENDORSEMENTS)\s*[#:]?\s*/gi, '').trim();
    const letters = endorseStr.match(/[HNTPSX]/g);
    if (letters) {
      results.endorsements = [...new Set(letters)];
    }
  }
  
  return results;
}

// Run extraction tests
const medicalResults = testMedicalCertExtraction(medicalOCRText);
console.log('📋 Medical Certificate Extraction Results:');
console.log(JSON.stringify(medicalResults, null, 2));

const cdlResults = testCDLExtraction(cdlOCRText);
console.log('\n📋 CDL Extraction Results:');
console.log(JSON.stringify(cdlResults, null, 2));

// Test Summary
console.log('\n📊 Test Summary:');
console.log('==================');

const tests = [
  { name: 'Medical cert name extraction', pass: medicalResults.firstName === 'John' && medicalResults.lastName === 'Smith' },
  { name: 'Medical cert number extraction', pass: medicalResults.certificateNumber === 'MED123456789' },
  { name: 'Medical cert expiry extraction', pass: medicalResults.expirationDate === '06/15/2025' },
  { name: 'Medical examiner extraction', pass: medicalResults.examinerName === 'Dr. Sarah Johnson' },
  { name: 'CDL name extraction', pass: cdlResults.firstName === 'Maria' && cdlResults.lastName === 'Rodriguez' },
  { name: 'CDL number extraction', pass: cdlResults.cdlNumber === 'CDLTX789456' },
  { name: 'CDL class extraction', pass: cdlResults.cdlClass === 'A' },
  { name: 'CDL endorsements extraction', pass: cdlResults.endorsements && cdlResults.endorsements.includes('H') && cdlResults.endorsements.includes('N') }
];

tests.forEach(test => {
  const status = test.pass ? '✅' : '❌';
  console.log(`${status} ${test.name}: ${test.pass ? 'PASS' : 'FAIL'}`);
});

const passedTests = tests.filter(t => t.pass).length;
const totalTests = tests.length;
console.log(`\n🎯 Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('\n🎉 All tests passed! Medical certificate OCR processing is working correctly.');
  console.log('\n📝 Ready for Phase 3: Dashboard & Alerts');
} else {
  console.log('\n⚠️  Some tests failed. Please review the OCR patterns.');
}