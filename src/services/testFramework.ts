// Automated Testing Framework for TruckBo Fleet Management
// Provides comprehensive testing tools for document processing and data validation

import { documentProcessor, ExtractedVehicleData } from './documentProcessor';
import { multiBatchDocumentProcessor } from './multiBatchDocumentProcessor';
// Storage functionality available if needed for future tests
// import { persistentFleetStorage, VehicleRecord } from './persistentFleetStorage';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  category: 'document' | 'data' | 'performance' | 'error' | 'ux';
  priority: 'high' | 'medium' | 'low';
  expectedResult: any;
  status: 'pending' | 'running' | 'passed' | 'failed';
  executionTime?: number;
  errorMessage?: string;
  actualResult?: any;
}

export interface TestResult {
  testId: string;
  passed: boolean;
  executionTime: number;
  actualResult: any;
  expectedResult: any;
  errorMessage?: string;
  details?: any;
}

export interface TestSuite {
  name: string;
  description: string;
  tests: TestCase[];
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
    totalExecutionTime: number;
  };
}

class TestFramework {
  private testSuites: Map<string, TestSuite> = new Map();
  private isRunning = false;

  // Create test documents with known data for validation
  async generateTestDocument(type: 'registration' | 'insurance', vehicleData: {
    vin: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    truckNumber: string;
    registrationNumber?: string;
    registrationExpiry?: string;
    registrationState?: string;
    insuranceCarrier?: string;
    policyNumber?: string;
    insuranceExpiry?: string;
    coverageAmount?: number;
  }): Promise<File> {
    let content = '';
    let fileName = '';

    if (type === 'registration') {
      content = `
VEHICLE REGISTRATION DOCUMENT
=============================

VEHICLE IDENTIFICATION NUMBER (VIN): ${vehicleData.vin}
MAKE: ${vehicleData.make}
MODEL: ${vehicleData.model}
YEAR: ${vehicleData.year}
LICENSE PLATE: ${vehicleData.licensePlate}

REGISTRATION NUMBER: ${vehicleData.registrationNumber || 'REG-' + vehicleData.vin.slice(-6)}
REGISTRATION STATE: ${vehicleData.registrationState || 'TX'}
REGISTRATION EXPIRES: ${vehicleData.registrationExpiry || '12/31/2024'}
REGISTERED OWNER: SUNBELT TRUCKING LLC

TRUCK NUMBER: ${vehicleData.truckNumber}
DOT NUMBER: 12345678
      `.trim();
      fileName = `test_${vehicleData.truckNumber}_registration.txt`;
    } else {
      content = `
COMMERCIAL VEHICLE INSURANCE CERTIFICATE
=======================================

VEHICLE IDENTIFICATION NUMBER: ${vehicleData.vin}
VEHICLE: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}
LICENSE PLATE: ${vehicleData.licensePlate}

INSURANCE CARRIER: ${vehicleData.insuranceCarrier || 'Progressive Commercial'}
POLICY NUMBER: ${vehicleData.policyNumber || 'POL-' + vehicleData.vin.slice(-6)}
EXPIRATION DATE: ${vehicleData.insuranceExpiry || '12/31/2024'}
LIABILITY COVERAGE: $${vehicleData.coverageAmount || 1000000}

INSURED: SUNBELT TRUCKING LLC
TRUCK NUMBER: ${vehicleData.truckNumber}
      `.trim();
      fileName = `test_${vehicleData.truckNumber}_insurance.txt`;
    }

    // Create a File object from the text content
    const blob = new Blob([content], { type: 'text/plain' });
    return new File([blob], fileName, { type: 'text/plain' });
  }

