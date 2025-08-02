// Real-time Compliance Monitoring Service
// Monitors compliance status across all data sources and provides alerts

import { comprehensiveComplianceService } from './comprehensiveComplianceApi';

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
  documentationNeeded?: string[];
  filingUrl?: string;
  createdAt: string;
  resolvedAt?: string;
}

interface ComplianceStatus {
  vehicleId: string;
  vin: string;
  overallScore: number;
  status: 'compliant' | 'warning' | 'critical' | 'non_compliant';
  lastChecked: string;
  nextCheck: string;
  alerts: ComplianceAlert[];
  categories: {
    emissions: { status: string; score: number; alerts: number };
    safety: { status: string; score: number; alerts: number };
    registration: { status: string; score: number; alerts: number };
    insurance: { status: string; score: number; alerts: number };
    inspections: { status: string; score: number; alerts: number };
  };
}

interface MonitoringConfig {
  checkInterval: number; // milliseconds
  alertThresholds: {
    critical: number; // days
    high: number;
    medium: number;
  };
  enabledSources: string[];
  notificationChannels: ('email' | 'sms' | 'webhook')[];
}

export class RealTimeComplianceMonitor {
  private monitoringIntervals: Map<string, number> = new Map();
  private complianceStatuses: Map<string, ComplianceStatus> = new Map();
  private subscribers: Map<string, ((status: ComplianceStatus) => void)[]> = new Map();
  
  private readonly defaultConfig: MonitoringConfig = {
    checkInterval: 6 * 60 * 60 * 1000, // 6 hours
    alertThresholds: {
      critical: 7, // 7 days
      high: 30,   // 30 days
      medium: 90  // 90 days
    },
    enabledSources: ['carb', 'fmcsa', 'dmv', 'insurance', 'inspections'],
    notificationChannels: ['email']
  };

  /**
   * Start monitoring a vehicle
   */
  async startMonitoring(
    vehicleId: string, 
    vin: string, 
    dotNumber?: string, 
    config: Partial<MonitoringConfig> = {}
  ): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    console.log(`Starting compliance monitoring for vehicle ${vehicleId} (${vin})`);
    
    // Initial check
    await this.performComplianceCheck(vehicleId, vin, dotNumber, finalConfig);
    
    // Set up recurring checks
    const interval = setInterval(async () => {
      await this.performComplianceCheck(vehicleId, vin, dotNumber, finalConfig);
    }, finalConfig.checkInterval);
    
