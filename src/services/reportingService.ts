// Comprehensive Reporting Service
// Generates compliance reports for fleet management

import { persistentFleetStorage, VehicleRecord, DriverRecord } from './persistentFleetStorage';
import { errorHandler } from './errorHandler';

export interface ComplianceReport {
  id: string;
  title: string;
  type: 'vehicle_compliance' | 'driver_compliance' | 'expiration_summary' | 'full_audit' | 'custom';
  generatedAt: string;
  generatedBy: string;
  dateRange: {
    from: string;
    to: string;
  };
  data: any;
  summary: ReportSummary;
  exportFormats: string[];
}

export interface ReportSummary {
  totalVehicles?: number;
  totalDrivers?: number;
  compliantCount: number;
  nonCompliantCount: number;
  expiringCount: number;
  criticalIssues: string[];
  recommendations: string[];
}

export interface ExpirationAlert {
  type: 'vehicle' | 'driver';
  id: string;
  name: string;
  documentType: 'registration' | 'insurance' | 'medical_certificate' | 'cdl';
  expirationDate: string;
  daysUntilExpiry: number;
  status: 'expired' | 'expires_soon' | 'critical';
  priority: 'critical' | 'high' | 'medium';
}

export interface ComplianceMetrics {
  overallComplianceRate: number;
  vehicleComplianceRate: number;
  driverComplianceRate: number;
  criticalAlerts: number;
  highPriorityAlerts: number;
  expiringSoon: number;
  totalDocuments: number;
  documentTypes: {
    [key: string]: {
      total: number;
      compliant: number;
      expiring: number;
      expired: number;
    };
  };
}

class ComplianceReportingService {
  
