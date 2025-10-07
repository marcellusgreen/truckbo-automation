import React from 'react';
import { ErrorBoundary, NotificationSystem } from './components/NotificationSystem';

// Enhanced ErrorBoundary that captures more details
class DetailedErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('🚨 Detailed Error Boundary caught an error:');
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Component Stack:', errorInfo.componentStack);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-2xl font-bold text-red-800 mb-4">🚨 App Crashed!</h2>
          
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-red-700">Error Message:</h3>
            <p className="text-red-600 bg-red-100 p-2 rounded font-mono text-sm">
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-semibold text-red-700">Error Stack:</h3>
            <pre className="text-red-600 bg-red-100 p-2 rounded text-xs overflow-auto max-h-40">
              {this.state.error?.stack || 'No stack trace'}
            </pre>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-semibold text-red-700">Component Stack:</h3>
            <pre className="text-red-600 bg-red-100 p-2 rounded text-xs overflow-auto max-h-40">
              {this.state.errorInfo?.componentStack || 'No component stack'}
            </pre>
          </div>

          <button 
            onClick={() => window.location.reload()} 
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Import and render the actual App
const ActualApp = React.lazy(() => import('./App'));

const TestRealAppWithErrorCapture: React.FC = () => {
  return (
    <DetailedErrorBoundary>
      <React.Suspense fallback={<div className="p-8">Loading App...</div>}>
        <ActualApp />
      </React.Suspense>
    </DetailedErrorBoundary>
  );
};

export default TestRealAppWithErrorCapture;