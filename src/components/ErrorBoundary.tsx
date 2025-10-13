// React Error Boundary Component
// Catches JavaScript errors in component tree and provides fallback UI

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { logger } from '../services/logger';
import { errorHandler, AppError } from '../services/errorHandlingService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  context?: {
    component?: string;
    feature?: string;
    userId?: string;
  };
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, context } = this.props;
    
    // Generate unique event ID for this error
    const eventId = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.setState({
      errorInfo,
      eventId
    });

    // Create comprehensive error context
    const errorContext = {
      layer: 'frontend' as const,
      component: context?.component || 'ErrorBoundary',
      operation: 'component_render',
      userId: context?.userId,
      metadata: {
        feature: context?.feature,
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
        eventId
      }
    };

    // Create structured error for logging
    const appError: AppError = errorHandler.createError(
      error.message,
      'processing',
      'high',
      {
        code: 'REACT_ERROR_BOUNDARY',
        context: errorContext,
        originalError: error,
        userMessage: 'Something went wrong with this part of the application.',
        suggestions: ['Try refreshing the page', 'Contact support if the problem persists'],
        metadata: {
          componentStack: errorInfo.componentStack,
          errorStack: error.stack,
          eventId
        }
      }
    );

    // Log the error
    logger.error('React Error Boundary caught error', errorContext, appError, {
      componentStack: errorInfo.componentStack,
      errorStack: error.stack,
      props: this.props,
      state: this.state
    });

    // Handle the error through our error handling system
    errorHandler.handleError(appError, errorContext, {
      showUserNotification: true,
      reportToService: true
    });

    // Call custom error handler if provided
    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        logger.error('Error in custom error handler', errorContext, handlerError as Error);
      }
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetKeys && resetKeys.some((key, idx) => prevProps.resetKeys?.[idx] !== key)) {
        this.resetErrorBoundary();
      }
    }

    if (hasError && resetOnPropsChange && prevProps !== this.props) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    const { context } = this.props;
    
    logger.info('Resetting error boundary', {
      layer: 'frontend',
      component: context?.component || 'ErrorBoundary',
      operation: 'reset_error_boundary'
    }, {
      eventId: this.state.eventId
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null
    });
  };

  render() {
    const { hasError, error, errorInfo, eventId } = this.state;
    const { children, fallback, context } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <ErrorFallbackUI
          error={error}
          errorInfo={errorInfo}
          eventId={eventId}
          context={context}
          onReset={this.resetErrorBoundary}
        />
      );
    }

    return children;
  }
}

// Default Error Fallback UI Component
interface ErrorFallbackUIProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
  context?: {
    component?: string;
    feature?: string;
    userId?: string;
  };
  onReset: () => void;
}

const ErrorFallbackUI: React.FC<ErrorFallbackUIProps> = ({
  error,
  errorInfo,
  eventId,
  context,
  onReset
}) => {
  const handleReloadPage = () => {
    logger.info('User requested page reload from error boundary', {
      layer: 'frontend',
      component: context?.component || 'ErrorBoundary',
      operation: 'reload_page'
    }, { eventId });
    
    window.location.reload();
  };

  const handleReportProblem = () => {
    logger.info('User requested to report problem', {
      layer: 'frontend', 
      component: context?.component || 'ErrorBoundary',
      operation: 'report_problem'
    }, { eventId });

    // Here you could open a support ticket or feedback form
    const subject = `Error Report - ${context?.feature || 'Application Error'}`;
    const body = `Error ID: ${eventId}\nComponent: ${context?.component}\nError: ${error?.message}\n\nPlease describe what you were doing when this error occurred.`;
    
    const mailtoLink = `mailto:support@example.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
  };

  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-[200px] flex items-center justify-center p-8 bg-red-50 border border-red-200 rounded-lg">
      <div className="max-w-md text-center">
        {/* Error Icon */}
        <div className="mx-auto w-16 h-16 mb-4 flex items-center justify-center bg-red-100 rounded-full">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        {/* Error Message */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Something went wrong
        </h3>
        
        <p className="text-gray-600 mb-4">
          {context?.feature 
            ? `There was a problem loading the ${context.feature} feature.` 
            : 'There was an unexpected error in this part of the application.'
          }
        </p>

        {/* Error Details (Development Only) */}
        {isDevelopment && error && (
          <details className="mb-4 text-left bg-red-100 p-3 rounded text-sm">
            <summary className="cursor-pointer font-medium text-red-800 mb-2">
              Error Details (Development)
            </summary>
            <div className="space-y-2">
              <div>
                <strong>Error:</strong> {error.message}
              </div>
              <div>
                <strong>Component:</strong> {context?.component || 'Unknown'}
              </div>
              <div>
                <strong>Event ID:</strong> {eventId}
              </div>
              {error.stack && (
                <div>
                  <strong>Stack:</strong>
                  <pre className="text-xs mt-1 p-2 bg-white rounded overflow-auto max-h-32">
                    {error.stack}
                  </pre>
                </div>
              )}
              {errorInfo?.componentStack && (
                <div>
                  <strong>Component Stack:</strong>
                  <pre className="text-xs mt-1 p-2 bg-white rounded overflow-auto max-h-32">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={onReset}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Try Again
          </button>
          
          <button
            onClick={handleReloadPage}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Reload Page
          </button>

          <button
            onClick={handleReportProblem}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Report Problem
          </button>
        </div>

        {/* Help Text */}
        <p className="text-xs text-gray-500 mt-4">
          Error ID: {eventId}
          {context?.userId && (
            <span className="block">User ID: {context.userId}</span>
          )}
        </p>
      </div>
    </div>
  );
};

// Higher-Order Component for easier usage
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Specialized Error Boundaries for different features
export const DocumentProcessingErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    context={{
      component: 'DocumentProcessingErrorBoundary',
      feature: 'Document Processing'
    }}
    fallback={
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <h4 className="font-medium text-yellow-800">Document Processing Unavailable</h4>
            <p className="text-sm text-yellow-700 mt-1">
              The document processing feature is currently experiencing issues. You can still view and manage existing vehicles.
            </p>
          </div>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

export const FleetTableErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    context={{
      component: 'FleetTableErrorBoundary',
      feature: 'Fleet Table'
    }}
    fallback={
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h4 className="font-medium text-gray-800 mb-1">Unable to Load Fleet Data</h4>
          <p className="text-sm text-gray-600 mb-3">
            There was a problem displaying the fleet table. Try refreshing the page.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Refresh Page
          </button>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

export const DashboardErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    context={{
      component: 'DashboardErrorBoundary',
      feature: 'Dashboard'
    }}
    resetOnPropsChange={true}
    fallback={
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Dashboard Unavailable</h3>
          <p className="text-gray-600 mb-4">
            The dashboard is temporarily unavailable. You can still access other features of the application.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reload Dashboard
          </button>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
);

export default ErrorBoundary;
