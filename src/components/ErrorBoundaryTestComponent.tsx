// Error Boundary Test Component
// Used to test error boundary functionality in practice

import React, { useState, useEffect } from 'react';
import { ErrorBoundary, DocumentProcessingErrorBoundary, FleetTableErrorBoundary } from './ErrorBoundary';
import { logger } from '../services/logger';
import { errorHandler } from '../services/errorHandlingService';

// Component that throws errors on demand for testing
const ErrorProneComponent: React.FC<{ shouldThrow: string | null }> = ({ shouldThrow }) => {
  useEffect(() => {
    if (shouldThrow === 'useEffect') {
      throw new Error('Simulated useEffect error for testing');
    }
  }, [shouldThrow]);

  if (shouldThrow === 'render') {
    throw new Error('Simulated render error for testing');
  }

  if (shouldThrow === 'async') {
    // Simulate async error
    setTimeout(() => {
      throw new Error('Simulated async error for testing');
    }, 100);
  }

  if (shouldThrow === 'stateUpdate') {
    // This will cause an infinite loop of state updates
    const [count, setCount] = useState(0);
    useEffect(() => {
      setCount(count + 1);
    }, [count]);
  }

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded">
      <h3 className="text-green-800 font-semibold">Component Working Normally</h3>
      <p className="text-green-600">This component is functioning correctly.</p>
    </div>
  );
};

// Component to test network error simulation
const NetworkTestComponent: React.FC<{ shouldFail: boolean }> = ({ shouldFail }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    const context = {
      layer: 'frontend' as const,
      component: 'NetworkTestComponent',
      operation: 'fetchData'
    };

    try {
      if (shouldFail) {
        // Simulate network failure
        throw new Error('Network request failed');
      }

      // Simulate successful data fetch
      await new Promise(resolve => setTimeout(resolve, 1000));
      setData({ message: 'Data loaded successfully', timestamp: new Date().toISOString() });
      
      logger.info('Test data fetch completed successfully', context);
      
    } catch (err) {
      const appError = errorHandler.createNetworkError(
        'Failed to fetch test data',
        undefined,
        'test-endpoint',
        context
      );

      await errorHandler.handleError(appError, context, {
        showUserNotification: true
      });

      setError(appError.userMessage || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded">
      <h3 className="text-blue-800 font-semibold">Network Test Component</h3>
      <div className="mt-2">
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
        >
          {loading ? 'Loading...' : 'Fetch Data'}
        </button>
      </div>
      
      {data && (
        <div className="mt-2 p-2 bg-green-100 border border-green-300 rounded">
          <p className="text-green-800">✅ {data.message}</p>
          <p className="text-green-600 text-sm">Loaded at: {data.timestamp}</p>
        </div>
      )}
      
      {error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
          <p className="text-red-800">❌ {error}</p>
        </div>
      )}
    </div>
  );
};

// Component to test storage operations
const StorageTestComponent: React.FC = () => {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testStorageOperation = async (operation: 'quota' | 'corruption' | 'permission') => {
    setLoading(true);
    setResult('');

    const context = {
      layer: 'storage' as const,
      component: 'StorageTestComponent',
      operation: 'testStorage'
    };

    try {
      switch (operation) {
        case 'quota':
          // Simulate quota exceeded
          const largeData = new Array(100000).fill('test').join('');
          for (let i = 0; i < 100; i++) {
            localStorage.setItem(`testQuota_${i}`, largeData);
          }
          setResult('Storage quota test completed (check console for errors)');
          break;

        case 'corruption':
          // Test corruption handling
          localStorage.setItem('testCorruption', 'invalid{json}');
          try {
            JSON.parse(localStorage.getItem('testCorruption') || '');
          } catch {
            throw new Error('JSON parsing failed');
          }
          break;

        case 'permission':
          // Simulate permission denied (harder to test in browser)
          throw new Error('Storage permission denied');

        default:
          throw new Error('Unknown operation');
      }
    } catch (error) {
      const storageError = errorHandler.createStorageError(
        `Storage ${operation} test failed: ${(error as Error).message}`,
        'write',
        `test_${operation}`,
        context
      );

      await errorHandler.handleError(storageError, context, {
        showUserNotification: true
      });

      setResult(`❌ ${operation} test failed but was handled gracefully`);
    } finally {
      setLoading(false);
      
      // Cleanup
      for (let i = 0; i < 100; i++) {
        localStorage.removeItem(`testQuota_${i}`);
      }
      localStorage.removeItem('testCorruption');
    }
  };

  return (
    <div className="p-4 bg-purple-50 border border-purple-200 rounded">
      <h3 className="text-purple-800 font-semibold">Storage Test Component</h3>
      <div className="mt-2 space-x-2">
        <button
          onClick={() => testStorageOperation('quota')}
          disabled={loading}
          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300"
        >
          Test Quota
        </button>
        <button
          onClick={() => testStorageOperation('corruption')}
          disabled={loading}
          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300"
        >
          Test Corruption
        </button>
        <button
          onClick={() => testStorageOperation('permission')}
          disabled={loading}
          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300"
        >
          Test Permission
        </button>
      </div>
      
      {result && (
        <div className="mt-2 p-2 bg-gray-100 border border-gray-300 rounded">
          <p className="text-gray-800">{result}</p>
        </div>
      )}
    </div>
  );
};

