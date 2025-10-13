import React, { useMemo, useState } from 'react';
import ErrorBoundaryTestComponent from '../components/ErrorBoundaryTestComponent';
import { logger } from '../services/logger';
import { errorHandler } from '../services/errorHandlingService';

type TestCategory = 'logging' | 'error';
type TestStatus = 'pending' | 'running' | 'passed' | 'failed';
type TestId = 'logging-basic' | 'error-notification' | 'error-dedup';

interface TestDefinition {
  id: TestId;
  name: string;
  category: TestCategory;
}

interface TestResult extends TestDefinition {
  status: TestStatus;
  error?: string;
  duration?: number;
  details?: string;
}

const TEST_DEFINITIONS: TestDefinition[] = [
  { id: 'logging-basic', name: 'Logging: Emit Levels', category: 'logging' },
  { id: 'error-notification', name: 'Error Handling: User Notification', category: 'error' },
  { id: 'error-dedup', name: 'Error Handling: Deduplication Guard', category: 'error' }
];

type CategoryFilter = TestCategory | 'all';

const ErrorHandlingTestPage: React.FC = () => {
  const [tests, setTests] = useState<TestResult[]>(
    TEST_DEFINITIONS.map((def) => ({ ...def, status: 'pending' }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [testLogs, setTestLogs] = useState<string[]>([]);

  const categoryOptions: CategoryFilter[] = useMemo(() => {
    const uniqueCategories = Array.from(new Set(TEST_DEFINITIONS.map((test) => test.category)));
    return ['all', ...uniqueCategories];
  }, []);

  const stats = useMemo(() => {
    return tests.reduce(
      (acc, test) => {
        acc.total += 1;
        acc[test.status] += 1;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        running: 0,
        passed: 0,
        failed: 0
      }
    );
  }, [tests]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const resetTests = () => {
    setTests(TEST_DEFINITIONS.map((def) => ({ ...def, status: 'pending', error: undefined, duration: undefined })));
    addLog('Test suite reset to pending state.');
  };

  const updateTestStatus = (
    id: TestId,
    status: TestStatus,
    error?: string,
    duration?: number,
    details?: string
  ) => {
    setTests((prev) =>
      prev.map((test) =>
        test.id === id
          ? {
              ...test,
              status,
              error,
              duration,
              details
            }
          : test
      )
    );
  };

  const runLoggingTest = () => {
    const context = { component: 'ErrorHandlingTestPage', operation: 'logging_test', layer: 'frontend' as const };
    logger.debug('Logging test: debug message', context);
    logger.info('Logging test: info message', context);
    logger.warn('Logging test: warn message', context);
    logger.error('Logging test: error message', context, new Error('Simulated error'));
    logger.critical('Logging test: critical message', context);
    addLog('Logging test emitted messages across all levels.');
  };

  const runErrorNotificationTest = async () => {
    const context = {
      layer: 'frontend' as const,
      component: 'ErrorHandlingTestPage',
      operation: 'notification_test'
    };

    const appError = errorHandler.createProcessingError(
      'Simulated processing failure for notification test.',
      'notification_test',
      { triggeredAt: new Date().toISOString() },
      context
    );

    await errorHandler.handleError(appError, context, {
      showUserNotification: true,
      reportToService: false
    });

    addLog('Error notification test triggered a user-facing notification.');
  };

  const runDedupTest = async () => {
    const context = {
      layer: 'frontend' as const,
      component: 'ErrorHandlingTestPage',
      operation: 'dedup_test'
    };

    const duplicateError = errorHandler.createProcessingError(
      'Simulated duplicate error for dedup test.',
      'dedup_test',
      { attempt: 1 },
      context
    );

    await errorHandler.handleError(duplicateError, context, {
      showUserNotification: false,
      reportToService: false
    });

    await errorHandler.handleError(duplicateError, context, {
      showUserNotification: false,
      reportToService: false
    });

    addLog('Deduplication test emitted the same error twice for cooldown validation.');
  };

  const executeTest = async (id: TestId) => {
    const definition = TEST_DEFINITIONS.find((test) => test.id === id);
    if (!definition) {
      return;
    }

    updateTestStatus(id, 'running');
    addLog(`Running "${definition.name}"...`);
    const start = performance.now();

    try {
      switch (id) {
        case 'logging-basic':
          runLoggingTest();
          break;
        case 'error-notification':
          await runErrorNotificationTest();
          break;
        case 'error-dedup':
          await runDedupTest();
          break;
        default:
          throw new Error(`Unknown test id: ${id}`);
      }

      const duration = Math.round(performance.now() - start);
      updateTestStatus(id, 'passed', undefined, duration);
      addLog(`"${definition.name}" completed successfully (${duration}ms).`);
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      const message = error instanceof Error ? error.message : String(error);
      updateTestStatus(id, 'failed', message, duration);
      addLog(`"${definition.name}" failed: ${message}`);
    }
  };

  const runSelectedTest = async (id: TestId) => {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    try {
      await executeTest(id);
    } finally {
      setIsRunning(false);
    }
  };

  const runAllTests = async () => {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    addLog('Running all tests sequentially...');

    try {
      for (const test of TEST_DEFINITIONS) {
        await executeTest(test.id);
      }
      addLog('All tests finished.');
    } finally {
      setIsRunning(false);
    }
  };

  const filteredTests = tests.filter((test) =>
    selectedCategory === 'all' ? true : test.category === selectedCategory
  );

  const getStatusIcon = (status: TestStatus) => {
    switch (status) {
      case 'passed':
        return '✅';
      case 'failed':
        return '❌';
      case 'running':
        return '⏳';
      default:
        return '•';
    }
  };

  const getStatusColor = (status: TestStatus) => {
    switch (status) {
      case 'passed':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      case 'running':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-gray-200 bg-white';
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="bg-white rounded-xl shadow-sm p-6 border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">
                Reliability Toolkit
              </p>
              <h1 className="text-3xl font-bold text-slate-900">Error Handling Test Bench</h1>
              <p className="mt-2 text-slate-600">
                Run targeted scenarios to verify logging, notification, and deduplication behaviour.
              </p>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-slate-600 text-sm">Total Tests</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
            <div className="text-2xl font-bold text-emerald-600">{stats.passed}</div>
            <div className="text-slate-600 text-sm">Passed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
            <div className="text-2xl font-bold text-rose-600">{stats.failed}</div>
            <div className="text-slate-600 text-sm">Failed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
            <div className="text-2xl font-bold text-blue-600">{stats.running}</div>
            <div className="text-slate-600 text-sm">Running</div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow border border-slate-200 space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">Test Controls</h2>
              <button
                onClick={runAllTests}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                {isRunning ? 'Running tests…' : 'Run All Tests'}
              </button>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value as CategoryFilter)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === 'all'
                        ? 'All Categories'
                        : `${option.charAt(0).toUpperCase()}${option.slice(1)} Tests`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setTestLogs([])}
                  className="px-3 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-sm"
                >
                  Clear Logs
                </button>
                <button
                  onClick={resetTests}
                  className="px-3 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300 text-sm"
                >
                  Reset Tests
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow border border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Test Results</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredTests.map((test) => (
                  <div
                    key={test.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor(test.status)}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getStatusIcon(test.status)}</span>
                      <div>
                        <div className="font-medium text-slate-900">{test.name}</div>
                        {test.duration !== undefined && (
                          <div className="text-xs text-slate-500">{test.duration}ms</div>
                        )}
                        {test.error && <div className="text-xs text-rose-600">{test.error}</div>}
                        {test.details && <div className="text-xs text-slate-500">{test.details}</div>}
                      </div>
                    </div>
                    {test.status === 'pending' && (
                      <button
                        onClick={() => runSelectedTest(test.id)}
                        disabled={isRunning}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
                      >
                        Run
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-lg shadow border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Test Logs</h2>
            <div className="bg-slate-900 text-emerald-300 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              {testLogs.length === 0 ? (
                <div className="text-slate-400">Logs will appear here as tests run.</div>
              ) : (
                testLogs.map((log, index) => (
                  <div key={index} className="mb-1 whitespace-pre-wrap">
                    {log}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="bg-white p-6 rounded-lg shadow border border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">React Error Boundary Playground</h2>
          <ErrorBoundaryTestComponent />
        </section>
      </div>
    </div>
  );
};

export default ErrorHandlingTestPage;
