// Enhanced Data Input Components
// Provides file upload, manual entry, and API fallback interfaces

import React, { useState, useRef } from 'react';
import { dataInputService, EnhancedVehicleData, ManualEntryTemplate, FileUploadResult } from '../services/dataInputService';

interface FormField {
  field: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
}

interface FileUploadProps {
  onDataProcessed: (data: EnhancedVehicleData[]) => void;
  onError: (error: string) => void;
}

export const BulkFileUpload: React.FC<FileUploadProps> = ({ onDataProcessed, onError }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadResult, setUploadResult] = useState<FileUploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onError('Please upload a CSV file');
      return;
    }

    setIsProcessing(true);
    setUploadResult(null);

    try {
      const result = await dataInputService.processBulkFile(file);
      setUploadResult(result);
      
      if (result.success) {
        onDataProcessed(result.data);
      } else {
        onError('File processing failed. Please check the file format and try again.');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'File processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    dataInputService.downloadBulkUploadTemplate();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Bulk Vehicle Data Upload</h3>
        <p className="text-gray-600 mb-4">Upload a CSV file with your vehicle data</p>
        
        <button
          onClick={downloadTemplate}
          className="mb-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
        >
          📥 Download CSV Template
        </button>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <div>
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-600">Processing file...</p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-4">📁</div>
            <p className="text-gray-600 mb-4">
              Drag and drop your CSV file here, or click to browse
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Choose File
            </button>
            <p className="text-sm text-gray-500 mt-2">
              Supported format: CSV • Max size: 10MB
            </p>
          </div>
        )}
      </div>

      {uploadResult && (
        <div className={`rounded-lg p-4 ${
          uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <h4 className={`font-semibold mb-2 ${
            uploadResult.success ? 'text-green-800' : 'text-red-800'
          }`}>
            Upload Results
          </h4>
          
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="text-sm">
              <span className="font-medium text-green-700">Processed: </span>
              {uploadResult.processed}
            </div>
            <div className="text-sm">
              <span className="font-medium text-red-700">Failed: </span>
              {uploadResult.failed}
            </div>
          </div>

          {uploadResult.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-red-800 mb-2">Errors:</p>
              <div className="max-h-32 overflow-y-auto bg-white rounded p-2 text-sm">
                {uploadResult.errors.map((error, index) => (
                  <div key={index} className="text-red-700">• {error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ManualEntryProps {
  template: ManualEntryTemplate;
  existingData?: Partial<EnhancedVehicleData>;
  onDataSubmitted: (data: EnhancedVehicleData) => void;
  onCancel: () => void;
}

export const ManualDataEntry: React.FC<ManualEntryProps> = ({ 
  template, 
  existingData, 
  onDataSubmitted, 
  onCancel 
}) => {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = { vin: template.vin };
    
    // Pre-populate with existing data
    if (existingData) {
      Object.keys(existingData).forEach(key => {
        if (existingData[key as keyof EnhancedVehicleData] !== undefined) {
          initial[key] = existingData[key as keyof EnhancedVehicleData];
        }
      });
    }
    
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    template.requiredFields.forEach(field => {
      const value = formData[field.field];
      
      if (field.validation?.required && (!value || value.toString().trim() === '')) {
        newErrors[field.field] = `${field.label} is required`;
        return;
      }
      
      if (value && field.validation) {
        const validation = field.validation;
        
        if (field.type === 'number') {
          const numValue = parseFloat(String(value));
          if (isNaN(numValue)) {
            newErrors[field.field] = `${field.label} must be a valid number`;
          } else {
            if (validation.min !== undefined && numValue < validation.min) {
              newErrors[field.field] = `${field.label} must be at least ${validation.min}`;
            }
            if (validation.max !== undefined && numValue > validation.max) {
              newErrors[field.field] = `${field.label} must be no more than ${validation.max}`;
            }
          }
        }
        
        if (validation.pattern && !new RegExp(validation.pattern).test(value.toString())) {
          newErrors[field.field] = `${field.label} format is invalid`;
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const vehicleData = dataInputService.processManualEntry(template.vin, formData);
    onDataSubmitted(vehicleData);
  };

  const renderField = (field: FormField, isRequired: boolean = false) => {
    const value = String(formData[field.field] || '');
    const hasError = errors[field.field];
    
    return (
      <div key={field.field} className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {field.label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        
        {field.type === 'select' ? (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.field, e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              hasError ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select {field.label}</option>
            {field.options?.map((option: string) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            type={field.type}
            value={value}
            onChange={(e) => handleInputChange(field.field, e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              hasError ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        )}
        
        {hasError && (
          <p className="text-red-500 text-sm mt-1">{hasError}</p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Manual Vehicle Data Entry</h3>
        <p className="text-gray-600 mb-2">
          Enter vehicle information for VIN: <span className="font-mono font-medium">{template.vin}</span>
        </p>
        {existingData?.dataSource?.method === 'api' && (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ Some data was retrieved from API but may be incomplete. Please review and fill missing fields.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Required Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {template.requiredFields.map(field => renderField(field, true))}
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-900 mb-3">Optional Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {template.optionalFields.map(field => renderField(field, false))}
          </div>
        </div>

        <div className="flex gap-4 pt-4 border-t">
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Save Vehicle Data
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

interface DataSourceIndicatorProps {
  data: EnhancedVehicleData;
}

export const DataSourceIndicator: React.FC<DataSourceIndicatorProps> = ({ data }) => {
  const getSourceColor = () => {
    switch (data.dataSource.method) {
      case 'api': return 'bg-green-100 text-green-800 border-green-200';
      case 'file': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'manual': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceIcon = () => {
    switch (data.dataSource.method) {
      case 'api': return '🔗';
      case 'file': return '📁';
      case 'manual': return '✏️';
      default: return '❓';
    }
  };

  const getConfidenceColor = () => {
    switch (data.dataSource.confidence) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-2">
      <div className={`inline-flex items-center px-2 py-1 rounded text-sm border ${getSourceColor()}`}>
        <span className="mr-1">{getSourceIcon()}</span>
        {data.dataSource.method.toUpperCase()}
      </div>
      
      <div className="text-xs text-gray-500">
        <div>Confidence: <span className={getConfidenceColor()}>{data.dataSource.confidence}</span></div>
        <div>Source: {data.dataSource.source}</div>
        <div>Updated: {new Date(data.dataSource.lastUpdated).toLocaleDateString()}</div>
      </div>
      
      {data.missingFields.length > 0 && (
        <div className="text-xs text-amber-600">
          Missing: {data.missingFields.join(', ')}
        </div>
      )}
      
      {data.needsReview && (
        <div className="text-xs text-red-600 font-medium">
          ⚠️ Needs Review
        </div>
      )}
    </div>
  );
};