// Main test component
const ErrorBoundaryTestComponent: React.FC = () => {
  const [errorType, setErrorType] = useState<string | null>(null);
  const [networkShouldFail, setNetworkShouldFail] = useState(false);

  const triggerError = (type: string) => {
    logger.info('Triggering test error', {
      component: 'ErrorBoundaryTestComponent',
      operation: 'trigger_error',
      metadata: { errorType: type }
    });
    setErrorType(type);
  };

  const resetErrors = () => {
    setErrorType(null);
    setNetworkShouldFail(false);
    logger.info('Resetting all test errors', { component: 'ErrorBoundaryTestComponent' });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">🧪 Error Boundary Testing Suite</h1>
      
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h2 className="text-yellow-800 font-semibold mb-3">Test Controls</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button
            onClick={() => triggerError('render')}
            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Render Error
          </button>
          <button
            onClick={() => triggerError('useEffect')}
            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            useEffect Error
          </button>
          <button
            onClick={() => triggerError('async')}
            className="px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm"
          >
            Async Error
          </button>
          <button
            onClick={() => setNetworkShouldFail(!networkShouldFail)}
            className={`px-3 py-2 text-white rounded text-sm ${
              networkShouldFail 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {networkShouldFail ? 'Fix Network' : 'Break Network'}
          </button>
        </div>
        <div className="mt-3">
          <button
            onClick={resetErrors}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            🔄 Reset All
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* General Error Boundary Test */}
        <div>
          <h2 className="text-xl font-semibold text-gray-700 mb-3">General Error Boundary</h2>
          <ErrorBoundary
            context={{ component: 'GeneralTestBoundary', feature: 'Error Testing' }}
            onError={(error, errorInfo) => {
              console.log('Error Boundary caught error:', error, errorInfo);
              logger.error('Error boundary triggered', {
                component: 'ErrorBoundaryTestComponent',
                operation: 'error_boundary_test'
              }, error);
            }}
          >
            <ErrorProneComponent shouldThrow={errorType} />
          </ErrorBoundary>
        </div>

        {/* Document Processing Error Boundary Test */}
        <div>
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Document Processing Error Boundary</h2>
          <DocumentProcessingErrorBoundary>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded">
              <h3 className="text-blue-800 font-semibold">Document Processing Component</h3>
              <p className="text-blue-600">This simulates the document processing area.</p>
              {errorType === 'document' && (
                <ErrorProneComponent shouldThrow="render" />
              )}
              <button
                onClick={() => triggerError('document')}
                className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Crash Document Processing
              </button>
            </div>
          </DocumentProcessingErrorBoundary>
        </div>

        {/* Fleet Table Error Boundary Test */}
        <div>
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Fleet Table Error Boundary</h2>
          <FleetTableErrorBoundary>
            <div className="p-4 bg-green-50 border border-green-200 rounded">
              <h3 className="text-green-800 font-semibold">Fleet Table Component</h3>
              <p className="text-green-600">This simulates the fleet table display.</p>
              {errorType === 'table' && (
                <ErrorProneComponent shouldThrow="render" />
              )}
              <button
                onClick={() => triggerError('table')}
                className="mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Crash Fleet Table
              </button>
            </div>
          </FleetTableErrorBoundary>
        </div>

        {/* Network Error Test */}
        <div>
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Network Error Handling</h2>
          <NetworkTestComponent shouldFail={networkShouldFail} />
        </div>

        {/* Storage Error Test */}
        <div>
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Storage Error Handling</h2>
          <StorageTestComponent />
        </div>

        {/* Logging Test */}
        <div>
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Logging System Test</h2>
          <div className="p-4 bg-gray-50 border border-gray-200 rounded">
            <h3 className="text-gray-800 font-semibold mb-2">Generate Log Entries</h3>
            <div className="space-x-2">
              <button
                onClick={() => logger.debug('Debug log test', { component: 'TestComponent' })}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Debug
              </button>
              <button
                onClick={() => logger.info('Info log test', { component: 'TestComponent' })}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Info
              </button>
              <button
                onClick={() => logger.warn('Warning log test', { component: 'TestComponent' })}
                className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
              >
                Warn
              </button>
              <button
                onClick={() => logger.error('Error log test', { component: 'TestComponent' }, new Error('Test error'))}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Error
              </button>
              <button
                onClick={() => logger.critical('Critical log test', { component: 'TestComponent' })}
                className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
              >
                Critical
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="text-blue-800 font-semibold">Instructions</h3>
        <ul className="text-blue-600 mt-2 space-y-1 text-sm">
          <li>• Click buttons to trigger different types of errors</li>
          <li>• Watch the console for detailed error logs</li>
          <li>• Notice how each error boundary provides a different fallback UI</li>
          <li>• Test network errors with the toggle button</li>
          <li>• Storage tests will show notifications when errors are handled</li>
          <li>• Use Reset All to return to the normal state</li>
        </ul>
      </div>
    </div>
  );
};

export default ErrorBoundaryTestComponent;
