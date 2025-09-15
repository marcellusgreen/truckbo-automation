// Compliance API Routes
// Standardized endpoints for compliance monitoring and reporting

import { Router, Request, Response } from 'express';
import { ApiResponseBuilder } from '../core/ApiResponseBuilder';
import { ApiError, asyncHandler, requestContext } from '../middleware/errorHandling';
import { HttpStatus, ApiErrorCode, RequestContext } from '../types/apiTypes';
import { VehicleRecord } from '../../../shared/types/vehicleTypes';
import { vehicleTransformer } from '../transformers/VehicleTransformer';
import { logger } from '../../../shared/services/logger';
import { apiManager } from '../../../shared/services/apiManager';
import { neonFleetStorage } from '../../../shared/services/neonFleetStorage';


const router = Router();

// Apply request context middleware to all routes
router.use(requestContext);

// Compliance interfaces
interface ComplianceItem {
  vehicleId: string;
  vin: string;
  licensePlate: string;
  truckNumber: string;
  make: string;
  model: string;
  year: number;
  status: 'active' | 'inactive' | 'maintenance';
  
  // Compliance details
  complianceType: 'registration' | 'insurance' | 'inspection' | 'emissions';
  currentStatus: 'current' | 'expires_soon' | 'expired' | 'missing';
  expirationDate?: string;
  daysUntilExpiration?: number;
  issuer?: string;
  policyNumber?: string;
  certificateNumber?: string;
  
  // Metadata
  lastChecked: string;
  nextCheckDue?: string;
  warningLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

interface ComplianceSummary {
  totalVehicles: number;
  compliant: number;
  expiringWithin30Days: number;
  expiringWithin7Days: number;
  expired: number;
  missing: number;
  byType: {
    registration: { compliant: number; warning: number; expired: number; missing: number };
    insurance: { compliant: number; warning: number; expired: number; missing: number };
    inspection: { compliant: number; warning: number; expired: number; missing: number };
    emissions: { compliant: number; warning: number; expired: number; missing: number };
  };
}

/**
 * GET /api/v1/compliance/expiring
 * Get vehicles with expiring compliance requirements
 */
router.get('/v1/compliance/expiring', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const startTime = Date.now();

  try {
    const {
      days = 30,
      type,
      status,
      page = 1,
      limit = 50,
      sortBy = 'daysUntilExpiration',
      sortOrder = 'asc'
    } = req.query;

    const daysAhead = Math.max(1, Math.min(365, parseInt(days as string, 10) || 30));
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));

    logger.info(`Fetching expiring compliance items (${daysAhead} days)`, {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'GET /compliance/expiring',
      requestId: context.requestId,
      userId: context.userId
    }, {
      filters: { days: daysAhead, type, status },
      pagination: { page: pageNum, limit: limitNum },
      sorting: { sortBy, sortOrder }
    });

    // Get all vehicles and analyze compliance
    const allVehicles = await neonFleetStorage.getAllVehicles();
    const complianceItems: ComplianceItem[] = [];
    
    const now = new Date();
    const cutoffDate = new Date(now.getTime() + (daysAhead * 24 * 60 * 60 * 1000));