  // Generate a set of test documents for comprehensive testing
  async generateTestDocumentSet(vehicleCount: number): Promise<{
    registrationFiles: File[];
    insuranceFiles: File[];
    expectedData: any[];
  }> {
    const registrationFiles: File[] = [];
    const insuranceFiles: File[] = [];
    const expectedData: any[] = [];

    for (let i = 1; i <= vehicleCount; i++) {
      const truckNumber = String(i).padStart(3, '0');
      const vin = `1HGBH41JXMN${String(100000 + i).slice(-6)}`;
      
      const vehicleData = {
        vin,
        make: 'FREIGHTLINER',
        model: 'CASCADIA',
        year: 2022,
        licensePlate: `TX${String(1000 + i)}`,
        truckNumber,
        registrationNumber: `REG-TX-${truckNumber}-2024`,
        registrationExpiry: `${String(i % 12 + 1).padStart(2, '0')}/15/2024`,
        registrationState: 'TX',
        insuranceCarrier: ['Progressive Commercial', 'State Farm Commercial', 'Nationwide Commercial'][i % 3],
        policyNumber: `POL-${truckNumber}-${String(2024 + (i % 2))}`,
        insuranceExpiry: `12/31/${2024 + (i % 2)}`,
        coverageAmount: i % 2 === 0 ? 1000000 : 2000000
      };

      const regFile = await this.generateTestDocument('registration', vehicleData);
      const insFile = await this.generateTestDocument('insurance', vehicleData);

      registrationFiles.push(regFile);
      insuranceFiles.push(insFile);
      expectedData.push(vehicleData);
    }

    return { registrationFiles, insuranceFiles, expectedData };
  }

