// Document Upload Modal Component
// Handles bulk document upload and AI processing

import React, { useState, useRef } from 'react';
import { documentProcessor, ProcessingResult, ExtractedVehicleData } from '../services/documentProcessor';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentsProcessed: (vehicleData: ExtractedVehicleData[]) => void;
}

type ProcessingStep = 'upload' | 'processing' | 'review' | 'complete';

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onDocumentsProcessed
}) => {
  const [step, setStep] = useState<ProcessingStep>('upload');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const resetModal = () => {
    setStep('upload');
    setSelectedFiles(null);
    setProcessingResult(null);
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

  const handleFolderUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(event.target.files);
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
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProcessingProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      console.log(`🚀 Starting Claude Vision processing for ${selectedFiles.length} files`);
      
      const result = await documentProcessor.processDocuments(
        selectedFiles,
        (progress, message) => {
          setProcessingProgress(Math.min(progress, 90));
          console.log(`📈 Progress: ${progress}% - ${message}`);
        }
      );
      
      clearInterval(progressInterval);
      setProcessingProgress(100);
      
      setProcessingResult(result);
      setStep('review');
      
      console.log(`✅ Processing complete: ${result.summary.processed} files processed`);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Processing failed');
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const acceptResults = () => {
    if (processingResult) {
      onDocumentsProcessed(processingResult.vehicleData);
      setStep('complete');
      
      // **HIGH PRIORITY FIX: Clear cache and trigger refresh**
      console.log('🔄 Clearing reconciler cache and triggering data refresh...');
      
      // Clear reconciler API cache to force fresh data fetch
      import('../services/reconcilerAPI').then(({ reconcilerAPI }) => {
        reconcilerAPI.clearCache();
        console.log('✅ ReconcilerAPI cache cleared');
      });
      
      // Auto-close after showing success
      setTimeout(() => {
        handleClose();
        
        // **Trigger parent component refresh after modal closes**
        console.log('🔄 Triggering parent component data refresh...');
        // The onDocumentsProcessed callback should handle the refresh
      }, 2000);
    }
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
      default: return '📋';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">🤖 AI Document Processing</h2>
              <p className="text-purple-100 mt-1">Upload registration & insurance documents for automatic processing</p>
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

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 text-2xl">🤖</span>
                    </div>
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="font-bold text-blue-800 mb-2">AI-Powered Document Processing</h3>
                    <p className="text-blue-700 text-sm mb-3">
                      Our AI can automatically extract vehicle information from:
                    </p>
                    <ul className="text-blue-700 text-sm space-y-1 mb-4">
                      <li>✅ Vehicle registration documents</li>
                      <li>✅ Insurance certificates and policies</li>
                      <li>✅ Title documents</li>
                      <li>✅ <strong>PDF files</strong> (processed on server with full Claude Vision support)</li>
                      <li>✅ <strong>JPG, PNG images</strong> (processed in browser with Claude Vision)</li>
                    </ul>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                      <p className="text-green-800 text-xs font-medium">
                        🚀 Hybrid Processing: PDFs → Server | Images → Browser - Best of both worlds!
                      </p>
                    </div>
                    <div className="bg-blue-100 rounded-lg p-3">
                      <p className="text-blue-800 text-xs font-medium">
                        💡 Pro Tip: Name your images clearly like "truck_123_registration.jpg" or "insurance_policy_2024.png"
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Folder Upload */}
                <div className="border-2 border-dashed border-purple-300 rounded-xl p-8 text-center hover:border-purple-400 transition-colors duration-200">
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    {...({webkitdirectory: ""})}
                    onChange={handleFolderUpload}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx,.txt"
                  />
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                    📁
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    Upload Entire Folder
                  </h4>
                  <p className="text-gray-600 mb-4">
                    Select a folder containing all your vehicle documents
                  </p>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:scale-105 active:scale-95"
                  >
                    📁 Select Folder
                  </button>
                </div>

                {/* Multiple Files Upload */}
                <div className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors duration-200">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx,.txt"
                  />
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                    📄
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    Select Multiple Files
                  </h4>
                  <p className="text-gray-600 mb-4">
                    Choose individual documents from different locations
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:scale-105 active:scale-95"
                  >
                    📄 Select Files
                  </button>
                </div>
              </div>

              {/* Selected Files Preview */}
              {selectedFiles && (
                <div className="bg-gray-50 rounded-xl p-6">
                  <h4 className="font-bold text-gray-900 mb-4">
                    Selected Files ({selectedFiles.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {Array.from(selectedFiles).slice(0, 12).map((file, index) => (
                      <div key={index} className="flex items-center p-3 bg-white rounded-lg border">
                        <span className="text-2xl mr-3">{getFileTypeIcon(file.name)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                    ))}
                    {selectedFiles.length > 12 && (
                      <div className="flex items-center justify-center p-3 bg-gray-100 rounded-lg border-2 border-dashed">
                        <span className="text-gray-500 text-sm">+{selectedFiles.length - 12} more files</span>
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={startProcessing}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-purple-900/20 hover:shadow-2xl hover:shadow-purple-900/30 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🤖 Start AI Processing
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Processing */}
          {step === 'processing' && (
            <div className="text-center py-12">
              <div className="animate-spin text-6xl mb-6">🤖</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">AI Processing Documents</h3>
              <p className="text-gray-600 mb-6">
                Extracting vehicle information, registration dates, and insurance details...
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
              
              <div className="bg-blue-50 rounded-xl p-4 max-w-md mx-auto">
                <p className="text-blue-700 text-sm">
                  🔍 Using AI to identify VINs, license plates, expiry dates, and insurance details
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review Results */}
          {step === 'review' && processingResult && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-center mb-4">
                  <span className="text-green-500 text-2xl mr-3">✅</span>
                  <h3 className="text-xl font-bold text-green-800">Processing Complete!</h3>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{processingResult.summary.totalFiles}</div>
                    <div className="text-sm text-green-700">Files Uploaded</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{processingResult.summary.processed}</div>
                    <div className="text-sm text-blue-700">Successfully Processed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600">{(() => {
                      const count = (processingResult.consolidatedVehicles?.length || processingResult.vehicleData.length);
                      console.log('🔍 SUMMARY COUNT DEBUG:', {
                        consolidatedVehicles: processingResult.consolidatedVehicles?.length,
                        vehicleData: processingResult.vehicleData.length,
                        finalCount: count
                      });
                      return count;
                    })()}</div>
                    <div className="text-sm text-emerald-700">Vehicles Found</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{processingResult.summary.registrationDocs}</div>
                    <div className="text-sm text-purple-700">Registration Docs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-600">{processingResult.summary.insuranceDocs}</div>
                    <div className="text-sm text-indigo-700">Insurance Docs</div>
                  </div>
                </div>
              </div>

              {/* Extracted Vehicle Data */}
              <div className="bg-white border border-gray-200 rounded-xl">
                <div className="p-4 border-b border-gray-200">
                  <h4 className="font-bold text-gray-900">Extracted Vehicle Data</h4>
                  <p className="text-sm text-gray-600">Review and verify the AI-extracted information</p>
                </div>
                
                <div className="max-h-96 overflow-y-auto">
                  {processingResult.vehicleData.map((vehicle, index) => (
                    <div key={index} className={`p-4 border-b border-gray-100 ${vehicle.needsReview ? 'bg-yellow-50' : 'bg-white'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-2">
                            <span className="text-lg mr-2">
                              {vehicle.documentType === 'registration' ? '📋' : '🛡️'}
                            </span>
                            <h5 className="font-bold text-gray-900">
                              {vehicle.year} {vehicle.make} {vehicle.model || 'Unknown Model'}
                            </h5>
                            {vehicle.needsReview && (
                              <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                                Needs Review
                              </span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">VIN:</span>
                              <div className="font-mono font-bold">{vehicle.vin || '—'}</div>
                            </div>
                            <div>
                              <span className="text-gray-500">License Plate:</span>
                              <div className="font-bold">{vehicle.licensePlate || '—'}</div>
                            </div>
                            <div>
                              <span className="text-gray-500">Expiry Date:</span>
                              <div className="font-bold">
                                {vehicle.registrationExpiry || vehicle.insuranceExpiry || '—'}
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-2 text-xs text-gray-500">
                            Source: {vehicle.sourceFileName} | Confidence: {Math.round(vehicle.extractionConfidence * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Errors and Unprocessed Files */}
              {(processingResult.errors.length > 0 || processingResult.unprocessedFiles.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h4 className="font-bold text-amber-800 mb-2">Attention Required</h4>
                  
                  {processingResult.unprocessedFiles.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm text-amber-700 mb-1">Unprocessed files:</p>
                      <ul className="text-xs text-amber-600 list-disc list-inside">
                        {processingResult.unprocessedFiles.map((file, index) => (
                          <li key={index}>{file}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {processingResult.errors.length > 0 && (
                    <div>
                      <p className="text-sm text-amber-700 mb-1">Processing errors:</p>
                      <ul className="text-xs text-amber-600 list-disc list-inside">
                        {processingResult.errors.map((error, index) => (
                          <li key={index}>{error.fileName}: {error.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => setStep('upload')}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors duration-200"
                >
                  ← Process More Files
                </button>
                <button
                  onClick={acceptResults}
                  className="flex-2 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  ✅ Add {(() => {
                    const count = (processingResult.consolidatedVehicles?.length || processingResult.vehicleData.length);
                    console.log('🔍 BUTTON COUNT DEBUG:', {
                      consolidatedVehicles: processingResult.consolidatedVehicles?.length,
                      vehicleData: processingResult.vehicleData.length,
                      finalCount: count
                    });
                    return count;
                  })()} Vehicles to Fleet
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold text-green-600 mb-2">Documents Processed Successfully!</h3>
              <p className="text-gray-600">
                Vehicle data has been extracted and added to your fleet management system.
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