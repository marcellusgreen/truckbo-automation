// Processing Modal Component
// Shows real-time progress for document processing operations

import { useEffect } from 'react';
import { ProgressBar, LoadingSpinner } from './NotificationSystem';

export interface ProcessingStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  details?: string;
  error?: string;
}

interface ProcessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  steps: ProcessingStep[];
  canCancel?: boolean;
  onCancel?: () => void;
}

export function ProcessingModal({ 
  isOpen, 
  onClose, 
  title, 
  steps, 
  canCancel = false, 
  onCancel 
}: ProcessingModalProps) {
  // Find current active step for potential future use
  useEffect(() => {
    steps.findIndex(step => step.status === 'in_progress');
    // Could be used for highlighting current step
  }, [steps]);

  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const overallProgress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  
  const getStepIcon = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '⏳';
      case 'failed': return '❌';
      case 'pending': return '⏸️';
      default: return '⏸️';
    }
  };

  const getStepColor = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'in_progress': return 'text-blue-600 bg-blue-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'pending': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!isOpen) return null;

  const isProcessing = steps.some(step => step.status === 'in_progress');
  const hasFailures = steps.some(step => step.status === 'failed');
  const isComplete = steps.every(step => step.status === 'completed' || step.status === 'failed');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-screen overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {!isProcessing && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Overall Progress */}
        <div className="px-6 py-4 border-b border-gray-100">
          <ProgressBar 
            progress={overallProgress}
            message={`${completedSteps} of ${totalSteps} steps completed`}
            showPercentage={true}
          />
        </div>

        {/* Steps List */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          <div className="space-y-3">
            {steps.map((step) => (
              <div 
                key={step.id}
                className={`p-3 rounded-lg border ${getStepColor(step.status)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{getStepIcon(step.status)}</span>
                    <div>
                      <h4 className="font-medium">{step.name}</h4>
                      {step.details && (
                        <p className="text-sm opacity-75 mt-1">{step.details}</p>
                      )}
                      {step.error && (
                        <p className="text-sm text-red-600 mt-1">Error: {step.error}</p>
                      )}
                    </div>
                  </div>
                  
                  {step.status === 'in_progress' && (
                    <div className="ml-4">
                      {step.progress !== undefined ? (
                        <div className="w-24">
                          <div className="text-xs text-center mb-1">
                            {Math.round(step.progress)}%
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${step.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      ) : (
                        <LoadingSpinner size="sm" message="" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {isProcessing && 'Processing documents...'}
              {isComplete && !hasFailures && 'All steps completed successfully!'}
              {hasFailures && 'Some steps failed. Please review the errors above.'}
            </div>
            
            <div className="flex space-x-2">
              {canCancel && isProcessing && onCancel && (
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
              )}
              
              {isComplete && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Document processing progress tracking
export class ProcessingTracker {
  private steps: ProcessingStep[] = [];
  private listeners: ((steps: ProcessingStep[]) => void)[] = [];

  addStep(step: Omit<ProcessingStep, 'status'>): void {
    this.steps.push({ ...step, status: 'pending' });
    this.notifyListeners();
  }

  updateStep(stepId: string, updates: Partial<ProcessingStep>): void {
    const stepIndex = this.steps.findIndex(step => step.id === stepId);
    if (stepIndex !== -1) {
      this.steps[stepIndex] = { ...this.steps[stepIndex], ...updates };
      this.notifyListeners();
    }
  }

  startStep(stepId: string, details?: string): void {
    this.updateStep(stepId, { status: 'in_progress', details, progress: 0 });
  }

  updateProgress(stepId: string, progress: number, details?: string): void {
    this.updateStep(stepId, { progress, details });
  }

  completeStep(stepId: string, details?: string): void {
    this.updateStep(stepId, { status: 'completed', progress: 100, details });
  }

  failStep(stepId: string, error: string): void {
    this.updateStep(stepId, { status: 'failed', error });
  }

  getSteps(): ProcessingStep[] {
    return [...this.steps];
  }

  clear(): void {
    this.steps = [];
    this.notifyListeners();
  }

  subscribe(listener: (steps: ProcessingStep[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.steps));
  }
}

export const processingTracker = new ProcessingTracker();