// Reporting Dashboard Component
// Comprehensive compliance reporting interface

import { useState, useEffect } from 'react';
import { reportingService, ComplianceReport, ComplianceMetrics } from '../services/reportingService';
import { errorHandler } from '../services/errorHandler';
import { LoadingSpinner } from './NotificationSystem';

export function ReportingDashboard() {
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'schedule' | 'overview' | 'vehicles' | 'drivers' | 'compliance' | 'exports'>('dashboard');

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const complianceMetrics = reportingService.calculateComplianceMetrics();
      setMetrics(complianceMetrics);
    } catch (error) {
      errorHandler.handleCriticalError(error, 'Loading compliance metrics');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (type: 'vehicle' | 'driver' | 'expiration' | 'full_audit') => {
    try {
      setLoading(true);
      let report: ComplianceReport;

      switch (type) {
        case 'vehicle':
          report = reportingService.generateVehicleComplianceReport();
          break;
        case 'driver':
          report = reportingService.generateDriverComplianceReport();
          break;
        case 'expiration':
          report = reportingService.generateExpirationSummaryReport(90);
          break;
        case 'full_audit':
          report = reportingService.generateFullAuditReport();
          break;
        default:
          throw new Error('Invalid report type');
      }

      setReports(prev => [report, ...prev]);
      setSelectedReport(report);
      errorHandler.showSuccess(`${report.title} generated successfully!`);
    } catch (error) {
      errorHandler.handleCriticalError(error, 'Generating report');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (report: ComplianceReport, format: 'pdf' | 'excel') => {
    try {
      if (format === 'pdf') {
        await reportingService.exportToPDF(report);
      } else {
        await reportingService.exportToExcel(report);
      }
    } catch (error) {
      errorHandler.handleCriticalError(error, `Exporting report to ${format.toUpperCase()}`);
    }
  };

  const getComplianceColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 85) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getComplianceBackground = (rate: number) => {
    if (rate >= 95) return 'bg-green-50 border-green-200';
    if (rate >= 85) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner message="Loading compliance data..." />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Compliance Reporting</h1>
        <p className="text-gray-600 mt-1">Monitor fleet compliance and generate regulatory reports</p>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'reports', label: 'Reports', icon: '📋' },
            { id: 'schedule', label: 'Schedule', icon: '⏰' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'overview' | 'vehicles' | 'drivers' | 'compliance' | 'exports' | 'schedule')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && metrics && (
        <div className="space-y-6">
          {/* Compliance Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className={`p-6 rounded-lg border ${getComplianceBackground(metrics.overallComplianceRate)}`}>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    📈
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Overall Compliance</p>
                  <p className={`text-2xl font-semibold ${getComplianceColor(metrics.overallComplianceRate)}`}>
                    {metrics.overallComplianceRate}%
                  </p>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-lg border ${getComplianceBackground(metrics.vehicleComplianceRate)}`}>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    🚛
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Vehicle Compliance</p>
                  <p className={`text-2xl font-semibold ${getComplianceColor(metrics.vehicleComplianceRate)}`}>
                    {metrics.vehicleComplianceRate}%
                  </p>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-lg border ${getComplianceBackground(metrics.driverComplianceRate)}`}>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    👨‍💼
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Driver Compliance</p>
                  <p className={`text-2xl font-semibold ${getComplianceColor(metrics.driverComplianceRate)}`}>
                    {metrics.driverComplianceRate}%
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                    🚨
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Critical Alerts</p>
                  <p className="text-2xl font-semibold text-red-600">{metrics.criticalAlerts}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Document Type Breakdown */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Compliance Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(metrics.documentTypes).map(([type, stats]) => (
                <div key={type} className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 capitalize mb-2">
                    {type.replace('_', ' ')}
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total:</span>
                      <span className="font-medium">{stats.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-600">Compliant:</span>
                      <span className="font-medium">{stats.compliant}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-600">Expiring:</span>
                      <span className="font-medium">{stats.expiring}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-600">Expired:</span>
                      <span className="font-medium">{stats.expired}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => generateReport('expiration')}
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="mr-2">⏰</span>
                Expiration Report
              </button>
              <button
                onClick={() => generateReport('vehicle')}
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="mr-2">🚛</span>
                Vehicle Report
              </button>
              <button
                onClick={() => generateReport('driver')}
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="mr-2">👨‍💼</span>
                Driver Report
              </button>
              <button
                onClick={() => generateReport('full_audit')}
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <span className="mr-2">📋</span>
                Full Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {loading && (
            <div className="flex justify-center">
              <LoadingSpinner message="Generating report..." />
            </div>
          )}

          {/* Report Generation */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate New Report</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => generateReport('vehicle')}
                disabled={loading}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left"
              >
                <div className="text-2xl mb-2">🚛</div>
                <h4 className="font-medium">Vehicle Compliance</h4>
                <p className="text-sm text-gray-600">Registration & insurance status</p>
              </button>
              <button
                onClick={() => generateReport('driver')}
                disabled={loading}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left"
              >
                <div className="text-2xl mb-2">👨‍💼</div>
                <h4 className="font-medium">Driver Compliance</h4>
                <p className="text-sm text-gray-600">Medical certs & CDL status</p>
              </button>
              <button
                onClick={() => generateReport('expiration')}
                disabled={loading}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-left"
              >
                <div className="text-2xl mb-2">⏰</div>
                <h4 className="font-medium">Expiration Summary</h4>
                <p className="text-sm text-gray-600">Upcoming renewals</p>
              </button>
              <button
                onClick={() => generateReport('full_audit')}
                disabled={loading}
                className="p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-left"
              >
                <div className="text-2xl mb-2">📋</div>
                <h4 className="font-medium">Full Audit</h4>
                <p className="text-sm text-gray-600">Comprehensive report</p>
              </button>
            </div>
          </div>

          {/* Generated Reports List */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Generated Reports</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {reports.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="text-gray-500">
                    <p className="text-lg">📄 No reports generated yet</p>
                    <p className="text-sm mt-1">Generate your first compliance report above</p>
                  </div>
                </div>
              ) : (
                reports.map((report) => (
                  <div key={report.id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{report.title}</h4>
                        <p className="text-sm text-gray-600">
                          Generated: {new Date(report.generatedAt).toLocaleString()}
                        </p>
                        <div className="flex items-center mt-2 space-x-4 text-xs text-gray-500">
                          <span>Compliant: {report.summary.compliantCount}</span>
                          <span>Non-compliant: {report.summary.nonCompliantCount}</span>
                          <span>Expiring: {report.summary.expiringCount}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedReport(report)}
                          className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          View
                        </button>
                        <button
                          onClick={() => exportReport(report, 'pdf')}
                          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          Export PDF
                        </button>
                        <button
                          onClick={() => exportReport(report, 'excel')}
                          className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Report Details Modal */}
          {selectedReport && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg w-full max-w-4xl max-h-screen overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-lg font-semibold">{selectedReport.title}</h3>
                  <button
                    onClick={() => setSelectedReport(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-6 max-h-96 overflow-y-auto">
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{selectedReport.summary.compliantCount}</div>
                        <div className="text-sm text-gray-600">Compliant</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{selectedReport.summary.nonCompliantCount}</div>
                        <div className="text-sm text-gray-600">Non-compliant</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">{selectedReport.summary.expiringCount}</div>
                        <div className="text-sm text-gray-600">Expiring</div>
                      </div>
                    </div>

                    {selectedReport.summary.criticalIssues.length > 0 && (
                      <div>
                        <h4 className="font-medium text-red-800 mb-2">🚨 Critical Issues</h4>
                        <ul className="space-y-1">
                          {selectedReport.summary.criticalIssues.map((issue, index) => (
                            <li key={index} className="text-sm text-red-700 bg-red-50 p-2 rounded">
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedReport.summary.recommendations.length > 0 && (
                      <div>
                        <h4 className="font-medium text-yellow-800 mb-2">💡 Recommendations</h4>
                        <ul className="space-y-1">
                          {selectedReport.summary.recommendations.map((rec, index) => (
                            <li key={index} className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-2">
                  <button
                    onClick={() => exportReport(selectedReport, 'pdf')}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Export PDF
                  </button>
                  <button
                    onClick={() => exportReport(selectedReport, 'excel')}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Automatic Reports</h3>
            <p className="text-gray-600 mb-6">Set up regular compliance reports to stay on top of expiring documents.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => reportingService.scheduleAutomaticReports('daily')}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="text-2xl mb-2">📅</div>
                <h4 className="font-medium">Daily Reports</h4>
                <p className="text-sm text-gray-600">Critical compliance alerts</p>
              </button>
              <button
                onClick={() => reportingService.scheduleAutomaticReports('weekly')}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="text-2xl mb-2">📊</div>
                <h4 className="font-medium">Weekly Reports</h4>
                <p className="text-sm text-gray-600">Comprehensive status updates</p>
              </button>
              <button
                onClick={() => reportingService.scheduleAutomaticReports('monthly')}
                className="p-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="text-2xl mb-2">📋</div>
                <h4 className="font-medium">Monthly Reports</h4>
                <p className="text-sm text-gray-600">Full audit and planning</p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}