  // Test single document processing accuracy
  async testDocumentProcessingAccuracy(testFiles: File[], expectedData: any[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (let i = 0; i < testFiles.length; i++) {
      const file = testFiles[i];
      const expected = expectedData[i];
      const startTime = Date.now();

      try {
        const fileList = this.createFileList([file]);
        const processingResult = await documentProcessor.processBulkDocuments(fileList);
        const executionTime = Date.now() - startTime;

        if (processingResult.vehicleData.length === 0) {
          results.push({
            testId: `DOC-ACC-${i + 1}`,
            passed: false,
            executionTime,
            actualResult: null,
            expectedResult: expected,
            errorMessage: 'No vehicle data extracted'
          });
          continue;
        }

        const extracted = processingResult.vehicleData[0];
        const accuracy = this.calculateExtractionAccuracy(extracted, expected);

        results.push({
          testId: `DOC-ACC-${i + 1}`,
          passed: accuracy >= 0.9, // 90% accuracy threshold
          executionTime,
          actualResult: { extracted, accuracy },
          expectedResult: expected,
          details: { accuracy, processingResult }
        });

      } catch (error) {
        results.push({
          testId: `DOC-ACC-${i + 1}`,
          passed: false,
          executionTime: Date.now() - startTime,
          actualResult: null,
          expectedResult: expected,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  // Test multi-batch processing and reconciliation
  async testMultiBatchProcessing(registrationFiles: File[], insuranceFiles: File[], expectedData: any[]): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Clear existing data
      multiBatchDocumentProcessor.clearProcessingData();

      // Process registration batch
      const regFileList = this.createFileList(registrationFiles);
      await multiBatchDocumentProcessor.processBatch(regFileList);

      // Process insurance batch
      const insFileList = this.createFileList(insuranceFiles);
      await multiBatchDocumentProcessor.processBatch(insFileList);

      // Get reconciliation results
      const state = multiBatchDocumentProcessor.getProcessingState();
      const reconciliation = state.reconciliationResult;

      if (!reconciliation) {
        throw new Error('No reconciliation result available');
      }

      const executionTime = Date.now() - startTime;

      // Validate reconciliation quality
      const totalVehicles = reconciliation.summary.totalVehicles;
      const fullyDocumented = reconciliation.summary.fullyDocumented;
      const reconciliationScore = reconciliation.summary.reconciliationScore;

      const passed = totalVehicles === expectedData.length && 
                    reconciliationScore >= 90; // 90% completeness threshold

      return {
        testId: 'MULTI-BATCH-001',
        passed,
        executionTime,
        actualResult: {
          totalVehicles,
          fullyDocumented,
          reconciliationScore,
          completeVehicles: reconciliation.completeVehicles.length,
          registrationOnly: reconciliation.registrationOnly.length,
          insuranceOnly: reconciliation.insuranceOnly.length
        },
        expectedResult: {
          totalVehicles: expectedData.length,
          reconciliationScore: 100,
          completeVehicles: expectedData.length
        },
        details: reconciliation
      };

    } catch (error) {
      return {
        testId: 'MULTI-BATCH-001',
        passed: false,
        executionTime: Date.now() - startTime,
        actualResult: null,
        expectedResult: { totalVehicles: expectedData.length },
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test system performance with large document sets
  async testPerformance(documentCount: number): Promise<TestResult> {
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting performance test with ${documentCount} documents...`);
      
      // Clear previous data to avoid interference
      multiBatchDocumentProcessor.clearProcessingData();
      
      const testData = await this.generateTestDocumentSet(documentCount);
      const processingStartTime = Date.now();

      // Measure memory before processing
      const initialMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : null;

      // Test batch processing performance with detailed timing
      console.log(`📋 Processing ${documentCount} registration documents...`);
      const regStartTime = Date.now();
      const regFileList = this.createFileList(testData.registrationFiles);
      await multiBatchDocumentProcessor.processBatch(regFileList);
      const regProcessingTime = Date.now() - regStartTime;

      console.log(`🛡️ Processing ${documentCount} insurance documents...`);
      const insStartTime = Date.now();
      const insFileList = this.createFileList(testData.insuranceFiles);
      await multiBatchDocumentProcessor.processBatch(insFileList);
      const insProcessingTime = Date.now() - insStartTime;

      // Measure reconciliation performance
      console.log(`🔄 Performing data reconciliation...`);
      const reconStartTime = Date.now();
      const state = multiBatchDocumentProcessor.getProcessingState();
      const reconTime = Date.now() - reconStartTime;

      const totalProcessingTime = Date.now() - processingStartTime;
      const totalExecutionTime = Date.now() - startTime;
      
      // Measure memory after processing
      const finalMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : null;
      const memoryIncrease = initialMemory && finalMemory ? finalMemory - initialMemory : null;

      // Performance metrics
      const totalDocuments = documentCount * 2;
      const timePerDocument = totalProcessingTime / totalDocuments;
      const documentsPerSecond = totalDocuments / (totalProcessingTime / 1000);
      
      // Performance thresholds (more realistic for large batches)
      const performanceThresholds = {
        timePerDocumentMs: documentCount <= 25 ? 1000 : documentCount <= 50 ? 1500 : 2000,
        maxMemoryMB: documentCount <= 25 ? 100 : documentCount <= 50 ? 200 : 500
      };
      
      const passed = timePerDocument < performanceThresholds.timePerDocumentMs &&
                    (!memoryIncrease || memoryIncrease < performanceThresholds.maxMemoryMB * 1024 * 1024);

      return {
        testId: `PERF-${documentCount}`,
        passed,
        executionTime: totalExecutionTime,
        actualResult: {
          totalDocuments,
          totalProcessingTime,
          registrationProcessingTime: regProcessingTime,
          insuranceProcessingTime: insProcessingTime,
          reconciliationTime: reconTime,
          timePerDocument: Math.round(timePerDocument),
          documentsPerSecond: Math.round(documentsPerSecond * 100) / 100,
          initialMemoryMB: initialMemory ? Math.round(initialMemory / 1024 / 1024) : null,
          finalMemoryMB: finalMemory ? Math.round(finalMemory / 1024 / 1024) : null,
          memoryIncreaseMB: memoryIncrease ? Math.round(memoryIncrease / 1024 / 1024) : null,
          vehiclesReconciled: state.reconciliationResult?.summary.totalVehicles || 0,
          reconciliationScore: state.reconciliationResult?.summary.reconciliationScore || 0
        },
        expectedResult: {
          timePerDocument: `<${performanceThresholds.timePerDocumentMs}ms`,
          memoryIncrease: `<${performanceThresholds.maxMemoryMB}MB`,
          reconciliationScore: '>90%'
        },
        details: {
          generationTime: processingStartTime - startTime,
          breakdown: {
            registration: regProcessingTime,
            insurance: insProcessingTime,
            reconciliation: reconTime
          },
          thresholds: performanceThresholds
        }
      };

    } catch (error) {
      return {
        testId: `PERF-${documentCount}`,
        passed: false,
        executionTime: Date.now() - startTime,
        actualResult: null,
        expectedResult: { documentCount },
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test error handling with problematic files
  async testErrorHandling(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    console.log('🚨 Starting comprehensive error handling tests...');

    // Test 1: Empty file
    try {
      console.log('📁 Testing empty file handling...');
      const emptyFile = new File([''], 'empty.txt', { type: 'text/plain' });
      const fileList = this.createFileList([emptyFile]);
      const result = await documentProcessor.processBulkDocuments(fileList);
      
      const passed = result.errors.length > 0 || result.unprocessedFiles.length > 0 || result.vehicleData.length === 0;
      
      results.push({
        testId: 'ERROR-001-EMPTY',
        passed,
        executionTime: 0,
        actualResult: {
          vehicleDataCount: result.vehicleData.length,
          errorsCount: result.errors.length,
          unprocessedCount: result.unprocessedFiles.length,
          summary: result.summary
        },
        expectedResult: 'Should handle empty file gracefully with no vehicle data extracted',
        details: { processingResult: result }
      });
      console.log(`📁 Empty file test: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    } catch (error) {
      results.push({
        testId: 'ERROR-001-EMPTY',
        passed: true, // Error thrown is acceptable for empty files
        executionTime: 0,
        actualResult: { errorThrown: true, message: error instanceof Error ? error.message : String(error) },
        expectedResult: 'Error handling for empty file'
      });
      console.log('📁 Empty file test: ✅ PASSED (error thrown, which is acceptable)');
    }

    // Test 2: File with no vehicle data
    try {
      console.log('📄 Testing file with no vehicle data...');
      const noDataContent = 'This is just random text with no vehicle information at all. Lorem ipsum dolor sit amet.';
      const noDataFile = new File([noDataContent], 'no_data.txt', { type: 'text/plain' });
      const fileList = this.createFileList([noDataFile]);
      const result = await documentProcessor.processBulkDocuments(fileList);
      
      // Should either extract no data or flag for review
      const passed = result.vehicleData.length === 0 || 
                    (result.vehicleData.length > 0 && result.vehicleData[0].needsReview === true) ||
                    result.unprocessedFiles.includes('no_data.txt');
      
      results.push({
        testId: 'ERROR-002-NO-DATA',
        passed,
        executionTime: 0,
        actualResult: {
          vehicleDataCount: result.vehicleData.length,
          needsReview: result.vehicleData[0]?.needsReview,
          extractionConfidence: result.vehicleData[0]?.extractionConfidence,
          unprocessedFiles: result.unprocessedFiles
        },
        expectedResult: 'Should handle files with no vehicle data by not extracting data or flagging for review',
        details: { processingResult: result }
      });
      console.log(`📄 No vehicle data test: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    } catch (error) {
      results.push({
        testId: 'ERROR-002-NO-DATA',
        passed: false,
        executionTime: 0,
        actualResult: null,
        expectedResult: 'Should handle files with no vehicle data',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('📄 No vehicle data test: ❌ FAILED (unexpected error)');
    }

    // Test 3: Corrupted/malformed VIN
    try {
      console.log('🔢 Testing malformed VIN handling...');
      const malformedVinContent = `
VEHICLE REGISTRATION
VIN: INVALID_VIN_TOO_SHORT
MAKE: FORD
MODEL: F150
LICENSE PLATE: ABC123
REGISTRATION EXPIRES: 12/31/2024
      `;
      const malformedVinFile = new File([malformedVinContent], 'malformed_vin.txt', { type: 'text/plain' });
      const fileList = this.createFileList([malformedVinFile]);
      const result = await documentProcessor.processBulkDocuments(fileList);
      
      // Should either not extract VIN or flag for review
      const passed = (result.vehicleData.length === 0) || 
                    (result.vehicleData.length > 0 && 
                     (!result.vehicleData[0].vin || result.vehicleData[0].needsReview === true));
      
      results.push({
        testId: 'ERROR-003-MALFORMED-VIN',
        passed,
        executionTime: 0,
        actualResult: {
          vehicleDataCount: result.vehicleData.length,
          extractedVin: result.vehicleData[0]?.vin,
          needsReview: result.vehicleData[0]?.needsReview,
          extractionConfidence: result.vehicleData[0]?.extractionConfidence,
          processingNotes: result.vehicleData[0]?.processingNotes
        },
        expectedResult: 'Should reject malformed VIN or flag for review',
        details: { processingResult: result }
      });
      console.log(`🔢 Malformed VIN test: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    } catch (error) {
      results.push({
        testId: 'ERROR-003-MALFORMED-VIN',
        passed: false,
        executionTime: 0,
        actualResult: null,
        expectedResult: 'Should handle malformed VIN gracefully',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('🔢 Malformed VIN test: ❌ FAILED (unexpected error)');
    }

    // Test 4: Invalid VIN format
    try {
      console.log('🚫 Testing invalid VIN format handling...');
      const invalidVinContent = 'VEHICLE REGISTRATION\nINVALID VIN: THISISNOTAVALIDVIN\nMAKE: CHEVROLET\nMODEL: SILVERADO';
      const invalidVinFile = new File([invalidVinContent], 'invalid_vin.txt', { type: 'text/plain' });
      const fileList = this.createFileList([invalidVinFile]);
      const result = await documentProcessor.processBulkDocuments(fileList);
      
      const passed = result.vehicleData.length === 0 || 
                    (result.vehicleData.length > 0 && 
                     (!result.vehicleData[0].vin || result.vehicleData[0].needsReview === true));
      
      results.push({
        testId: 'ERROR-004-INVALID-VIN',
        passed,
        executionTime: 0,
        actualResult: {
          vehicleDataCount: result.vehicleData.length,
          extractedVin: result.vehicleData[0]?.vin,
          needsReview: result.vehicleData[0]?.needsReview
        },
        expectedResult: 'Should flag invalid VIN for review'
      });
      console.log(`🚫 Invalid VIN test: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    } catch (error) {
      results.push({
        testId: 'ERROR-004-INVALID-VIN',
        passed: false,
        executionTime: 0,
        actualResult: null,
        expectedResult: 'Should handle invalid VIN gracefully',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('🚫 Invalid VIN test: ❌ FAILED (unexpected error)');
    }

    // Test 5: Unsupported file format
    try {
      console.log('🔧 Testing unsupported file format handling...');
      const unsupportedContent = 'VIN: 1HGBH41JXMN109186\nMAKE: HONDA\nMODEL: CIVIC';
      const unsupportedFile = new File([unsupportedContent], 'test.xyz', { type: 'application/unknown' });
      const fileList = this.createFileList([unsupportedFile]);
      const result = await documentProcessor.processBulkDocuments(fileList);
      
      // Should skip unsupported files
      const passed = result.vehicleData.length === 0 && 
                    (result.unprocessedFiles.includes('test.xyz') || result.summary.totalFiles === 0);
      
      results.push({
        testId: 'ERROR-005-UNSUPPORTED-FORMAT',
        passed,
        executionTime: 0,
        actualResult: {
          vehicleDataCount: result.vehicleData.length,
          unprocessedFiles: result.unprocessedFiles,
          totalFiles: result.summary.totalFiles
        },
        expectedResult: 'Should skip unsupported file formats'
      });
      console.log(`🔧 Unsupported format test: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    } catch (error) {
      results.push({
        testId: 'ERROR-005-UNSUPPORTED-FORMAT',
        passed: false,
        executionTime: 0,
        actualResult: null,
        expectedResult: 'Should handle unsupported formats gracefully',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('🔧 Unsupported format test: ❌ FAILED (unexpected error)');
    }

    // Test 6: Recovery after processing errors
    try {
      console.log('🔄 Testing error recovery with mixed file quality...');
      const goodContent = `
VEHICLE REGISTRATION
VIN: 1HGBH41JXMN109186
MAKE: HONDA
MODEL: CIVIC
LICENSE PLATE: ABC123
REGISTRATION EXPIRES: 12/31/2024
      `;
      const badContent = '';
      const anotherGoodContent = `
INSURANCE CERTIFICATE
VIN: 1HGBH41JXMN109187
MAKE: TOYOTA
MODEL: CAMRY
POLICY NUMBER: POL-12345
EXPIRATION DATE: 06/30/2025
      `;
      
      const goodFile1 = new File([goodContent], 'good1.txt', { type: 'text/plain' });
      const badFile = new File([badContent], 'bad.txt', { type: 'text/plain' });
      const goodFile2 = new File([anotherGoodContent], 'good2.txt', { type: 'text/plain' });
      
      const fileList = this.createFileList([goodFile1, badFile, goodFile2]);
      const result = await documentProcessor.processBulkDocuments(fileList);
      
      // Should process good files despite bad ones
      const passed = result.vehicleData.length >= 2 && // Should get at least 2 good records
                    result.summary.processed >= 2;
      
      results.push({
        testId: 'ERROR-006-RECOVERY',
        passed,
        executionTime: 0,
        actualResult: {
          vehicleDataCount: result.vehicleData.length,
          processed: result.summary.processed,
          errors: result.errors.length,
          unprocessed: result.unprocessedFiles.length
        },
        expectedResult: 'Should continue processing good files after encountering bad ones'
      });
      console.log(`🔄 Error recovery test: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    } catch (error) {
      results.push({
        testId: 'ERROR-006-RECOVERY',
        passed: false,
        executionTime: 0,
        actualResult: null,
        expectedResult: 'Should handle mixed file quality gracefully',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.log('🔄 Error recovery test: ❌ FAILED (unexpected error)');
    }

    console.log('🚨 Error handling tests completed.');
    return results;
  }

  // Calculate extraction accuracy by comparing fields
  private calculateExtractionAccuracy(extracted: ExtractedVehicleData, expected: any): number {
    const fields = ['vin', 'make', 'model', 'year', 'licensePlate', 'truckNumber'];
    let correctFields = 0;
    let totalFields = 0;

    for (const field of fields) {
      if (expected[field] !== undefined) {
        totalFields++;
        if (extracted[field as keyof ExtractedVehicleData] === expected[field]) {
          correctFields++;
        }
      }
    }

    // Check type-specific fields
    if (extracted.documentType === 'registration') {
      const regFields = ['registrationNumber', 'registrationExpiry', 'registrationState'];
      for (const field of regFields) {
        if (expected[field] !== undefined) {
          totalFields++;
          if (extracted[field as keyof ExtractedVehicleData] === expected[field]) {
            correctFields++;
          }
        }
      }
    } else if (extracted.documentType === 'insurance') {
      const insFields = ['insuranceCarrier', 'policyNumber', 'insuranceExpiry', 'coverageAmount'];
      for (const field of insFields) {
        if (expected[field] !== undefined) {
          totalFields++;
          if (extracted[field as keyof ExtractedVehicleData] === expected[field]) {
            correctFields++;
          }
        }
      }
    }

    return totalFields > 0 ? correctFields / totalFields : 0;
  }

  // Helper to create FileList from File array
  private createFileList(files: File[]): FileList {
    const dt = new DataTransfer();
    files.forEach(file => dt.items.add(file));
    return dt.files;
  }

  // Test document format variations and edge cases
  async testDocumentFormats(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Test 1: Different date formats
    const dateFormats = [
      { format: 'MM/DD/YYYY', date: '12/31/2024', expected: '12/31/2024' },
      { format: 'DD/MM/YYYY', date: '31/12/2024', expected: '31/12/2024' },
      { format: 'Month DD, YYYY', date: 'December 31, 2024', expected: 'December 31, 2024' },
      { format: 'DD-MMM-YYYY', date: '31-Dec-2024', expected: '31-Dec-2024' }
    ];

    for (const dateTest of dateFormats) {
      try {
        const content = `
VEHICLE REGISTRATION
VIN: 1HGBH41JXMN109186
REGISTRATION EXPIRES: ${dateTest.date}
MAKE: FORD
MODEL: F150
        `;
        const file = new File([content], `date_test_${dateTest.format}.txt`, { type: 'text/plain' });
        const fileList = this.createFileList([file]);
        const result = await documentProcessor.processBulkDocuments(fileList);

        const passed = result.vehicleData.length > 0 && 
                      result.vehicleData[0].registrationExpiry !== undefined;

        results.push({
          testId: `FORMAT-DATE-${dateTest.format}`,
          passed,
          executionTime: 0,
          actualResult: result.vehicleData[0]?.registrationExpiry,
          expectedResult: dateTest.expected,
          details: { format: dateTest.format, extractedDate: result.vehicleData[0]?.registrationExpiry }
        });
      } catch (error) {
        results.push({
          testId: `FORMAT-DATE-${dateTest.format}`,
          passed: false,
          executionTime: 0,
          actualResult: null,
          expectedResult: dateTest.expected,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Test 2: VIN format variations
    const vinFormats = [
      'VIN: 1HGBH41JXMN109186',
      'VEHICLE IDENTIFICATION NUMBER: 1HGBH41JXMN109186',
      'V.I.N.: 1HGBH41JXMN109186',
      '1HGBH41JXMN109186 (VIN)'
    ];

    for (let i = 0; i < vinFormats.length; i++) {
      try {
        const content = `
VEHICLE REGISTRATION
${vinFormats[i]}
MAKE: FORD
MODEL: F150
        `;
        const file = new File([content], `vin_test_${i}.txt`, { type: 'text/plain' });
        const fileList = this.createFileList([file]);
        const result = await documentProcessor.processBulkDocuments(fileList);

        const passed = result.vehicleData.length > 0 && 
                      result.vehicleData[0].vin === '1HGBH41JXMN109186';

        results.push({
          testId: `FORMAT-VIN-${i + 1}`,
          passed,
          executionTime: 0,
          actualResult: result.vehicleData[0]?.vin,
          expectedResult: '1HGBH41JXMN109186',
          details: { vinFormat: vinFormats[i] }
        });
      } catch (error) {
        results.push({
          testId: `FORMAT-VIN-${i + 1}`,
          passed: false,
          executionTime: 0,
          actualResult: null,
          expectedResult: '1HGBH41JXMN109186',
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  // Run comprehensive test suite
  async runFullTestSuite(): Promise<TestSuite> {
    console.log('🧪 Starting comprehensive test suite...');
    this.isRunning = true;

    const suite: TestSuite = {
      name: 'TruckBo Fleet Management - Full Test Suite',
      description: 'Comprehensive testing of document processing and fleet management features',
      tests: [],
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        successRate: 0,
        totalExecutionTime: 0
      }
    };

    const overallStartTime = Date.now();

    try {
      // Generate test data
      console.log('📄 Generating test documents...');
      const testData = await this.generateTestDocumentSet(10);

      // Test 1: Document Processing Accuracy
      console.log('🔍 Testing document processing accuracy...');
      const allFiles = [...testData.registrationFiles, ...testData.insuranceFiles];
      const allExpectedData = [...testData.expectedData, ...testData.expectedData];
      const accuracyResults = await this.testDocumentProcessingAccuracy(allFiles, allExpectedData);
      suite.results.push(...accuracyResults);

      // Test 2: Document Format Variations
      console.log('📋 Testing document format variations...');
      const formatResults = await this.testDocumentFormats();
      suite.results.push(...formatResults);

      // Test 3: Multi-Batch Processing
      console.log('🔄 Testing multi-batch processing...');
      const multiBatchResult = await this.testMultiBatchProcessing(
        testData.registrationFiles,
        testData.insuranceFiles,
        testData.expectedData
      );
      suite.results.push(multiBatchResult);

      // Test 4: Performance Testing
      console.log('⚡ Testing performance with progressively larger document sets...');
      const performanceResults = [];
      
      // Test small batch (baseline)
      console.log('📊 Testing small batch performance (25 documents)...');
      performanceResults.push(await this.testPerformance(25));
      
      // Test medium batch
      console.log('📊 Testing medium batch performance (50 documents)...');
      performanceResults.push(await this.testPerformance(50));
      
      // Test large batch (stress test)
      console.log('📊 Testing large batch performance (100 documents)...');
      performanceResults.push(await this.testPerformance(100));
      
      suite.results.push(...performanceResults);

      // Test 5: Error Handling and Recovery
      console.log('🚨 Testing error handling and recovery scenarios...');
      const errorResults = await this.testErrorHandling();
      suite.results.push(...errorResults);

      // Calculate summary
      suite.summary.total = suite.results.length;
      suite.summary.passed = suite.results.filter(r => r.passed).length;
      suite.summary.failed = suite.summary.total - suite.summary.passed;
      suite.summary.successRate = (suite.summary.passed / suite.summary.total) * 100;
      suite.summary.totalExecutionTime = Date.now() - overallStartTime;

      console.log('✅ Test suite completed!');
      console.log(`📊 Results: ${suite.summary.passed}/${suite.summary.total} passed (${suite.summary.successRate.toFixed(1)}%)`);

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      suite.results.push({
        testId: 'SUITE-ERROR',
        passed: false,
        executionTime: Date.now() - overallStartTime,
        actualResult: null,
        expectedResult: 'Complete test suite',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }

    this.isRunning = false;
    this.testSuites.set('full-suite', suite);
    return suite;
  }

  // Get test results summary
  getTestResults(): Map<string, TestSuite> {
    return this.testSuites;
  }

  // Check if tests are currently running
  isTestRunning(): boolean {
    return this.isRunning;
  }
}

export const testFramework = new TestFramework();