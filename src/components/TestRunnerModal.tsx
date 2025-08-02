// Test Runner Modal Component
// Provides UI for running comprehensive system tests

import React, { useState } from 'react';
import { testFramework, TestSuite, TestResult } from '../services/testFramework';

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TestStatus = 'idle' | 'running' | 'completed' | 'error';

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({
  isOpen,
  onClose
}) => {
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testSuite, setTestSuite] = useState<TestSuite | null>(null);
  const [currentTest, setCurrentTest] = useState<string>('');
  const [progress, setProgress] = useState(0);

  const runTests = async () => {
    setTestStatus('running');
    setProgress(0);
    setCurrentTest('Initializing test suite...');

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 2, 90));
      }, 500);

      // Run the actual tests
      const suite = await testFramework.runFullTestSuite();
      
      clearInterval(progressInterval);
      setProgress(100);
      setTestSuite(suite);
      setTestStatus('completed');
      setCurrentTest('Test suite completed');

    } catch (error) {
      setTestStatus('error');
      setCurrentTest(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const resetTests = () => {
    setTestStatus('idle');
    setTestSuite(null);
    setCurrentTest('');
    setProgress(0);
  };

  const getStatusColor = (result: TestResult) => {
    return result.passed ? 'text-green-600' : 'text-red-600';
  };

  const getStatusIcon = (result: TestResult) => {
    return result.passed ? '✅' : '❌';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">🧪 System Test Runner</h2>
              <p className="text-blue-100 mt-1">Comprehensive testing of document processing and fleet management</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors duration-200"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Test Status Overview */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Test Status</h3>
              <div className="flex gap-3">
                {testStatus === 'idle' && (
                  <button
                    onClick={runTests}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    🚀 Run Test Suite
                  </button>
                )}
                {testStatus === 'completed' && (
                  <button
                    onClick={resetTests}
                    className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl font-bold transition-all duration-200"
                  >
                    🔄 Reset Tests
                  </button>
                )}
              </div>
            </div>

            {testStatus === 'running' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="animate-spin text-4xl mb-4">🧪</div>
                  <h4 className="text-lg font-semibold text-gray-900">Running Comprehensive Tests</h4>
                  <p className="text-gray-600">{currentTest}</p>
                </div>
                
                <div className="max-w-md mx-auto">
                  <div className="bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 text-center">{progress}% complete</p>
                </div>
              </div>
            )}

            {testStatus === 'error' && (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">❌</div>
                <h4 className="text-xl font-bold text-red-600 mb-2">Test Suite Failed</h4>
                <p className="text-red-700">{currentTest}</p>
              </div>
            )}

            {testStatus === 'completed' && testSuite && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-6xl mb-4">
                    {testSuite.summary.successRate >= 90 ? '🎉' : testSuite.summary.successRate >= 70 ? '⚠️' : '❌'}
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Test Suite Complete</h4>
                  <p className="text-gray-600">
                    Executed {testSuite.summary.total} tests in {(testSuite.summary.totalExecutionTime / 1000).toFixed(2)} seconds
                  </p>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-white rounded-lg border">
                    <div className="text-2xl font-bold text-blue-600">{testSuite.summary.total}</div>
                    <div className="text-sm text-blue-700">Total Tests</div>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg border">
                    <div className="text-2xl font-bold text-green-600">{testSuite.summary.passed}</div>
                    <div className="text-sm text-green-700">Passed</div>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg border">
                    <div className="text-2xl font-bold text-red-600">{testSuite.summary.failed}</div>
                    <div className="text-sm text-red-700">Failed</div>
                  </div>
                  <div className="text-center p-4 bg-white rounded-lg border">
                    <div className="text-2xl font-bold text-purple-600">{testSuite.summary.successRate.toFixed(1)}%</div>
                    <div className="text-sm text-purple-700">Success Rate</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Detailed Test Results */}
          {testSuite && testSuite.results.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl">
              <div className="p-4 border-b border-gray-200">
                <h4 className="font-bold text-gray-900">Detailed Test Results</h4>
                <p className="text-sm text-gray-600">Click on a test to view detailed information</p>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {testSuite.results.map((result, index) => (
                  <div key={index} className="p-4 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{getStatusIcon(result)}</span>
                        <div>
                          <h5 className={`font-semibold ${getStatusColor(result)}`}>
                            {result.testId}
                          </h5>
                          <p className="text-sm text-gray-600">
                            Execution time: {result.executionTime}ms
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        {result.passed ? (
                          <span className="text-green-600 font-medium">PASSED</span>
                        ) : (
                          <span className="text-red-600 font-medium">FAILED</span>
                        )}
                      </div>
                    </div>

                    {/* Error Message */}
                    {result.errorMessage && (
                      <div className="mt-3 p-3 bg-red-50 rounded-lg">
                        <p className="text-sm text-red-700 font-medium">Error:</p>
                        <p className="text-sm text-red-600">{result.errorMessage}</p>
                      </div>
                    )}

                    {/* Performance Details */}
                    {result.testId.startsWith('PERF-') && result.actualResult && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700 font-medium">Performance Metrics:</p>
                        <div className="text-sm text-blue-600 space-y-2 mt-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>📄 Documents: {result.actualResult.totalDocuments}</div>
                            <div>⏱️ Time/Doc: {result.actualResult.timePerDocument}ms</div>
                            <div>🚀 Docs/Sec: {result.actualResult.documentsPerSecond}</div>
                            <div>🔄 Reconciliation: {result.actualResult.reconciliationScore}%</div>
                          </div>
                          
                          {result.actualResult.memoryIncreaseMB && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-200">
                              <div>💾 Memory Used: {result.actualResult.memoryIncreaseMB}MB</div>
                              <div>🎯 Vehicles: {result.actualResult.vehiclesReconciled}</div>
                            </div>
                          )}
                          
                          {result.details?.breakdown && (
                            <div className="pt-2 border-t border-blue-200">
                              <p className="text-xs text-blue-600 font-medium mb-1">Processing Breakdown:</p>
                              <div className="grid grid-cols-3 gap-1 text-xs">
                                <div>📋 Reg: {result.details.breakdown.registration}ms</div>
                                <div>🛡️ Ins: {result.details.breakdown.insurance}ms</div>
                                <div>🔗 Recon: {result.details.breakdown.reconciliation}ms</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Accuracy Details */}
                    {result.testId.startsWith('DOC-ACC-') && result.actualResult && (
                      <div className="mt-3 p-3 bg-green-50 rounded-lg">
                        <p className="text-sm text-green-700 font-medium">Extraction Accuracy:</p>
                        <div className="text-sm text-green-600 mt-1">
                          {(result.actualResult.accuracy * 100).toFixed(1)}% field accuracy
                        </div>
                      </div>
                    )}

                    {/* Multi-batch Details */}
                    {result.testId === 'MULTI-BATCH-001' && result.actualResult && (
                      <div className="mt-3 p-3 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-700 font-medium">Reconciliation Results:</p>
                        <div className="text-sm text-purple-600 grid grid-cols-2 gap-2 mt-1">
                          <div>Total Vehicles: {result.actualResult.totalVehicles}</div>
                          <div>Complete Records: {result.actualResult.fullyDocumented}</div>
                          <div>Reconciliation Score: {result.actualResult.reconciliationScore}%</div>
                          <div>Missing Data: {result.actualResult.registrationOnly + result.actualResult.insuranceOnly}</div>
                        </div>
                      </div>
                    )}

                    {/* Error Handling Details */}
                    {result.testId.startsWith('ERROR-') && result.actualResult && (
                      <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                        <p className="text-sm text-orange-700 font-medium">Error Handling Results:</p>
                        <div className="text-sm text-orange-600 mt-1">
                          {result.testId === 'ERROR-001-EMPTY' && (
                            <div className="space-y-1">
                              <div>Vehicle Data Extracted: {result.actualResult.vehicleDataCount || 0}</div>
                              <div>Errors Recorded: {result.actualResult.errorsCount || 0}</div>
                              <div>Files Skipped: {result.actualResult.unprocessedCount || 0}</div>
                            </div>
                          )}
                          {result.testId === 'ERROR-002-NO-DATA' && (
                            <div className="space-y-1">
                              <div>Vehicle Data Count: {result.actualResult.vehicleDataCount || 0}</div>
                              <div>Needs Review: {result.actualResult.needsReview ? 'Yes' : 'No'}</div>
                              <div>Confidence: {result.actualResult.extractionConfidence ? (result.actualResult.extractionConfidence * 100).toFixed(1) + '%' : 'N/A'}</div>
                            </div>
                          )}
                          {(result.testId === 'ERROR-003-MALFORMED-VIN' || result.testId === 'ERROR-004-INVALID-VIN') && (
                            <div className="space-y-1">
                              <div>VIN Extracted: {result.actualResult.extractedVin || 'None'}</div>
                              <div>Flagged for Review: {result.actualResult.needsReview ? 'Yes' : 'No'}</div>
                              <div>Confidence: {result.actualResult.extractionConfidence ? (result.actualResult.extractionConfidence * 100).toFixed(1) + '%' : 'N/A'}</div>
                            </div>
                          )}
                          {result.testId === 'ERROR-005-UNSUPPORTED-FORMAT' && (
                            <div className="space-y-1">
                              <div>Vehicle Data: {result.actualResult.vehicleDataCount || 0}</div>
                              <div>Skipped Files: {result.actualResult.unprocessedFiles?.length || 0}</div>
                              <div>Total Processed: {result.actualResult.totalFiles || 0}</div>
                            </div>
                          )}
                          {result.testId === 'ERROR-006-RECOVERY' && (
                            <div className="space-y-1">
                              <div>Successfully Processed: {result.actualResult.processed || 0}</div>
                              <div>Vehicle Records: {result.actualResult.vehicleDataCount || 0}</div>
                              <div>Errors Encountered: {result.actualResult.errors || 0}</div>
                              <div>Files Skipped: {result.actualResult.unprocessed || 0}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test Categories Information */}
          {testStatus === 'idle' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h4 className="font-bold text-blue-800 mb-3">Test Categories</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h5 className="font-semibold text-blue-700 mb-2">📄 Document Processing</h5>
                  <ul className="text-blue-600 space-y-1">
                    <li>• Single document accuracy</li>
                    <li>• Multi-batch reconciliation</li>
                    <li>• File format support</li>
                    <li>• VIN and date extraction</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold text-blue-700 mb-2">⚡ Performance & Reliability</h5>
                  <ul className="text-blue-600 space-y-1">
                    <li>• Large batch processing</li>
                    <li>• Memory usage monitoring</li>
                    <li>• Error handling & recovery</li>
                    <li>• Malformed data detection</li>
                    <li>• File format validation</li>
                  </ul>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                <p className="text-blue-800 text-sm">
                  <span className="font-semibold">💡 Tip:</span> Tests will generate synthetic documents with known data 
                  to validate extraction accuracy and system performance.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};