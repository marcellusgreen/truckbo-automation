// OpenAPI Documentation Generator
// Generates comprehensive API documentation in OpenAPI 3.0 format

import { ApiVersion } from '../types/apiTypes';

export const generateOpenApiSpec = (version: ApiVersion = 'v1') => {
  return {
    openapi: '3.0.3',
    info: {
      title: 'TruckBo Automation API',
      description: `
# TruckBo Automation API

A standardized REST API for vehicle fleet management and compliance monitoring.

## Features

- **Consistent Response Format**: All endpoints return responses in a standardized format
- **Comprehensive Error Handling**: Detailed error information with user-friendly messages
- **Data Transformation**: Clean data mapping between database and API formats
- **API Versioning**: Support for multiple API versions with backward compatibility
- **Rate Limiting**: Built-in protection against abuse
- **Request Logging**: Complete audit trail of all API requests
- **Health Monitoring**: Real-time API health and metrics

## Authentication

Currently, the API does not require authentication. In production, this would include:
- JWT token-based authentication
- Role-based access control (RBAC)
- API key management
- OAuth 2.0 integration

## Response Format

All API responses follow this consistent structure:

### Success Response
\`\`\`json
{
  "status": "success",
  "message": "Human readable success message",
  "data": { /* Response data */ },
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "v1",
  "requestId": "req_1704110400000_abc123",
  "meta": {
    "processingTime": 150
  }
}
\`\`\`

### Error Response
\`\`\`json
{
  "status": "error",
  "message": "Error message for developers",
  "data": null,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "v1",
  "requestId": "req_1704110400000_abc123",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Detailed error description",
    "userMessage": "User-friendly error message",
    "details": {
      "validation": {
        "vin": ["VIN must be exactly 17 characters"]
      }
    }
  }
}
\`\`\`

## Rate Limiting

- **Global Limit**: 1000 requests per 15-minute window per IP
- **API-specific Limits**: Vary by endpoint complexity
- Headers included in responses:
  - \`X-RateLimit-Limit\`: Request limit
  - \`X-RateLimit-Remaining\`: Remaining requests
  - \`X-RateLimit-Reset\`: Reset timestamp

## Error Codes

Standard error codes used across all endpoints:

- **VALIDATION_ERROR**: Invalid input data
- **NOT_FOUND**: Requested resource not found
- **DUPLICATE_RECORD**: Resource already exists
- **PROCESSING_FAILED**: Server-side processing error
- **RATE_LIMITED**: Too many requests
- **INTERNAL_ERROR**: Unexpected server error
      `,
      version: version === 'v1' ? '1.0.0' : '2.0.0',
      contact: {
        name: 'TruckBo API Support',
        email: 'api-support@truckbo.com',
        url: 'https://truckbo.com/support'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:3001/api/${version}`,
        description: 'Development server'
      },
      {
        url: `https://api.truckbo.com/${version}`,
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Vehicles',
        description: 'Vehicle fleet management operations'
      },
      {
        name: 'Documents',
        description: 'Document processing and OCR operations'
      },
      {
        name: 'Compliance',
        description: 'Compliance monitoring and reporting'
      },
      {
        name: 'System',
        description: 'System health and status endpoints'
      }
    ],
    paths: {
      '/vehicles': {
        get: {
          tags: ['Vehicles'],
          summary: 'List vehicles',
          description: 'Retrieve a paginated list of vehicles with optional filtering',
          parameters: [
            {
              name: 'page',
              in: 'query',
              description: 'Page number (1-based)',
              required: false,
              schema: { type: 'integer', minimum: 1, default: 1 }
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Items per page',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
            },
            {
              name: 'status',
              in: 'query',
              description: 'Filter by vehicle status',
              required: false,
              schema: { type: 'string', enum: ['active', 'inactive', 'maintenance'] }
            },
            {
              name: 'compliance',
              in: 'query',
              description: 'Filter by compliance status',
              required: false,
              schema: { type: 'string', enum: ['compliant', 'non_compliant', 'expires_soon', 'incomplete'] }
            },
            {
              name: 'search',
              in: 'query',
              description: 'Search term for VIN, make, model, license plate, or truck number',
              required: false,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Successful response with vehicle list',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VehicleListResponse' }
                }
              }
            },
            '400': {
              description: 'Bad request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            }
          }
        },
        post: {
          tags: ['Vehicles'],
          summary: 'Create or update vehicle',
          description: 'Create a new vehicle or update an existing one based on VIN',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VehicleInput' }
              }
            }
          },
          responses: {
            '200': {
              description: 'Vehicle updated successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VehicleResponse' }
                }
              }
            },
            '201': {
              description: 'Vehicle created successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VehicleResponse' }
                }
              }
            },
            '422': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ValidationErrorResponse' }
                }
              }
            }
          }
        }
      },
      '/vehicles/{id}': {
        get: {
          tags: ['Vehicles'],
          summary: 'Get vehicle by ID',
          description: 'Retrieve detailed information about a specific vehicle',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Vehicle ID',
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VehicleResponse' }
                }
              }
            },
            '404': {
              description: 'Vehicle not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            }
          }
        },
        put: {
          tags: ['Vehicles'],
          summary: 'Update vehicle',
          description: 'Update an existing vehicle',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Vehicle ID',
              schema: { type: 'string' }
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VehicleInput' }
              }
            }
          },
          responses: {
            '200': {
              description: 'Vehicle updated successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VehicleResponse' }
                }
              }
            },
            '404': {
              description: 'Vehicle not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            }
          }
        },
        delete: {
          tags: ['Vehicles'],
          summary: 'Delete vehicle',
          description: 'Delete a specific vehicle',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Vehicle ID',
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Vehicle deleted successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessResponse' }
                }
              }
            },
            '404': {
              description: 'Vehicle not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            }
          }
        }
      },
      '/documents/process': {
        post: {
          tags: ['Documents'],
          summary: 'Process documents',
          description: 'Upload and process documents for data extraction using OCR and AI',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    documents: {
                      type: 'array',
                      items: {
                        type: 'string',
                        format: 'binary'
                      },
                      description: 'Document files to process (PDF, JPEG, PNG, TIFF)',
                      maxItems: 10
                    }
                  },
                  required: ['documents']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Documents processed successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DocumentProcessingResponse' }
                }
              }
            },
            '400': {
              description: 'Invalid request or unsupported file type',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            }
          }
        }
      },
      '/compliance/expiring': {
        get: {
          tags: ['Compliance'],
          summary: 'Get expiring compliance',
          description: 'Retrieve vehicles with compliance requirements expiring within a specified timeframe',
          parameters: [
            {
              name: 'days',
              in: 'query',
              description: 'Number of days ahead to check for expiring compliance',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 365, default: 30 }
            },
            {
              name: 'type',
              in: 'query',
              description: 'Filter by compliance type',
              required: false,
              schema: { type: 'string', enum: ['registration', 'insurance', 'inspection', 'emissions'] }
            }
          ],
          responses: {
            '200': {
              description: 'Expiring compliance items retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ComplianceExpiringResponse' }
                }
              }
            }
          }
        }
      },
      '/compliance/summary': {
        get: {
          tags: ['Compliance'],
          summary: 'Get compliance summary',
          description: 'Retrieve overall compliance summary statistics for the fleet',
          responses: {
            '200': {
              description: 'Compliance summary retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ComplianceSummaryResponse' }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        BaseResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['success', 'error', 'warning'],
              description: 'Response status'
            },
            message: {
              type: 'string',
              description: 'Human readable message'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp in ISO 8601 format'
            },
            version: {
              type: 'string',
              enum: ['v1', 'v2'],
              description: 'API version'
            },
            requestId: {
              type: 'string',
              description: 'Unique request identifier'
            },
            meta: {
              type: 'object',
              properties: {
                processingTime: {
                  type: 'integer',
                  description: 'Processing time in milliseconds'
                }
              }
            }
          },
          required: ['status', 'message', 'timestamp', 'version', 'requestId']
        },
        SuccessResponse: {
          allOf: [
            { $ref: '#/components/schemas/BaseResponse' },
            {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['success']
                },
                data: {
                  description: 'Response data'
                }
              }
            }
          ]
        },
        ErrorResponse: {
          allOf: [
            { $ref: '#/components/schemas/BaseResponse' },
            {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['error']
                },
                data: {
                  type: 'null'
                },
                error: {
                  type: 'object',
                  properties: {
                    code: {
                      type: 'string',
                      description: 'Error code for programmatic handling'
                    },
                    message: {
                      type: 'string',
                      description: 'Detailed error message for developers'
                    },
                    userMessage: {
                      type: 'string',
                      description: 'User-friendly error message'
                    },
                    details: {
                      type: 'object',
                      description: 'Additional error context'
                    }
                  },
                  required: ['code', 'message', 'userMessage']
                }
              },
              required: ['error']
            }
          ]
        },
        ValidationErrorResponse: {
          allOf: [
            { $ref: '#/components/schemas/ErrorResponse' },
            {
              type: 'object',
              properties: {
                error: {
                  type: 'object',
                  properties: {
                    code: {
                      type: 'string',
                      enum: ['VALIDATION_ERROR']
                    },
                    details: {
                      type: 'object',
                      properties: {
                        validation: {
                          type: 'object',
                          additionalProperties: {
                            type: 'array',
                            items: { type: 'string' }
                          },
                          description: 'Field-specific validation errors'
                        }
                      }
                    }
                  }
                }
              }
            }
          ]
        },
        Vehicle: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique vehicle identifier' },
            vin: { type: 'string', minLength: 17, maxLength: 17, description: '17-character VIN' },
            make: { type: 'string', description: 'Vehicle make' },
            model: { type: 'string', description: 'Vehicle model' },
            year: { type: 'integer', minimum: 1900, description: 'Vehicle year' },
            licensePlate: { type: 'string', description: 'License plate number' },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'maintenance'],
              description: 'Current vehicle status'
            },
            truckNumber: { type: 'string', description: 'Internal truck number' },
            dotNumber: { type: 'string', description: 'DOT number if applicable' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            registration: {
              type: 'object',
              properties: {
                number: { type: 'string' },
                state: { type: 'string' },
                expirationDate: { type: 'string', format: 'date-time' },
                registeredOwner: { type: 'string' }
              }
            },
            insurance: {
              type: 'object',
              properties: {
                carrier: { type: 'string' },
                policyNumber: { type: 'string' },
                expirationDate: { type: 'string', format: 'date-time' },
                coverageAmount: { type: 'number' }
              }
            },
            compliance: {
              type: 'object',
              properties: {
                overall: {
                  type: 'string',
                  enum: ['compliant', 'non_compliant', 'expires_soon', 'review_needed', 'incomplete']
                },
                registrationStatus: {
                  type: 'string',
                  enum: ['current', 'expires_soon', 'expired', 'missing']
                },
                insuranceStatus: {
                  type: 'string',
                  enum: ['current', 'expires_soon', 'expired', 'missing']
                },
                lastUpdated: { type: 'string', format: 'date-time' }
              }
            }
          },
          required: ['id', 'vin', 'make', 'model', 'year', 'licensePlate', 'status', 'truckNumber']
        },
        VehicleInput: {
          type: 'object',
          properties: {
            vin: { type: 'string', minLength: 17, maxLength: 17 },
            make: { type: 'string' },
            model: { type: 'string' },
            year: { type: 'integer', minimum: 1900 },
            licensePlate: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'maintenance'] },
            truckNumber: { type: 'string' },
            dotNumber: { type: 'string' },
            registration: {
              type: 'object',
              properties: {
                number: { type: 'string' },
                state: { type: 'string' },
                expirationDate: { type: 'string', format: 'date' },
                registeredOwner: { type: 'string' }
              }
            },
            insurance: {
              type: 'object',
              properties: {
                carrier: { type: 'string' },
                policyNumber: { type: 'string' },
                expirationDate: { type: 'string', format: 'date' },
                coverageAmount: { type: 'number' }
              }
            }
          },
          required: ['vin', 'make', 'model', 'year', 'licensePlate', 'truckNumber']
        },
        VehicleResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/Vehicle' }
              }
            }
          ]
        },
        VehicleListResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Vehicle' }
                },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                    pages: { type: 'integer' },
                    hasNext: { type: 'boolean' },
                    hasPrev: { type: 'boolean' }
                  }
                }
              }
            }
          ]
        },
        DocumentProcessingResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          documentId: { type: 'string' },
                          fileName: { type: 'string' },
                          status: { type: 'string', enum: ['processed', 'processing', 'failed'] },
                          confidence: { type: 'number', minimum: 0, maximum: 100 },
                          extractedData: { type: 'object' }
                        }
                      }
                    },
                    summary: {
                      type: 'object',
                      properties: {
                        totalDocuments: { type: 'integer' },
                        successfullyProcessed: { type: 'integer' },
                        failed: { type: 'integer' }
                      }
                    }
                  }
                }
              }
            }
          ]
        },
        ComplianceExpiringResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      vehicleId: { type: 'string' },
                      vin: { type: 'string' },
                      complianceType: { type: 'string', enum: ['registration', 'insurance', 'inspection', 'emissions'] },
                      currentStatus: { type: 'string', enum: ['current', 'expires_soon', 'expired', 'missing'] },
                      daysUntilExpiration: { type: 'integer' },
                      warningLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'critical'] }
                    }
                  }
                }
              }
            }
          ]
        },
        ComplianceSummaryResponse: {
          allOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    totalVehicles: { type: 'integer' },
                    compliant: { type: 'integer' },
                    expiringWithin30Days: { type: 'integer' },
                    expiringWithin7Days: { type: 'integer' },
                    expired: { type: 'integer' },
                    missing: { type: 'integer' }
                  }
                }
              }
            }
          ]
        }
      }
    }
  };
};

export default generateOpenApiSpec;