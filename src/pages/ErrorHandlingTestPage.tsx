// Error Handling Test Page
// Comprehensive testing interface for all error handling scenarios

import React, { useState, useEffect } from 'react';
import ErrorBoundaryTestComponent from '../components/ErrorBoundaryTestComponent';
import { logger } from '../services/logger';
import { errorHandler, withErrorHandling } from '../services/errorHandlingService';
import { persistentFleetStorage } from '../services/persistentFleetStorage';
import { reconcilerAPI } from '../services/reconcilerAPI';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
  duration?: number;
  details?: any;
}

const ErrorHandlingTestPage: React.FC = () => {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [testLogs, setTestLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const updateTestStatus = (testName: string, status: TestResult['status'], error?: string, duration?: number, details?: any) => {
    setTests(prev => prev.map(test => 
      test.name === testName 
        ? { ...test, status, error, duration, details }
        : test
    ));
  };

  const initializeTests = () => {
    const testSuite: TestResult[] = [
      // Storage Tests
      { name: 'Storage: Quota Exceeded', status: 'pending' },
      { name: 'Storage: Data Corruption', status: 'pending' },
      { name: 'Storage: Backup Fallback', status: 'pending' },
      { name: 'Storage: Concurrent Operations', status: 'pending' },
      
      // API Tests
      { name: 'API: Network Timeout', status: 'pending' },
      { name: 'API: Retry Logic', status: 'pending' },
      { name: 'API: Fallback Data', status: 'pending' },
      { name: 'API: Rate Limiting', status: 'pending' },
      
      // Document Processing Tests
      { name: 'Document: Invalid Format', status: 'pending' },
      { name: 'Document: OCR Failure', status: 'pending' },
      { name: 'Document: Large File Timeout', status: 'pending' },
      { name: 'Document: Memory Overflow', status: 'pending' },
      
      // Logging Tests
      { name: 'Logging: All Levels', status: 'pending' },
      { name: 'Logging: Context Tracking', status: 'pending' },
      { name: 'Logging: Operation Lifecycle', status: 'pending' },
      { name: 'Logging: Performance Impact', status: 'pending' },
      
      // Error Handling Tests
      { name: 'Error Handling: Classification', status: 'pending' },
      { name: 'Error Handling: Severity Mapping', status: 'pending' },
      { name: 'Error Handling: User Notifications', status: 'pending' },
      { name: 'Error Handling: Deduplication', status: 'pending' }
    ];
    
    setTests(testSuite);
  };

  useEffect(() => {
    initializeTests();
  }, []);

  // Test implementations
  const runStorageQuotaTest = async (): Promise<void> => {
    const testName = 'Storage: Quota Exceeded';
    updateTestStatus(testName, 'running');
    const startTime = Date.now();
    
    try {
      addLog('Testing storage quota exceeded scenario...');
      
      // Fill up localStorage to simulate quota exceeded
      const largeData = new Array(50000).fill('test_data').join('');
      const testKeys: string[] = [];
      
      try {
        for (let i = 0; i < 50; i++) {
          const key = `test_quota_${i}`;
          localStorage.setItem(key, largeData);
          testKeys.push(key);
        }
      } catch (quotaError) {
        addLog(`Quota exceeded at iteration (expected): ${quotaError}`);
      }
      
      // Try to add vehicle when quota is exceeded
      const mockVehicle = {
        vin: 'TEST' + Date.now(),
        make: 'TestMake',
        model: 'TestModel',
        year: 2023,
        licensePlate: 'TEST123',
        status: 'active' as const
      };
      
      const result = persistentFleetStorage.addVehicle(mockVehicle);
      
      // Clean up
      testKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
      
      const duration = Date.now() - startTime;
      
      if (result === null) {
        addLog('✅ Storage quota test passed - gracefully handled');
        updateTestStatus(testName, 'passed', undefined, duration);
      } else {
        addLog('❌ Storage quota test failed - should have returned null');
        updateTestStatus(testName, 'failed', 'Expected null result for quota exceeded', duration);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      addLog(`❌ Storage quota test failed: ${error}`);
      updateTestStatus(testName, 'failed', (error as Error).message, duration);
    }
  };

  const runStorageCorruptionTest = async (): Promise<void> => {
    const testName = 'Storage: Data Corruption';
    updateTestStatus(testName, 'running');
    const startTime = Date.now();
    
    try {
      addLog('Testing storage data corruption handling...');
      
      // Save valid backup
      const validData = [{ id: '1', vin: 'BACKUP123', make: 'Test' }];
      localStorage.setItem('truckbo_fleet_backup', JSON.stringify(validData));
      
      // Corrupt main data
      localStorage.setItem('truckbo_fleet_data', '{invalid json data}');
      
      // Try to load fleet
      const fleet = persistentFleetStorage.getFleet();
      
      const duration = Date.now() - startTime;
      
      if (Array.isArray(fleet)) {
        addLog('✅ Data corruption test passed - returned valid array');
        updateTestStatus(testName, 'passed', undefined, duration, { fleetLength: fleet.length });
      } else {
        addLog('❌ Data corruption test failed - did not return array');
        updateTestStatus(testName, 'failed', 'Expected array result', duration);
      }
      
      // Cleanup
      localStorage.removeItem('truckbo_fleet_data');
      localStorage.removeItem('truckbo_fleet_backup');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      addLog(`❌ Storage corruption test failed: ${error}`);
      updateTestStatus(testName, 'failed', (error as Error).message, duration);
    }
  };

  const runNetworkTimeoutTest = async (): Promise<void> => {
    const testName = 'API: Network Timeout';
    updateTestStatus(testName, 'running');
    const startTime = Date.now();
    
    try {
      addLog('Testing network timeout with retry logic...');
      
      let attemptCount = 0;
      const result = await errorHandler.handleOperationWithRetry(
        async () => {
          attemptCount++;
          addLog(`Network attempt ${attemptCount}`);
          if (attemptCount < 3) {
            throw new Error('Network timeout');
          }
          return { success: true, data: 'Network recovered' };
        },
        { fallback: true, data: 'Fallback data' },
        {
          layer: 'api',
          component: 'ErrorHandlingTestPage',
          operation: 'network_timeout_test'
        },
        {
          maxRetries: 3,
          retryDelay: 100,
          enableFallback: true
        }
      );
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        addLog('✅ Network timeout test passed - retry logic worked');
        updateTestStatus(testName, 'passed', undefined, duration, { attemptCount, result });
      } else {
        addLog('❌ Network timeout test failed - retry logic failed');
        updateTestStatus(testName, 'failed', 'Retry logic did not succeed', duration);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      addLog(`❌ Network timeout test failed: ${error}`);
      updateTestStatus(testName, 'failed', (error as Error).message, duration);
    }
  };

  const runLogLevelTest = async (): Promise<void> => {
    const testName = 'Logging: All Levels';
    updateTestStatus(testName, 'running');
    const startTime = Date.now();
    
    try {
      addLog('Testing all log levels...');
      
      const testContext = {
        layer: 'frontend' as const,
        component: 'ErrorHandlingTestPage',
        operation: 'log_level_test'
      };
      
      // Test all log levels
      logger.debug('Debug level test', testContext, { testData: 'debug' });
      logger.info('Info level test', testContext, { testData: 'info' });
      logger.warn('Warning level test', testContext, undefined, { testData: 'warn' });
      logger.error('Error level test', testContext, new Error('Test error'), { testData: 'error' });
      logger.critical('Critical level test', testContext, { testData: 'critical' });
      
      // Test operation lifecycle
      const operationId = logger.startOperation('Test operation', testContext);
      setTimeout(() => {
        logger.completeOperation('Test operation', operationId, testContext);
      }, 50);
      
      const duration = Date.now() - startTime;
      
      addLog('✅ Log level test completed - check console for logs');
      updateTestStatus(testName, 'passed', undefined, duration);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      addLog(`❌ Log level test failed: ${error}`);
      updateTestStatus(testName, 'failed', (error as Error).message, duration);
    }
  };

  const runErrorClassificationTest = async (): Promise<void> => {
    const testName = 'Error Handling: Classification';
    updateTestStatus(testName, 'running');
    const startTime = Date.now();
    
    try {
      addLog('Testing error classification and handling...');
      
      const context = {
        layer: 'api' as const,
        component: 'ErrorHandlingTestPage',
        operation: 'error_classification_test'
      };
      
      // Test different error types
      const validationError = errorHandler.createValidationError(
        'Invalid input',
        'testField',
        'invalidValue',
        context
      );
      
      const networkError = errorHandler.createNetworkError(
        'Network failure',
        500,
        'test-endpoint',
        context
      );
      
      const storageError = errorHandler.createStorageError(
        'Storage full',
        'write',
        'test-key',
        context
      );
      
      // Handle errors (without notifications for testing)
      await errorHandler.handleError(validationError, context, { showUserNotification: false });
      await errorHandler.handleError(networkError, context, { showUserNotification: false });
      await errorHandler.handleError(storageError, context, { showUserNotification: false });
      
      const duration = Date.now() - startTime;
      
      addLog('✅ Error classification test passed - all error types handled');
      updateTestStatus(testName, 'passed', undefined, duration);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      addLog(`❌ Error classification test failed: ${error}`);
      updateTestStatus(testName, 'failed', (error as Error).message, duration);
    }
  };

  const runAllTests = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    setTestLogs([]);
    addLog('🚀 Starting comprehensive error handling test suite...');
    
    // Reset all tests to pending
    initializeTests();
    
    const testRunners = [
      runStorageQuotaTest,
      runStorageCorruptionTest,
      runNetworkTimeoutTest,
      runLogLevelTest,
      runErrorClassificationTest
    ];
    
    for (const testRunner of testRunners) {
      try {
        await testRunner();
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        addLog(`❌ Test runner failed: ${error}`);
      }
    }
    
    addLog('🏁 Test suite completed!');
    setIsRunning(false);
  };

  const runSelectedTest = (testName: string) => {
    const testMap: { [key: string]: () => Promise<void> } = {
      'Storage: Quota Exceeded': runStorageQuotaTest,
      'Storage: Data Corruption': runStorageCorruptionTest,
      'API: Network Timeout': runNetworkTimeoutTest,
      'Logging: All Levels': runLogLevelTest,
      'Error Handling: Classification': runErrorClassificationTest
    };
    
    const testRunner = testMap[testName];
    if (testRunner) {
      testRunner();
    } else {
      addLog(`⚠️ Test "${testName}" not yet implemented`);
      updateTestStatus(testName, 'failed', 'Test not implemented');
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'passed': return '✅';
      case 'failed': return '❌';
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'running': return 'text-blue-600 bg-blue-100';
      case 'passed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
    }
  };

  const stats = {
    total: tests.length,
    passed: tests.filter(t => t.status === 'passed').length,
    failed: tests.filter(t => t.status === 'failed').length,
    running: tests.filter(t => t.status === 'running').length
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🧪 Error Handling Test Suite
          </h1>
          <p className="text-gray-600 text-lg">
            Comprehensive testing of error handling, logging, and recovery mechanisms
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-gray-600">Total Tests</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="text-2xl font-bold text-green-600">{stats.passed}</div>
            <div className="text-gray-600">Passed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-gray-600">Failed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{stats.running}</div>
            <div className="text-gray-600">Running</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Test Controls and Results */}
          <div className="space-y-6">
            {/* Controls */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Controls</h2>
              <div className="space-y-3">
                <button
                  onClick={runAllTests}
                  disabled={isRunning}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {isRunning ? '🔄 Running Tests...' : '🚀 Run All Tests'}
                </button>
                
                <div className="flex space-x-2">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="all">All Categories</option>
                    <option value="storage">Storage Tests</option>
                    <option value="api">API Tests</option>
                    <option value="document">Document Tests</option>
                    <option value="logging">Logging Tests</option>
                    <option value="error">Error Handling Tests</option>
                  </select>
                  <button
                    onClick={() => setTestLogs([])}
                    className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Clear Logs
                  </button>
                </div>
              </div>
            </div>

            {/* Test Results */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Results</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {tests
                  .filter(test => selectedCategory === 'all' || test.name.toLowerCase().includes(selectedCategory.toLowerCase()))
                  .map((test, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor(test.status)}`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">{getStatusIcon(test.status)}</span>
                        <div>
                          <div className="font-medium">{test.name}</div>
                          {test.duration && (
                            <div className="text-sm opacity-75">{test.duration}ms</div>
                          )}
                          {test.error && (
                            <div className="text-sm text-red-600">{test.error}</div>
                          )}
                        </div>
                      </div>
                      {test.status === 'pending' && (
                        <button
                          onClick={() => runSelectedTest(test.name)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Run
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Test Logs */}
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Logs</h2>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              {testLogs.length === 0 ? (
                <div className="text-gray-500">No logs yet. Run tests to see output.</div>
              ) : (
                testLogs.map((log, index) => (
                  <div key={index} className="mb-1">{log}</div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* React Error Boundary Tests */}
        <div className="mt-8">
          <ErrorBoundaryTestComponent />
        </div>
      </div>
    </div>
  );
};

export default ErrorHandlingTestPage;