// Compliance Reporting Service (refactored for centralized fleet adapter)
// Provides async helpers to generate vehicle/driver compliance reports and export artifacts.

import { fleetStorageAdapter } from './fleetStorageAdapter';
import { centralizedFleetDataService, type UnifiedVehicleData } from './centralizedFleetDataService';
import { persistentFleetStorage, type DriverRecord } from './persistentFleetStorage';
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

type VehicleComplianceBucket = 'compliant' | 'expiring' | 'nonCompliant';

const DEFAULT_GENERATED_BY = 'TruckBo System';

class ComplianceReportingService {
  private async fetchVehicles(): Promise<UnifiedVehicleData[]> {
    try {
      const cached = centralizedFleetDataService.getVehicles();
      if (cached.length > 0) {
        return cached;
      }

      await centralizedFleetDataService.initializeData();
      const refreshed = centralizedFleetDataService.getVehicles();
      if (refreshed.length > 0) {
        return refreshed;
      }
    } catch (error) {
      console.warn('[ReportingService] Centralized fleet data unavailable, using adapter fallback', error);
    }

    return await fleetStorageAdapter.getFleet();
  }

  private async fetchDrivers(): Promise<DriverRecord[]> {
    try {
      return await persistentFleetStorage.getDriversAsync();
    } catch (error) {
      console.warn('[ReportingService] Driver data unavailable', error);
      return [];
    }
  }

  private getDateRange(input?: { from: string; to: string }) {
    if (input) {
      return input;
    }

    const today = new Date().toISOString().split('T')[0];
    return { from: today, to: today };
  }

  private getDaysUntil(expiration?: string | null): number | null {
    if (!expiration) {
      return null;
    }
    const date = new Date(expiration);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const diff = date.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  private classifyVehicle(vehicle: UnifiedVehicleData): {
    bucket: VehicleComplianceBucket;
    criticalIssues: string[];
    recommendations: string[];
  } {
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];
    const label = vehicle.truckNumber || vehicle.vin || 'Unknown Vehicle';

    const metadata = (vehicle.complianceData as Record<string, any>) ?? {};
    const registrationExpiry =
      vehicle.registrationExpirationDate ?? metadata.registrationExpirationDate ?? metadata.registration?.expirationDate ?? null;
    const insuranceExpiry =
      vehicle.insuranceExpirationDate ?? metadata.insuranceExpirationDate ?? metadata.insurance?.expirationDate ?? null;

    const registrationDays = this.getDaysUntil(registrationExpiry);
    const insuranceDays = this.getDaysUntil(insuranceExpiry);

    let bucket: VehicleComplianceBucket = 'compliant';

    if (registrationDays === null) {
      bucket = 'nonCompliant';
      criticalIssues.push(`${label}: Missing registration expiration date`);
    } else if (registrationDays < 0) {
      bucket = 'nonCompliant';
      criticalIssues.push(`${label}: Registration expired ${Math.abs(registrationDays)} days ago`);
    } else if (registrationDays <= 30) {
      bucket = 'expiring';
      recommendations.push(`${label}: Registration expires in ${registrationDays} days`);
    }

    if (insuranceDays === null) {
      bucket = 'nonCompliant';
      criticalIssues.push(`${label}: Missing insurance expiration date`);
    } else if (insuranceDays < 0) {
      bucket = 'nonCompliant';
      criticalIssues.push(`${label}: Insurance expired ${Math.abs(insuranceDays)} days ago`);
    } else if (insuranceDays <= 15 && bucket !== 'nonCompliant') {
      bucket = 'expiring';
      recommendations.push(`${label}: Insurance expires in ${insuranceDays} days`);
    }

    if (!vehicle.vin) {
      bucket = 'nonCompliant';
      criticalIssues.push(`${label}: Missing VIN`);
    }

    return { bucket, criticalIssues, recommendations };
  }

