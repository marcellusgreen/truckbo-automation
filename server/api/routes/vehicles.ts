// Vehicles API Routes
// Standardized endpoints for vehicle management

import { Router, Request, Response } from 'express';
import { ApiResponseBuilder } from '../core/ApiResponseBuilder';
import { ApiError, asyncHandler, requestContext } from '../middleware/errorHandling';
import { vehicleTransformer, ApiVehicleInput } from '../transformers/VehicleTransformer';
import { HttpStatus, ApiErrorCode, RequestContext } from '../types/apiTypes';
import { VehicleRecord } from '../../../shared/types/vehicleTypes';
import { logger } from '../../../shared/services/logger';
import { persistentFleetStorage } from '../../../shared/services/mockFleetStorage';

const router = Router();

// Apply request context middleware to all routes
router.use(requestContext);

/**
 * GET /api/v1/vehicles
 * Get all vehicles with optional filtering and pagination
 */
router.get('/v1/vehicles', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const startTime = Date.now();
  
  try {
    // Parse query parameters
    const {
      page = 1,
      limit = 20,
      status,
      compliance,
      search,
      sortBy = 'truckNumber',
      sortOrder = 'asc'
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

    logger.info('Fetching vehicles list', {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'GET /vehicles',
      requestId: context.requestId,
      userId: context.userId
    }, {
      filters: { status, compliance, search },
      pagination: { page: pageNum, limit: limitNum },
      sorting: { sortBy, sortOrder }
    });

    // Get vehicles from storage
    const allVehicles = await persistentFleetStorage.getAllVehicles();
    
    if (!Array.isArray(allVehicles)) {
      throw ApiError.internal('Failed to retrieve vehicles from storage');
    }

    // Apply transformations and filters
    const result = vehicleTransformer.transformForSearch(allVehicles, {
      status: status as string,
      compliance: compliance as string,
      search: search as string
    });

    // Apply sorting
    const sortedVehicles = result.vehicles.sort((a, b) => {
      const aVal = (a as any)[sortBy as string];
      const bVal = (b as any)[sortBy as string];
      
      if (aVal === bVal) return 0;
      const comparison = aVal < bVal ? -1 : 1;
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedVehicles = sortedVehicles.slice(startIndex, endIndex);
    
    // Build paginated response
    const response = ApiResponseBuilder.paginated(
      paginatedVehicles,
      pageNum,
      limitNum,
      result.vehicles.length,
      'Vehicles retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    // Add summary data to meta
    response.meta = {
      ...response.meta,
      summary: result.summary,
      filters: { status, compliance, search },
      sorting: { sortBy, sortOrder }
    };

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error('Failed to retrieve vehicles', {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'GET /vehicles',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error);

    throw error;
  }
}));

/**
 * GET /api/v1/vehicles/:id
 * Get a specific vehicle by ID
 */
router.get('/v1/vehicles/:id', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    logger.info(`Fetching vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'GET /vehicles/:id',
      requestId: context.requestId,
      userId: context.userId
    }, { vehicleId: id });

    // Get vehicle from storage
    const vehicle = await persistentFleetStorage.getVehicle(id);
    
    if (!vehicle) {
      throw ApiError.notFound('Vehicle', id);
    }

    // Transform vehicle data
    const transformedVehicle = vehicleTransformer.transform(vehicle);

    const response = ApiResponseBuilder.success(
      transformedVehicle,
      'Vehicle retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to retrieve vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'GET /vehicles/:id',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { vehicleId: id });

    throw error;
  }
}));

/**
 * POST /api/v1/vehicles
 * Create a new vehicle or update an existing one
 */
router.post('/v1/vehicles', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const startTime = Date.now();

  try {
    const vehicleInput: ApiVehicleInput = req.body;

    // Validate required fields
    if (!vehicleInput.vin || !vehicleInput.make || !vehicleInput.model || 
        !vehicleInput.year || !vehicleInput.licensePlate || !vehicleInput.truckNumber) {
      throw ApiError.validation({
        general: ['Missing required fields: vin, make, model, year, licensePlate, truckNumber']
      });
    }

    // Validate VIN format
    if (typeof vehicleInput.vin !== 'string' || vehicleInput.vin.length !== 17) {
      throw ApiError.validation({
        vin: ['VIN must be exactly 17 characters long']
      });
    }

    // Validate year
    const currentYear = new Date().getFullYear();
    if (vehicleInput.year < 1900 || vehicleInput.year > currentYear + 1) {
      throw ApiError.validation({
        year: [`Year must be between 1900 and ${currentYear + 1}`]
      });
    }

    logger.info('Creating/updating vehicle', {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'POST /vehicles',
      requestId: context.requestId,
      userId: context.userId
    }, { vin: vehicleInput.vin, truckNumber: vehicleInput.truckNumber });

    // Check if vehicle with this VIN already exists
    const existingVehicles = await persistentFleetStorage.getAllVehicles();
    const existingVehicle = existingVehicles.find((v: VehicleRecord) => v.vin === vehicleInput.vin);

    let savedVehicle: VehicleRecord;
    let isUpdate = false;

    if (existingVehicle) {
      // Update existing vehicle
      const updateData = vehicleTransformer.reverseInput(vehicleInput);
      savedVehicle = await persistentFleetStorage.updateVehicle(existingVehicle.id, updateData);
      isUpdate = true;

      logger.info('Vehicle updated successfully', {
        layer: 'api',
        component: 'VehiclesController',
        operation: 'POST /vehicles (update)',
        requestId: context.requestId,
        userId: context.userId
      }, { vehicleId: existingVehicle.id, vin: vehicleInput.vin });

    } else {
      // Create new vehicle
      const newVehicleData = vehicleTransformer.reverseInput(vehicleInput);
      savedVehicle = await persistentFleetStorage.addVehicle({
        ...newVehicleData,
        id: `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dateAdded: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      } as VehicleRecord);

      logger.info('Vehicle created successfully', {
        layer: 'api',
        component: 'VehiclesController',
        operation: 'POST /vehicles (create)',
        requestId: context.requestId,
        userId: context.userId
      }, { vehicleId: savedVehicle.id, vin: vehicleInput.vin });
    }

    // Transform response data
    const transformedVehicle = vehicleTransformer.transform(savedVehicle);

    const response = ApiResponseBuilder.success(
      transformedVehicle,
      isUpdate ? 'Vehicle updated successfully' : 'Vehicle created successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(isUpdate ? HttpStatus.OK : HttpStatus.CREATED).json(response);

  } catch (error) {
    logger.error('Failed to create/update vehicle', {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'POST /vehicles',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { requestBody: req.body });

    throw error;
  }
}));

