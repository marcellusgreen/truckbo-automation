"use strict";
/**
 * Reconciler API Service
 * Provides easy access to vehicle reconciliation functionality with caching and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcilerAPI = void 0;
const vehicleReconciler_1 = require("../src/services/vehicleReconciler");
class ReconcilerAPI {
    constructor() {
        Object.defineProperty(this, "dashboardCache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "CACHE_DURATION", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 5 * 60 * 1000
        }); // 5 minutes
    }
    /**
     * Get simplified vehicle summary view
     */
    getVehicleSummaryView(vin) {
        const vehicle = vehicleReconciler_1.vehicleReconciler.getVehicleSummary(vin);
        if (!vehicle)
            return null;
        // Find next expiring document
        let nextExpiringDocument;
        let earliestExpiry = Infinity;
        vehicle.documents.forEach(doc => {
            if (doc.expirationDate) {
                const expiry = new Date(doc.expirationDate);
                const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                if (expiry.getTime() < earliestExpiry) {
                    earliestExpiry = expiry.getTime();
                    let urgency;
                    if (daysUntil < 0)
                        urgency = 'expired';
                    else if (daysUntil <= 7)
                        urgency = 'critical';
                    else if (daysUntil <= 30)
                        urgency = 'warning';
                    else
                        urgency = 'normal';
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
        const hasExpiredDocuments = Array.from(vehicle.documents.values()).some(doc => doc.expirationDate && new Date(doc.expirationDate) < new Date());
        const hasExpiringSoonDocuments = Array.from(vehicle.documents.values()).some(doc => {
            if (!doc.expirationDate)
                return false;
            const daysUntil = Math.ceil((new Date(doc.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysUntil > 0 && daysUntil <= 30;
        });
        return {
            vin: vehicle.vin,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            licensePlate: vehicle.licensePlate,
            state: vehicle.state,
            engineDescription: vehicle.engineDescription,
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
    }
    /**
     * Get all vehicles as summary views
     */
    getAllVehicleSummaries() {
        const vehicles = vehicleReconciler_1.vehicleReconciler.getAllVehicles();
        return vehicles.map(vehicle => this.getVehicleSummaryView(vehicle.vin))
            .filter(summary => summary !== null);
    }
    /**
     * Search vehicles with simplified criteria
     */
    searchVehicles(query) {
        const vehicles = vehicleReconciler_1.vehicleReconciler.searchVehicles({
            vin: query.vin,
            make: query.make,
            licensePlate: query.licensePlate,
            complianceStatus: query.complianceStatus,
            hasConflicts: query.hasConflicts,
            expiresWithinDays: query.expiresWithinDays
        });
        let results = vehicles.map(vehicle => this.getVehicleSummaryView(vehicle.vin))
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
    getExpiringVehicles(days = 30) {
        const expiring = vehicleReconciler_1.vehicleReconciler.getExpiringSoon(days);
        return expiring.map(item => ({
            vehicle: this.getVehicleSummaryView(item.vin),
            expiringDocuments: item.expiringDocuments
        })).filter(item => item.vehicle !== null);
    }
    /**
     * Get fleet dashboard data with caching
     */
    getFleetDashboard() {
        // Check cache
        const now = Date.now();
        if (this.dashboardCache && (now - this.dashboardCache.timestamp) < this.CACHE_DURATION) {
            return this.dashboardCache.data;
        }
        // Generate fresh dashboard data
        const stats = vehicleReconciler_1.vehicleReconciler.getStats();
        const vehicles = vehicleReconciler_1.vehicleReconciler.getAllVehicles();
        // Calculate summary stats
        const compliantVehicles = vehicles.filter(v => v.complianceStatus.overall === 'compliant').length;
        const nonCompliantVehicles = vehicles.filter(v => v.complianceStatus.overall === 'non_compliant').length;
        const vehiclesNeedingReview = vehicles.filter(v => v.complianceStatus.overall === 'review_needed' || v.complianceStatus.overall === 'incomplete').length;
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
        const issueMap = new Map();
        vehicles.forEach(vehicle => {
            // Compliance issues
            if (vehicle.complianceStatus.overall === 'non_compliant') {
                const issue = 'Non-compliant vehicle';
                if (!issueMap.has(issue)) {
                    issueMap.set(issue, { count: 0, vehicles: new Set(), severity: 'high' });
                }
                issueMap.get(issue).count++;
                issueMap.get(issue).vehicles.add(vehicle.vin);
            }
            // Expiring documents
            const hasExpiring = Array.from(vehicle.documents.values()).some(doc => {
                if (!doc.expirationDate)
                    return false;
                const daysUntil = Math.ceil((new Date(doc.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return daysUntil > 0 && daysUntil <= 30;
            });
            if (hasExpiring) {
                const issue = 'Documents expiring soon';
                if (!issueMap.has(issue)) {
                    issueMap.set(issue, { count: 0, vehicles: new Set(), severity: 'medium' });
                }
                issueMap.get(issue).count++;
                issueMap.get(issue).vehicles.add(vehicle.vin);
            }
            // Active conflicts
            if (vehicle.activeConflicts.length > 0) {
                const issue = 'Document conflicts detected';
                if (!issueMap.has(issue)) {
                    issueMap.set(issue, { count: 0, vehicles: new Set(), severity: 'medium' });
                }
                issueMap.get(issue).count++;
                issueMap.get(issue).vehicles.add(vehicle.vin);
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
        const dashboard = {
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
        return dashboard;
    }
    /**
     * Get detailed stats
     */
    getDetailedStats() {
        return vehicleReconciler_1.vehicleReconciler.getStats();
    }
    /**
     * Add document to reconciliation system
     */
    async addDocument(documentData, metadata) {
        try {
            const result = await vehicleReconciler_1.vehicleReconciler.addDocument(documentData, metadata);
            if (result.success && result.vehicleVIN) {
                const vehicleSummary = this.getVehicleSummaryView(result.vehicleVIN);
                // Clear dashboard cache to force refresh
                this.dashboardCache = null;
                return {
                    ...result,
                    vehicleSummary: vehicleSummary || undefined
                };
            }
            return result;
        }
        catch (error) {
            console.error('ReconcilerAPI: Error adding document:', error);
            return {
                success: false,
                warnings: [`Failed to add document: ${error instanceof Error ? error.message : 'Unknown error'}`]
            };
        }
    }
    /**
     * Export reconciliation data
     */
    exportData() {
        return vehicleReconciler_1.vehicleReconciler.exportData();
    }
    /**
     * Clear cache (useful for testing or manual refresh)
     */
    clearCache() {
        this.dashboardCache = null;
    }
    /**
     * Get compliance breakdown by document type
     */
    getComplianceBreakdown() {
        const vehicles = vehicleReconciler_1.vehicleReconciler.getAllVehicles();
        const breakdown = new Map();
        const documentTypes = ['registration', 'insurance', 'inspection', 'cdl', 'medical'];
        documentTypes.forEach(type => {
            breakdown.set(type, { total: 0, current: 0, expiring: 0, expired: 0, missing: 0 });
        });
        vehicles.forEach(vehicle => {
            documentTypes.forEach(type => {
                const complianceKey = type;
                if (complianceKey === 'overall')
                    return;
                const status = vehicle.complianceStatus[complianceKey];
                const breakdown_data = breakdown.get(type);
                breakdown_data.total++;
                switch (status.status) {
                    case 'current':
                        breakdown_data.current++;
                        break;
                    case 'expires_soon':
                        breakdown_data.expiring++;
                        break;
                    case 'expired':
                        breakdown_data.expired++;
                        break;
                    case 'missing':
                        breakdown_data.missing++;
                        break;
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
exports.reconcilerAPI = new ReconcilerAPI();
