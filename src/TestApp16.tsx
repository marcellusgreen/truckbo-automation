import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';

// Test importing the services that App.tsx imports but we haven't tested
import { comprehensiveComplianceService } from './services/comprehensiveComplianceApi';
import { documentDownloadService } from './services/documentDownloadService';
import { dataInputService } from './services/dataInputService';

const TestServiceImports: React.FC = () => {
  const [status, setStatus] = React.useState('Testing service imports...');
  const [errors, setErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    const testServices = async () => {
      const testErrors: string[] = [];
      
      try {
        console.log('Testing comprehensiveComplianceService...');
        // Just check if it exists
        if (comprehensiveComplianceService) {
          console.log('✅ comprehensiveComplianceService imported');
        }
      } catch (error: any) {
        console.error('❌ comprehensiveComplianceService failed:', error);
        testErrors.push(`comprehensiveComplianceService: ${error.message}`);
      }

      try {
        console.log('Testing documentDownloadService...');
        if (documentDownloadService) {
          console.log('✅ documentDownloadService imported');
        }
      } catch (error: any) {
        console.error('❌ documentDownloadService failed:', error);
        testErrors.push(`documentDownloadService: ${error.message}`);
      }

      try {
        console.log('Testing dataInputService...');
        if (dataInputService) {
          console.log('✅ dataInputService imported');
        }
      } catch (error: any) {
        console.error('❌ dataInputService failed:', error);
        testErrors.push(`dataInputService: ${error.message}`);
      }

      if (testErrors.length === 0) {
        setStatus('✅ All service imports working!');
      } else {
        setStatus('❌ Some service imports failed');
        setErrors(testErrors);
      }
    };

    testServices();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Service Import Test</h1>
      <p className="text-lg mb-4">{status}</p>
      
      {errors.length > 0 && (
        <div className="bg-red-100 p-4 rounded mb-4">
          <h3 className="font-bold text-red-800">Errors:</h3>
          <ul className="list-disc pl-5">
            {errors.map((error, index) => (
              <li key={index} className="text-red-700">{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const TestApp16: React.FC = () => {
  return (
    <ErrorBoundary>
      <TestServiceImports />
      <NotificationSystem />
    </ErrorBoundary>
  );
};

export default TestApp16;