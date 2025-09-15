"use strict";
/**
 * Advanced Vehicle Document Reconciliation System
 * Groups documents by VIN, tracks compliance history, and provides consolidated vehicle views
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehicleReconciler = exports.VehicleReconciler = void 0;
const fieldStandardization_1 = require("../utils/fieldStandardization");
class VehicleReconciler {
    constructor() {
        Object.defineProperty(this, "vehicles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "vinAliases", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // Maps alternative VINs to primary VIN
        Object.defineProperty(this, "documentIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // Maps documentId to VIN
        console.log('🚛 VehicleReconciler initialized');
        this.loadFromStorage();
    }
    /**
     * Save data to localStorage
     */
    saveToStorage() {
        try {
            const data = {
                vehicles: Object.fromEntries(Array.from(this.vehicles.entries()).map(([vin, vehicle]) => [
                    vin,
                    {
                        ...vehicle,
                        documents: Object.fromEntries(vehicle.documents),
                        documentsByType: Object.fromEntries(Array.from(vehicle.documentsByType.entries()).map(([type, docs]) => [type, docs])),
                        complianceHistory: Object.fromEntries(vehicle.complianceHistory)
                    }
                ])),
                vinAliases: Object.fromEntries(this.vinAliases),
                documentIndex: Object.fromEntries(this.documentIndex),
                lastSaved: new Date().toISOString()
            };
            localStorage.setItem('vehicleReconciler_data', JSON.stringify(data));
            console.log('💾 VehicleReconciler data saved to storage');
        }
        catch (error) {
            console.error('❌ Error saving VehicleReconciler data:', error);
        }
    }
    /**
     * Load data from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('vehicleReconciler_data');
            if (!stored) {
                console.log('📭 No stored VehicleReconciler data found');
                return;
            }
            const data = JSON.parse(stored);
            console.log('📂 Loading VehicleReconciler data from storage:', {
                vehicleCount: Object.keys(data.vehicles || {}).length,
                lastSaved: data.lastSaved
            });
            // Restore vehicles
            if (data.vehicles) {
                Object.entries(data.vehicles).forEach(([vin, vehicleData]) => {
                    const vehicle = {
                        ...vehicleData,
                        documents: new Map(Object.entries(vehicleData.documents || {})),
                        documentsByType: new Map(Object.entries(vehicleData.documentsByType || {}).map(([type, docs]) => [type, docs])),
                        complianceHistory: new Map(Object.entries(vehicleData.complianceHistory || {}))
                    };
                    this.vehicles.set(vin, vehicle);
                });
            }
            // Restore aliases and index
            if (data.vinAliases) {
                this.vinAliases = new Map(Object.entries(data.vinAliases));
            }
            if (data.documentIndex) {
                this.documentIndex = new Map(Object.entries(data.documentIndex));
            }
            console.log(`✅ Restored ${this.vehicles.size} vehicles from storage`);
        }
        catch (error) {
            console.error('❌ Error loading VehicleReconciler data:', error);
        }
    }
    /**
     * Add a document to the reconciliation system
     */
    async addDocument(documentData, metadata) {
        try {
            console.log(`📄 Adding document: ${metadata.fileName}`);
            // Extract VIN from document
            const extractedVIN = await this.extractVINFromDocument(documentData);
            if (!extractedVIN) {
                return {
                    success: false,
                    warnings: ['No valid VIN found in document - cannot reconcile']
                };
            }
            // Find or create vehicle record
            const primaryVIN = this.resolvePrimaryVIN(extractedVIN);
            let vehicleRecord = this.vehicles.get(primaryVIN);
            if (!vehicleRecord) {
                vehicleRecord = this.createNewVehicleRecord(primaryVIN);
                this.vehicles.set(primaryVIN, vehicleRecord);
                console.log(`🆕 Created new vehicle record for VIN: ${primaryVIN}`);
            }
            // Create document record
            const documentRecord = this.createDocumentRecord(documentData, metadata, extractedVIN);
            // Check for conflicts before adding
            const conflicts = this.detectConflicts(vehicleRecord, documentRecord);
            // Add document to vehicle
            this.addDocumentToVehicle(vehicleRecord, documentRecord);
            // Update compliance status
            this.updateComplianceStatus(vehicleRecord, documentRecord);
            // Update vehicle metadata
            vehicleRecord.lastUpdated = new Date().toISOString();
            vehicleRecord.documentCount = vehicleRecord.documents.size;
            this.calculateComplianceScore(vehicleRecord);
            // Index the document
            this.documentIndex.set(documentRecord.id, primaryVIN);
            // Save to storage
            this.saveToStorage();
            console.log(`✅ Document added to VIN ${primaryVIN}. Total documents: ${vehicleRecord.documentCount}`);
            return {
                success: true,
                vehicleVIN: primaryVIN,
                conflicts: conflicts.length > 0 ? conflicts : undefined,
                warnings: this.generateWarnings(vehicleRecord, documentRecord)
            };
        }
        catch (error) {
            console.error('Error adding document to reconciler:', error);
            return {
                success: false,
                warnings: [`Failed to add document: ${error instanceof Error ? error.message : 'Unknown error'}`]
            };
        }
    }
    /**
     * Get consolidated vehicle summary
     */
    getVehicleSummary(vin) {
        const primaryVIN = this.resolvePrimaryVIN(vin);
        const vehicle = this.vehicles.get(primaryVIN);
        if (!vehicle) {
            return null;
        }
        // Refresh compliance status before returning
        this.refreshVehicleComplianceStatus(vehicle);
        return vehicle;
    }
    /**
     * Get vehicles with expiring compliance (within specified days)
     */
    getExpiringSoon(days = 30) {
        const expiringSoon = [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() + days);
        this.vehicles.forEach((vehicle, vin) => {
            const expiringDocs = [];
            vehicle.documents.forEach(doc => {
                if (doc.expirationDate) {
                    const expiryDate = new Date(doc.expirationDate);
                    const daysUntil = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (daysUntil <= days) {
                        let urgency;
                        if (daysUntil < 0)
                            urgency = 'expired';
                        else if (daysUntil <= 7)
                            urgency = 'critical';
                        else if (daysUntil <= 14)
                            urgency = 'warning';
                        else
                            urgency = 'normal';
                        expiringDocs.push({
                            documentType: doc.documentType,
                            documentId: doc.id,
                            expirationDate: doc.expirationDate,
                            daysUntilExpiry: daysUntil,
                            urgency
                        });
                    }
                }
            });
            if (expiringDocs.length > 0) {
                expiringSoon.push({
                    vin,
                    vehicle,
                    expiringDocuments: expiringDocs.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
                });
            }
        });
        return expiringSoon.sort((a, b) => Math.min(...a.expiringDocuments.map((d) => d.daysUntilExpiry)) -
            Math.min(...b.expiringDocuments.map((d) => d.daysUntilExpiry)));
    }
    /**
     * Get all vehicles with their current status
     */
    getAllVehicles() {
        const vehicles = [];
        this.vehicles.forEach(vehicle => {
            this.refreshVehicleComplianceStatus(vehicle);
            vehicles.push(vehicle);
        });
        return vehicles.sort((a, b) => {
            // Sort by risk level (critical first), then by VIN
            const riskOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
            const riskDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
            return riskDiff !== 0 ? riskDiff : a.vin.localeCompare(b.vin);
        });
    }
    /**
     * Get reconciler statistics
     */
    getStats() {
        const stats = {
            totalVehicles: this.vehicles.size,
            totalDocuments: 0,
            documentsPerVehicle: { avg: 0, min: Infinity, max: 0 },
            complianceBreakdown: {
                compliant: 0,
                nonCompliant: 0,
                expiresSoon: 0,
                needsReview: 0,
                incomplete: 0
            },
            conflictsSummary: {
                active: 0,
                resolved: 0,
                byType: {},
                bySeverity: {}
            },
            expirationAlert: {
                expired: 0,
                expiresToday: 0,
                expiresThisWeek: 0,
                expiresThisMonth: 0
            }
        };
        const docCounts = [];
        const today = new Date();
        const oneWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const oneMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        this.vehicles.forEach(vehicle => {
            this.refreshVehicleComplianceStatus(vehicle);
            // Document counts
            stats.totalDocuments += vehicle.documentCount;
            docCounts.push(vehicle.documentCount);
            // Compliance breakdown
            switch (vehicle.complianceStatus.overall) {
                case 'compliant':
                    stats.complianceBreakdown.compliant++;
                    break;
                case 'non_compliant':
                    stats.complianceBreakdown.nonCompliant++;
                    break;
                case 'expires_soon':
                    stats.complianceBreakdown.expiresSoon++;
                    break;
                case 'review_needed':
                    stats.complianceBreakdown.needsReview++;
                    break;
                case 'incomplete':
                    stats.complianceBreakdown.incomplete++;
                    break;
            }
            // Conflict statistics
            stats.conflictsSummary.active += vehicle.activeConflicts.length;
            stats.conflictsSummary.resolved += vehicle.resolvedConflicts.length;
            [...vehicle.activeConflicts, ...vehicle.resolvedConflicts].forEach(conflict => {
                stats.conflictsSummary.byType[conflict.type] = (stats.conflictsSummary.byType[conflict.type] || 0) + 1;
                stats.conflictsSummary.bySeverity[conflict.severity] = (stats.conflictsSummary.bySeverity[conflict.severity] || 0) + 1;
            });
            // Expiration alerts
            vehicle.documents.forEach(doc => {
                if (doc.expirationDate) {
                    const expiry = new Date(doc.expirationDate);
                    if (expiry < today) {
                        stats.expirationAlert.expired++;
                    }
                    else if (expiry.toDateString() === today.toDateString()) {
                        stats.expirationAlert.expiresToday++;
                    }
                    else if (expiry <= oneWeek) {
                        stats.expirationAlert.expiresThisWeek++;
                    }
                    else if (expiry <= oneMonth) {
                        stats.expirationAlert.expiresThisMonth++;
                    }
                }
            });
        });
        // Calculate document statistics
        if (docCounts.length > 0) {
            stats.documentsPerVehicle.avg = Math.round(stats.totalDocuments / this.vehicles.size);
            stats.documentsPerVehicle.min = Math.min(...docCounts);
            stats.documentsPerVehicle.max = Math.max(...docCounts);
        }
        return stats;
    }
    /**
     * Search vehicles by various criteria
     */
    searchVehicles(criteria) {
        const results = [];
        this.vehicles.forEach(vehicle => {
            this.refreshVehicleComplianceStatus(vehicle);
            // VIN search (fuzzy)
            if (criteria.vin && !vehicle.vin.toLowerCase().includes(criteria.vin.toLowerCase()) &&
                !vehicle.alternativeVINs.some(alt => alt.toLowerCase().includes(criteria.vin.toLowerCase()))) {
                return;
            }
            // Vehicle details
            if (criteria.make && vehicle.make && !vehicle.make.toLowerCase().includes(criteria.make.toLowerCase())) {
                return;
            }
            if (criteria.model && vehicle.model && !vehicle.model.toLowerCase().includes(criteria.model.toLowerCase())) {
                return;
            }
            if (criteria.licensePlate && vehicle.licensePlate &&
                !vehicle.licensePlate.toLowerCase().includes(criteria.licensePlate.toLowerCase())) {
                return;
            }
            if (criteria.state && vehicle.state && vehicle.state !== criteria.state) {
                return;
            }
            // Compliance status
            if (criteria.complianceStatus && vehicle.complianceStatus.overall !== criteria.complianceStatus) {
                return;
            }
            // Conflicts
            if (criteria.hasConflicts !== undefined) {
                const hasConflicts = vehicle.activeConflicts.length > 0;
                if (criteria.hasConflicts !== hasConflicts) {
                    return;
                }
            }
            // Expiration check
            if (criteria.expiresWithinDays !== undefined) {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() + criteria.expiresWithinDays);
                let hasExpiringDoc = false;
                vehicle.documents.forEach(doc => {
                    if (doc.expirationDate && new Date(doc.expirationDate) <= cutoff) {
                        hasExpiringDoc = true;
                    }
                });
                if (!hasExpiringDoc) {
                    return;
                }
            }
            results.push(vehicle);
        });
        return results;
    }
    /**
     * Export all data for backup/analysis
     */
    exportData() {
        const vehicles = Array.from(this.vehicles.entries()).map(([vin, vehicle]) => ({
            vin,
            vehicle: {
                ...vehicle,
                documents: Array.from(vehicle.documents.values()),
                documentsByType: Object.fromEntries(vehicle.documentsByType),
                complianceHistory: Object.fromEntries(vehicle.complianceHistory)
            }
        }));
        return {
            vehicles,
            stats: this.getStats(),
            exportDate: new Date().toISOString()
        };
    }
    // ==========================================
    // PRIVATE HELPER METHODS
    // ==========================================
    /**
     * Extract VIN from document data
     */
    async extractVINFromDocument(documentData) {
        // Use standardization utilities to properly extract VIN
        // Standardize the document data to get VIN in consistent format
        const standardizedData = (0, fieldStandardization_1.standardizeVehicleData)(documentData, 'document_processing');
        // Check VIN from standardized data first
        if (standardizedData.vin && typeof standardizedData.vin === 'string' && standardizedData.vin.length >= 15) {
            const cleanedVIN = this.cleanAndValidateVIN(standardizedData.vin);
            if (cleanedVIN)
                return cleanedVIN;
        }
        // Fallback to nested extraction for complex document structures
        const vinSources = [
            documentData.extractedData?.vin,
            documentData.extractedData?.vinNumber,
            documentData.flexibleValidation?.extracted_fields?.find((f) => f.field.toLowerCase().includes('vin'))?.value,
            documentData.vin_numbers?.[0]?.value,
            documentData.vins?.[0]?.vin
        ];
        for (const vinSource of vinSources) {
            if (vinSource && typeof vinSource === 'string' && vinSource.length >= 15) {
                const cleanedVIN = this.cleanAndValidateVIN(vinSource);
                if (cleanedVIN)
                    return cleanedVIN;
            }
        }
        return null;
    }
    /**
     * Clean and validate VIN format following data consistency standards
     */
    cleanAndValidateVIN(vin) {
        if (!vin || typeof vin !== 'string')
            return null;
        // Clean and standardize VIN format
        const cleanVIN = vin.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
        // Validate VIN length (standard VIN is 17 characters, minimum 15 for legacy)
        if (cleanVIN.length >= 15 && cleanVIN.length <= 17) {
            return cleanVIN;
        }
        return null;
    }
    /**
     * Resolve primary VIN from potential alias
     */
    resolvePrimaryVIN(vin) {
        return this.vinAliases.get(vin) || vin;
    }
    /**
     * Create new vehicle record
     */
    createNewVehicleRecord(vin) {
        const now = new Date().toISOString();
        return {
            vin,
            alternativeVINs: [],
            documents: new Map(),
            documentsByType: new Map(),
            complianceHistory: new Map(),
            complianceStatus: {
                registration: { status: 'missing', lastUpdated: now, confidence: 0, warnings: [] },
                insurance: { status: 'missing', lastUpdated: now, confidence: 0, warnings: [] },
                inspection: { status: 'missing', lastUpdated: now, confidence: 0, warnings: [] },
                cdl: { status: 'missing', lastUpdated: now, confidence: 0, warnings: [] },
                medical: { status: 'missing', lastUpdated: now, confidence: 0, warnings: [] },
                overall: 'incomplete'
            },
            activeConflicts: [],
            resolvedConflicts: [],
            firstSeen: now,
            lastUpdated: now,
            documentCount: 0,
            complianceScore: 0,
            riskLevel: 'medium'
        };
    }
    /**
     * Create document record from processed data
     */
    createDocumentRecord(documentData, metadata, vin) {
        const now = new Date().toISOString();
        return {
            id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            fileName: metadata.fileName,
            documentType: this.inferDocumentType(documentData),
            extractedData: documentData,
            flexibleValidation: documentData.flexibleValidation,
            vin,
            uploadDate: metadata.uploadDate || now,
            processedDate: now,
            confidence: documentData.confidence || documentData.flexibleValidation?.confidence_score || 50,
            status: 'active',
            effectiveDate: this.extractDate(documentData, 'effective'),
            expirationDate: this.extractDate(documentData, 'expiration'),
            issueDate: this.extractDate(documentData, 'issue'),
            source: metadata.source,
            processingNotes: documentData.processingNotes || [],
            conflicts: []
        };
    }
    /**
     * Infer document type from processed data
     */
    inferDocumentType(documentData) {
        console.log('🔍 Document type inference debug:', {
            documentType: documentData.documentType,
            document_type: documentData.document_type,
            flexibleValidation: documentData.flexibleValidation,
            extractedFields: documentData.flexibleValidation?.extracted_fields,
            fileName: documentData.fileName || 'unknown',
            fullDocumentData: documentData
        });
        const docType = documentData.documentType ||
            documentData.document_type ||
            documentData.flexibleValidation?.extracted_fields?.find((f) => f.field === 'document_type')?.value ||
            'other';
        console.log('🎯 Extracted document type:', docType);
        // Map common variations to standard types
        const typeMap = {
            'vehicle_registration': 'registration',
            'auto_insurance': 'insurance',
            'commercial_drivers_license': 'cdl',
            'dot_medical': 'medical_certificate',
            'vehicle_inspection': 'inspection',
            'operating_permit': 'permit',
            // Add more variations
            'registration': 'registration',
            'insurance': 'insurance',
            'cdl': 'cdl',
            'medical': 'medical_certificate',
            'inspection': 'inspection',
            'permit': 'permit'
        };
        // Also check filename for document type clues
        const fileName = documentData.fileName || '';
        const fileNameLower = fileName.toLowerCase();
        let inferredFromFileName = null;
        if (fileNameLower.includes('registration') || fileNameLower.includes('reg')) {
            inferredFromFileName = 'registration';
        }
        else if (fileNameLower.includes('insurance')) {
            inferredFromFileName = 'insurance';
        }
        else if (fileNameLower.includes('cdl')) {
            inferredFromFileName = 'cdl';
        }
        else if (fileNameLower.includes('medical')) {
            inferredFromFileName = 'medical_certificate';
        }
        else if (fileNameLower.includes('inspection')) {
            inferredFromFileName = 'inspection';
        }
        const finalType = typeMap[docType] || inferredFromFileName || docType || 'other';
        console.log('🎯 Final document type determination:', {
            originalType: docType,
            inferredFromFileName,
            finalType,
            fileName
        });
        return finalType;
    }
    /**
     * Extract date from document data
     */
    extractDate(documentData, dateType) {
        const datePaths = {
            effective: ['effectiveDate', 'effective_date', 'startDate', 'issue_date', 'issueDate'],
            expiration: [
                'expirationDate', 'expiry', 'expiration_date', 'due_date', 'dueDate',
                'expires', 'expiresOn', 'expires_on', 'validUntil', 'valid_until',
                'endDate', 'end_date', 'renewalDate', 'renewal_date'
            ],
            issue: ['issueDate', 'issue_date', 'issuedDate', 'issued_date', 'dateIssued', 'date_issued']
        };
        console.log(`🗓️ Extracting ${dateType} date from document:`, {
            datePaths: datePaths[dateType],
            extractedData: documentData.extractedData,
            documentData: documentData,
            hasFlexibleValidation: !!documentData.flexibleValidation
        });
        const paths = datePaths[dateType] || [];
        for (const path of paths) {
            // Check multiple locations for the date
            const dateValue = documentData.extractedData?.[path] ||
                documentData[path] ||
                documentData.dates?.find((d) => d.type?.includes(dateType))?.date ||
                documentData.flexibleValidation?.extracted_fields?.find((f) => f.field === path || f.field === `${dateType}_date` || f.field === `${dateType}Date`)?.value;
            console.log(`🔍 Checking path "${path}":`, dateValue);
            if (dateValue) {
                try {
                    const parsed = new Date(dateValue);
                    if (!isNaN(parsed.getTime())) {
                        const formattedDate = parsed.toISOString().split('T')[0];
                        console.log(`✅ Found ${dateType} date: ${dateValue} -> ${formattedDate}`);
                        return formattedDate; // Return YYYY-MM-DD format
                    }
                }
                catch (e) {
                    // Continue to next path
                }
            }
        }
        return undefined;
    }
    /**
     * Add document to vehicle record
     */
    addDocumentToVehicle(vehicle, document) {
        // Add to main documents map
        vehicle.documents.set(document.id, document);
        // Add to documents by type
        if (!vehicle.documentsByType.has(document.documentType)) {
            vehicle.documentsByType.set(document.documentType, []);
        }
        vehicle.documentsByType.get(document.documentType).push(document);
        // Update vehicle info from document if missing
        if (document.extractedData) {
            if (!vehicle.make && document.extractedData.make) {
                vehicle.make = document.extractedData.make;
            }
            if (!vehicle.model && document.extractedData.model) {
                vehicle.model = document.extractedData.model;
            }
            if (!vehicle.year && document.extractedData.year) {
                vehicle.year = document.extractedData.year.toString();
            }
            if (!vehicle.licensePlate && document.extractedData.licensePlate) {
                vehicle.licensePlate = document.extractedData.licensePlate;
            }
            if (!vehicle.state && document.extractedData.state) {
                vehicle.state = document.extractedData.state;
            }
            // Extract engine information from flexible validation if available
            if (document.flexibleValidation?.engine_info) {
                const engineInfo = document.flexibleValidation.engine_info;
                if (engineInfo.confidence > 60) {
                    vehicle.engineCode = engineInfo.engineCode;
                    vehicle.engineDescription = engineInfo.engineDescription;
                    vehicle.engineConfidence = engineInfo.confidence;
                }
            }
        }
        // Update compliance history
        this.updateComplianceHistory(vehicle, document);
    }
    /**
     * Detect conflicts when adding a new document
     */
    detectConflicts(vehicle, newDocument) {
        const conflicts = [];
        // Check for duplicate document types with different expiration dates
        const existingDocsOfType = vehicle.documentsByType.get(newDocument.documentType) || [];
        existingDocsOfType.forEach(existingDoc => {
            if (existingDoc.expirationDate && newDocument.expirationDate) {
                const existingExpiry = new Date(existingDoc.expirationDate);
                const newExpiry = new Date(newDocument.expirationDate);
                if (Math.abs(existingExpiry.getTime() - newExpiry.getTime()) > 24 * 60 * 60 * 1000) { // More than 1 day difference
                    conflicts.push({
                        type: 'date_mismatch',
                        severity: 'medium',
                        description: `${newDocument.documentType} expiration dates differ: ${existingDoc.fileName} (${existingDoc.expirationDate}) vs ${newDocument.fileName} (${newDocument.expirationDate})`,
                        conflictingDocuments: [existingDoc.id, newDocument.id],
                        suggestedResolution: 'Verify which document is more recent and accurate',
                        resolved: false
                    });
                }
            }
            // Check for vehicle info inconsistencies
            if (newDocument.extractedData && existingDoc.extractedData) {
                const fieldsToCheck = ['make', 'model', 'year', 'licensePlate'];
                fieldsToCheck.forEach(field => {
                    const existingValue = existingDoc.extractedData[field];
                    const newValue = newDocument.extractedData[field];
                    if (existingValue && newValue && existingValue !== newValue) {
                        conflicts.push({
                            type: 'data_inconsistency',
                            severity: 'low',
                            description: `Vehicle ${field} mismatch: ${existingDoc.fileName} has "${existingValue}", ${newDocument.fileName} has "${newValue}"`,
                            conflictingDocuments: [existingDoc.id, newDocument.id],
                            suggestedResolution: `Use the value from the more recent or reliable document`,
                            resolved: false
                        });
                    }
                });
            }
        });
        // Add conflicts to both documents and vehicle
        conflicts.forEach(conflict => {
            newDocument.conflicts.push(conflict);
            vehicle.activeConflicts.push(conflict);
        });
        return conflicts;
    }
    /**
     * Update compliance status for vehicle
     */
    updateComplianceStatus(vehicle, document) {
        const docType = document.documentType;
        const now = new Date().toISOString();
        // Map document types to compliance categories
        const complianceMapping = {
            'registration': 'registration',
            'insurance': 'insurance',
            'inspection': 'inspection',
            'cdl': 'cdl',
            'medical_certificate': 'medical'
        };
        const complianceCategory = complianceMapping[docType];
        if (!complianceCategory)
            return;
        const compliance = vehicle.complianceStatus[complianceCategory];
        // Determine status based on expiration date
        let status = 'current';
        let daysUntilExpiry;
        if (document.expirationDate) {
            const expiry = new Date(document.expirationDate);
            const today = new Date();
            daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry < 0) {
                status = 'expired';
            }
            else if (daysUntilExpiry <= 30) {
                status = 'expires_soon';
            }
            else {
                status = 'current';
            }
        }
        else {
            status = document.confidence > 70 ? 'current' : 'under_review';
        }
        // Update compliance status
        compliance.status = status;
        compliance.currentDocument = document.id;
        compliance.expirationDate = document.expirationDate;
        compliance.daysUntilExpiry = daysUntilExpiry;
        compliance.lastUpdated = now;
        compliance.confidence = document.confidence;
        compliance.warnings = document.conflicts.map(c => c.description);
        // Update overall compliance status
        this.updateOverallComplianceStatus(vehicle);
    }
    /**
     * Update overall compliance status
     */
    updateOverallComplianceStatus(vehicle) {
        const statuses = [
            vehicle.complianceStatus.registration.status,
            vehicle.complianceStatus.insurance.status,
            vehicle.complianceStatus.inspection.status,
            vehicle.complianceStatus.cdl.status,
            vehicle.complianceStatus.medical.status
        ];
        const hasExpired = statuses.includes('expired');
        const hasExpiringSoon = statuses.includes('expires_soon');
        const hasMissing = statuses.includes('missing');
        const hasUnderReview = statuses.includes('under_review');
        const hasConflicts = vehicle.activeConflicts.length > 0;
        if (hasExpired || hasConflicts) {
            vehicle.complianceStatus.overall = 'non_compliant';
            vehicle.riskLevel = 'high';
        }
        else if (hasExpiringSoon) {
            vehicle.complianceStatus.overall = 'expires_soon';
            vehicle.riskLevel = 'medium';
        }
        else if (hasMissing || hasUnderReview) {
            vehicle.complianceStatus.overall = 'review_needed';
            vehicle.riskLevel = 'medium';
        }
        else if (statuses.every(s => s === 'current')) {
            vehicle.complianceStatus.overall = 'compliant';
            vehicle.riskLevel = 'low';
        }
        else {
            vehicle.complianceStatus.overall = 'incomplete';
            vehicle.riskLevel = 'medium';
        }
    }
    /**
     * Update compliance history
     */
    updateComplianceHistory(vehicle, document) {
        const docType = document.documentType;
        if (!vehicle.complianceHistory.has(docType)) {
            vehicle.complianceHistory.set(docType, {
                documentType: docType,
                timeline: [],
                upcomingExpirations: []
            });
        }
        const history = vehicle.complianceHistory.get(docType);
        // Add timeline entry
        history.timeline.push({
            date: document.processedDate,
            document: document.fileName,
            action: 'added',
            details: `Document processed with ${document.confidence}% confidence`
        });
        // Update current document
        history.currentDocument = document;
        // Update upcoming expirations
        if (document.expirationDate) {
            const daysUntil = Math.ceil((new Date(document.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            let urgency;
            if (daysUntil < 0)
                urgency = 'expired';
            else if (daysUntil <= 7)
                urgency = 'critical';
            else if (daysUntil <= 30)
                urgency = 'warning';
            else
                urgency = 'normal';
            history.upcomingExpirations = [{
                    document: document.fileName,
                    expirationDate: document.expirationDate,
                    daysUntilExpiry: daysUntil,
                    urgency
                }];
        }
        // Sort timeline by date
        history.timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    /**
     * Calculate compliance score
     */
    calculateComplianceScore(vehicle) {
        let totalScore = 0;
        let categories = 0;
        const complianceCategories = ['registration', 'insurance', 'inspection', 'cdl', 'medical'];
        complianceCategories.forEach(category => {
            const status = vehicle.complianceStatus[category];
            let categoryScore = 0;
            switch (status.status) {
                case 'current':
                    categoryScore = 100;
                    break;
                case 'expires_soon':
                    categoryScore = 80;
                    break;
                case 'under_review':
                    categoryScore = 60;
                    break;
                case 'invalid':
                    categoryScore = 40;
                    break;
                case 'expired':
                    categoryScore = 0;
                    break;
                case 'missing':
                    categoryScore = status.confidence > 0 ? 20 : 0;
                    break;
            }
            // Adjust for confidence
            categoryScore = categoryScore * (status.confidence / 100);
            totalScore += categoryScore;
            categories++;
        });
        vehicle.complianceScore = categories > 0 ? Math.round(totalScore / categories) : 0;
        // Update risk level based on score
        if (vehicle.complianceScore >= 90) {
            vehicle.riskLevel = 'low';
        }
        else if (vehicle.complianceScore >= 70) {
            vehicle.riskLevel = 'medium';
        }
        else if (vehicle.complianceScore >= 40) {
            vehicle.riskLevel = 'high';
        }
        else {
            vehicle.riskLevel = 'critical';
        }
    }
    /**
     * Refresh vehicle compliance status
     */
    refreshVehicleComplianceStatus(vehicle) {
        const now = new Date();
        // Check all documents for expiration status changes
        vehicle.documents.forEach(doc => {
            if (doc.expirationDate) {
                const expiry = new Date(doc.expirationDate);
                const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                // Update document status based on expiration
                if (daysUntil < 0 && doc.status === 'active') {
                    doc.status = 'superseded'; // Mark as superseded if expired
                }
            }
        });
        // Recalculate compliance status and score
        this.updateOverallComplianceStatus(vehicle);
        this.calculateComplianceScore(vehicle);
    }
    /**
     * Generate warnings for document/vehicle
     */
    generateWarnings(vehicle, document) {
        const warnings = [];
        // Low confidence warning
        if (document.confidence < 70) {
            warnings.push(`Document confidence is low (${document.confidence}%) - manual review recommended`);
        }
        // Expiration warnings
        if (document.expirationDate) {
            const daysUntil = Math.ceil((new Date(document.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntil < 0) {
                warnings.push(`Document has expired (${Math.abs(daysUntil)} days ago)`);
            }
            else if (daysUntil <= 30) {
                warnings.push(`Document expires soon (${daysUntil} days)`);
            }
        }
        // Conflict warnings
        if (document.conflicts.length > 0) {
            warnings.push(`${document.conflicts.length} conflict(s) detected with existing documents`);
        }
        // Vehicle-level warnings
        if (vehicle.activeConflicts.length > 3) {
            warnings.push(`Vehicle has ${vehicle.activeConflicts.length} active conflicts`);
        }
        if (vehicle.complianceScore < 50) {
            warnings.push(`Vehicle compliance score is low (${vehicle.complianceScore}%)`);
        }
        return warnings;
    }
}
exports.VehicleReconciler = VehicleReconciler;
// Export singleton instance
exports.vehicleReconciler = new VehicleReconciler();