  /**
   * Generate vehicle compliance report
   */
  generateVehicleComplianceReport(dateRange?: { from: string; to: string }): ComplianceReport {
    const vehicles = persistentFleetStorage.getFleet();
    const reportDate = new Date().toISOString();
    
    const compliantVehicles: VehicleRecord[] = [];
    const nonCompliantVehicles: VehicleRecord[] = [];
    const expiringVehicles: VehicleRecord[] = [];
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    vehicles.forEach((vehicle: VehicleRecord) => {
      let isCompliant = true;
      let isExpiring = false;

      // Check registration compliance
      if (vehicle.registrationExpiry) {
        const expiryDate = new Date(vehicle.registrationExpiry);
        const today = new Date();
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) {
          isCompliant = false;
          criticalIssues.push(`${vehicle.truckNumber}: Registration expired ${Math.abs(daysUntilExpiry)} days ago`);
        } else if (daysUntilExpiry <= 30) {
          isExpiring = true;
          recommendations.push(`${vehicle.truckNumber}: Registration expires in ${daysUntilExpiry} days - schedule renewal`);
        }
      } else {
        isCompliant = false;
        criticalIssues.push(`${vehicle.truckNumber}: Missing registration expiry date`);
      }

      // Check insurance compliance
      if (vehicle.insuranceExpiry) {
        const expiryDate = new Date(vehicle.insuranceExpiry);
        const today = new Date();
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) {
          isCompliant = false;
          criticalIssues.push(`${vehicle.truckNumber}: Insurance expired ${Math.abs(daysUntilExpiry)} days ago`);
        } else if (daysUntilExpiry <= 15) {
          isExpiring = true;
          recommendations.push(`${vehicle.truckNumber}: Insurance expires in ${daysUntilExpiry} days - renew immediately`);
        }
      } else {
        isCompliant = false;
        criticalIssues.push(`${vehicle.truckNumber}: Missing insurance information`);
      }

      // Check for required fields
      if (!vehicle.vin) {
        isCompliant = false;
        criticalIssues.push(`${vehicle.truckNumber}: Missing VIN`);
      }

      // Categorize vehicle
      if (!isCompliant) {
        nonCompliantVehicles.push(vehicle);
      } else if (isExpiring) {
        expiringVehicles.push(vehicle);
      } else {
        compliantVehicles.push(vehicle);
      }
    });

    const summary: ReportSummary = {
      totalVehicles: vehicles.length,
      compliantCount: compliantVehicles.length,
      nonCompliantCount: nonCompliantVehicles.length,
      expiringCount: expiringVehicles.length,
      criticalIssues: criticalIssues.slice(0, 10), // Top 10 critical issues
      recommendations: recommendations.slice(0, 10)
    };

    return {
      id: `vehicle_compliance_${Date.now()}`,
      title: 'Vehicle Compliance Report',
      type: 'vehicle_compliance',
      generatedAt: reportDate,
      generatedBy: 'TruckBo System',
      dateRange: dateRange || {
        from: new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
      },
      data: {
        compliantVehicles,
        nonCompliantVehicles,
        expiringVehicles,
        totalVehicles: vehicles.length
      },
      summary,
      exportFormats: ['PDF', 'Excel', 'CSV']
    };
  }

  /**
   * Generate driver compliance report
   */
  generateDriverComplianceReport(dateRange?: { from: string; to: string }): ComplianceReport {
    const drivers = persistentFleetStorage.getDrivers();
    const reportDate = new Date().toISOString();
    
    const compliantDrivers: DriverRecord[] = [];
    const nonCompliantDrivers: DriverRecord[] = [];
    const expiringDrivers: DriverRecord[] = [];
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    drivers.forEach(driver => {
      let isCompliant = true;
      let isExpiring = false;
      const driverName = `${driver.firstName} ${driver.lastName}`;

      // Check medical certificate compliance
      if (driver.medicalCertificate) {
        if (driver.medicalCertificate.status === 'expired') {
          isCompliant = false;
          criticalIssues.push(`${driverName}: Medical certificate expired ${Math.abs(driver.medicalCertificate.daysUntilExpiry)} days ago`);
        } else if (driver.medicalCertificate.status === 'expiring_soon') {
          isExpiring = true;
          recommendations.push(`${driverName}: Medical certificate expires in ${driver.medicalCertificate.daysUntilExpiry} days`);
        }
      } else {
        isCompliant = false;
        criticalIssues.push(`${driverName}: Missing medical certificate`);
      }

      // Check CDL compliance
      if (driver.cdlInfo) {
        if (driver.cdlInfo.status === 'expired') {
          isCompliant = false;
          criticalIssues.push(`${driverName}: CDL expired ${Math.abs(driver.cdlInfo.daysUntilExpiry)} days ago`);
        } else if (driver.cdlInfo.status === 'expiring_soon') {
          isExpiring = true;
          recommendations.push(`${driverName}: CDL expires in ${driver.cdlInfo.daysUntilExpiry} days`);
        }
      } else {
        isCompliant = false;
        criticalIssues.push(`${driverName}: Missing CDL information`);
      }

      // Check required fields
      if (!driver.employeeId) {
        isCompliant = false;
        criticalIssues.push(`${driverName}: Missing employee ID`);
      }

      // Categorize driver
      if (!isCompliant) {
        nonCompliantDrivers.push(driver);
      } else if (isExpiring) {
        expiringDrivers.push(driver);
      } else {
        compliantDrivers.push(driver);
      }
    });

    const summary: ReportSummary = {
      totalDrivers: drivers.length,
      compliantCount: compliantDrivers.length,
      nonCompliantCount: nonCompliantDrivers.length,
      expiringCount: expiringDrivers.length,
      criticalIssues: criticalIssues.slice(0, 10),
      recommendations: recommendations.slice(0, 10)
    };

    return {
      id: `driver_compliance_${Date.now()}`,
      title: 'Driver Compliance Report',
      type: 'driver_compliance',
      generatedAt: reportDate,
      generatedBy: 'TruckBo System',
      dateRange: dateRange || {
        from: new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
      },
      data: {
        compliantDrivers,
        nonCompliantDrivers,
        expiringDrivers,
        totalDrivers: drivers.length
      },
      summary,
      exportFormats: ['PDF', 'Excel', 'CSV']
    };
  }

  /**
   * Generate expiration summary report
   */
  generateExpirationSummaryReport(daysAhead: number = 90): ComplianceReport {
    const vehicles = persistentFleetStorage.getFleet();
    const drivers = persistentFleetStorage.getDrivers();
    const reportDate = new Date().toISOString();
    const alerts: ExpirationAlert[] = [];

    // Check vehicle expirations
    vehicles.forEach((vehicle: VehicleRecord) => {
      const today = new Date();
      
      // Registration expiration
      if (vehicle.registrationExpiry) {
        const expiryDate = new Date(vehicle.registrationExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry <= daysAhead) {
          alerts.push({
            type: 'vehicle',
            id: vehicle.id,
            name: `${vehicle.truckNumber} (${vehicle.make} ${vehicle.model})`,
            documentType: 'registration',
            expirationDate: vehicle.registrationExpiry,
            daysUntilExpiry,
            status: daysUntilExpiry < 0 ? 'expired' : daysUntilExpiry <= 30 ? 'critical' : 'expires_soon',
            priority: daysUntilExpiry < 0 ? 'critical' : daysUntilExpiry <= 15 ? 'critical' : daysUntilExpiry <= 30 ? 'high' : 'medium'
          });
        }
      }

      // Insurance expiration
      if (vehicle.insuranceExpiry) {
        const expiryDate = new Date(vehicle.insuranceExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry <= daysAhead) {
          alerts.push({
            type: 'vehicle',
            id: vehicle.id,
            name: `${vehicle.truckNumber} (${vehicle.make} ${vehicle.model})`,
            documentType: 'insurance',
            expirationDate: vehicle.insuranceExpiry,
            daysUntilExpiry,
            status: daysUntilExpiry < 0 ? 'expired' : daysUntilExpiry <= 15 ? 'critical' : 'expires_soon',
            priority: daysUntilExpiry < 0 ? 'critical' : daysUntilExpiry <= 7 ? 'critical' : daysUntilExpiry <= 15 ? 'high' : 'medium'
          });
        }
      }
    });

    // Check driver expirations
    drivers.forEach(driver => {
      const driverName = `${driver.firstName} ${driver.lastName}`;
      
      // Medical certificate expiration
      if (driver.medicalCertificate && driver.medicalCertificate.daysUntilExpiry <= daysAhead) {
        alerts.push({
          type: 'driver',
          id: driver.id,
          name: driverName,
          documentType: 'medical_certificate',
          expirationDate: driver.medicalCertificate.expirationDate,
          daysUntilExpiry: driver.medicalCertificate.daysUntilExpiry,
          status: driver.medicalCertificate.status as any,
          priority: driver.medicalCertificate.daysUntilExpiry < 0 ? 'critical' : 
                   driver.medicalCertificate.daysUntilExpiry <= 30 ? 'high' : 'medium'
        });
      }

      // CDL expiration
      if (driver.cdlInfo && driver.cdlInfo.daysUntilExpiry <= daysAhead) {
        alerts.push({
          type: 'driver',
          id: driver.id,
          name: driverName,
          documentType: 'cdl',
          expirationDate: driver.cdlInfo.expirationDate,
          daysUntilExpiry: driver.cdlInfo.daysUntilExpiry,
          status: driver.cdlInfo.status as any,
          priority: driver.cdlInfo.daysUntilExpiry < 0 ? 'critical' : 
                   driver.cdlInfo.daysUntilExpiry <= 60 ? 'high' : 'medium'
        });
      }
    });

    // Sort alerts by priority and days until expiry
    alerts.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    const criticalAlerts = alerts.filter(a => a.priority === 'critical');
    const highAlerts = alerts.filter(a => a.priority === 'high');

    const summary: ReportSummary = {
      totalVehicles: vehicles.length,
      totalDrivers: drivers.length,
      compliantCount: vehicles.length + drivers.length - alerts.length,
      nonCompliantCount: criticalAlerts.length,
      expiringCount: alerts.length - criticalAlerts.length,
      criticalIssues: criticalAlerts.slice(0, 10).map(alert => 
        `${alert.name}: ${alert.documentType} ${alert.status} (${Math.abs(alert.daysUntilExpiry)} days)`
      ),
      recommendations: highAlerts.slice(0, 10).map(alert =>
        `Schedule renewal for ${alert.name}: ${alert.documentType} expires in ${alert.daysUntilExpiry} days`
      )
    };

    return {
      id: `expiration_summary_${Date.now()}`,
      title: `Expiration Summary Report (Next ${daysAhead} Days)`,
      type: 'expiration_summary',
      generatedAt: reportDate,
      generatedBy: 'TruckBo System',
      dateRange: {
        from: new Date().toISOString().split('T')[0],
        to: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      },
      data: {
        alerts,
        daysAhead,
        criticalAlerts: criticalAlerts.length,
        highPriorityAlerts: highAlerts.length,
        totalAlerts: alerts.length
      },
      summary,
      exportFormats: ['PDF', 'Excel', 'CSV']
    };
  }

  /**
   * Generate comprehensive audit report
   */
  generateFullAuditReport(): ComplianceReport {
    const vehicleReport = this.generateVehicleComplianceReport();
    const driverReport = this.generateDriverComplianceReport();
    const expirationReport = this.generateExpirationSummaryReport(90);
    const metrics = this.calculateComplianceMetrics();
    
    const reportDate = new Date().toISOString();

    const combinedCriticalIssues = [
      ...vehicleReport.summary.criticalIssues,
      ...driverReport.summary.criticalIssues,
      ...expirationReport.summary.criticalIssues
    ];

    const combinedRecommendations = [
      ...vehicleReport.summary.recommendations,
      ...driverReport.summary.recommendations,
      ...expirationReport.summary.recommendations
    ];

    const summary: ReportSummary = {
      totalVehicles: vehicleReport.summary.totalVehicles,
      totalDrivers: driverReport.summary.totalDrivers,
      compliantCount: vehicleReport.summary.compliantCount + driverReport.summary.compliantCount,
      nonCompliantCount: vehicleReport.summary.nonCompliantCount + driverReport.summary.nonCompliantCount,
      expiringCount: vehicleReport.summary.expiringCount + driverReport.summary.expiringCount,
      criticalIssues: combinedCriticalIssues.slice(0, 15),
      recommendations: combinedRecommendations.slice(0, 15)
    };

    return {
      id: `full_audit_${Date.now()}`,
      title: 'Comprehensive Fleet Compliance Audit',
      type: 'full_audit',
      generatedAt: reportDate,
      generatedBy: 'TruckBo System',
      dateRange: {
        from: new Date().toISOString().split('T')[0],
        to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      },
      data: {
        vehicleCompliance: vehicleReport.data,
        driverCompliance: driverReport.data,
        expirationAlerts: expirationReport.data,
        metrics
      },
      summary,
      exportFormats: ['PDF', 'Excel']
    };
  }

  /**
   * Calculate compliance metrics
   */
  calculateComplianceMetrics(): ComplianceMetrics {
    const vehicles = persistentFleetStorage.getFleet();
    const drivers = persistentFleetStorage.getDrivers();
    
    let totalCompliant = 0;
    let totalDocuments = 0;
    let criticalAlerts = 0;
    let highPriorityAlerts = 0;
    let expiringSoon = 0;

    const documentTypes: { [key: string]: any } = {
      registration: { total: 0, compliant: 0, expiring: 0, expired: 0 },
      insurance: { total: 0, compliant: 0, expiring: 0, expired: 0 },
      medical_certificate: { total: 0, compliant: 0, expiring: 0, expired: 0 },
      cdl: { total: 0, compliant: 0, expiring: 0, expired: 0 }
    };

    // Process vehicles
    vehicles.forEach((vehicle: VehicleRecord) => {
      // Registration
      if (vehicle.registrationExpiry) {
        documentTypes.registration.total++;
        totalDocuments++;
        
        const expiryDate = new Date(vehicle.registrationExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          documentTypes.registration.expired++;
          criticalAlerts++;
        } else if (daysUntilExpiry <= 30) {
          documentTypes.registration.expiring++;
          expiringSoon++;
          if (daysUntilExpiry <= 15) highPriorityAlerts++;
        } else {
          documentTypes.registration.compliant++;
          totalCompliant++;
        }
      }
      
      // Insurance
      if (vehicle.insuranceExpiry) {
        documentTypes.insurance.total++;
        totalDocuments++;
        
        const expiryDate = new Date(vehicle.insuranceExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          documentTypes.insurance.expired++;
          criticalAlerts++;
        } else if (daysUntilExpiry <= 15) {
          documentTypes.insurance.expiring++;
          expiringSoon++;
          highPriorityAlerts++;
        } else {
          documentTypes.insurance.compliant++;
          totalCompliant++;
        }
      }
    });

    // Process drivers
    drivers.forEach(driver => {
      // Medical certificates
      if (driver.medicalCertificate) {
        documentTypes.medical_certificate.total++;
        totalDocuments++;
        
        if (driver.medicalCertificate.status === 'expired') {
          documentTypes.medical_certificate.expired++;
          criticalAlerts++;
        } else if (driver.medicalCertificate.status === 'expiring_soon') {
          documentTypes.medical_certificate.expiring++;
          expiringSoon++;
          if (driver.medicalCertificate.daysUntilExpiry <= 30) highPriorityAlerts++;
        } else {
          documentTypes.medical_certificate.compliant++;
          totalCompliant++;
        }
      }
      
      // CDL
      if (driver.cdlInfo) {
        documentTypes.cdl.total++;
        totalDocuments++;
        
        if (driver.cdlInfo.status === 'expired') {
          documentTypes.cdl.expired++;
          criticalAlerts++;
        } else if (driver.cdlInfo.status === 'expiring_soon') {
          documentTypes.cdl.expiring++;
          expiringSoon++;
          if (driver.cdlInfo.daysUntilExpiry <= 60) highPriorityAlerts++;
        } else {
          documentTypes.cdl.compliant++;
          totalCompliant++;
        }
      }
    });

    const overallComplianceRate = totalDocuments > 0 ? (totalCompliant / totalDocuments) * 100 : 100;
    const vehicleDocuments = documentTypes.registration.total + documentTypes.insurance.total;
    const vehicleCompliant = documentTypes.registration.compliant + documentTypes.insurance.compliant;
    const driverDocuments = documentTypes.medical_certificate.total + documentTypes.cdl.total;
    const driverCompliant = documentTypes.medical_certificate.compliant + documentTypes.cdl.compliant;

    return {
      overallComplianceRate: Number(overallComplianceRate.toFixed(1)),
      vehicleComplianceRate: vehicleDocuments > 0 ? Number(((vehicleCompliant / vehicleDocuments) * 100).toFixed(1)) : 100,
      driverComplianceRate: driverDocuments > 0 ? Number(((driverCompliant / driverDocuments) * 100).toFixed(1)) : 100,
      criticalAlerts,
      highPriorityAlerts,
      expiringSoon,
      totalDocuments,
      documentTypes
    };
  }

  /**
   * Export report to PDF
   */
  async exportToPDF(report: ComplianceReport): Promise<void> {
    try {
      // Create PDF content
      const pdfContent = this.generatePDFContent(report);
      
      // Create blob and download
      const blob = new Blob([pdfContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
      
      errorHandler.showSuccess('Report exported successfully!');
    } catch (error) {
      errorHandler.handleCriticalError(error, 'PDF export');
    }
  }

  /**
   * Export report to Excel/CSV
   */
  async exportToExcel(report: ComplianceReport): Promise<void> {
    try {
      const csvContent = this.generateCSVContent(report);
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      errorHandler.showSuccess('Report exported to CSV successfully!');
    } catch (error) {
      errorHandler.handleCriticalError(error, 'Excel export');
    }
  }

  /**
   * Generate PDF content (HTML format for simplicity)
   */
  private generatePDFContent(report: ComplianceReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${report.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
        .metric { background: white; padding: 15px; border: 1px solid #dee2e6; border-radius: 4px; text-align: center; }
        .alerts { margin: 20px 0; }
        .alert { padding: 10px; margin: 5px 0; border-left: 4px solid #dc3545; background: #f8d7da; }
        .recommendation { padding: 10px; margin: 5px 0; border-left: 4px solid #ffc107; background: #fff3cd; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #dee2e6; padding: 8px; text-align: left; }
        th { background: #e9ecef; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${report.title}</h1>
        <p>Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
        <p>Report Period: ${report.dateRange.from} to ${report.dateRange.to}</p>
    </div>

    <div class="summary">
        <h2>Executive Summary</h2>
        <div class="metrics">
            <div class="metric">
                <h3>${report.summary.compliantCount}</h3>
                <p>Compliant</p>
            </div>
            <div class="metric">
                <h3>${report.summary.nonCompliantCount}</h3>
                <p>Non-Compliant</p>
            </div>
            <div class="metric">
                <h3>${report.summary.expiringCount}</h3>
                <p>Expiring Soon</p>
            </div>
        </div>
    </div>

    ${report.summary.criticalIssues.length > 0 ? `
    <div class="alerts">
        <h2>Critical Issues</h2>
        ${report.summary.criticalIssues.map(issue => `<div class="alert">${issue}</div>`).join('')}
    </div>
    ` : ''}

    ${report.summary.recommendations.length > 0 ? `
    <div class="alerts">
        <h2>Recommendations</h2>
        ${report.summary.recommendations.map(rec => `<div class="recommendation">${rec}</div>`).join('')}
    </div>
    ` : ''}

    <div class="footer">
        <p>Generated by TruckBo Pro Fleet Management System</p>
        <p>This report contains confidential information. Handle according to company policy.</p>
    </div>
</body>
</html>`;
  }

  /**
   * Generate CSV content
   */
  private generateCSVContent(report: ComplianceReport): string {
    let csv = `Report Title,${report.title}\n`;
    csv += `Generated At,${new Date(report.generatedAt).toLocaleString()}\n`;
    csv += `Date Range,${report.dateRange.from} to ${report.dateRange.to}\n\n`;

    csv += `Summary\n`;
    csv += `Metric,Value\n`;
    csv += `Compliant,${report.summary.compliantCount}\n`;
    csv += `Non-Compliant,${report.summary.nonCompliantCount}\n`;
    csv += `Expiring Soon,${report.summary.expiringCount}\n\n`;

    if (report.summary.criticalIssues.length > 0) {
      csv += `Critical Issues\n`;
      report.summary.criticalIssues.forEach(issue => {
        csv += `"${issue}"\n`;
      });
      csv += '\n';
    }

    if (report.summary.recommendations.length > 0) {
      csv += `Recommendations\n`;
      report.summary.recommendations.forEach(rec => {
        csv += `"${rec}"\n`;
      });
    }

    return csv;
  }

  /**
   * Schedule automatic reports
   */
  scheduleAutomaticReports(frequency: 'daily' | 'weekly' | 'monthly'): void {
    const intervalMs = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000
    };

    setInterval(() => {
      try {
        const expirationReport = this.generateExpirationSummaryReport(30);
        if (expirationReport.summary.criticalIssues.length > 0) {
          errorHandler.showInfo(
            `Scheduled Report: ${expirationReport.summary.criticalIssues.length} critical compliance issues found`,
            10000
          );
        }
      } catch (error) {
        console.error('Scheduled report generation failed:', error);
      }
    }, intervalMs[frequency]);

    errorHandler.showSuccess(`Automatic ${frequency} reports scheduled successfully!`);
  }
}

export const reportingService = new ComplianceReportingService();