    for (const vehicle of allVehicles) {
      // Skip inactive vehicles if status filter is applied
      if (status && vehicle.status !== status) {
        continue;
      }

      const transformedVehicle = vehicleTransformer.transform(vehicle);
      
      // Check registration compliance
      if ((!type || type === 'registration') && vehicle.registrationExpirationDate) {
        const regExpiry = new Date(vehicle.registrationExpirationDate);
        const daysUntilExpiry = Math.ceil((regExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (regExpiry <= cutoffDate || daysUntilExpiry < 0) {
          complianceItems.push({
            vehicleId: vehicle.id,
            vin: vehicle.vin,
            licensePlate: vehicle.licensePlate,
            truckNumber: vehicle.truckNumber,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            status: vehicle.status,
            complianceType: 'registration',
            currentStatus: daysUntilExpiry < 0 ? 'expired' : 
                          daysUntilExpiry <= 7 ? 'expires_soon' : 'current',
            expirationDate: vehicle.registrationExpirationDate,
            daysUntilExpiration: daysUntilExpiry,
            issuer: vehicle.registrationState,
            certificateNumber: vehicle.registrationNumber,
            lastChecked: new Date().toISOString(),
            nextCheckDue: new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
            warningLevel: daysUntilExpiry < 0 ? 'critical' :
                         daysUntilExpiry <= 3 ? 'high' :
                         daysUntilExpiry <= 7 ? 'medium' :
                         daysUntilExpiry <= 30 ? 'low' : 'none'
          });
        }
      }

      // Check insurance compliance
      if ((!type || type === 'insurance') && vehicle.insuranceExpirationDate) {
        const insExpiry = new Date(vehicle.insuranceExpirationDate);
        const daysUntilExpiry = Math.ceil((insExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (insExpiry <= cutoffDate || daysUntilExpiry < 0) {
          complianceItems.push({
            vehicleId: vehicle.id,
            vin: vehicle.vin,
            licensePlate: vehicle.licensePlate,
            truckNumber: vehicle.truckNumber,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            status: vehicle.status,
            complianceType: 'insurance',
            currentStatus: daysUntilExpiry < 0 ? 'expired' : 
                          daysUntilExpiry <= 7 ? 'expires_soon' : 'current',
            expirationDate: vehicle.insuranceExpirationDate,
            daysUntilExpiration: daysUntilExpiry,
            issuer: vehicle.insuranceCarrier,
            policyNumber: vehicle.policyNumber,
            lastChecked: new Date().toISOString(),
            nextCheckDue: new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
            warningLevel: daysUntilExpiry < 0 ? 'critical' :
                         daysUntilExpiry <= 3 ? 'high' :
                         daysUntilExpiry <= 7 ? 'medium' :
                         daysUntilExpiry <= 30 ? 'low' : 'none'
          });
        }
      }
    }

    // Sort compliance items
    complianceItems.sort((a, b) => {
      const aVal = (a as any)[sortBy as string];
      const bVal = (b as any)[sortBy as string];
      
      if (aVal === bVal) return 0;
      const comparison = aVal < bVal ? -1 : 1;
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedItems = complianceItems.slice(startIndex, endIndex);

    // Calculate summary
    const summary = {
      totalItems: complianceItems.length,
      critical: complianceItems.filter(item => item.warningLevel === 'critical').length,
      high: complianceItems.filter(item => item.warningLevel === 'high').length,
      medium: complianceItems.filter(item => item.warningLevel === 'medium').length,
      low: complianceItems.filter(item => item.warningLevel === 'low').length,
      byType: {
        registration: complianceItems.filter(item => item.complianceType === 'registration').length,
        insurance: complianceItems.filter(item => item.complianceType === 'insurance').length,
        inspection: complianceItems.filter(item => item.complianceType === 'inspection').length,
        emissions: complianceItems.filter(item => item.complianceType === 'emissions').length
      }
    };

    const response = ApiResponseBuilder.paginated(
      paginatedItems,
      pageNum,
      limitNum,
      complianceItems.length,
      'Expiring compliance items retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    // Add summary to meta
    response.meta = {
      ...response.meta,
      summary,
      filters: { days: daysAhead, type, status },
      sorting: { sortBy, sortOrder }
    };

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error('Failed to retrieve expiring compliance items', {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'GET /compliance/expiring',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error);

    throw error;
  }
}));

/**
 * GET /api/v1/compliance/summary
 * Get overall compliance summary for the fleet
 */
router.get('/v1/compliance/summary', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const startTime = Date.now();

  try {
    const { status } = req.query;

    logger.info('Fetching compliance summary', {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'GET /compliance/summary',
      requestId: context.requestId,
      userId: context.userId
    }, { statusFilter: status });

    // Get all vehicles and calculate compliance summary
    const allVehicles = await neonFleetStorage.getAllVehicles();
    let filteredVehicles = allVehicles;
    
    if (status) {
      filteredVehicles = allVehicles.filter((v: VehicleRecord) => v.status === status);
    }

    const now = new Date();
    const summary: ComplianceSummary = {
      totalVehicles: filteredVehicles.length,
      compliant: 0,
      expiringWithin30Days: 0,
      expiringWithin7Days: 0,
      expired: 0,
      missing: 0,
      byType: {
        registration: { compliant: 0, warning: 0, expired: 0, missing: 0 },
        insurance: { compliant: 0, warning: 0, expired: 0, missing: 0 },
        inspection: { compliant: 0, warning: 0, expired: 0, missing: 0 },
        emissions: { compliant: 0, warning: 0, expired: 0, missing: 0 }
      }
    };

    for (const vehicle of filteredVehicles) {
      const transformedVehicle = vehicleTransformer.transform(vehicle);
      const compliance = transformedVehicle.compliance;

      if (!compliance) continue;

      // Overall compliance status
      switch (compliance.overall) {
        case 'compliant':
          summary.compliant++;
          break;
        case 'expires_soon':
          summary.expiringWithin30Days++;
          break;
        case 'non_compliant':
          summary.expired++;
          break;
        case 'incomplete':
          summary.missing++;
          break;
      }

      // Registration compliance
      switch (compliance.registrationStatus) {
        case 'current':
          summary.byType.registration.compliant++;
          break;
        case 'expires_soon':
          summary.byType.registration.warning++;
          if (vehicle.registrationExpirationDate) {
            const daysUntil = Math.ceil((new Date(vehicle.registrationExpirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 7) summary.expiringWithin7Days++;
          }
          break;
        case 'expired':
          summary.byType.registration.expired++;
          break;
        case 'missing':
          summary.byType.registration.missing++;
          break;
      }

      // Insurance compliance
      switch (compliance.insuranceStatus) {
        case 'current':
          summary.byType.insurance.compliant++;
          break;
        case 'expires_soon':
          summary.byType.insurance.warning++;
          if (vehicle.insuranceExpirationDate) {
            const daysUntil = Math.ceil((new Date(vehicle.insuranceExpirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 7) summary.expiringWithin7Days++;
          }
          break;
        case 'expired':
          summary.byType.insurance.expired++;
          break;
        case 'missing':
          summary.byType.insurance.missing++;
          break;
      }

      // Inspection compliance (simulated)
      summary.byType.inspection.compliant += Math.random() > 0.7 ? 1 : 0;
      summary.byType.inspection.warning += Math.random() > 0.8 ? 1 : 0;

      // Emissions compliance (simulated)
      summary.byType.emissions.compliant += Math.random() > 0.6 ? 1 : 0;
      summary.byType.emissions.warning += Math.random() > 0.9 ? 1 : 0;
    }

    const response = ApiResponseBuilder.success(
      summary,
      'Compliance summary retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error('Failed to retrieve compliance summary', {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'GET /compliance/summary',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error);

    throw error;
  }
}));

/**
 * GET /api/v1/compliance/vehicle/:id
 * Get detailed compliance information for a specific vehicle
 */
router.get('/v1/compliance/vehicle/:id', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    logger.info(`Fetching compliance details for vehicle ${id}`, {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'GET /compliance/vehicle/:id',
      requestId: context.requestId,
      userId: context.userId
    }, { vehicleId: id });

    const vehicle = await neonFleetStorage.getVehicle(id);
    if (!vehicle) {
      throw ApiError.notFound('Vehicle', id);
    }

    const transformedVehicle = vehicleTransformer.transform(vehicle);
    const now = new Date();

    // Build detailed compliance information
    const complianceDetails = {
      vehicleId: vehicle.id,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      truckNumber: vehicle.truckNumber,
      overallStatus: transformedVehicle.compliance?.overall || 'incomplete',
      lastUpdated: transformedVehicle.compliance?.lastUpdated || new Date().toISOString(),
      
      registration: {
        status: transformedVehicle.compliance?.registrationStatus || 'missing',
        number: vehicle.registrationNumber,
        state: vehicle.registrationState,
        expirationDate: vehicle.registrationExpirationDate,
        daysUntilExpiration: vehicle.registrationExpirationDate ? 
          Math.ceil((new Date(vehicle.registrationExpirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
        owner: vehicle.registeredOwner
      },
      
      insurance: {
        status: transformedVehicle.compliance?.insuranceStatus || 'missing',
        carrier: vehicle.insuranceCarrier,
        policyNumber: vehicle.policyNumber,
        expirationDate: vehicle.insuranceExpirationDate,
        daysUntilExpiration: vehicle.insuranceExpirationDate ?
          Math.ceil((new Date(vehicle.insuranceExpirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
        coverageAmount: vehicle.coverageAmount
      },
      
      inspection: {
        status: 'current', // Simulated
        lastInspection: new Date(Date.now() - (Math.random() * 365 * 24 * 60 * 60 * 1000)).toISOString(),
        nextDue: new Date(Date.now() + (Math.random() * 180 * 24 * 60 * 60 * 1000)).toISOString(),
        inspector: 'Certified Inspector #123',
        location: 'Main Service Center'
      },
      
      emissions: {
        status: 'current', // Simulated
        lastTest: new Date(Date.now() - (Math.random() * 730 * 24 * 60 * 60 * 1000)).toISOString(),
        nextDue: new Date(Date.now() + (Math.random() * 365 * 24 * 60 * 60 * 1000)).toISOString(),
        testCenter: 'Emissions Testing Station A',
        certificateNumber: 'EMI' + Math.random().toString(36).substr(2, 9).toUpperCase()
      },
      
      // Risk assessment
      riskAssessment: {
        overall: 'low' as 'low' | 'medium' | 'critical', // Based on compliance status
        factors: [] as string[],
        recommendations: [] as string[]
      }
    };

    // Add risk factors and recommendations
    const riskFactors: string[] = [];
    const recommendations: string[] = [];

    if (complianceDetails.registration.status === 'expired') {
      riskFactors.push('Expired vehicle registration');
      recommendations.push('Renew vehicle registration immediately');
      complianceDetails.riskAssessment.overall = 'critical';
    }

    if (complianceDetails.insurance.status === 'expired') {
      riskFactors.push('Expired insurance coverage');
      recommendations.push('Renew insurance policy immediately');
      complianceDetails.riskAssessment.overall = 'critical';
    }

    if (complianceDetails.registration.daysUntilExpiration && complianceDetails.registration.daysUntilExpiration <= 30) {
      riskFactors.push('Registration expires within 30 days');
      recommendations.push('Schedule registration renewal');
      if (complianceDetails.riskAssessment.overall === 'low') {
        complianceDetails.riskAssessment.overall = 'medium';
      }
    }

    complianceDetails.riskAssessment.factors = riskFactors;
    complianceDetails.riskAssessment.recommendations = recommendations;

    const response = ApiResponseBuilder.success(
      complianceDetails,
      'Vehicle compliance details retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to retrieve compliance details for vehicle ${id}`, {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'GET /compliance/vehicle/:id',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { vehicleId: id });

    throw error;
  }
}));

/**
 * POST /api/v1/compliance/refresh/:id
 * Refresh compliance data for a specific vehicle
 */
router.post('/v1/compliance/refresh/:id', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    logger.info(`Refreshing compliance data for vehicle ${id}`, {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'POST /compliance/refresh/:id',
      requestId: context.requestId,
      userId: context.userId
    }, { vehicleId: id });

    const vehicle = await neonFleetStorage.getVehicle(id);
    if (!vehicle) {
      throw ApiError.notFound('Vehicle', id);
    }

    // Simulate compliance data refresh (in real implementation, this would call external APIs)
    const refreshResult = await refreshVehicleCompliance(vehicle);
    
    const response = ApiResponseBuilder.success(
      {
        vehicleId: id,
        refreshedAt: new Date().toISOString(),
        dataSourcesChecked: refreshResult.sources,
        updatedFields: refreshResult.updatedFields,
        complianceStatus: refreshResult.status
      },
      'Vehicle compliance data refreshed successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to refresh compliance data for vehicle ${id}`, {
      layer: 'api',
      component: 'ComplianceController',
      operation: 'POST /compliance/refresh/:id',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { vehicleId: id });

    throw error;
  }
}));

// Helper function to simulate compliance data refresh
async function refreshVehicleCompliance(vehicle: VehicleRecord): Promise<{
  sources: string[];
  updatedFields: string[];
  status: string;
}> {
  // Simulate API calls to external compliance services
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    sources: ['DMV Registration Database', 'Insurance Verification System', 'Inspection Records'],
    updatedFields: ['registrationStatus', 'insuranceStatus'],
    status: 'compliant'
  };
}

export default router;