  async generateVehicleComplianceReport(dateRange?: { from: string; to: string }): Promise<ComplianceReport> {
    const vehicles = await this.fetchVehicles();
    const compliant: UnifiedVehicleData[] = [];
    const nonCompliant: UnifiedVehicleData[] = [];
    const expiring: UnifiedVehicleData[] = [];
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    vehicles.forEach(vehicle => {
      const result = this.classifyVehicle(vehicle);
      criticalIssues.push(...result.criticalIssues);
      recommendations.push(...result.recommendations);

      switch (result.bucket) {
        case 'compliant':
          compliant.push(vehicle);
          break;
        case 'expiring':
          expiring.push(vehicle);
          break;
        case 'nonCompliant':
          nonCompliant.push(vehicle);
          break;
      }
    });

    const summary: ReportSummary = {
      totalVehicles: vehicles.length,
      compliantCount: compliant.length,
      nonCompliantCount: nonCompliant.length,
      expiringCount: expiring.length,
      criticalIssues: criticalIssues.slice(0, 10),
      recommendations: recommendations.slice(0, 10)
    };

    return {
      id: `vehicle_compliance_${Date.now()}`,
      title: 'Vehicle Compliance Report',
      type: 'vehicle_compliance',
      generatedAt: new Date().toISOString(),
      generatedBy: DEFAULT_GENERATED_BY,
      dateRange: this.getDateRange(dateRange),
      data: {
        compliantVehicles: compliant,
        nonCompliantVehicles: nonCompliant,
        expiringVehicles: expiring
      },
      summary,
      exportFormats: ['PDF', 'Excel', 'CSV']
    };
  }