    this.monitoringIntervals.set(vehicleId, interval as any);
  }

  /**
   * Stop monitoring a vehicle
   */
  stopMonitoring(vehicleId: string): void {
    const interval = this.monitoringIntervals.get(vehicleId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(vehicleId);
    }
    this.complianceStatuses.delete(vehicleId);
    this.subscribers.delete(vehicleId);
    
    console.log(`Stopped compliance monitoring for vehicle ${vehicleId}`);
  }

  /**
   * Get current compliance status
   */
  getComplianceStatus(vehicleId: string): ComplianceStatus | null {
    return this.complianceStatuses.get(vehicleId) || null;
  }

  /**
   * Subscribe to compliance status updates
   */
  subscribe(vehicleId: string, callback: (status: ComplianceStatus) => void): () => void {
    if (!this.subscribers.has(vehicleId)) {
      this.subscribers.set(vehicleId, []);
    }
    this.subscribers.get(vehicleId)!.push(callback);
    
    return () => {
      const callbacks = this.subscribers.get(vehicleId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get all active alerts across all vehicles
   */
  getAllActiveAlerts(): ComplianceAlert[] {
    const allAlerts: ComplianceAlert[] = [];
    for (const status of this.complianceStatuses.values()) {
      allAlerts.push(...status.alerts.filter(alert => !alert.resolvedAt));
    }
    return allAlerts.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    for (const status of this.complianceStatuses.values()) {
      const alert = status.alerts.find(a => a.id === alertId);
      if (alert) {
        alert.resolvedAt = new Date().toISOString();
        this.notifySubscribers(status.vehicleId, status);
        break;
      }
    }
  }

  /**
   * Perform comprehensive compliance check
   */
  private async performComplianceCheck(
    vehicleId: string, 
    vin: string, 
    dotNumber: string | undefined, 
    config: MonitoringConfig
  ): Promise<void> {
    try {
      console.log(`Performing compliance check for ${vin}`);
      
      // Get unified compliance data
      const complianceData = await comprehensiveComplianceService.getUnifiedComplianceData(vin, dotNumber);
      
      // Generate alerts based on the data
      const alerts = this.generateAlertsFromData(vehicleId, vin, complianceData, config);
      
      // Calculate overall compliance status
      const status = this.calculateComplianceStatus(vehicleId, vin, complianceData, alerts);
      
      // Update stored status
      this.complianceStatuses.set(vehicleId, status);
      
      // Notify subscribers
      this.notifySubscribers(vehicleId, status);
      
      console.log(`Compliance check completed for ${vin}. Status: ${status.status}, Alerts: ${alerts.length}`);
      
    } catch (error) {
      console.error(`Compliance check failed for ${vin}:`, error);
    }
  }

  /**
   * Generate alerts from compliance data
   */
  private generateAlertsFromData(
    vehicleId: string, 
    vin: string, 
    complianceData: any, 
    config: MonitoringConfig
  ): ComplianceAlert[] {
    const alerts: ComplianceAlert[] = [];
    
    // CARB emissions alerts
    if (complianceData.carbData) {
      const carb = complianceData.carbData;
      
      if (carb.complianceStatus === 'non-compliant') {
        alerts.push({
          id: `carb-non-compliant-${vehicleId}-${Date.now()}`,
          vehicleId,
          vin,
          alertType: 'violation',
          severity: 'critical',
          title: 'CARB Emissions Non-Compliance',
          description: 'Vehicle is not compliant with CARB emissions standards',
          dueDate: carb.nextInspectionDue || '',
          daysUntilDue: this.calculateDaysUntil(carb.nextInspectionDue),
          source: 'CARB',
          actionRequired: 'Schedule emissions inspection and repair',
          estimatedCost: 2500,
          jurisdictions: ['California'],
          documentationNeeded: ['Emissions test certificate', 'Repair receipts'],
          createdAt: new Date().toISOString()
        });
      }
      
      if (carb.nextInspectionDue) {
        const daysUntil = this.calculateDaysUntil(carb.nextInspectionDue);
        if (daysUntil <= config.alertThresholds.critical) {
          alerts.push({
            id: `carb-inspection-due-${vehicleId}-${Date.now()}`,
            vehicleId,
            vin,
            alertType: 'inspection_due',
            severity: daysUntil <= 0 ? 'critical' : 'high',
            title: 'CARB Emissions Inspection Due',
            description: `Emissions inspection due in ${daysUntil} days`,
            dueDate: carb.nextInspectionDue,
            daysUntilDue: daysUntil,
            source: 'CARB',
            actionRequired: 'Schedule emissions inspection',
            estimatedCost: 200,
            jurisdictions: ['California'],
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // FMCSA safety alerts
    if (complianceData.fmcsaData) {
      const fmcsa = complianceData.fmcsaData;
      
      if (fmcsa.safetyRating === 'Unsatisfactory') {
        alerts.push({
          id: `fmcsa-safety-rating-${vehicleId}-${Date.now()}`,
          vehicleId,
          vin,
          alertType: 'safety_rating',
          severity: 'critical',
          title: 'Unsatisfactory Safety Rating',
          description: 'FMCSA safety rating is unsatisfactory',
          dueDate: '',
          daysUntilDue: 0,
          source: 'FMCSA',
          actionRequired: 'Improve safety practices and request re-rating',
          jurisdictions: ['Federal'],
          createdAt: new Date().toISOString()
        });
      }
      
      // Insurance expiration
      if (fmcsa.insuranceData?.expirationDate) {
        const daysUntil = this.calculateDaysUntil(fmcsa.insuranceData.expirationDate);
        if (daysUntil <= config.alertThresholds.high) {
          alerts.push({
            id: `insurance-expiration-${vehicleId}-${Date.now()}`,
            vehicleId,
            vin,
            alertType: 'expiration',
            severity: daysUntil <= config.alertThresholds.critical ? 'critical' : 'high',
            title: 'Insurance Policy Expiring',
            description: `Commercial insurance expires in ${daysUntil} days`,
            dueDate: fmcsa.insuranceData.expirationDate,
            daysUntilDue: daysUntil,
            source: 'FMCSA',
            actionRequired: 'Renew commercial vehicle insurance',
            estimatedCost: 5000,
            jurisdictions: ['Federal'],
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // Registration alerts
    if (complianceData.registrationData) {
      const reg = complianceData.registrationData;
      
      if (!reg.isValid) {
        alerts.push({
          id: `registration-invalid-${vehicleId}-${Date.now()}`,
          vehicleId,
          vin,
          alertType: 'violation',
          severity: 'critical',
          title: 'Invalid Vehicle Registration',
          description: 'Vehicle registration is not valid',
          dueDate: '',
          daysUntilDue: 0,
          source: `${reg.state} DMV`,
          actionRequired: 'Renew vehicle registration immediately',
          estimatedCost: reg.fees?.totalFee || 500,
          jurisdictions: [reg.state],
          createdAt: new Date().toISOString()
        });
      } else if (reg.expirationDate) {
        const daysUntil = this.calculateDaysUntil(reg.expirationDate);
        if (daysUntil <= config.alertThresholds.high) {
          alerts.push({
            id: `registration-expiration-${vehicleId}-${Date.now()}`,
            vehicleId,
            vin,
            alertType: 'expiration',
            severity: daysUntil <= config.alertThresholds.critical ? 'critical' : 'medium',
            title: 'Vehicle Registration Expiring',
            description: `Registration expires in ${daysUntil} days`,
            dueDate: reg.expirationDate,
            daysUntilDue: daysUntil,
            source: `${reg.state} DMV`,
            actionRequired: 'Renew vehicle registration',
            estimatedCost: reg.fees?.totalFee || 500,
            jurisdictions: [reg.state],
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Calculate overall compliance status
   */
  private calculateComplianceStatus(
    vehicleId: string, 
    vin: string, 
    complianceData: any, 
    alerts: ComplianceAlert[]
  ): ComplianceStatus {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const highAlerts = alerts.filter(a => a.severity === 'high').length;
    const mediumAlerts = alerts.filter(a => a.severity === 'medium').length;
    
    let overallStatus: 'compliant' | 'warning' | 'critical' | 'non_compliant';
    if (criticalAlerts > 0) {
      overallStatus = 'critical';
    } else if (highAlerts > 0) {
      overallStatus = 'warning';
    } else if (mediumAlerts > 0) {
      overallStatus = 'warning';
    } else {
      overallStatus = 'compliant';
    }
    
    const score = complianceData.complianceScore || 85;
    
    return {
      vehicleId,
      vin,
      overallScore: score,
      status: overallStatus,
      lastChecked: new Date().toISOString(),
      nextCheck: new Date(Date.now() + this.defaultConfig.checkInterval).toISOString(),
      alerts,
      categories: {
        emissions: {
          status: complianceData.carbData?.complianceStatus || 'unknown',
          score: complianceData.carbData ? 90 : 50,
          alerts: alerts.filter(a => a.source === 'CARB').length
        },
        safety: {
          status: complianceData.fmcsaData?.safetyRating || 'unknown',
          score: complianceData.fmcsaData?.safetyRating === 'Satisfactory' ? 95 : 60,
          alerts: alerts.filter(a => a.source === 'FMCSA').length
        },
        registration: {
          status: complianceData.registrationData?.isValid ? 'valid' : 'invalid',
          score: complianceData.registrationData?.isValid ? 100 : 0,
          alerts: alerts.filter(a => a.source.includes('DMV')).length
        },
        insurance: {
          status: complianceData.insuranceData?.isActive ? 'active' : 'inactive',
          score: complianceData.insuranceData?.isActive ? 100 : 0,
          alerts: alerts.filter(a => a.alertType === 'expiration' && a.title.includes('Insurance')).length
        },
        inspections: {
          status: complianceData.inspectionRecords?.length > 0 ? 'current' : 'unknown',
          score: 85,
          alerts: alerts.filter(a => a.alertType === 'inspection_due').length
        }
      }
    };
  }

  /**
   * Calculate days until a date
   */
  private calculateDaysUntil(dateString: string): number {
    if (!dateString) return 999;
    const targetDate = new Date(dateString);
    const now = new Date();
    const diffTime = targetDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Notify all subscribers of status changes
   */
  private notifySubscribers(vehicleId: string, status: ComplianceStatus): void {
    const callbacks = this.subscribers.get(vehicleId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(status);
        } catch (error) {
          console.error('Error notifying compliance subscriber:', error);
        }
      });
    }
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    totalVehicles: number;
    activeMonitoring: number;
    totalAlerts: number;
    criticalAlerts: number;
    averageScore: number;
  } {
    const statuses = Array.from(this.complianceStatuses.values());
    const allAlerts = this.getAllActiveAlerts();
    
    return {
      totalVehicles: statuses.length,
      activeMonitoring: this.monitoringIntervals.size,
      totalAlerts: allAlerts.length,
      criticalAlerts: allAlerts.filter(a => a.severity === 'critical').length,
      averageScore: statuses.length > 0 ? 
        statuses.reduce((sum, s) => sum + s.overallScore, 0) / statuses.length : 0
    };
  }

  /**
   * Stop all monitoring
   */
  stopAllMonitoring(): void {
    for (const vehicleId of this.monitoringIntervals.keys()) {
      this.stopMonitoring(vehicleId);
    }
  }
}

export const realTimeComplianceMonitor = new RealTimeComplianceMonitor();