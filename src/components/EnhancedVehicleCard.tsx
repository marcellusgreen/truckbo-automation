// Enhanced Vehicle Card Component
// Modern card design with trucking industry aesthetics and compliance indicators

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
    status: 'active' | 'inactive';
    dotNumber?: string;
    dateAdded: string;
  };
  compliance: {
    registration: ComplianceItem;
    insurance: ComplianceItem;
    dotInspection: ComplianceItem;
    ifta: ComplianceItem;
    overall: {
      score: number; // 0-100
      status: 'compliant' | 'warning' | 'expired';
    };
  };
  onViewDetails?: () => void;
  onScheduleService?: () => void;
  onEditVehicle?: () => void;
}

const TruckIcon: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v10h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-3zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2H17V9.5h2.5zm-.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
  </svg>
);

const ComplianceIndicator: React.FC<{ status: ComplianceItem['status']; days: number; label: string }> = ({ 
  status, 
  days, 
  label 
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'compliant': return 'text-compliance-valid bg-compliance-valid/10 border-compliance-valid/20';
      case 'warning': return 'text-compliance-warning bg-compliance-warning/10 border-compliance-warning/20';
      case 'expired': return 'text-compliance-expired bg-compliance-expired/10 border-compliance-expired/20';
      default: return 'text-compliance-unknown bg-compliance-unknown/10 border-compliance-unknown/20';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'compliant': return '✅';
      case 'warning': return '⚠️';
      case 'expired': return '❌';
      default: return '❓';
    }
  };

  const getDaysText = () => {
    if (status === 'expired') return 'Expired';
    if (status === 'unknown') return 'Unknown';
    if (days <= 0) return 'Due';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  return (
    <div className={`flex items-center space-x-2 px-2 py-1.5 rounded border text-xs ${getStatusColor()}`}>
      <span className="text-sm">{getStatusIcon()}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{label}</div>
        <div className="text-xs opacity-75">{getDaysText()}</div>
      </div>
    </div>
  );
};

const ComplianceScore: React.FC<{ score: number; status: 'compliant' | 'warning' | 'expired' }> = ({ 
  score 
}) => {
  const getScoreColor = () => {
    if (score >= 90) return 'text-compliance-valid';
    if (score >= 70) return 'text-compliance-warning';
    return 'text-compliance-expired';
  };

  const getProgressColor = () => {
    if (score >= 90) return 'bg-compliance-valid';
    if (score >= 70) return 'bg-compliance-warning';
    return 'bg-compliance-expired';
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="flex-1">
        <div className="flex justify-between text-sm font-medium mb-1">
          <span>Compliance Score</span>
          <span className={`font-semibold ${getScoreColor()}`}>{score}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor()}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        {score >= 90 && <div className="text-lg">🟢</div>}
        {score >= 70 && score < 90 && <div className="text-lg">🟡</div>}
        {score < 70 && <div className="text-lg">🔴</div>}
      </div>
    </div>
  );
};

export const EnhancedVehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  compliance,
  onViewDetails,
  onScheduleService,
  onEditVehicle
}) => {
  const getStatusConfig = () => {
    switch (vehicle.status) {
      case 'active':
        return {
          color: 'text-status-online bg-status-online/10 border-status-online/20',
          icon: '🟢',
          label: 'Active'
        };
      case 'inactive':
        return {
          color: 'text-status-offline bg-status-offline/10 border-status-offline/20',
          icon: '⭕',
          label: 'Inactive'
        };
      default:
        return {
          color: 'text-status-idle bg-status-idle/10 border-status-idle/20',
          icon: '❓',
          label: 'Unknown'
        };
    }
  };

  const statusConfig = getStatusConfig();
  const truckNumber = vehicle.truckNumber?.replace('Truck #', '#') || `#${vehicle.vin?.slice(-3) || '???'}`;

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.01] border border-gray-200 overflow-hidden">
      {/* Header with Truck Info */}
      <div className="bg-gradient-fleet p-4 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10">
          <TruckIcon className="w-16 h-16 transform rotate-12 translate-x-4 -translate-y-2" />
        </div>
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <TruckIcon className="w-6 h-6 text-truck-chrome" />
              <div>
                <h3 className="text-lg font-bold">{truckNumber}</h3>
                <p className="text-fleet-100 text-xs">
                  {vehicle.truckNumber?.includes('Truck #') ? 'Auto-detected' : 'Custom ID'}
                </p>
              </div>
            </div>
            <div className={`px-2 py-1 rounded text-xs font-medium border ${statusConfig.color}`}>
              <span className="mr-1">{statusConfig.icon}</span>
              {statusConfig.label}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="font-medium text-fleet-100 text-xs">Vehicle</div>
              <div className="font-semibold">{vehicle.year} {vehicle.make}</div>
              <div className="text-fleet-200 text-xs">{vehicle.model}</div>
            </div>
            <div>
              <div className="font-medium text-fleet-100 text-xs">Identifiers</div>
              <div className="font-mono text-xs bg-black/20 px-2 py-1 rounded">
                {vehicle.licensePlate}
              </div>
              <div className="font-mono text-xs text-fleet-200 mt-1">
                VIN: ...{vehicle.vin.slice(-8)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Status */}
      <div className="p-4">
        <div className="mb-4">
          <ComplianceScore score={compliance.overall.score} status={compliance.overall.status} />
        </div>

        {/* Compliance Details Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <ComplianceIndicator 
            status={compliance.registration.status} 
            days={compliance.registration.daysUntilExpiry} 
            label="Registration" 
          />
          <ComplianceIndicator 
            status={compliance.insurance.status} 
            days={compliance.insurance.daysUntilExpiry} 
            label="Insurance" 
          />
          <ComplianceIndicator 
            status={compliance.dotInspection.status} 
            days={compliance.dotInspection.daysUntilExpiry} 
            label="DOT Inspection" 
          />
          <ComplianceIndicator 
            status={compliance.ifta.status} 
            days={compliance.ifta.daysUntilExpiry} 
            label="IFTA" 
          />
        </div>

        {/* Additional Info */}
        <div className="text-xs text-gray-600 border-t border-gray-100 pt-3 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">DOT:</span> {vehicle.dotNumber || 'Not Set'}
            </div>
            <div>
              <span className="font-medium">Added:</span> {new Date(vehicle.dateAdded).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onViewDetails}
            className="flex-1 bg-gradient-fleet hover:bg-fleet-700 text-white px-3 py-2 rounded font-medium transition-all duration-200 text-sm"
          >
            📋 Details
          </button>
          <button
            onClick={onScheduleService}
            className="flex-1 bg-gradient-compliance hover:bg-truck-compliant text-white px-3 py-2 rounded font-medium transition-all duration-200 text-sm"
          >
            🔧 Service
          </button>
          <button
            onClick={onEditVehicle}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded font-medium transition-all duration-200 text-sm"
          >
            ✏️
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedVehicleCard;