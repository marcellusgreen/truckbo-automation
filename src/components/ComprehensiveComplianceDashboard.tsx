// Comprehensive Compliance Dashboard Component
// Shows real-time compliance data from all integrated sources

import React, { useState, useEffect } from 'react';
import { realTimeComplianceMonitor } from '../services/realTimeComplianceMonitor';

interface ComplianceAlert {
  id: string;
  vehicleId: string;
  vin: string;
  alertType: 'expiration' | 'violation' | 'renewal' | 'inspection_due' | 'safety_rating';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  dueDate: string;
  daysUntilDue: number;
  source: string;
  actionRequired: string;
  estimatedCost?: number;
  jurisdictions?: string[];
}

interface ComplianceStats {
  totalVehicles: number;
  activeMonitoring: number;
  totalAlerts: number;
  criticalAlerts: number;
  averageScore: number;
}

interface ComplianceDashboardProps {
  vehicles: Array<{ id: string; vin: string; make: string; model: string; year: number; dotNumber?: string }>;
}

export const ComprehensiveComplianceDashboard: React.FC<ComplianceDashboardProps> = ({ vehicles }) => {
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [stats, setStats] = useState<ComplianceStats>({
    totalVehicles: 0,
    activeMonitoring: 0,
    totalAlerts: 0,
    criticalAlerts: 0,
    averageScore: 0
  });
  const [selectedAlert, setSelectedAlert] = useState<ComplianceAlert | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'CARB' | 'FMCSA' | 'DOT' | 'EPA' | 'DMV' | 'Insurance'>('all');

  useEffect(() => {
    // Initialize monitoring for all vehicles
    const initializeMonitoring = async () => {
      console.log('Initializing compliance monitoring for', vehicles.length, 'vehicles');
      
      for (const vehicle of vehicles) {
        await realTimeComplianceMonitor.startMonitoring(
          vehicle.id,
          vehicle.vin,
          vehicle.dotNumber
        );
      }
      
      setIsMonitoring(true);
      updateDashboard();
    };

    if (vehicles.length > 0 && !isMonitoring) {
      initializeMonitoring();
    }

    // Set up periodic updates
    const interval = setInterval(updateDashboard, 30000); // Update every 30 seconds

    return () => {
      clearInterval(interval);
      realTimeComplianceMonitor.stopAllMonitoring();
    };
  }, [vehicles, isMonitoring]);

  const updateDashboard = () => {
    const currentAlerts = realTimeComplianceMonitor.getAllActiveAlerts();
    const currentStats = realTimeComplianceMonitor.getMonitoringStats();
    
    setAlerts(currentAlerts);
    setStats(currentStats);
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    if (filterSource !== 'all' && !alert.source.includes(filterSource)) return false;
    return true;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return '📋';
      default: return '📄';
    }
  };

  const getAlertTypeIcon = (alertType: string) => {
    switch (alertType) {
      case 'expiration': return '📅';
      case 'violation': return '🚫';
      case 'renewal': return '🔄';
      case 'inspection_due': return '🔍';
      case 'safety_rating': return '⭐';
      default: return '📋';
    }
  };

  const resolveAlert = (alertId: string) => {
    realTimeComplianceMonitor.resolveAlert(alertId);
    updateDashboard();
    setSelectedAlert(null);
  };

  const exportAlerts = () => {
    const csvContent = [
      'VIN,Alert Type,Severity,Title,Description,Due Date,Days Until Due,Source,Action Required,Estimated Cost',
      ...filteredAlerts.map(alert => [
        alert.vin,
        alert.alertType,
        alert.severity,
        alert.title,
        alert.description,
        alert.dueDate,
        alert.daysUntilDue,
        alert.source,
        alert.actionRequired,
        alert.estimatedCost || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_alerts_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">🛡️ Comprehensive Compliance Dashboard</h2>
        <div className="flex gap-2">
          <button
            onClick={exportAlerts}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            📊 Export Alerts
          </button>
          <button
            onClick={updateDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">Total Vehicles</div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalVehicles}</div>
          <div className="text-xs text-gray-500 mt-1">Under monitoring</div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">Active Alerts</div>
          <div className="text-2xl font-bold text-orange-600">{stats.totalAlerts}</div>
          <div className="text-xs text-gray-500 mt-1">Requiring attention</div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">Critical Issues</div>
          <div className="text-2xl font-bold text-red-600">{stats.criticalAlerts}</div>
          <div className="text-xs text-gray-500 mt-1">Immediate action needed</div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">Average Score</div>
          <div className="text-2xl font-bold text-green-600">{Math.round(stats.averageScore)}%</div>
          <div className="text-xs text-gray-500 mt-1">Compliance rating</div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-500">Monitoring Status</div>
          <div className={`text-2xl font-bold ${isMonitoring ? 'text-green-600' : 'text-red-600'}`}>
            {isMonitoring ? 'ACTIVE' : 'INACTIVE'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Real-time monitoring</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Severity</label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as 'all' | 'critical' | 'high' | 'medium' | 'low')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as 'all' | 'CARB' | 'FMCSA' | 'DOT' | 'EPA')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Sources</option>
              <option value="CARB">CARB</option>
              <option value="FMCSA">FMCSA</option>
              <option value="DMV">DMV</option>
              <option value="Insurance">Insurance</option>
            </select>
          </div>
          
          <div className="ml-auto">
            <div className="text-sm text-gray-600">
              Showing {filteredAlerts.length} of {alerts.length} alerts
            </div>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-900">Active Compliance Alerts</h3>
        </div>
        
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-4">✅</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Alerts</h3>
            <p className="text-gray-500">
              {alerts.length === 0 
                ? 'All vehicles are compliant or monitoring is still loading'
                : 'No alerts match your current filters'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{getAlertTypeIcon(alert.alertType)}</span>
                      <div>
                        <h4 className="font-semibold text-gray-900">{alert.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-1 text-xs font-medium rounded border ${getSeverityColor(alert.severity)}`}>
                            {getSeverityIcon(alert.severity)} {alert.severity.toUpperCase()}
                          </span>
                          <span className="text-sm text-gray-500">VIN: {alert.vin}</span>
                          <span className="text-sm text-gray-500">Source: {alert.source}</span>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-gray-700 mb-3">{alert.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-900">Action Required:</span>
                        <p className="text-gray-600">{alert.actionRequired}</p>
                      </div>
                      
                      {alert.dueDate && (
                        <div>
                          <span className="font-medium text-gray-900">Due Date:</span>
                          <p className={`${alert.daysUntilDue <= 0 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                            {alert.dueDate} ({alert.daysUntilDue <= 0 ? 'OVERDUE' : `${alert.daysUntilDue} days`})
                          </p>
                        </div>
                      )}
                      
                      {alert.estimatedCost && (
                        <div>
                          <span className="font-medium text-gray-900">Estimated Cost:</span>
                          <p className="text-gray-600">${alert.estimatedCost.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    
                    {alert.jurisdictions && alert.jurisdictions.length > 0 && (
                      <div className="mt-2">
                        <span className="text-sm font-medium text-gray-900">Jurisdictions: </span>
                        <span className="text-sm text-gray-600">{alert.jurisdictions.join(', ')}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4 flex flex-col gap-2">
                    <button
                      onClick={() => setSelectedAlert(alert)}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Mark Resolved
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alert Details Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedAlert.title}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-1 text-sm font-medium rounded border ${getSeverityColor(selectedAlert.severity)}`}>
                    {getSeverityIcon(selectedAlert.severity)} {selectedAlert.severity.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">Source: {selectedAlert.source}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Description</h4>
                <p className="text-gray-700">{selectedAlert.description}</p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Required Action</h4>
                <p className="text-gray-700">{selectedAlert.actionRequired}</p>
              </div>

              {selectedAlert.dueDate && (
                <div>
                  <h4 className="font-semibold mb-2">Timeline</h4>
                  <p className="text-gray-700">
                    Due: {selectedAlert.dueDate} 
                    <span className={`ml-2 ${selectedAlert.daysUntilDue <= 0 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                      ({selectedAlert.daysUntilDue <= 0 ? 'OVERDUE' : `${selectedAlert.daysUntilDue} days remaining`})
                    </span>
                  </p>
                </div>
              )}

              {selectedAlert.estimatedCost && (
                <div>
                  <h4 className="font-semibold mb-2">Estimated Cost</h4>
                  <p className="text-gray-700">${selectedAlert.estimatedCost.toLocaleString()}</p>
                </div>
              )}

              {selectedAlert.jurisdictions && selectedAlert.jurisdictions.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Jurisdictions</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedAlert.jurisdictions.map((jurisdiction, index) => (
                      <span key={index} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                        {jurisdiction}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <button
                  onClick={() => resolveAlert(selectedAlert.id)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Mark as Resolved
                </button>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};