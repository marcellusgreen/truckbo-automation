// Multi-Batch Document Upload Modal
// Supports multiple upload sessions and intelligent data reconciliation

import React, { useState, useRef, useEffect } from 'react';
import { multiBatchDocumentProcessor, MultiBatchProcessingState } from '../services/multiBatchDocumentProcessor';

interface MultiBatchDocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentsReconciled: (vehicleCount: number) => void;
}

type ProcessingStep = 'overview' | 'upload' | 'processing' | 'reconciliation' | 'complete';

export const MultiBatchDocumentUploadModal: React.FC<MultiBatchDocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onDocumentsReconciled
}) => {
  const [step, setStep] = useState<ProcessingStep>('overview');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [processingState, setProcessingState] = useState<MultiBatchProcessingState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load processing state on component mount
  useEffect(() => {
    if (isOpen) {
      const state = multiBatchDocumentProcessor.getProcessingState();
      setProcessingState(state);
      
      // Start with upload step if no batches exist, otherwise show overview
      setStep(state.batches.length === 0 ? 'upload' : 'overview');
    }
  }, [isOpen]);

  // Subscribe to processing state changes
  useEffect(() => {
    const unsubscribe = multiBatchDocumentProcessor.subscribe((state) => {
      setProcessingState(state);
    });
    return unsubscribe;
  }, []);

  const resetModal = () => {
    setStep('overview');
    setSelectedFiles(null);
    setIsProcessing(false);
    setProcessingProgress(0);
    setError(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleFileSelection = (files: FileList | null) => {
    if (files && files.length > 0) {
      setSelectedFiles(files);
      setError(null);
      console.log(`📁 Selected ${files.length} files for processing`);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(event.target.files);
  };

  const startProcessing = async () => {
    if (!selectedFiles) {
      setError('Please select files to process');
      return;
    }

    setIsProcessing(true);
    setStep('processing');
    setProcessingProgress(0);

    try {
      const result = await multiBatchDocumentProcessor.applyReconciliation();

      if (!result.success) {
        const message = result.errors.length > 0 ? result.errors.join('; ') : 'Unknown reconciliation error';
        setError(`Failed to apply reconciliation: ${message}`);
        return;
      }

      console.log('[MultiBatch] Applied reconciliation', result);

      onDocumentsReconciled(result.processed);
      setStep('complete');

      // Auto-close after showing success
      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Batch processing failed');
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const applyReconciliation = async () => {
    if (!processingState?.reconciliationResult) {
      setError('No reconciliation data available');
      return;
    }

    setIsProcessing(true);

    try {
      const result = await multiBatchDocumentProcessor.applyReconciliation();

      if (!result.success) {
        const message = result.errors.length > 0 ? result.errors.join('; ') : 'Unknown reconciliation error';
        setError(`Failed to apply reconciliation: ${message}`);
        return;
      }

      console.log('[MultiBatch] Applied reconciliation', result);

      onDocumentsReconciled(result.processed);
      setStep('complete');

      // Auto-close after showing success
      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to apply reconciliation');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAllData = () => {
    multiBatchDocumentProcessor.clearProcessingData();
    setStep('upload');
  };

  const getFileTypeIcon = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png': return '🖼️';
      case 'doc':
      case 'docx': return '📝';
      case 'txt': return '📋';
      default: return '📋';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">🔄 Multi-Batch Document Processing</h2>
              <p className="text-purple-100 mt-1">Upload registration and insurance documents separately, then reconcile data</p>
            </div>
            <button
              onClick={handleClose}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors duration-200"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <div className="flex items-center">
                <span className="text-red-500 text-xl mr-3">❌</span>
                <span className="text-red-700 font-medium">{error}</span>
              </div>
            </div>
          )}

          {/* Step 1: Overview */}
          {step === 'overview' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 text-2xl">📊</span>
                    </div>
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="font-bold text-blue-800 mb-2">Multi-Batch Processing Overview</h3>
                    <p className="text-blue-700 text-sm mb-3">
                      This advanced document processor allows you to upload documents in multiple batches and intelligently reconcile the data:
                    </p>
                    <ul className="text-blue-700 text-sm space-y-1">
                      <li>✅ Upload registration documents in one batch</li>
                      <li>✅ Upload insurance documents in another batch</li>
                      <li>✅ Automatic data reconciliation by VIN</li>
                      <li>✅ Complete compliance data merging</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Current Processing State */}
              {processingState && (
                <div className="bg-white border border-gray-200 rounded-xl">
                  <div className="p-4 border-b border-gray-200">
                    <h4 className="font-bold text-gray-900">Processing Status</h4>
                  </div>
                  
                  <div className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{processingState.batches.length}</div>
                        <div className="text-sm text-blue-700">Batches Processed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{processingState.totalDocumentsProcessed}</div>
                        <div className="text-sm text-green-700">Total Documents</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {processingState.reconciliationResult?.summary.fullyDocumented || 0}
                        </div>
                        <div className="text-sm text-purple-700">Complete Vehicles</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-indigo-600">
                          {processingState.reconciliationResult?.summary.reconciliationScore || 0}%
                        </div>
                        <div className="text-sm text-indigo-700">Data Completeness</div>
                      </div>
                    </div>

                    {/* Batch History */}
                    {processingState.batches.length > 0 && (
                      <div className="mb-4">
                        <h5 className="font-semibold text-gray-800 mb-2">Recent Batches:</h5>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {processingState.batches.slice(-3).map((batch) => (
                            <div key={batch.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center">
                                <span className="text-lg mr-3">📁</span>
                                <div>
                                  <div className="text-sm font-medium">
                                    {batch.registrationDocs} registration, {batch.insuranceDocs} insurance
                                  </div>
                                  <div className="text-xs text-gray-500">{formatDate(batch.timestamp)}</div>
                                </div>
                              </div>
                              <div className="text-sm text-gray-600">
                                {batch.processedFiles}/{batch.totalFiles} files
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => setStep('upload')}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  📁 Upload More Documents
                </button>
                
                {processingState?.reconciliationResult && (
                  <button
                    onClick={() => setStep('reconciliation')}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    🔄 View Reconciliation
                  </button>
                )}
                
                {processingState?.batches && processingState.batches.length > 0 && (
                  <button
                    onClick={clearAllData}
                    className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-bold transition-all duration-200"
                  >
                    🗑️ Clear All
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-green-600 text-2xl">📂</span>
                    </div>
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="font-bold text-green-800 mb-2">Upload Document Batch</h3>
                    <p className="text-green-700 text-sm mb-3">
                      You can upload documents in separate batches (e.g., all registration documents first, then all insurance documents).
                      The system will automatically reconcile the data by VIN.
                    </p>
                    <div className="bg-green-100 rounded-lg p-3">
                      <p className="text-green-800 text-xs font-medium">
                        💡 Pro Tip: Upload one document type at a time for better organization and reconciliation
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* File Upload Area */}
              <div className="border-2 border-dashed border-purple-300 rounded-xl p-8 text-center hover:border-purple-400 transition-colors duration-200">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx,.txt"
                />
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                  📁
                </div>
                <h5 className="text-lg font-semibold text-gray-900 mb-2">
                  {selectedFiles ? `Selected: ${selectedFiles.length} files` : 'Select Document Batch'}
                </h5>
                <p className="text-gray-500 mb-4">
                  {selectedFiles ? 'Click process to continue' : 'Choose registration documents, insurance documents, or mixed batch'}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  {selectedFiles ? '📄 Change Files' : '📁 Browse Files'}
                </button>
              </div>

              {/* Selected Files Preview */}
              {selectedFiles && (
                <div className="bg-gray-50 rounded-xl p-6">
                  <h4 className="font-bold text-gray-900 mb-4">
                    Selected Files ({selectedFiles.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6 max-h-60 overflow-y-auto">
                    {Array.from(selectedFiles).map((file, index) => (
                      <div key={index} className="flex items-center p-3 bg-white rounded-lg border">
                        <span className="text-2xl mr-3">{getFileTypeIcon(file.name)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={startProcessing}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-purple-900/20 hover:shadow-2xl hover:shadow-purple-900/30 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🚀 Process Batch
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Processing */}
          {step === 'processing' && (
            <div className="text-center py-12">
              <div className="animate-spin text-6xl mb-6">🔄</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Processing Document Batch</h3>
              <p className="text-gray-600 mb-6">
                Extracting vehicle information and preparing for reconciliation...
              </p>
              
              <div className="max-w-md mx-auto mb-6">
                <div className="bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${processingProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">{processingProgress}% complete</p>
              </div>
            </div>
          )}

          {/* Step 4: Reconciliation */}
          {step === 'reconciliation' && processingState?.reconciliationResult && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-center mb-4">
                  <span className="text-green-500 text-2xl mr-3">✅</span>
                  <h3 className="text-xl font-bold text-green-800">Data Reconciliation Complete!</h3>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{processingState.reconciliationResult.summary.totalVehicles}</div>
                    <div className="text-sm text-green-700">Total Vehicles</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{processingState.reconciliationResult.summary.fullyDocumented}</div>
                    <div className="text-sm text-blue-700">Complete Records</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{processingState.reconciliationResult.summary.missingInsurance}</div>
                    <div className="text-sm text-orange-700">Missing Insurance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{processingState.reconciliationResult.summary.missingRegistration}</div>
                    <div className="text-sm text-red-700">Missing Registration</div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Data Completeness</span>
                    <span className="text-sm font-bold text-purple-600">{processingState.reconciliationResult.summary.reconciliationScore}%</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${processingState.reconciliationResult.summary.reconciliationScore}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Reconciliation Details */}
              <div className="bg-white border border-gray-200 rounded-xl">
                <div className="p-4 border-b border-gray-200">
                  <h4 className="font-bold text-gray-900">Reconciliation Breakdown</h4>
                </div>
                
                <div className="p-4 space-y-4 max-h-60 overflow-y-auto">
                  {/* Complete Vehicles */}
                  {processingState.reconciliationResult.completeVehicles.length > 0 && (
                    <div>
                      <h5 className="font-semibold text-green-700 mb-2">✅ Complete Records ({processingState.reconciliationResult.completeVehicles.length})</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {processingState.reconciliationResult.completeVehicles.slice(0, 4).map((vehicle, index) => (
                          <div key={index} className="p-2 bg-green-50 rounded border-l-4 border-green-500">
                            <div className="text-sm font-medium">{vehicle.truckNumber || `#${vehicle.vin.slice(-3)}`}</div>
                            <div className="text-xs text-gray-600">{vehicle.make} {vehicle.model} • {vehicle.vin.slice(-6)}</div>
                          </div>
                        ))}
                      </div>
                      {processingState.reconciliationResult.completeVehicles.length > 4 && (
                        <p className="text-xs text-gray-500 mt-2">... and {processingState.reconciliationResult.completeVehicles.length - 4} more</p>
                      )}
                    </div>
                  )}

                  {/* Registration Only */}
                  {processingState.reconciliationResult.registrationOnly.length > 0 && (
                    <div>
                      <h5 className="font-semibold text-orange-700 mb-2">⚠️ Missing Insurance ({processingState.reconciliationResult.registrationOnly.length})</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {processingState.reconciliationResult.registrationOnly.slice(0, 4).map((vehicle, index) => (
                          <div key={index} className="p-2 bg-orange-50 rounded border-l-4 border-orange-500">
                            <div className="text-sm font-medium">{vehicle.truckNumber || `#${vehicle.vin.slice(-3)}`}</div>
                            <div className="text-xs text-gray-600">{vehicle.make} {vehicle.model} • {vehicle.vin.slice(-6)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Insurance Only */}
                  {processingState.reconciliationResult.insuranceOnly.length > 0 && (
                    <div>
                      <h5 className="font-semibold text-red-700 mb-2">❌ Missing Registration ({processingState.reconciliationResult.insuranceOnly.length})</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {processingState.reconciliationResult.insuranceOnly.slice(0, 4).map((vehicle, index) => (
                          <div key={index} className="p-2 bg-red-50 rounded border-l-4 border-red-500">
                            <div className="text-sm font-medium">{vehicle.truckNumber || `#${vehicle.vin.slice(-3)}`}</div>
                            <div className="text-xs text-gray-600">{vehicle.make} {vehicle.model} • {vehicle.vin.slice(-6)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => setStep('upload')}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors duration-200"
                >
                  📁 Upload More Documents
                </button>
                <button
                  onClick={applyReconciliation}
                  disabled={isProcessing}
                  className="flex-2 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? '⏳ Applying...' : `🚛 Add ${processingState.reconciliationResult.summary.totalVehicles} Vehicles to Fleet`}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 'complete' && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold text-green-600 mb-2">Fleet Data Reconciled Successfully!</h3>
              <p className="text-gray-600">
                All vehicles have been processed and added to your fleet with complete compliance data.
              </p>
              <div className="mt-6">
                <div className="inline-flex items-center text-green-600">
                  <span className="animate-spin mr-2">⏳</span>
                  Closing automatically...
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