  async generateDriverComplianceReport(dateRange?: { from: string; to: string }): Promise<ComplianceReport> {
    const drivers = await this.fetchDrivers();
    const compliant: DriverRecord[] = [];
    const nonCompliant: DriverRecord[] = [];
    const expiring: DriverRecord[] = [];
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    drivers.forEach(driver => {
      const driverName = `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || 'Unknown Driver';

      const medicalStatus = (driver.medicalCertificate as Record<string, any>)?.status;
      const medicalDays = this.getDaysUntil((driver.medicalCertificate as Record<string, any>)?.expirationDate);
      const cdlStatus = (driver.cdlInfo as Record<string, any>)?.status;
      const cdlDays = this.getDaysUntil((driver.cdlInfo as Record<string, any>)?.expirationDate);

      const medicalExpired = medicalStatus === 'expired' || (medicalDays !== null && medicalDays < 0);
      const medicalExpiring =
        !medicalExpired && (medicalStatus === 'expiring_soon' || (medicalDays !== null && medicalDays <= 30));
      const cdlExpired = cdlStatus === 'expired' || (cdlDays !== null && cdlDays < 0);
      const cdlExpiring = !cdlExpired && (cdlStatus === 'expiring_soon' || (cdlDays !== null && cdlDays <= 30));

      if (medicalExpired) {
        criticalIssues.push(`${driverName}: Medical certificate expired`);
      } else if (medicalExpiring) {
        recommendations.push(`${driverName}: Medical certificate expires in ${medicalDays ?? 0} days`);
      }

      if (cdlExpired) {
        criticalIssues.push(`${driverName}: CDL expired`);
      } else if (cdlExpiring) {
        recommendations.push(`${driverName}: CDL expires in ${cdlDays ?? 0} days`);
      }

      const hasNonCompliance = medicalExpired || cdlExpired;
      const hasExpiringRisk = !hasNonCompliance && (medicalExpiring || cdlExpiring);

      if (hasNonCompliance) {
        nonCompliant.push(driver);
      } else if (hasExpiringRisk) {
        expiring.push(driver);
      } else {
        compliant.push(driver);
      }
    });

    const summary: ReportSummary = {
      totalDrivers: drivers.length,
      compliantCount: compliant.length,
      nonCompliantCount: nonCompliant.length,
      expiringCount: expiring.length,
      criticalIssues: criticalIssues.slice(0, 10),
      recommendations: recommendations.slice(0, 10)
    };

    return {
      id: `driver_compliance_${Date.now()}`,
      title: 'Driver Compliance Report',
      type: 'driver_compliance',
      generatedAt: new Date().toISOString(),
      generatedBy: DEFAULT_GENERATED_BY,
      dateRange: this.getDateRange(dateRange),
      data: { compliantDrivers: compliant, nonCompliantDrivers: nonCompliant, expiringDrivers: expiring },
      summary,
      exportFormats: ['PDF', 'Excel', 'CSV']
    };
  }

  async generateExpirationSummaryReport(daysAhead: number = 30): Promise<ComplianceReport> {
    const vehicles = await this.fetchVehicles();
    const alerts: ExpirationAlert[] = [];

    vehicles.forEach(vehicle => {
      const label = vehicle.truckNumber || vehicle.vin || 'Unknown Vehicle';
      const metadata = (vehicle.complianceData as Record<string, any>) ?? {};
      const registrationExpiry =
        vehicle.registrationExpirationDate ?? metadata.registrationExpirationDate ?? metadata.registration?.expirationDate ?? null;
      const insuranceExpiry =
        vehicle.insuranceExpirationDate ?? metadata.insuranceExpirationDate ?? metadata.insurance?.expirationDate ?? null;

      const regDays = this.getDaysUntil(registrationExpiry);
      if (regDays !== null && regDays <= daysAhead) {
        alerts.push({
          type: 'vehicle',
          id: `${vehicle.vin ?? label}-registration`,
          name: label,
          documentType: 'registration',
          expirationDate: registrationExpiry ?? '',
          daysUntilExpiry: regDays,
          status: regDays < 0 ? 'expired' : regDays <= 7 ? 'critical' : 'expires_soon',
          priority: regDays < 0 ? 'critical' : regDays <= 7 ? 'critical' : 'high'
        });
      }

      const insDays = this.getDaysUntil(insuranceExpiry);
      if (insDays !== null && insDays <= daysAhead) {
        alerts.push({
          type: 'vehicle',
          id: `${vehicle.vin ?? label}-insurance`,
          name: label,
          documentType: 'insurance',
          expirationDate: insuranceExpiry ?? '',
          daysUntilExpiry: insDays,
          status: insDays < 0 ? 'expired' : insDays <= 7 ? 'critical' : 'expires_soon',
          priority: insDays < 0 ? 'critical' : insDays <= 7 ? 'critical' : 'high'
        });
      }
    });

    const summary: ReportSummary = {
      totalVehicles: vehicles.length,
      compliantCount: alerts.filter(alert => alert.status === 'expired').length,
      nonCompliantCount: alerts.filter(alert => alert.status === 'expired').length,
      expiringCount: alerts.filter(alert => alert.status !== 'expired').length,
      criticalIssues: alerts
        .filter(alert => alert.priority === 'critical')
        .slice(0, 10)
        .map(alert => `${alert.name}: ${alert.documentType} ${alert.status.replace('_', ' ')}`),
      recommendations: alerts
        .filter(alert => alert.priority !== 'critical')
        .slice(0, 10)
        .map(alert => `${alert.name}: Renew ${alert.documentType} within ${alert.daysUntilExpiry} days`)
    };

    return {
      id: `expiration_summary_${Date.now()}`,
      title: `Expiration Summary (${daysAhead} days)`,
      type: 'expiration_summary',
      generatedAt: new Date().toISOString(),
      generatedBy: DEFAULT_GENERATED_BY,
      dateRange: this.getDateRange(),
      data: { alerts },
      summary,
      exportFormats: ['PDF', 'Excel', 'CSV']
    };
  }

  async generateFullAuditReport(dateRange?: { from: string; to: string }): Promise<ComplianceReport> {
    const [vehicleReport, driverReport, expirationReport] = await Promise.all([
      this.generateVehicleComplianceReport(dateRange),
      this.generateDriverComplianceReport(dateRange),
      this.generateExpirationSummaryReport(60)
    ]);

    const summary: ReportSummary = {
      totalVehicles: vehicleReport.summary.totalVehicles,
      totalDrivers: driverReport.summary.totalDrivers,
      compliantCount: (vehicleReport.summary.compliantCount || 0) + (driverReport.summary.compliantCount || 0),
      nonCompliantCount: (vehicleReport.summary.nonCompliantCount || 0) + (driverReport.summary.nonCompliantCount || 0),
      expiringCount: expirationReport.summary.expiringCount,
      criticalIssues: [
        ...vehicleReport.summary.criticalIssues,
        ...driverReport.summary.criticalIssues,
        ...expirationReport.summary.criticalIssues
      ].slice(0, 10),
      recommendations: [
        ...vehicleReport.summary.recommendations,
        ...driverReport.summary.recommendations,
        ...expirationReport.summary.recommendations
      ].slice(0, 10)
    };

    return {
      id: `full_audit_${Date.now()}`,
      title: 'Comprehensive Compliance Audit',
      type: 'full_audit',
      generatedAt: new Date().toISOString(),
      generatedBy: DEFAULT_GENERATED_BY,
      dateRange: this.getDateRange(dateRange),
      data: {
        vehicleReport,
        driverReport,
        expirationReport
      },
      summary,
      exportFormats: ['PDF', 'Excel', 'CSV']
    };
  }

  async calculateComplianceMetrics(): Promise<ComplianceMetrics> {
    const [vehicleReport, driverReport, expirationReport] = await Promise.all([
      this.generateVehicleComplianceReport(),
      this.generateDriverComplianceReport(),
      this.generateExpirationSummaryReport(30)
    ]);

    const totalVehicleDocs =
      (vehicleReport.data?.nonCompliantVehicles?.length ?? 0) +
      (vehicleReport.data?.expiringVehicles?.length ?? 0) +
      (vehicleReport.data?.compliantVehicles?.length ?? 0);
    const totalDriverDocs =
      (driverReport.data?.nonCompliantDrivers?.length ?? 0) +
      (driverReport.data?.expiringDrivers?.length ?? 0) +
      (driverReport.data?.compliantDrivers?.length ?? 0);

    const overallDocs = totalVehicleDocs + totalDriverDocs;
    const compliantDocs =
      (vehicleReport.data?.compliantVehicles?.length ?? 0) + (driverReport.data?.compliantDrivers?.length ?? 0);

    const documentTypes: ComplianceMetrics['documentTypes'] = {
      registration: {
        total: vehicleReport.data?.expiringVehicles?.length ?? 0,
        compliant: vehicleReport.data?.compliantVehicles?.length ?? 0,
        expiring: vehicleReport.data?.expiringVehicles?.length ?? 0,
        expired: vehicleReport.data?.nonCompliantVehicles?.length ?? 0
      },
      insurance: {
        total: vehicleReport.data?.expiringVehicles?.length ?? 0,
        compliant: vehicleReport.data?.compliantVehicles?.length ?? 0,
        expiring: vehicleReport.data?.expiringVehicles?.length ?? 0,
        expired: vehicleReport.data?.nonCompliantVehicles?.length ?? 0
      },
      medical_certificate: {
        total: driverReport.data?.expiringDrivers?.length ?? 0,
        compliant: driverReport.data?.compliantDrivers?.length ?? 0,
        expiring: driverReport.data?.expiringDrivers?.length ?? 0,
        expired: driverReport.data?.nonCompliantDrivers?.length ?? 0
      },
      cdl: {
        total: driverReport.data?.expiringDrivers?.length ?? 0,
        compliant: driverReport.data?.compliantDrivers?.length ?? 0,
        expiring: driverReport.data?.expiringDrivers?.length ?? 0,
        expired: driverReport.data?.nonCompliantDrivers?.length ?? 0
      }
    };

    const criticalAlerts = expirationReport.summary.criticalIssues.length;
    const expiringSoon = expirationReport.summary.expiringCount;

    return {
      overallComplianceRate: overallDocs > 0 ? Number(((compliantDocs / overallDocs) * 100).toFixed(1)) : 100,
      vehicleComplianceRate:
        totalVehicleDocs > 0
          ? Number(((vehicleReport.summary.compliantCount / totalVehicleDocs) * 100).toFixed(1))
          : 100,
      driverComplianceRate:
        totalDriverDocs > 0 ? Number(((driverReport.summary.compliantCount / totalDriverDocs) * 100).toFixed(1)) : 100,
      criticalAlerts,
      highPriorityAlerts: expirationReport.summary.criticalIssues.length,
      expiringSoon,
      totalDocuments: overallDocs,
      documentTypes
    };
  }

  async exportToPDF(report: ComplianceReport): Promise<void> {
    try {
      const pdfContent = this.generatePDFContent(report);
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

  scheduleAutomaticReports(frequency: 'daily' | 'weekly' | 'monthly'): void {
    const intervalMs = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000
    };

    const runReport = async () => {
      try {
        const expirationReport = await this.generateExpirationSummaryReport(30);
        if (expirationReport.summary.criticalIssues.length > 0) {
          errorHandler.showInfo(
            `Scheduled Report: ${expirationReport.summary.criticalIssues.length} critical compliance issues found`,
            10_000
          );
        }
      } catch (error) {
        console.error('Scheduled report generation failed:', error);
      }
    };

    void runReport();
    setInterval(() => {
      void runReport();
    }, intervalMs[frequency]);

    errorHandler.showSuccess(`Automatic ${frequency} reports scheduled successfully!`);
  }

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
}

export const reportingService = new ComplianceReportingService();
