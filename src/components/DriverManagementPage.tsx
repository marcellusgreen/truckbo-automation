// Driver Management Dashboard
// Tracks medical certificates, CDL renewals, and compliance alerts

import { useState, useEffect } from 'react';
import { persistentFleetStorage, DriverRecord } from '../services/persistentFleetStorage';

interface DriverAlert {
  driverId: string;
  driverName: string;
  alertType: 'medical_expires_soon' | 'medical_expired' | 'cdl_expires_soon' | 'cdl_expired';
  daysUntilExpiry: number;
  expirationDate: string;
  priority: 'critical' | 'high' | 'medium';
}

export function DriverManagementPage() {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [alerts, setAlerts] = useState<DriverAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');

  // Load drivers on component mount
  useEffect(() => {
    loadDrivers();
    
    // Subscribe to driver data changes
    const unsubscribe = persistentFleetStorage.subscribe(() => {
      loadDrivers();
    });
    
    return unsubscribe;
  }, []);

  const loadDrivers = () => {
    try {
      const driverData = persistentFleetStorage.getDrivers();
      setDrivers(driverData);
      
      // Generate alerts
      const generatedAlerts = generateAlerts(driverData);
      setAlerts(generatedAlerts);
      
      setLoading(false);
      console.log(`📋 Loaded ${driverData.length} drivers with ${generatedAlerts.length} alerts`);
    } catch (error) {
      console.error('Error loading drivers:', error);
      setLoading(false);
    }
  };

  const generateAlerts = (driverData: DriverRecord[]): DriverAlert[] => {
    const alerts: DriverAlert[] = [];
    
    driverData.forEach(driver => {
      const driverName = `${driver.firstName} ${driver.lastName}`;
      
      // Medical certificate alerts
      if (driver.medicalCertificate.status === 'expired') {
        alerts.push({
          driverId: driver.id,
          driverName,
          alertType: 'medical_expired',
          daysUntilExpiry: driver.medicalCertificate.daysUntilExpiry,
          expirationDate: driver.medicalCertificate.expirationDate,
          priority: 'critical'
        });
      } else if (driver.medicalCertificate.status === 'expiring_soon') {
        alerts.push({
          driverId: driver.id,
          driverName,
          alertType: 'medical_expires_soon',
          daysUntilExpiry: driver.medicalCertificate.daysUntilExpiry,
          expirationDate: driver.medicalCertificate.expirationDate,
          priority: driver.medicalCertificate.daysUntilExpiry <= 7 ? 'critical' : 'high'
        });
      }
      
      // CDL alerts
      if (driver.cdlInfo.status === 'expired') {
        alerts.push({
          driverId: driver.id,
          driverName,
          alertType: 'cdl_expired',
          daysUntilExpiry: driver.cdlInfo.daysUntilExpiry,
          expirationDate: driver.cdlInfo.expirationDate,
          priority: 'critical'
        });
      } else if (driver.cdlInfo.status === 'expiring_soon') {
        alerts.push({
          driverId: driver.id,
          driverName,
          alertType: 'cdl_expires_soon',
          daysUntilExpiry: driver.cdlInfo.daysUntilExpiry,
          expirationDate: driver.cdlInfo.expirationDate,
          priority: 'high'
        });
      }
    });
    
    return alerts.sort((a, b) => {
      // Sort by priority (critical first) then by days until expiry
      const priorityOrder = { critical: 0, high: 1, medium: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });
  };

  const getFilteredDrivers = () => {
    switch (filterStatus) {
      case 'active':
        return drivers.filter(d => d.status === 'active');
      case 'expiring':
        return drivers.filter(d => 
          d.medicalCertificate.status === 'expiring_soon' || 
          d.cdlInfo.status === 'expiring_soon'
        );
      case 'expired':
        return drivers.filter(d => 
          d.medicalCertificate.status === 'expired' || 
          d.cdlInfo.status === 'expired'
        );
      default:
        return drivers;
    }
  };

  const getStatusBadge = (status: 'valid' | 'expired' | 'expiring_soon' | 'invalid', daysUntil: number) => {
    switch (status) {
      case 'valid':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✅ Valid ({daysUntil} days)
          </span>
        );
      case 'expiring_soon':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            ⚠️ Expires in {daysUntil} days
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            🔴 Expired ({Math.abs(daysUntil)} days ago)
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            ❓ Invalid
          </span>
        );
    }
  };

  const getAlertIcon = (alertType: DriverAlert['alertType']) => {
    switch (alertType) {
      case 'medical_expired':
        return '🚨 Medical Certificate EXPIRED';
      case 'medical_expires_soon':
        return '⚠️ Medical Certificate Expiring Soon';
      case 'cdl_expired':
        return '🚨 CDL EXPIRED';
      case 'cdl_expires_soon':
        return '⚠️ CDL Expiring Soon';
    }
  };

  const filteredDrivers = getFilteredDrivers();
  const criticalAlerts = alerts.filter(a => a.priority === 'critical').length;
  const highAlerts = alerts.filter(a => a.priority === 'high').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading drivers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Driver Management</h1>
            <p className="text-gray-600 mt-1">Track medical certificates, CDL renewals, and compliance</p>
          </div>
          <button
            onClick={() => setShowAddDriverModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
          >
            ➕ Add Driver
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                👨‍💼
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Drivers</p>
              <p className="text-2xl font-semibold text-gray-900">{drivers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                🚨
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Critical Alerts</p>
              <p className="text-2xl font-semibold text-red-600">{criticalAlerts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center text-yellow-600">
                ⚠️
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Expiring Soon</p>
              <p className="text-2xl font-semibold text-yellow-600">{highAlerts}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                ✅
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Compliant</p>
              <p className="text-2xl font-semibold text-green-600">
                {drivers.filter(d => 
                  d.medicalCertificate.status === 'valid' && 
                  d.cdlInfo.status === 'valid'
                ).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🔔 Active Alerts</h2>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border-l-4 ${
                  alert.priority === 'critical' 
                    ? 'bg-red-50 border-red-400' 
                    : 'bg-yellow-50 border-yellow-400'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900">
                      {getAlertIcon(alert.alertType)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {alert.driverName} - Expires: {alert.expirationDate}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${
                      alert.priority === 'critical' ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      {alert.daysUntilExpiry < 0 
                        ? `${Math.abs(alert.daysUntilExpiry)} days overdue`
                        : `${alert.daysUntilExpiry} days remaining`
                      }
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {alerts.length > 5 && (
              <p className="text-sm text-gray-500 text-center pt-2">
                ... and {alerts.length - 5} more alerts
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(['all', 'active', 'expiring', 'expired'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1 rounded-lg text-sm font-medium capitalize ${
              filterStatus === status
                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status === 'all' ? 'All Drivers' : status}
          </button>
        ))}
      </div>

      {/* Driver Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CDL Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Medical Certificate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <p className="text-lg">👤 No drivers found</p>
                      <p className="text-sm mt-1">
                        {filterStatus === 'all' 
                          ? 'Add your first driver to get started'
                          : `No drivers match the "${filterStatus}" filter`
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600">
                              {driver.firstName.charAt(0)}{driver.lastName.charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {driver.firstName} {driver.lastName}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {driver.employeeId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        Class {driver.cdlInfo.class} • {driver.cdlInfo.cdlState}
                      </div>
                      <div className="text-sm text-gray-500">
                        {driver.cdlInfo.cdlNumber}
                      </div>
                      <div className="mt-1">
                        {getStatusBadge(driver.cdlInfo.status, driver.cdlInfo.daysUntilExpiry)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        Expires: {driver.medicalCertificate.expirationDate}
                      </div>
                      <div className="text-sm text-gray-500">
                        {driver.medicalCertificate.certificateNumber}
                      </div>
                      <div className="mt-1">
                        {getStatusBadge(driver.medicalCertificate.status, driver.medicalCertificate.daysUntilExpiry)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        driver.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {driver.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900 mr-3">
                        Edit
                      </button>
                      <button className="text-gray-600 hover:text-gray-900">
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Driver Modal Placeholder */}
      {showAddDriverModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add New Driver</h3>
            <p className="text-gray-600 mb-4">
              Driver management modal will be implemented in the next step.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddDriverModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}