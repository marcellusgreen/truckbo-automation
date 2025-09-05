"use strict";
// Vehicle Storage Service - Environment Agnostic
// Core vehicle data storage types and utilities
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceCalculator = exports.VehicleUtils = void 0;
const logger_1 = require("./logger");
/**
 * Utility functions for vehicle data validation and manipulation
 */
class VehicleUtils {
    static validateVIN(vin) {
        if (!vin || vin.length !== 17)
            return false;
        // Basic VIN validation - no I, O, or Q characters
        const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/;
        return vinRegex.test(vin);
    }
    static formatLicensePlate(plate) {
        return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    static isExpired(dateString) {
        if (!dateString)
            return false;
        const expiryDate = new Date(dateString);
        const today = new Date();
        return expiryDate < today;
    }
    static isExpiringWithin(dateString, days = 30) {
        if (!dateString)
            return false;
        const expiryDate = new Date(dateString);
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() + days);
        return expiryDate <= checkDate && expiryDate >= new Date();
    }
    static generateId() {
        return `vehicle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    static generateDriverId() {
        return `driver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.VehicleUtils = VehicleUtils;
/**
 * Vehicle compliance status calculator
 */
class ComplianceCalculator {
    static calculateComplianceStatus(vehicle) {
        const context = {
            layer: 'storage',
            component: 'ComplianceCalculator',
            operation: 'calculateComplianceStatus'
        };
        try {
            // Check registration expiration
            if (VehicleUtils.isExpired(vehicle.registrationExpirationDate)) {
                logger_1.logger.debug('Vehicle registration expired', context, {
                    vehicleId: vehicle.id,
                    expirationDate: vehicle.registrationExpirationDate
                });
                return 'expired';
            }
            // Check insurance expiration
            if (VehicleUtils.isExpired(vehicle.insuranceExpirationDate)) {
                logger_1.logger.debug('Vehicle insurance expired', context, {
                    vehicleId: vehicle.id,
                    expirationDate: vehicle.insuranceExpirationDate
                });
                return 'expired';
            }
            // Check for upcoming expirations
            const hasUpcomingExpirations = VehicleUtils.isExpiringWithin(vehicle.registrationExpirationDate, 30) ||
                VehicleUtils.isExpiringWithin(vehicle.insuranceExpirationDate, 30);
            if (hasUpcomingExpirations) {
                logger_1.logger.debug('Vehicle has upcoming expirations', context, {
                    vehicleId: vehicle.id,
                    registrationExpiry: vehicle.registrationExpirationDate,
                    insuranceExpiry: vehicle.insuranceExpirationDate
                });
                return 'warning';
            }
            // Check if essential data is missing
            if (!vehicle.registrationExpirationDate || !vehicle.insuranceExpirationDate) {
                logger_1.logger.debug('Vehicle missing essential compliance data', context, {
                    vehicleId: vehicle.id
                });
                return 'unknown';
            }
            return 'compliant';
        }
        catch (error) {
            logger_1.logger.error('Error calculating compliance status', context, error, {
                vehicleId: vehicle.id
            });
            return 'unknown';
        }
    }
}
exports.ComplianceCalculator = ComplianceCalculator;
