// Minimalistic Vehicle Card Component
// Clean, desktop-focused design with proper sizing

import React from 'react';

interface ComplianceItem {
  status: 'compliant' | 'warning' | 'expired' | 'unknown';
  expiryDate?: string;
  daysUntilExpiry: number;
}

interface VehicleCardProps {
  vehicle: {
    id: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    truckNumber?: string;
    status: 'active' | 'inactive' | 'maintenance';
    dotNumber?: string;
    dateAdded: string;
  };
  compliance: {
    registration: ComplianceItem;
    insurance: ComplianceItem;
    dotInspection: ComplianceItem;
    ifta: ComplianceItem;
    overall: {
      score: number;
      status: 'compliant' | 'warning' | 'expired';
    };
  };
  onViewDetails?: () => void;
  onScheduleService?: () => void;
  onEditVehicle?: () => void;
}

const StatusDot: React.FC<{ status: ComplianceItem['status'] }> = ({ status }) => {
  const getColor = () => {
    switch (status) {
      case 'compliant': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'expired': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  return <div className={`w-2 h-2 rounded-full ${getColor()}`} />;
};

export const MinimalisticVehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  compliance,
  onViewDetails,
  onScheduleService,
  onEditVehicle
}) => {
  const truckNumber = vehicle.truckNumber?.replace('Truck #', '') || vehicle.vin?.slice(-3) || '???';
  
  const getStatusColor = () => {
    switch (vehicle.status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'inactive': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors duration-200 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-semibold text-gray-900">#{truckNumber}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor()}`}>
            {vehicle.status}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {compliance.overall.score}%
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="mb-2">
        <div className="text-sm font-medium text-gray-900">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </div>
        <div className="text-xs text-gray-500">
          {vehicle.licensePlate} • VIN: ...{vehicle.vin.slice(-6)}
        </div>
      </div>

      {/* Compliance Status */}
      <div className="grid grid-cols-4 gap-1 mb-3">
        <div className="flex items-center space-x-1">
          <StatusDot status={compliance.registration.status} />
          <span className="text-xs text-gray-600">REG</span>
        </div>
        <div className="flex items-center space-x-1">
          <StatusDot status={compliance.insurance.status} />
          <span className="text-xs text-gray-600">INS</span>
        </div>
        <div className="flex items-center space-x-1">
          <StatusDot status={compliance.dotInspection.status} />
          <span className="text-xs text-gray-600">DOT</span>
        </div>
        <div className="flex items-center space-x-1">
          <StatusDot status={compliance.ifta.status} />
          <span className="text-xs text-gray-600">IFTA</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex space-x-1">
        <button
          onClick={onViewDetails}
          className="flex-1 text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 hover:border-blue-300 transition-colors duration-150"
        >
          View
        </button>
        <button
          onClick={onScheduleService}
          className="flex-1 text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded border border-gray-200 hover:border-gray-300 transition-colors duration-150"
        >
          Service
        </button>
        <button
          onClick={onEditVehicle}
          className="text-xs px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded border border-gray-200 hover:border-gray-300 transition-colors duration-150"
        >
          ⋯
        </button>
      </div>
    </div>
  );
};

export default MinimalisticVehicleCard;