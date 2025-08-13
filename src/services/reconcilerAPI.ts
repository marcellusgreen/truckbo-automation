/**
 * Reconciler API Service
 * Provides easy access to vehicle reconciliation functionality with caching and error handling
 * Enhanced with comprehensive error handling and logging
 */

import { vehicleReconciler, type VehicleRecord, type ReconcilerStats } from './vehicleReconciler';
import { eventBus, FleetEvents } from './eventBus';
import { logger, LogContext } from './logger';
import { errorHandler, withErrorHandling } from './errorHandlingService';

export interface VehicleSummaryView {
  vin: string;
  make?: string;
  model?: string;
  year?: string;
  licensePlate?: string;
  state?: string;
  
  // Engine information (VIN-decoded)
  engineDescription?: string;
  
  // Registration and Insurance Expiry Dates (MM/YYYY format) - Standardized naming
  registrationExpirationDate?: string;
  insuranceExpirationDate?: string;
  
  // Compliance summary
  overallStatus: string;
  complianceScore: number;
  riskLevel: string;
  
  // Document summary
  totalDocuments: number;
  documentTypes: string[];
  lastUpdated: string;
  
  // Expiration summary
  nextExpiringDocument?: {
    documentType: string;
    expirationDate: string;
    daysUntilExpiry: number;
    urgency: string;
  };
  
  // Alerts
  activeConflicts: number;
  hasExpiredDocuments: boolean;
  hasExpiringSoonDocuments: boolean;
}

export interface FleetDashboard {
  summary: {
    totalVehicles: number;
    compliantVehicles: number;
    nonCompliantVehicles: number;
    vehiclesNeedingReview: number;
    averageComplianceScore: number;
  };
  
  alerts: {
    expiredToday: number;
    expiringThisWeek: number;
    expiringThisMonth: number;
    activeConflicts: number;
    highRiskVehicles: number;
  };
  
  recentActivity: Array<{
    vin: string;
    action: string;
    documentType: string;
    timestamp: string;
    status: string;
  }>;
  
  topIssues: Array<{
    issue: string;
    count: number;
    severity: string;
    affectedVehicles: string[];
  }>;
}

