// Simple test script for medical certificate extraction
const fs = require('fs');
const path = require('path');

// Read mock medical certificate
const mockDocPath = path.join(__dirname, 'mock-fleet-documents', 'medical-certificates', 'driver_001_medical.txt');
const mockText = fs.readFileSync(mockDocPath, 'utf8');

console.log('🔍 Testing Medical Certificate Extraction Patterns');
console.log('='.repeat(60));
console.log('Mock Document Content:');
console.log(mockText);
console.log('='.repeat(60));

// Test certificate number extraction
const certPatterns = [
  /(?:Certificate\s+Number|CERTIFICATE\s+NUMBER|CERT\s+NO|CERTIFICATE\s+#)\s*[#:]?\s*([A-Z0-9\-]+)/gi,
  /Certificate\s+Number:\s*([A-Z0-9\-]+)/gi,
];

console.log('\n📋 Testing Certificate Number Extraction:');
for (const pattern of certPatterns) {
  const matches = mockText.match(pattern);
  if (matches) {
    console.log(`✅ Pattern found: ${pattern}`);
    console.log(`   Match: "${matches[0]}"`);
    const extracted = matches[0].replace(/^[^A-Z0-9]*/, '').replace(/Certificate\s+Number:\s*/gi, '').trim();
    console.log(`   Extracted: "${extracted}"`);
    break;
  }
}

// Test examiner name extraction
const examinerPatterns = [
  /Medical\s+Examiner:\s*(Dr\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+(?:,\s*MD)?)/gi,
  /Examiner\s+Signature:\s*(Dr\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+(?:,\s*MD)?)/gi
];

console.log('\n👨‍⚕️ Testing Examiner Name Extraction:');
for (const pattern of examinerPatterns) {
  const matches = mockText.match(pattern);
  if (matches) {
    console.log(`✅ Pattern found: ${pattern}`);
    console.log(`   Match: "${matches[0]}"`);
    const extracted = matches[0].replace(/^(Medical\s+Examiner|Examiner\s+Signature)\s*[#:]?\s*/gi, '').trim();
    console.log(`   Extracted: "${extracted}"`);
    break;
  }
}

// Test registry number extraction
const registryPatterns = [
  /National\s+Registry\s+Number:\s*([0-9]+)/gi,
  /National\s+Registry\s+ID:\s*([0-9]+)/gi,
];

console.log('\n🔢 Testing Registry Number Extraction:');
for (const pattern of registryPatterns) {
  const matches = mockText.match(pattern);
  if (matches) {
    console.log(`✅ Pattern found: ${pattern}`);
    console.log(`   Match: "${matches[0]}"`);
    const extracted = matches[0].replace(/^[^0-9]*/, '').trim();
    console.log(`   Extracted: "${extracted}"`);
    break;
  }
}

// Test date extraction
const issueDatePatterns = [
  /Issue\s+Date:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
  /Date\s+Issued:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/gi,
];

const expiryDatePatterns = [
  /Expiration\s+Date:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
];

console.log('\n📅 Testing Date Extraction:');
console.log('Issue Date:');
for (const pattern of issueDatePatterns) {
  const matches = mockText.match(pattern);
  if (matches) {
    console.log(`✅ Pattern found: ${pattern}`);
    console.log(`   Match: "${matches[0]}"`);
    const extracted = matches[0].replace(/^[^0-9A-Za-z]*/, '').replace(/^(Issue\s+Date|Date\s+Issued)\s*[#:]?\s*/gi, '').trim();
    console.log(`   Extracted: "${extracted}"`);
    break;
  }
}

console.log('Expiry Date:');
for (const pattern of expiryDatePatterns) {
  const matches = mockText.match(pattern);
  if (matches) {
    console.log(`✅ Pattern found: ${pattern}`);
    console.log(`   Match: "${matches[0]}"`);
    const extracted = matches[0].replace(/^[^0-9]*/, '').replace(/^Expiration\s+Date\s*[#:]?\s*/gi, '').trim();
    console.log(`   Extracted: "${extracted}"`);
    break;
  }
}

// Test restrictions extraction
const restrictionPatterns = [
  /Restrictions:\s*([A-Z\s]+(?:REQUIRED|NEEDED)?)/gi,
];

console.log('\n⚠️ Testing Restrictions Extraction:');
for (const pattern of restrictionPatterns) {
  const matches = mockText.match(pattern);
  if (matches) {
    console.log(`✅ Pattern found: ${pattern}`);
    console.log(`   Match: "${matches[0]}"`);
    const extracted = matches[0].replace(/^Restrictions\s*[#:]?\s*/gi, '').trim();
    console.log(`   Extracted: "${extracted}"`);
    break;
  }
}

console.log('\n='.repeat(60));
console.log('✅ Medical Certificate Extraction Test Complete!');