/**
 * PUT /api/v1/vehicles/:id
 * Update a specific vehicle
 */
router.put('/v1/vehicles/:id', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    const vehicleInput: ApiVehicleInput = req.body;

    // Validate required fields
    if (!vehicleInput.vin || !vehicleInput.make || !vehicleInput.model || 
        !vehicleInput.year || !vehicleInput.licensePlate || !vehicleInput.truckNumber) {
      throw ApiError.validation({
        general: ['Missing required fields: vin, make, model, year, licensePlate, truckNumber']
      });
    }

    logger.info(`Updating vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'PUT /vehicles/:id',
      requestId: context.requestId,
      userId: context.userId
    }, { vehicleId: id, vin: vehicleInput.vin });

    // Check if vehicle exists
    const existingVehicle = await persistentFleetStorage.getVehicle(id);
    if (!existingVehicle) {
      throw ApiError.notFound('Vehicle', id);
    }

    // Check for VIN conflicts (if VIN is being changed)
    if (existingVehicle.vin !== vehicleInput.vin) {
      const allVehicles = await persistentFleetStorage.getAllVehicles();
      const vinConflict = allVehicles.find((v: VehicleRecord) => 
        v.vin === vehicleInput.vin && v.id !== id
      );
      
      if (vinConflict) {
        throw ApiError.conflict('Vehicle', 'VIN', vehicleInput.vin);
      }
    }

    // Update vehicle
    const updateData = vehicleTransformer.reverseInput(vehicleInput);
    const updatedVehicle = await persistentFleetStorage.updateVehicle(id, updateData);

    // Transform response data
    const transformedVehicle = vehicleTransformer.transform(updatedVehicle);

    const response = ApiResponseBuilder.success(
      transformedVehicle,
      'Vehicle updated successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to update vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'PUT /vehicles/:id',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { vehicleId: id, requestBody: req.body });

    throw error;
  }
}));

/**
 * DELETE /api/v1/vehicles/:id
 * Delete a specific vehicle
 */
router.delete('/v1/vehicles/:id', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    logger.info(`Deleting vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'DELETE /vehicles/:id',
      requestId: context.requestId,
      userId: context.userId
    }, { vehicleId: id });

    // Check if vehicle exists
    const existingVehicle = await persistentFleetStorage.getVehicle(id);
    if (!existingVehicle) {
      throw ApiError.notFound('Vehicle', id);
    }

    // Delete vehicle
    await persistentFleetStorage.removeVehicle(id);

    const response = ApiResponseBuilder.success(
      null,
      'Vehicle deleted successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to delete vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'DELETE /vehicles/:id',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { vehicleId: id });

    throw error;
  }
}));

/**
 * GET /api/v1/vehicles/:id/compliance
 * Get compliance status for a specific vehicle
 */
router.get('/v1/vehicles/:id/compliance', asyncHandler(async (req: Request, res: Response) => {
  const context = (req as any).context as RequestContext;
  const { id } = req.params;
  const startTime = Date.now();

  try {
    logger.info(`Fetching compliance for vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'GET /vehicles/:id/compliance',
      requestId: context.requestId,
      userId: context.userId
    }, { vehicleId: id });

    // Get vehicle from storage
    const vehicle = await persistentFleetStorage.getVehicle(id);
    if (!vehicle) {
      throw ApiError.notFound('Vehicle', id);
    }

    // Transform vehicle to get compliance data
    const transformedVehicle = vehicleTransformer.transform(vehicle);
    const compliance = transformedVehicle.compliance;

    if (!compliance) {
      throw ApiError.processing('Unable to determine compliance status');
    }

    const response = ApiResponseBuilder.success(
      compliance,
      'Vehicle compliance status retrieved successfully',
      {
        requestId: context.requestId,
        version: context.apiVersion,
        processingTime: Date.now() - startTime
      }
    );

    res.status(HttpStatus.OK).json(response);

  } catch (error) {
    logger.error(`Failed to retrieve compliance for vehicle ${id}`, {
      layer: 'api',
      component: 'VehiclesController',
      operation: 'GET /vehicles/:id/compliance',
      requestId: context.requestId,
      userId: context.userId
    }, error as Error, { vehicleId: id });

    throw error;
  }
}));

export default router;