class ReconcilerAPI {
  private dashboardCache: { data: FleetDashboard; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Get simplified vehicle summary view
   */
  getVehicleSummaryView(vin: string): VehicleSummaryView | null {
    const context: LogContext = {
      layer: 'api',
      component: 'ReconcilerAPI',
      operation: 'getVehicleSummaryView',
      metadata: { vin }
    };

    const operationId = logger.startOperation('Getting vehicle summary view', context, { vin });

    try {
      logger.debug('Retrieving vehicle summary from reconciler', context);
      
      const vehicle = vehicleReconciler.getVehicleSummary(vin);
      if (!vehicle) {
        logger.warn('Vehicle not found in reconciler', context, undefined, { vin });
        logger.completeOperation('Getting vehicle summary view', operationId, context, { found: false });
        return null;
      }
      
      logger.debug('Processing vehicle summary data', context, {
        documentCount: vehicle.documents.size,
        complianceScore: vehicle.complianceScore
      });

    // Find next expiring document
    let nextExpiringDocument: VehicleSummaryView['nextExpiringDocument'];
    let earliestExpiry = Infinity;
    
    vehicle.documents.forEach(doc => {
      if (doc.expirationDate) {
        const expiry = new Date(doc.expirationDate);
        const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        if (expiry.getTime() < earliestExpiry) {
          earliestExpiry = expiry.getTime();
          
          let urgency: string;
          if (daysUntil < 0) urgency = 'expired';
          else if (daysUntil <= 7) urgency = 'critical';
          else if (daysUntil <= 30) urgency = 'warning';
          else urgency = 'normal';
          
          nextExpiringDocument = {
            documentType: doc.documentType,
            expirationDate: doc.expirationDate,
            daysUntilExpiry: daysUntil,
            urgency
          };
        }
      }
    });

    // Check for expired/expiring documents
    const hasExpiredDocuments = Array.from(vehicle.documents.values()).some(doc => 
      doc.expirationDate && new Date(doc.expirationDate) < new Date()
    );
    
    const hasExpiringSoonDocuments = Array.from(vehicle.documents.values()).some(doc => {
      if (!doc.expirationDate) return false;
      const daysUntil = Math.ceil((new Date(doc.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysUntil > 0 && daysUntil <= 30;
    });

    // Helper function to format date as MM/YYYY
    const formatExpiryDate = (dateString: string): string => {
      try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString; // Return original if invalid
        
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${year}`;
      } catch {
        return dateString; // Return original if error
      }
    };

    // Extract registration and insurance expiry dates from documents
    let registrationExpirationDate: string | undefined;
    let insuranceExpirationDate: string | undefined;
    
    // Search through documents for registration and insurance expiry dates
    logger.debug(`Searching expiry dates for VIN ${vehicle.vin}`, context, {
      totalDocuments: vehicle.documents.size,
      documentTypes: Array.from(vehicle.documentsByType.keys())
    });
    
    vehicle.documents.forEach(doc => {
      logger.debug(`Processing document: ${doc.fileName}`, context, {
        documentType: doc.documentType,
        hasExpirationDate: !!doc.expirationDate,
        expirationDate: doc.expirationDate,
        hasExtractedData: !!doc.extractedData,
        extractedExpirationDate: doc.extractedData?.expirationDate
      });
      
      // Look for registration expiry in registration documents
      if (doc.documentType === 'registration' && doc.expirationDate && !registrationExpirationDate) {
        registrationExpirationDate = formatExpiryDate(doc.expirationDate);
        logger.debug(`Found registration expiry: ${doc.expirationDate} -> ${registrationExpirationDate}`, context);
      }
      
      // Look for insurance expiry in insurance documents  
      if (doc.documentType === 'insurance' && doc.expirationDate && !insuranceExpirationDate) {
        insuranceExpirationDate = formatExpiryDate(doc.expirationDate);
        logger.debug(`Found insurance expiry: ${doc.expirationDate} -> ${insuranceExpirationDate}`, context);
      }
      
      // Also check extracted data fields
      if (doc.extractedData) {
        if (doc.extractedData.expirationDate) {
          if (doc.documentType === 'registration' && !registrationExpirationDate) {
            registrationExpirationDate = formatExpiryDate(doc.extractedData.expirationDate);
            logger.debug(`Found registration expiry from extractedData: ${doc.extractedData.expirationDate} -> ${registrationExpirationDate}`, context);
          }
          if (doc.documentType === 'insurance' && !insuranceExpirationDate) {
            insuranceExpirationDate = formatExpiryDate(doc.extractedData.expirationDate);
            logger.debug(`Found insurance expiry from extractedData: ${doc.extractedData.expirationDate} -> ${insuranceExpirationDate}`, context);
          }
        }
      }
    });
    
    logger.debug(`Final expiry results for VIN ${vehicle.vin}`, context, {
      registrationExpirationDate,
      insuranceExpirationDate
    });

      const summary: VehicleSummaryView = {
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        licensePlate: vehicle.licensePlate,
        state: vehicle.state,
        
        engineDescription: vehicle.engineDescription,
        
        // Add extracted registration and insurance expiry dates (standardized naming)
        registrationExpirationDate,
        insuranceExpirationDate,
        
        overallStatus: vehicle.complianceStatus.overall,
        complianceScore: vehicle.complianceScore,
        riskLevel: vehicle.riskLevel,
        
        totalDocuments: vehicle.documentCount,
        documentTypes: Array.from(vehicle.documentsByType.keys()),
        lastUpdated: vehicle.lastUpdated,
        
        nextExpiringDocument,
        
        activeConflicts: vehicle.activeConflicts.length,
        hasExpiredDocuments,
        hasExpiringSoonDocuments
      };
      
      logger.completeOperation('Getting vehicle summary view', operationId, context, {
        found: true,
        documentCount: summary.totalDocuments,
        complianceScore: summary.complianceScore,
        riskLevel: summary.riskLevel
      });
      
      return summary;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to get vehicle summary view: ${(error as Error).message}`,
        'getVehicleSummaryView',
        { vin },
        context
      );
      
      logger.failOperation('Getting vehicle summary view', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: false // Don't spam notifications for individual vehicle lookups
      });
      
      return null;
    }
  }

  /**
   * Get all vehicles as summary views
   */
  getAllVehicleSummaries(): VehicleSummaryView[] {
    const context: LogContext = {
      layer: 'api',
      component: 'ReconcilerAPI',
      operation: 'getAllVehicleSummaries'
    };

    const operationId = logger.startOperation('Getting all vehicle summaries', context);

    try {
      logger.debug('Retrieving all vehicles from reconciler', context);
      
      const vehicles = vehicleReconciler.getAllVehicles();
      logger.info(`Processing ${vehicles.length} vehicles for summary views`, context, {
        vehicleCount: vehicles.length
      });
      
      const summaries = vehicles.map(vehicle => this.getVehicleSummaryView(vehicle.vin)!)
                              .filter(summary => summary !== null);
      
      logger.completeOperation('Getting all vehicle summaries', operationId, context, {
        processedCount: vehicles.length,
        successfulCount: summaries.length
      });
      
      return summaries;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to get all vehicle summaries: ${(error as Error).message}`,
        'getAllVehicleSummaries',
        undefined,
        context
      );
      
      logger.failOperation('Getting all vehicle summaries', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      return [];
    }
  }

  /**
   * Search vehicles with simplified criteria
   */
  searchVehicles(query: {
    vin?: string;
    make?: string;
    licensePlate?: string;
    complianceStatus?: 'compliant' | 'non_compliant' | 'expires_soon' | 'review_needed' | 'incomplete';
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    hasConflicts?: boolean;
    expiresWithinDays?: number;
  }): VehicleSummaryView[] {
    const vehicles = vehicleReconciler.searchVehicles({
      vin: query.vin,
      make: query.make,
      licensePlate: query.licensePlate,
      complianceStatus: query.complianceStatus,
      hasConflicts: query.hasConflicts,
      expiresWithinDays: query.expiresWithinDays
    });
    
    let results = vehicles.map(vehicle => this.getVehicleSummaryView(vehicle.vin)!)
                         .filter(summary => summary !== null);
    
    // Additional filtering for risk level
    if (query.riskLevel) {
      results = results.filter(vehicle => vehicle.riskLevel === query.riskLevel);
    }
    
    return results;
  }

  /**
   * Get vehicles expiring within specified days
   */
  getExpiringVehicles(days: number = 30): Array<{
    vehicle: VehicleSummaryView;
    expiringDocuments: Array<{
      documentType: string;
      expirationDate: string;
      daysUntilExpiry: number;
      urgency: string;
    }>;
  }> {
    const expiring = vehicleReconciler.getExpiringSoon(days);
    
    return expiring.map(item => ({
      vehicle: this.getVehicleSummaryView(item.vin)!,
      expiringDocuments: item.expiringDocuments
    })).filter(item => item.vehicle !== null);
  }

  /**
   * Get fleet dashboard data with caching
   */
  getFleetDashboard(): FleetDashboard {
    const context: LogContext = {
      layer: 'api',
      component: 'ReconcilerAPI',
      operation: 'getFleetDashboard'
    };

    const operationId = logger.startOperation('Getting fleet dashboard', context);

    try {
      // Check cache
      const now = Date.now();
      if (this.dashboardCache && (now - this.dashboardCache.timestamp) < this.CACHE_DURATION) {
        logger.debug('Returning cached dashboard data', context, {
          cacheAge: now - this.dashboardCache.timestamp,
          maxAge: this.CACHE_DURATION
        });
        
        logger.completeOperation('Getting fleet dashboard', operationId, context, { fromCache: true });
        return this.dashboardCache.data;
      }

      logger.debug('Generating fresh dashboard data', context);
      
      // Generate fresh dashboard data
      const stats = vehicleReconciler.getStats();
      const vehicles = vehicleReconciler.getAllVehicles();
      
      logger.debug('Processing dashboard statistics', context, {
        totalVehicles: stats.totalVehicles,
        vehicleCount: vehicles.length
      });
    
    // Calculate summary stats
    const compliantVehicles = vehicles.filter(v => v.complianceStatus.overall === 'compliant').length;
    const nonCompliantVehicles = vehicles.filter(v => v.complianceStatus.overall === 'non_compliant').length;
    const vehiclesNeedingReview = vehicles.filter(v => 
      v.complianceStatus.overall === 'review_needed' || v.complianceStatus.overall === 'incomplete'
    ).length;
    
    const totalComplianceScore = vehicles.reduce((sum, v) => sum + v.complianceScore, 0);
    const averageComplianceScore = vehicles.length > 0 ? Math.round(totalComplianceScore / vehicles.length) : 0;
    
    // Calculate alerts
    const highRiskVehicles = vehicles.filter(v => v.riskLevel === 'high' || v.riskLevel === 'critical').length;
    
    // Generate recent activity (simulated - in real app would come from audit log)
    const recentActivity = vehicles
      .slice(0, 10) // Last 10 vehicles
      .map(vehicle => ({
        vin: vehicle.vin,
        action: 'Document processed',
        documentType: Array.from(vehicle.documentsByType.keys())[0] || 'unknown',
        timestamp: vehicle.lastUpdated,
        status: vehicle.complianceStatus.overall
      }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Identify top issues
    const issueMap = new Map<string, { count: number; vehicles: Set<string>; severity: string }>();
    
    vehicles.forEach(vehicle => {
      // Compliance issues
      if (vehicle.complianceStatus.overall === 'non_compliant') {
        const issue = 'Non-compliant vehicle';
        if (!issueMap.has(issue)) {
          issueMap.set(issue, { count: 0, vehicles: new Set(), severity: 'high' });
        }
        issueMap.get(issue)!.count++;
        issueMap.get(issue)!.vehicles.add(vehicle.vin);
      }
      
      // Expiring documents
      const hasExpiring = Array.from(vehicle.documents.values()).some(doc => {
        if (!doc.expirationDate) return false;
        const daysUntil = Math.ceil((new Date(doc.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 30;
      });
      
      if (hasExpiring) {
        const issue = 'Documents expiring soon';
        if (!issueMap.has(issue)) {
          issueMap.set(issue, { count: 0, vehicles: new Set(), severity: 'medium' });
        }
        issueMap.get(issue)!.count++;
        issueMap.get(issue)!.vehicles.add(vehicle.vin);
      }
      
      // Active conflicts
      if (vehicle.activeConflicts.length > 0) {
        const issue = 'Document conflicts detected';
        if (!issueMap.has(issue)) {
          issueMap.set(issue, { count: 0, vehicles: new Set(), severity: 'medium' });
        }
        issueMap.get(issue)!.count++;
        issueMap.get(issue)!.vehicles.add(vehicle.vin);
      }
    });
    
    const topIssues = Array.from(issueMap.entries())
      .map(([issue, data]) => ({
        issue,
        count: data.count,
        severity: data.severity,
        affectedVehicles: Array.from(data.vehicles)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const dashboard: FleetDashboard = {
      summary: {
        totalVehicles: stats.totalVehicles,
        compliantVehicles,
        nonCompliantVehicles,
        vehiclesNeedingReview,
        averageComplianceScore
      },
      
      alerts: {
        expiredToday: stats.expirationAlert.expiresToday,
        expiringThisWeek: stats.expirationAlert.expiresThisWeek,
        expiringThisMonth: stats.expirationAlert.expiresThisMonth,
        activeConflicts: stats.conflictsSummary.active,
        highRiskVehicles
      },
      
      recentActivity,
      topIssues
    };

      // Cache the result
      this.dashboardCache = {
        data: dashboard,
        timestamp: now
      };
      
      logger.info('Generated fresh dashboard data', context, {
        totalVehicles: dashboard.summary.totalVehicles,
        compliantVehicles: dashboard.summary.compliantVehicles,
        activeAlerts: dashboard.alerts.activeConflicts,
        topIssuesCount: dashboard.topIssues.length
      });
      
      logger.completeOperation('Getting fleet dashboard', operationId, context, {
        fromCache: false,
        generatedStats: true
      });

      return dashboard;
    } catch (error) {
      const appError = errorHandler.createProcessingError(
        `Failed to generate fleet dashboard: ${(error as Error).message}`,
        'getFleetDashboard',
        undefined,
        context
      );
      
      logger.failOperation('Getting fleet dashboard', operationId, appError, context);
      
      errorHandler.handleError(appError, context, {
        showUserNotification: true
      });
      
      // Return minimal dashboard structure to prevent UI crashes
      const emptyDashboard: FleetDashboard = {
        summary: {
          totalVehicles: 0,
          compliantVehicles: 0,
          nonCompliantVehicles: 0,
          vehiclesNeedingReview: 0,
          averageComplianceScore: 0
        },
        alerts: {
          expiredToday: 0,
          expiringThisWeek: 0,
          expiringThisMonth: 0,
          activeConflicts: 0,
          highRiskVehicles: 0
        },
        recentActivity: [],
        topIssues: []
      };
      
      return emptyDashboard;
    }
  }

  /**
   * Get detailed stats
   */
  getDetailedStats(): ReconcilerStats {
    return vehicleReconciler.getStats();
  }

  /**
   * Add document to reconciliation system
   */
  async addDocument(documentData: any, metadata: {
    fileName: string;
    source: string;
    uploadDate?: string;
  }): Promise<{
    success: boolean;
    vehicleVIN?: string;
    conflicts?: any[];
    warnings?: string[];
    vehicleSummary?: VehicleSummaryView;
  }> {
    const context: LogContext = {
      layer: 'api',
      component: 'ReconcilerAPI',
      operation: 'addDocument',
      metadata: {
        fileName: metadata.fileName,
        source: metadata.source,
        hasDocumentData: !!documentData
      }
    };

    const operationId = logger.startOperation('Adding document to reconciliation system', context, {
      fileName: metadata.fileName,
      source: metadata.source,
      uploadDate: metadata.uploadDate
    });

    return await withErrorHandling.async(async () => {
      logger.debug('Adding document to vehicle reconciler', context);
      
      const result = await vehicleReconciler.addDocument(documentData, metadata);
      
      if (result.success && result.vehicleVIN) {
        logger.info('Document successfully added to reconciler', context, {
          vehicleVIN: result.vehicleVIN,
          hasConflicts: !!result.conflicts && result.conflicts.length > 0,
          conflictCount: result.conflicts?.length || 0
        });
        
        logger.debug('Generating vehicle summary view', context);
        const vehicleSummary = this.getVehicleSummaryView(result.vehicleVIN);
        
        // Clear dashboard cache to force refresh
        this.dashboardCache = null;
        logger.debug('Dashboard cache cleared after document addition', context);
        
        // Emit event for document processing
        FleetEvents.documentProcessed(documentData, result.vehicleVIN, 'reconcilerAPI');
        
        logger.completeOperation('Adding document to reconciliation system', operationId, context, {
          vehicleVIN: result.vehicleVIN,
          conflictCount: result.conflicts?.length || 0,
          warningCount: result.warnings?.length || 0
        });
        
        return {
          ...result,
          vehicleSummary: vehicleSummary || undefined
        };
      } else {
        logger.warn('Document addition failed or no VIN identified', context, undefined, {
          success: result.success,
          hasVehicleVIN: !!result.vehicleVIN,
          warningCount: result.warnings?.length || 0
        });
        
        logger.completeOperation('Adding document to reconciliation system', operationId, context, {
          success: false,
          warningCount: result.warnings?.length || 0
        });
      }
      
      return result;
    }, context, {
      showUserNotification: true,
      enableRetry: false // Document processing shouldn't auto-retry
    });
  }

  /**
   * Export reconciliation data
   */
  exportData(): any {
    return vehicleReconciler.exportData();
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.dashboardCache = null;
    
    // Emit event for cache clearing
    FleetEvents.cacheCleared('reconcilerAPI', 'reconcilerAPI');
  }

  /**
   * Get compliance breakdown by document type
   */
  getComplianceBreakdown(): Array<{
    documentType: string;
    total: number;
    current: number;
    expiring: number;
    expired: number;
    missing: number;
    complianceRate: number;
  }> {
    const vehicles = vehicleReconciler.getAllVehicles();
    const breakdown = new Map<string, {
      total: number;
      current: number;
      expiring: number;
      expired: number;
      missing: number;
    }>();

    const documentTypes = ['registration', 'insurance', 'inspection', 'cdl', 'medical'];
    
    documentTypes.forEach(type => {
      breakdown.set(type, { total: 0, current: 0, expiring: 0, expired: 0, missing: 0 });
    });

    vehicles.forEach(vehicle => {
      documentTypes.forEach(type => {
        const complianceKey = type as keyof typeof vehicle.complianceStatus;
        if (complianceKey === 'overall') return;
        
        const status = vehicle.complianceStatus[complianceKey];
        const breakdown_data = breakdown.get(type)!;
        
        breakdown_data.total++;
        
        switch (status.status) {
          case 'current': breakdown_data.current++; break;
          case 'expires_soon': breakdown_data.expiring++; break;
          case 'expired': breakdown_data.expired++; break;
          case 'missing': breakdown_data.missing++; break;
        }
      });
    });

    return Array.from(breakdown.entries()).map(([documentType, data]) => ({
      documentType,
      ...data,
      complianceRate: data.total > 0 ? Math.round((data.current / data.total) * 100) : 0
    }));
  }
}

// Export singleton instance
export const reconcilerAPI = new ReconcilerAPI();