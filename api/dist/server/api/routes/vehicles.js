"use strict";
// Vehicles API Routes
// Standardized endpoints for vehicle management
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ApiResponseBuilder_1 = require("../core/ApiResponseBuilder");
const errorHandling_1 = require("../middleware/errorHandling");
const VehicleTransformer_1 = require("../transformers/VehicleTransformer");
const apiTypes_1 = require("../types/apiTypes");
const logger_1 = require("../../../shared/services/logger");
const mockFleetStorage_1 = require("../../../shared/services/mockFleetStorage");
const router = (0, express_1.Router)();
// Apply request context middleware to all routes
router.use(errorHandling_1.requestContext);
/**
 * GET /api/v1/vehicles
 * Get all vehicles with optional filtering and pagination
 */
router.get('/v1/vehicles', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const startTime = Date.now();
    try {
        // Parse query parameters
        const { page = 1, limit = 20, status, compliance, search, sortBy = 'truckNumber', sortOrder = 'asc' } = req.query;
        // Validate pagination parameters
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        logger_1.logger.info('Fetching vehicles list', {
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
        const allVehicles = await mockFleetStorage_1.persistentFleetStorage.getAllVehicles();
        if (!Array.isArray(allVehicles)) {
            throw errorHandling_1.ApiError.internal('Failed to retrieve vehicles from storage');
        }
        // Apply transformations and filters
        const result = VehicleTransformer_1.vehicleTransformer.transformForSearch(allVehicles, {
            status: status,
            compliance: compliance,
            search: search
        });
        // Apply sorting
        const sortedVehicles = result.vehicles.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            if (aVal === bVal)
                return 0;
            const comparison = aVal < bVal ? -1 : 1;
            return sortOrder === 'desc' ? -comparison : comparison;
        });
        // Apply pagination
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedVehicles = sortedVehicles.slice(startIndex, endIndex);
        // Build paginated response
        const response = ApiResponseBuilder_1.ApiResponseBuilder.paginated(paginatedVehicles, pageNum, limitNum, result.vehicles.length, 'Vehicles retrieved successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        // Add summary data to meta
        response.meta = {
            ...response.meta,
            summary: result.summary,
            filters: { status, compliance, search },
            sorting: { sortBy, sortOrder }
        };
        res.status(apiTypes_1.HttpStatus.OK).json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to retrieve vehicles', {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'GET /vehicles',
            requestId: context.requestId,
            userId: context.userId
        }, error);
        throw error;
    }
}));
/**
 * GET /api/v1/vehicles/:id
 * Get a specific vehicle by ID
 */
router.get('/v1/vehicles/:id', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const { id } = req.params;
    const startTime = Date.now();
    try {
        logger_1.logger.info(`Fetching vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'GET /vehicles/:id',
            requestId: context.requestId,
            userId: context.userId
        }, { vehicleId: id });
        // Get vehicle from storage
        const vehicle = await mockFleetStorage_1.persistentFleetStorage.getVehicle(id);
        if (!vehicle) {
            throw errorHandling_1.ApiError.notFound('Vehicle', id);
        }
        // Transform vehicle data
        const transformedVehicle = VehicleTransformer_1.vehicleTransformer.transform(vehicle);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success(transformedVehicle, 'Vehicle retrieved successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        res.status(apiTypes_1.HttpStatus.OK).json(response);
    }
    catch (error) {
        logger_1.logger.error(`Failed to retrieve vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'GET /vehicles/:id',
            requestId: context.requestId,
            userId: context.userId
        }, error, { vehicleId: id });
        throw error;
    }
}));
/**
 * POST /api/v1/vehicles
 * Create a new vehicle or update an existing one
 */
