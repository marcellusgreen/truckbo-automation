// Add Vehicle Modal Component
// Allows adding single vehicles to existing fleet

import React, { useState } from 'react';
import { persistentFleetStorage, VehicleRecord } from '../services/persistentFleetStorage';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVehicleAdded: (vehicle: VehicleRecord) => void;
}

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({
  isOpen,
  onClose,
  onVehicleAdded
}) => {
  const [formData, setFormData] = useState({
    vin: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    licensePlate: '',
    dotNumber: '',
    truckNumber: '', // Will auto-generate if left empty
    status: 'active' as 'active' | 'maintenance' | 'inactive'
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      vin: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      licensePlate: '',
      dotNumber: '',
      truckNumber: '',
      status: 'active'
    });
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.vin.trim()) {
      newErrors.vin = 'VIN is required';
    } else if (formData.vin.length !== 17) {
      newErrors.vin = 'VIN must be 17 characters';
    }

    if (!formData.make.trim()) {
      newErrors.make = 'Make is required';
    }

    if (!formData.model.trim()) {
      newErrors.model = 'Model is required';
    }

    if (formData.year < 1900 || formData.year > new Date().getFullYear() + 1) {
      newErrors.year = 'Please enter a valid year';
    }

    if (!formData.licensePlate.trim()) {
      newErrors.licensePlate = 'License plate is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const newVehicle = persistentFleetStorage.addVehicle({
        vin: formData.vin.toUpperCase(),
        make: formData.make,
        model: formData.model,
        year: formData.year,
        licensePlate: formData.licensePlate.toUpperCase(),
        dotNumber: formData.dotNumber || undefined,
        truckNumber: formData.truckNumber || '', // Will auto-generate if empty
        status: formData.status
      });

      if (newVehicle) {
        onVehicleAdded(newVehicle);
        resetForm();
        onClose();
      } else {
        setErrors({ general: 'Failed to add vehicle. VIN may already exist.' });
      }
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : String(error) || 'Failed to add vehicle' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">🚛 Add New Vehicle</h2>
              <p className="text-blue-100 mt-1">Add a single vehicle to your existing fleet</p>
            </div>
            <button
              onClick={handleClose}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors duration-200"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center">
                <span className="text-red-500 text-xl mr-3">❌</span>
                <span className="text-red-700 font-medium">{errors.general}</span>
              </div>
            </div>
          )}

          {/* Truck Number Field - Most Important for Fleet Managers */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              🚛 Truck Number <span className="text-slate-500">(Auto-detected from license plate if left empty)</span>
            </label>
            <input
              type="text"
              value={formData.truckNumber}
              onChange={(e) => setFormData({ ...formData, truckNumber: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-purple-500 transition-colors duration-200 text-lg font-bold"
              placeholder="Truck #047 or Unit 47 (leave empty for auto-detection)"
            />
            <p className="text-xs text-slate-600 mt-1">
              💡 Leave empty and we'll automatically detect from your license plate (e.g., TRK047 → Truck #047)
            </p>
          </div>

          {/* VIN Field */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              VIN Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
              className={`w-full px-4 py-3 rounded-xl border-2 font-mono text-sm transition-colors duration-200 ${
                errors.vin 
                  ? 'border-red-300 bg-red-50 focus:border-red-500' 
                  : 'border-slate-300 focus:border-blue-500'
              }`}
              placeholder="1HGCM82633A123456"
              maxLength={17}
            />
            {errors.vin && <p className="text-red-600 text-sm mt-1 font-medium">{errors.vin}</p>}
          </div>

          {/* Make and Model */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Make <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-colors duration-200 ${
                  errors.make 
                    ? 'border-red-300 bg-red-50 focus:border-red-500' 
                    : 'border-slate-300 focus:border-blue-500'
                }`}
                placeholder="Freightliner"
              />
              {errors.make && <p className="text-red-600 text-sm mt-1 font-medium">{errors.make}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Model <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-colors duration-200 ${
                  errors.model 
                    ? 'border-red-300 bg-red-50 focus:border-red-500' 
                    : 'border-slate-300 focus:border-blue-500'
                }`}
                placeholder="Cascadia"
              />
              {errors.model && <p className="text-red-600 text-sm mt-1 font-medium">{errors.model}</p>}
            </div>
          </div>

          {/* Year and License Plate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Year <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                className={`w-full px-4 py-3 rounded-xl border-2 transition-colors duration-200 ${
                  errors.year 
                    ? 'border-red-300 bg-red-50 focus:border-red-500' 
                    : 'border-slate-300 focus:border-blue-500'
                }`}
                min="1900"
                max={new Date().getFullYear() + 1}
              />
              {errors.year && <p className="text-red-600 text-sm mt-1 font-medium">{errors.year}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                License Plate <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.licensePlate}
                onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value.toUpperCase() })}
                className={`w-full px-4 py-3 rounded-xl border-2 font-mono transition-colors duration-200 ${
                  errors.licensePlate 
                    ? 'border-red-300 bg-red-50 focus:border-red-500' 
                    : 'border-slate-300 focus:border-blue-500'
                }`}
                placeholder="ABC123"
              />
              {errors.licensePlate && <p className="text-red-600 text-sm mt-1 font-medium">{errors.licensePlate}</p>}
            </div>
          </div>

          {/* DOT Number and Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                DOT Number <span className="text-amber-600">(Required for Compliance Data)</span>
              </label>
              <input
                type="text"
                value={formData.dotNumber}
                onChange={(e) => setFormData({ ...formData, dotNumber: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-blue-500 transition-colors duration-200"
                placeholder="1234567"
              />
              <p className="text-xs text-slate-600 mt-1">
                💡 DOT number identifies the carrier/company. Required for FMCSA compliance lookups.
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Initial Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' | 'maintenance' })}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-blue-500 transition-colors duration-200"
              >
                <option value="active">🟢 Active</option>
                <option value="maintenance">🟡 Maintenance</option>
                <option value="inactive">⚪ Inactive</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin mr-2">⏳</span>
                  Adding Vehicle...
                </span>
              ) : (
                '🚛 Add Vehicle'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};