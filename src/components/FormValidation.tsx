// Form Validation Components
// Provides real-time form validation with user feedback

import React, { useState, useEffect } from 'react';
import { dataValidator, ValidationResult } from '../services/dataValidation';

interface ValidatedInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  validator?: (value: string) => ValidationResult;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'tel' | 'date';
  helpText?: string;
}

export function ValidatedInput({
  label,
  value,
  onChange,
  validator,
  placeholder,
  required = false,
  type = 'text',
  helpText
}: ValidatedInputProps) {
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, errors: [], warnings: [] });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (validator && touched) {
      const result = validator(value);
      setValidation(result);
    }
  }, [value, validator, touched]);

  const handleBlur = () => {
    setTouched(true);
    if (validator) {
      const result = validator(value);
      setValidation(result);
    }
  };

  const getInputStyle = () => {
    if (!touched) return 'border-gray-300 focus:border-blue-500';
    if (!validation.isValid) return 'border-red-500 focus:border-red-500';
    if (validation.warnings.length > 0) return 'border-yellow-500 focus:border-yellow-500';
    return 'border-green-500 focus:border-green-500';
  };

  const getStatusIcon = () => {
    if (!touched) return null;
    if (!validation.isValid) return '❌';
    if (validation.warnings.length > 0) return '⚠️';
    return '✅';
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 ${getInputStyle()}`}
        />
        
        {getStatusIcon() && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <span className="text-sm">{getStatusIcon()}</span>
          </div>
        )}
      </div>

      {/* Help text */}
      {helpText && !touched && (
        <p className="text-xs text-gray-500 mt-1">{helpText}</p>
      )}

      {/* Validation messages */}
      {touched && (
        <div className="mt-1">
          {validation.errors.map((error, index) => (
            <p key={index} className="text-xs text-red-600 flex items-center">
              <span className="mr-1">❌</span>
              {error.message}
            </p>
          ))}
          
          {validation.warnings.map((warning, index) => (
            <p key={index} className="text-xs text-yellow-600 flex items-center">
              <span className="mr-1">⚠️</span>
              {warning.message}
              {warning.suggestion && (
                <span className="ml-1 text-gray-500">({warning.suggestion})</span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

interface VINInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function VINInput({ value, onChange, required = false }: VINInputProps) {
  const vinValidator = (vin: string) => dataValidator.validateVIN(vin);

  return (
    <ValidatedInput
      label="Vehicle Identification Number (VIN)"
      value={value}
      onChange={onChange}
      validator={vinValidator}
      placeholder="1HGBH41JXMN109186"
      required={required}
      helpText="17-character alphanumeric code (no I, O, or Q)"
    />
  );
}

interface DateInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  futureOnly?: boolean;
  pastOnly?: boolean;
}

export function DateInput({ 
  label, 
  value, 
  onChange, 
  required = false, 
  futureOnly = false, 
  pastOnly = false 
}: DateInputProps) {
  const dateValidator = (dateString: string) => {
    const result = dataValidator.validateDate ? dataValidator.validateDate(dateString) : { isValid: true, errors: [], warnings: [] };
    
    if (result.isValid && dateString) {
      const date = new Date(dateString);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (futureOnly && date <= today) {
        result.errors.push({
          field: 'date',
          message: 'Date must be in the future',
          value: dateString,
          severity: 'error' as const
        });
        result.isValid = false;
      }

      if (pastOnly && date > today) {
        result.errors.push({
          field: 'date',
          message: 'Date must be in the past',
          value: dateString,
          severity: 'error' as const
        });
        result.isValid = false;
      }
    }

    return result;
  };

  return (
    <ValidatedInput
      label={label}
      value={value}
      onChange={onChange}
      validator={dateValidator}
      required={required}
      type="date"
    />
  );
}

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function FormSection({ 
  title, 
  children, 
  collapsible = false, 
  defaultCollapsed = false 
}: FormSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="mb-6">
      <div 
        className={`flex items-center justify-between p-4 bg-gray-50 rounded-t-lg border ${
          collapsible ? 'cursor-pointer hover:bg-gray-100' : ''
        }`}
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
      >
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {collapsible && (
          <span className="text-gray-500">
            {collapsed ? '▼' : '▲'}
          </span>
        )}
      </div>
      
      {!collapsed && (
        <div className="p-4 border border-t-0 rounded-b-lg bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

interface ValidationSummaryProps {
  validation: ValidationResult;
  title?: string;
}

export function ValidationSummary({ validation, title = "Validation Results" }: ValidationSummaryProps) {
  if (validation.isValid && validation.warnings.length === 0) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center">
          <span className="text-green-600 mr-2">✅</span>
          <h4 className="font-medium text-green-800">{title}</h4>
        </div>
        <p className="text-sm text-green-700 mt-1">All validation checks passed!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {validation.errors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="font-medium text-red-800 flex items-center mb-2">
            <span className="mr-2">❌</span>
            {validation.errors.length} Error{validation.errors.length > 1 ? 's' : ''}
          </h4>
          <ul className="text-sm text-red-700 space-y-1">
            {validation.errors.map((error, index) => (
              <li key={index} className="flex items-start">
                <span className="font-medium mr-2">{error.field}:</span>
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-medium text-yellow-800 flex items-center mb-2">
            <span className="mr-2">⚠️</span>
            {validation.warnings.length} Warning{validation.warnings.length > 1 ? 's' : ''}
          </h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            {validation.warnings.map((warning, index) => (
              <li key={index} className="flex items-start">
                <span className="font-medium mr-2">{warning.field}:</span>
                <div>
                  <span>{warning.message}</span>
                  {warning.suggestion && (
                    <div className="text-yellow-600 mt-1 italic">
                      Suggestion: {warning.suggestion}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Form validation hook
export function useFormValidation<T extends Record<string, unknown>>(initialData: T, validator: (data: T) => ValidationResult) {
  const [data, setData] = useState(initialData);
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true, errors: [], warnings: [] });
  const [touched, setTouched] = useState<{[key: string]: boolean}>({});

  const updateField = (field: keyof T, value: T[keyof T]) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    
    // Mark field as touched
    setTouched(prev => ({ ...prev, [field]: true }));
    
    // Validate
    const result = validator(newData);
    setValidation(result);
  };

  const validateAll = () => {
    const result = validator(data);
    setValidation(result);
    
    // Mark all fields as touched
    const allFields = Object.keys(data);
    const touchedFields = allFields.reduce((acc, field) => {
      acc[field] = true;
      return acc;
    }, {} as {[key: string]: boolean});
    setTouched(touchedFields);
    
    return result;
  };

  const reset = () => {
    setData(initialData);
    setValidation({ isValid: true, errors: [], warnings: [] });
    setTouched({});
  };

  return {
    data,
    validation,
    touched,
    updateField,
    validateAll,
    reset,
    isValid: validation.isValid
  };
}