router.post('/v1/vehicles', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const startTime = Date.now();
    try {
        const vehicleInput = req.body;
        // Validate required fields
        if (!vehicleInput.vin || !vehicleInput.make || !vehicleInput.model ||
            !vehicleInput.year || !vehicleInput.licensePlate || !vehicleInput.truckNumber) {
            throw errorHandling_1.ApiError.validation({
                general: ['Missing required fields: vin, make, model, year, licensePlate, truckNumber']
            });
        }
        // Validate VIN format
        if (typeof vehicleInput.vin !== 'string' || vehicleInput.vin.length !== 17) {
            throw errorHandling_1.ApiError.validation({
                vin: ['VIN must be exactly 17 characters long']
            });
        }
        // Validate year
        const currentYear = new Date().getFullYear();
        if (vehicleInput.year < 1900 || vehicleInput.year > currentYear + 1) {
            throw errorHandling_1.ApiError.validation({
                year: [`Year must be between 1900 and ${currentYear + 1}`]
            });
        }
        logger_1.logger.info('Creating/updating vehicle', {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'POST /vehicles',
            requestId: context.requestId,
            userId: context.userId
        }, { vin: vehicleInput.vin, truckNumber: vehicleInput.truckNumber });
        // Check if vehicle with this VIN already exists
        const existingVehicles = await mockFleetStorage_1.persistentFleetStorage.getAllVehicles();
        const existingVehicle = existingVehicles.find((v) => v.vin === vehicleInput.vin);
        let savedVehicle;
        let isUpdate = false;
        if (existingVehicle) {
            // Update existing vehicle
            const updateData = VehicleTransformer_1.vehicleTransformer.reverseInput(vehicleInput);
            const updatedVehicle = await mockFleetStorage_1.persistentFleetStorage.updateVehicle(existingVehicle.id, updateData);
            if (!updatedVehicle) {
                return ApiResponseBuilder_1.ApiResponseBuilder.error('RESOURCE_NOT_FOUND', 'Vehicle not found', 'The requested vehicle could not be found', {
                    requestId: context.requestId,
                    httpStatus: 404
                });
            }
            savedVehicle = updatedVehicle;
            isUpdate = true;
            logger_1.logger.info('Vehicle updated successfully', {
                layer: 'api',
                component: 'VehiclesController',
                operation: 'POST /vehicles (update)',
                requestId: context.requestId,
                userId: context.userId
            }, { vehicleId: existingVehicle.id, vin: vehicleInput.vin });
        }
        else {
            // Create new vehicle
            const newVehicleData = VehicleTransformer_1.vehicleTransformer.reverseInput(vehicleInput);
            savedVehicle = await mockFleetStorage_1.persistentFleetStorage.addVehicle({
                ...newVehicleData,
                id: `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                dateAdded: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });
            logger_1.logger.info('Vehicle created successfully', {
                layer: 'api',
                component: 'VehiclesController',
                operation: 'POST /vehicles (create)',
                requestId: context.requestId,
                userId: context.userId
            }, { vehicleId: savedVehicle.id, vin: vehicleInput.vin });
        }
        // Transform response data
        const transformedVehicle = VehicleTransformer_1.vehicleTransformer.transform(savedVehicle);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success(transformedVehicle, isUpdate ? 'Vehicle updated successfully' : 'Vehicle created successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        res.status(isUpdate ? apiTypes_1.HttpStatus.OK : apiTypes_1.HttpStatus.CREATED).json(response);
    }
    catch (error) {
        logger_1.logger.error('Failed to create/update vehicle', {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'POST /vehicles',
            requestId: context.requestId,
            userId: context.userId
        }, error, { requestBody: req.body });
        throw error;
    }
}));
/**
 * PUT /api/v1/vehicles/:id
 * Update a specific vehicle
 */
router.put('/v1/vehicles/:id', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const { id } = req.params;
    const startTime = Date.now();
    try {
        const vehicleInput = req.body;
        // Validate required fields
        if (!vehicleInput.vin || !vehicleInput.make || !vehicleInput.model ||
            !vehicleInput.year || !vehicleInput.licensePlate || !vehicleInput.truckNumber) {
            throw errorHandling_1.ApiError.validation({
                general: ['Missing required fields: vin, make, model, year, licensePlate, truckNumber']
            });
        }
        logger_1.logger.info(`Updating vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'PUT /vehicles/:id',
            requestId: context.requestId,
            userId: context.userId
        }, { vehicleId: id, vin: vehicleInput.vin });
        // Check if vehicle exists
        const existingVehicle = await mockFleetStorage_1.persistentFleetStorage.getVehicle(id);
        if (!existingVehicle) {
            throw errorHandling_1.ApiError.notFound('Vehicle', id);
        }
        // Check for VIN conflicts (if VIN is being changed)
        if (existingVehicle.vin !== vehicleInput.vin) {
            const allVehicles = await mockFleetStorage_1.persistentFleetStorage.getAllVehicles();
            const vinConflict = allVehicles.find((v) => v.vin === vehicleInput.vin && v.id !== id);
            if (vinConflict) {
                throw errorHandling_1.ApiError.conflict('Vehicle', 'VIN', vehicleInput.vin);
            }
        }
        // Update vehicle
        const updateData = VehicleTransformer_1.vehicleTransformer.reverseInput(vehicleInput);
        const updatedVehicle = await mockFleetStorage_1.persistentFleetStorage.updateVehicle(id, updateData);
        if (!updatedVehicle) {
            return ApiResponseBuilder_1.ApiResponseBuilder.error('RESOURCE_NOT_FOUND', 'Vehicle not found', 'The requested vehicle could not be found', {
                requestId: context.requestId,
                httpStatus: 404
            });
        }
        // Transform response data
        const transformedVehicle = VehicleTransformer_1.vehicleTransformer.transform(updatedVehicle);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success(transformedVehicle, 'Vehicle updated successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        res.status(apiTypes_1.HttpStatus.OK).json(response);
    }
    catch (error) {
        logger_1.logger.error(`Failed to update vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'PUT /vehicles/:id',
            requestId: context.requestId,
            userId: context.userId
        }, error, { vehicleId: id, requestBody: req.body });
        throw error;
    }
}));
/**
 * DELETE /api/v1/vehicles/:id
 * Delete a specific vehicle
 */
router.delete('/v1/vehicles/:id', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const { id } = req.params;
    const startTime = Date.now();
    try {
        logger_1.logger.info(`Deleting vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'DELETE /vehicles/:id',
            requestId: context.requestId,
            userId: context.userId
        }, { vehicleId: id });
        // Check if vehicle exists
        const existingVehicle = await mockFleetStorage_1.persistentFleetStorage.getVehicle(id);
        if (!existingVehicle) {
            throw errorHandling_1.ApiError.notFound('Vehicle', id);
        }
        // Delete vehicle
        await mockFleetStorage_1.persistentFleetStorage.removeVehicle(id);
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success(null, 'Vehicle deleted successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        res.status(apiTypes_1.HttpStatus.OK).json(response);
    }
    catch (error) {
        logger_1.logger.error(`Failed to delete vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'DELETE /vehicles/:id',
            requestId: context.requestId,
            userId: context.userId
        }, error, { vehicleId: id });
        throw error;
    }
}));
/**
 * GET /api/v1/vehicles/:id/compliance
 * Get compliance status for a specific vehicle
 */
router.get('/v1/vehicles/:id/compliance', (0, errorHandling_1.asyncHandler)(async (req, res) => {
    const context = req.context;
    const { id } = req.params;
    const startTime = Date.now();
    try {
        logger_1.logger.info(`Fetching compliance for vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'GET /vehicles/:id/compliance',
            requestId: context.requestId,
            userId: context.userId
        }, { vehicleId: id });
        // Get vehicle from storage
        const vehicle = await mockFleetStorage_1.persistentFleetStorage.getVehicle(id);
        if (!vehicle) {
            throw errorHandling_1.ApiError.notFound('Vehicle', id);
        }
        // Transform vehicle to get compliance data
        const transformedVehicle = VehicleTransformer_1.vehicleTransformer.transform(vehicle);
        const compliance = transformedVehicle.compliance;
        if (!compliance) {
            throw errorHandling_1.ApiError.processing('Unable to determine compliance status');
        }
        const response = ApiResponseBuilder_1.ApiResponseBuilder.success(compliance, 'Vehicle compliance status retrieved successfully', {
            requestId: context.requestId,
            version: context.apiVersion,
            processingTime: Date.now() - startTime
        });
        res.status(apiTypes_1.HttpStatus.OK).json(response);
    }
    catch (error) {
        logger_1.logger.error(`Failed to retrieve compliance for vehicle ${id}`, {
            layer: 'api',
            component: 'VehiclesController',
            operation: 'GET /vehicles/:id/compliance',
            requestId: context.requestId,
            userId: context.userId
        }, error, { vehicleId: id });
        throw error;
    }
}));
exports.default = router;
