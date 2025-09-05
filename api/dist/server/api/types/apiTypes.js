"use strict";
// Standardized API Types and Response Formats
// Provides consistent structure for all API responses and error handling
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiErrorCode = exports.HttpStatus = void 0;
// Standard HTTP Status Codes
var HttpStatus;
(function (HttpStatus) {
    // Success
    HttpStatus[HttpStatus["OK"] = 200] = "OK";
    HttpStatus[HttpStatus["CREATED"] = 201] = "CREATED";
    HttpStatus[HttpStatus["NO_CONTENT"] = 204] = "NO_CONTENT";
    // Client Errors
    HttpStatus[HttpStatus["BAD_REQUEST"] = 400] = "BAD_REQUEST";
    HttpStatus[HttpStatus["UNAUTHORIZED"] = 401] = "UNAUTHORIZED";
    HttpStatus[HttpStatus["FORBIDDEN"] = 403] = "FORBIDDEN";
    HttpStatus[HttpStatus["NOT_FOUND"] = 404] = "NOT_FOUND";
    HttpStatus[HttpStatus["METHOD_NOT_ALLOWED"] = 405] = "METHOD_NOT_ALLOWED";
    HttpStatus[HttpStatus["CONFLICT"] = 409] = "CONFLICT";
    HttpStatus[HttpStatus["UNPROCESSABLE_ENTITY"] = 422] = "UNPROCESSABLE_ENTITY";
    HttpStatus[HttpStatus["TOO_MANY_REQUESTS"] = 429] = "TOO_MANY_REQUESTS";
    // Server Errors
    HttpStatus[HttpStatus["INTERNAL_SERVER_ERROR"] = 500] = "INTERNAL_SERVER_ERROR";
    HttpStatus[HttpStatus["NOT_IMPLEMENTED"] = 501] = "NOT_IMPLEMENTED";
    HttpStatus[HttpStatus["BAD_GATEWAY"] = 502] = "BAD_GATEWAY";
    HttpStatus[HttpStatus["SERVICE_UNAVAILABLE"] = 503] = "SERVICE_UNAVAILABLE";
    HttpStatus[HttpStatus["GATEWAY_TIMEOUT"] = 504] = "GATEWAY_TIMEOUT";
})(HttpStatus || (exports.HttpStatus = HttpStatus = {}));
// Standard Error Codes
var ApiErrorCode;
(function (ApiErrorCode) {
    // Generic Errors
    ApiErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ApiErrorCode["INVALID_REQUEST"] = "INVALID_REQUEST";
    ApiErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ApiErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ApiErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ApiErrorCode["CONFLICT"] = "CONFLICT";
    ApiErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    // Validation Errors
    ApiErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ApiErrorCode["MISSING_REQUIRED_FIELD"] = "MISSING_REQUIRED_FIELD";
    ApiErrorCode["INVALID_FORMAT"] = "INVALID_FORMAT";
    ApiErrorCode["INVALID_VALUE"] = "INVALID_VALUE";
    // Business Logic Errors
    ApiErrorCode["DUPLICATE_RECORD"] = "DUPLICATE_RECORD";
    ApiErrorCode["INSUFFICIENT_PERMISSIONS"] = "INSUFFICIENT_PERMISSIONS";
    ApiErrorCode["RESOURCE_LOCKED"] = "RESOURCE_LOCKED";
    ApiErrorCode["BUSINESS_RULE_VIOLATION"] = "BUSINESS_RULE_VIOLATION";
    // Processing Errors
    ApiErrorCode["PROCESSING_FAILED"] = "PROCESSING_FAILED";
    ApiErrorCode["TIMEOUT"] = "TIMEOUT";
    ApiErrorCode["EXTERNAL_SERVICE_ERROR"] = "EXTERNAL_SERVICE_ERROR";
    ApiErrorCode["STORAGE_ERROR"] = "STORAGE_ERROR";
    // Document Processing Errors
    ApiErrorCode["INVALID_DOCUMENT"] = "INVALID_DOCUMENT";
    ApiErrorCode["DOCUMENT_PROCESSING_FAILED"] = "DOCUMENT_PROCESSING_FAILED";
    ApiErrorCode["UNSUPPORTED_DOCUMENT_TYPE"] = "UNSUPPORTED_DOCUMENT_TYPE";
    ApiErrorCode["DOCUMENT_TOO_LARGE"] = "DOCUMENT_TOO_LARGE";
    ApiErrorCode["OCR_FAILED"] = "OCR_FAILED";
    // Vehicle/Fleet Errors
    ApiErrorCode["VEHICLE_NOT_FOUND"] = "VEHICLE_NOT_FOUND";
    ApiErrorCode["VIN_ALREADY_EXISTS"] = "VIN_ALREADY_EXISTS";
    ApiErrorCode["INVALID_VIN"] = "INVALID_VIN";
    ApiErrorCode["COMPLIANCE_CHECK_FAILED"] = "COMPLIANCE_CHECK_FAILED";
    // Driver Errors
    ApiErrorCode["DRIVER_NOT_FOUND"] = "DRIVER_NOT_FOUND";
    ApiErrorCode["CDL_VALIDATION_FAILED"] = "CDL_VALIDATION_FAILED";
    ApiErrorCode["MEDICAL_CERT_EXPIRED"] = "MEDICAL_CERT_EXPIRED";
})(ApiErrorCode || (exports.ApiErrorCode = ApiErrorCode = {}));
