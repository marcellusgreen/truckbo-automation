// Bulk Upload Modal Component
// Allows adding multiple vehicles via CSV/VIN list to existing fleet

import React, { useState, useRef } from 'react';
import type { VehicleRecord } from '../services/persistentFleetStorage';
import { fleetStorageAdapter } from '../services/fleetStorageAdapter';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVehiclesAdded: (vehicles: VehicleRecord[]) => void;
}

interface ParsedVIN {
  vin: string;
  isValid: boolean;
  row: number;
}

interface ProcessedVehicle {
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  dotNumber?: string;
  status: 'active' | 'maintenance' | 'inactive';
  isValid: boolean;
  needsReview: boolean;
  missingFields: string[];
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  onVehiclesAdded
}) => {
  const [uploadMethod, setUploadMethod] = useState<'vin_list' | 'csv_upload'>('csv_upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [vinListText, setVinListText] = useState('');
  const [, setParsedVINs] = useState<ParsedVIN[]>([]);
  const [processedVehicles, setProcessedVehicles] = useState<ProcessedVehicle[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<'upload' | 'processing' | 'review' | 'complete'>('upload');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetModal = () => {
    setUploadMethod('csv_upload');
    setUploadedFile(null);
    setVinListText('');
    setParsedVINs([]);
    setProcessedVehicles([]);
    setIsProcessing(false);
    setProcessingStep('upload');
    setError(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  // VIN validation function
  const validateVIN = (vin: string): boolean => {
    if (vin.length !== 17) return false;
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
    return vinRegex.test(vin);
  };

  // Parse VIN list from text
  const parseVINList = (text: string): ParsedVIN[] => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    return lines.map((vin, index) => ({
      vin: vin.toUpperCase(),
      isValid: validateVIN(vin),
      row: index + 1
    }));
  };

  // Parse CSV file
  const parseCSVFile = (file: File): Promise<ParsedVIN[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          
          // Skip header if it exists
          const dataLines = lines[0].toLowerCase().includes('vin') ? lines.slice(1) : lines;
          
          const parsed = dataLines.map((line, index) => {
            const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
            const vin = columns[0]; // Assume VIN is first column
            
            return {
              vin: vin.toUpperCase(),
              isValid: validateVIN(vin),
              row: index + 2 // +2 because we might have skipped header and index starts at 0
            };
          });

          resolve(parsed);
        } catch (error) {
          reject(new Error('Failed to parse CSV file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setError(null);
    }
  };

  const handleVINListSubmit = async () => {
    if (!vinListText.trim()) {
      setError('Please enter at least one VIN');
      return;
    }

    setIsProcessing(true);
    setProcessingStep('processing');

    try {
      const parsed = parseVINList(vinListText);
      setParsedVINs(parsed);
      
      if (parsed.length === 0) {
        throw new Error('No valid VINs found');
      }

      // Process VINs into vehicle data
      const processed = parsed.map(vinData => ({
        vin: vinData.vin,
        status: 'active' as const,
        isValid: vinData.isValid,
        needsReview: !vinData.isValid,
        missingFields: vinData.isValid ? ['make', 'model', 'year', 'licensePlate'] : ['vin', 'make', 'model', 'year', 'licensePlate']
      }));

      setProcessedVehicles(processed);
      setProcessingStep('review');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error) || 'Failed to process VIN list');
      setProcessingStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCSVSubmit = async () => {
    if (!uploadedFile) {
      setError('Please select a CSV file');
      return;
    }

    setIsProcessing(true);
    setProcessingStep('processing');

    try {
      const parsed = await parseCSVFile(uploadedFile);
      setParsedVINs(parsed);
      
      if (parsed.length === 0) {
        throw new Error('No valid data found in CSV file');
      }

      // Process VINs into vehicle data
      const processed = parsed.map(vinData => ({
        vin: vinData.vin,
        status: 'active' as const,
        isValid: vinData.isValid,
        needsReview: !vinData.isValid,
        missingFields: vinData.isValid ? ['make', 'model', 'year', 'licensePlate'] : ['vin', 'make', 'model', 'year', 'licensePlate']
      }));

      setProcessedVehicles(processed);
      setProcessingStep('review');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error) || 'Failed to process CSV file');
      setProcessingStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const addVehiclesToFleet = async () => {
    const validVehicles = processedVehicles.filter(v => v.isValid);

    if (validVehicles.length === 0) {
      setError('No valid vehicles to add');
      return;
    }

    setIsProcessing(true);

    try {
      const vehiclesToAdd = validVehicles.map(v => ({
        vin: v.vin,
        make: v.make || 'Unknown',
        model: v.model || 'Unknown',
        year: v.year || new Date().getFullYear(),
        licensePlate: v.licensePlate || `${v.vin.slice(-6)}`,
        dotNumber: v.dotNumber,
        truckNumber: '',
        status: v.status
      }));

      const result = await fleetStorageAdapter.addVehicles(vehiclesToAdd);

      if (result.success && result.processed > 0) {
        const fleet = await fleetStorageAdapter.getFleet();
        const addedVehicles = fleet.filter(vehicle => validVehicles.some(v => v.vin === vehicle.vin));

        onVehiclesAdded(addedVehicles as VehicleRecord[]);
        setProcessingStep('complete');

        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        throw new Error(result.errors.join(', ') || 'Failed to add vehicles to fleet');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to add vehicles');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSampleCSV = () => {
    const csvContent = 'VIN,Make,Model,Year,License_Plate,DOT_Number\n1HGCM82633A123456,Honda,Civic,2022,ABC123,1234567\n1FTFW1ET5DFC12345,Ford,F-150,2023,XYZ789,7654321';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_vehicle_import.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">📁 Bulk Add Vehicles</h2>
              <p className="text-green-100 mt-1">Add multiple vehicles to your existing fleet</p>
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

          {processingStep === 'upload' && (
            <>
              {/* Method Selection */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Choose Import Method</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div
                    className={`group relative border-2 rounded-xl p-6 cursor-pointer transition-all duration-300 ${
                      uploadMethod === 'csv_upload'
                        ? 'border-green-500 bg-green-50 shadow-lg'
                        : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
                    }`}
                    onClick={() => setUploadMethod('csv_upload')}
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                        CSV
                      </div>
                      <h4 className="font-bold text-xl mb-3 text-gray-900">CSV File Upload</h4>
                      <p className="text-gray-600">Upload a CSV file with vehicle information</p>
                    </div>
                  </div>

                  <div
                    className={`group relative border-2 rounded-xl p-6 cursor-pointer transition-all duration-300 ${
                      uploadMethod === 'vin_list'
                        ? 'border-green-500 bg-green-50 shadow-lg'
                        : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
                    }`}
                    onClick={() => setUploadMethod('vin_list')}
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto group-hover:scale-110 transition-transform duration-300">
                        VIN
                      </div>
                      <h4 className="font-bold text-xl mb-3 text-gray-900">VIN List</h4>
                      <p className="text-gray-600">Paste a list of VIN numbers</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* CSV Upload */}
              {uploadMethod === 'csv_upload' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <span className="text-blue-600 text-lg">💡</span>
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <h4 className="font-semibold text-blue-800 mb-2">CSV Format</h4>
                        <p className="text-blue-700 text-sm mb-3">
                          Your CSV should have columns: VIN, Make, Model, Year, License_Plate, DOT_Number
                          <br/><strong>Note:</strong> DOT_Number is required for compliance data (identifies the carrier/company)
                        </p>
                        <button
                          onClick={downloadSampleCSV}
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all duration-300 shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-900/30 hover:scale-105 active:scale-95"
                        >
                          📥 Download Sample CSV
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-green-400 transition-colors duration-200">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                      📁
                    </div>
                    <h5 className="text-lg font-semibold text-gray-900 mb-2">
                      {uploadedFile ? `Selected: ${uploadedFile.name}` : 'Drop your CSV file here'}
                    </h5>
                    <p className="text-gray-500 mb-4">
                      {uploadedFile ? 'Click process to continue' : 'or click to browse files'}
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:scale-105 active:scale-95"
                    >
                      {uploadedFile ? '📄 Change File' : '📁 Browse Files'}
                    </button>
                  </div>

                  <button
                    onClick={handleCSVSubmit}
                    disabled={!uploadedFile || isProcessing}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-green-900/20 hover:shadow-2xl hover:shadow-green-900/30 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '⏳ Processing...' : '🚀 Process CSV File'}
                  </button>
                </div>
              )}

              {/* VIN List Input */}
              {uploadMethod === 'vin_list' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <span className="text-blue-600 text-lg">💡</span>
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <h4 className="font-semibold text-blue-800 mb-2">VIN List Format</h4>
                        <p className="text-blue-700 text-sm">
                          Enter one VIN per line. VINs must be exactly 17 characters long.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Paste VIN Numbers (one per line)
                    </label>
                    <textarea
                      value={vinListText}
                      onChange={(e) => setVinListText(e.target.value)}
                      className="w-full h-40 px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-blue-500 font-mono text-sm resize-none"
                      placeholder="1HGCM82633A123456&#10;1FTFW1ET5DFC12345&#10;JH4KA8260MC123456"
                    />
                  </div>

                  <button
                    onClick={handleVINListSubmit}
                    disabled={!vinListText.trim() || isProcessing}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 hover:shadow-2xl hover:shadow-blue-900/30 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '⏳ Processing...' : '🚀 Process VIN List'}
                  </button>
                </div>
              )}
            </>
          )}

          {processingStep === 'processing' && (
            <div className="text-center py-12">
              <div className="animate-spin text-6xl mb-4">⚙️</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Processing Vehicle Data</h3>
              <p className="text-gray-600">Validating VINs and preparing vehicle records...</p>
            </div>
          )}

          {processingStep === 'review' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Review Vehicles</h3>
                <div className="text-sm text-gray-600">
                  {processedVehicles.filter(v => v.isValid).length} valid of {processedVehicles.length} total
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="font-semibold text-blue-800">Total VINs</div>
                  <div className="text-2xl text-blue-600">{processedVehicles.length}</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="font-semibold text-green-800">Valid VINs</div>
                  <div className="text-2xl text-green-600">{processedVehicles.filter(v => v.isValid).length}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="font-semibold text-red-800">Invalid VINs</div>
                  <div className="text-2xl text-red-600">{processedVehicles.filter(v => !v.isValid).length}</div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                <div className="flex items-center">
                  <span className="text-yellow-500 text-xl mr-3">⚠️</span>
                  <div>
                    <h4 className="font-semibold text-yellow-800">Note</h4>
                    <p className="text-yellow-700 text-sm">
                      Vehicles will be added with placeholder data for missing information. You can edit them later in Fleet Management.
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto">
                <div className="space-y-2">
                  {processedVehicles.map((vehicle, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        vehicle.isValid
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-lg mr-2">
                            {vehicle.isValid ? '✅' : '❌'}
                          </span>
                          <span className="font-mono text-sm font-bold">
                            {vehicle.vin}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          vehicle.isValid 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {vehicle.isValid ? 'Valid' : 'Invalid VIN'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setProcessingStep('upload')}
                  className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors duration-200"
                >
                  ← Back
                </button>
                <button
                  onClick={addVehiclesToFleet}
                  disabled={processedVehicles.filter(v => v.isValid).length === 0 || isProcessing}
                  className="flex-2 px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? '⏳ Adding...' : `🚛 Add ${processedVehicles.filter(v => v.isValid).length} Vehicles`}
                </button>
              </div>
            </div>
          )}

          {processingStep === 'complete' && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold text-green-600 mb-2">Vehicles Added Successfully!</h3>
              <p className="text-gray-600">
                {processedVehicles.filter(v => v.isValid).length} vehicles have been added to your fleet.
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



