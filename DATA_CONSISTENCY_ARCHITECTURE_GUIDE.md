# Data Consistency Architecture Guide
*Multi-Layer Data Synchronization and Schema Standardization*

## Overview
This document outlines the comprehensive data consistency architecture and best practices for multi-layer applications. Developed during the implementation of synchronized data schemas across processor, storage, and frontend layers, these practices ensure data integrity, type safety, and maintainability in complex systems.

---

## Core Principles

### 1. Single Source of Truth
- **Rule**: Define all field names and types in a centralized schema file
- **Implementation**: `src/types/standardizedFields.ts` contains all interface definitions
- **Benefit**: Changes only need to be made in one place
- **Example**: All layers reference `StandardizedVehicle` interface instead of defining their own

### 2. Consistent Naming Conventions
- **Date Fields**: Always use `expirationDate` suffix (not `expiry` or `expiryDate`)
  - ✅ `registrationExpirationDate`
  - ❌ `registrationExpiry`, `regExpiry`, `registrationExpiry`
- **Status Fields**: Use full descriptive names ending in `Status` or use `status`
  - ✅ `overallComplianceStatus`, `status`
  - ❌ `overallStatus`, `complianceState`
- **ID Fields**: Use consistent patterns
  - ✅ `truckNumber` (not `vehicleNumber`, `unitNumber`)
  - ✅ `employeeId` (not `empId`, `employeeNumber`)

### 3. Type Consistency
- **Numbers vs Strings**: Be explicit about data types
  - ✅ `year: number` (always)
  - ❌ `year: string` in some places, `year: number` in others
- **Date Formats**: Standardize on ISO strings
  - ✅ `expirationDate: string` (ISO format)
  - ❌ Mixed date formats across layers

---

## Implementation Patterns

### 1. Schema Definition Pattern
```typescript
// Define comprehensive interfaces with clear field names
export interface StandardizedVehicle {
  // Primary identifiers
  id: string;
  vin: string;
  
  // Nested objects for related data
  registration?: {
    registrationNumber?: string;
    registrationState?: string;
    registrationExpirationDate?: string; // Consistent naming
    registeredOwner?: string;
  };
  
  // Metadata for tracking
  metadata: {
    dataSource: DataSource;
    lastSyncTimestamp: number;
    needsReview: boolean;
  };
}
```

### 2. Field Mapping Pattern
```typescript
// Create comprehensive mapping dictionaries
export const FIELD_MAPPINGS = {
  EXPIRATION_DATES: {
    'expiryDate': 'expirationDate',
    'expiry': 'expirationDate',
    'expires': 'expirationDate',
    'registrationExpiry': 'registrationExpirationDate'
  }
};
```

### 3. Transformation Function Pattern
```typescript
// Provide standardization functions for each data type
export function standardizeVehicleData(legacyData: any, source: DataSource): Partial<StandardizedVehicle> {
  const standardized: any = {};
  
  // Apply field name mappings
  Object.entries(legacyData).forEach(([legacyKey, value]) => {
    const standardKey = getStandardizedFieldName(legacyKey);
    const standardValue = getStandardizedFieldValue(legacyKey, value);
    standardized[standardKey] = standardValue;
  });
  
  return standardized;
}
```

### 4. Backward Compatibility Pattern
```typescript
// Handle legacy data gracefully
private standardizeVehicleRecord(record: any): VehicleRecord {
  // Transform legacy field names
  if (record.registrationExpiry && !record.registrationExpirationDate) {
    record.registrationExpirationDate = record.registrationExpiry;
    delete record.registrationExpiry;
  }
  
  // Ensure type consistency
  if (record.year && typeof record.year === 'string') {
    record.year = parseInt(record.year) || new Date().getFullYear();
  }
  
  return record as VehicleRecord;
}
```

---

## Layer-Specific Best Practices

### Processor Layer (`documentProcessor.ts`)
- **Apply standardization before returning results**
- **Maintain extraction confidence and metadata**
- **Use consistent field names in extracted data interfaces**
- **Example**:
```typescript
// Standardize field names before returning
result.vehicleData = result.vehicleData.map(vehicle => this.standardizeExtractedVehicleData(vehicle));
```

### Storage Layer (`persistentFleetStorage.ts`, `reconcilerAPI.ts`)
- **Transform legacy data when loading from storage**
- **Apply field mappings automatically**
- **Maintain backward compatibility for existing data**
- **Example**:
```typescript
getFleet(): VehicleRecord[] {
  const rawData = data ? JSON.parse(data) : [];
  // Apply field standardization to legacy data
  return rawData.map((record: any) => this.standardizeVehicleRecord(record));
}
```

### Frontend Layer (`App.tsx`)
- **Use standardized field names consistently in UI**
- **Update all references, including debugging logs**
- **Maintain user experience during field name changes**
- **Example**:
```typescript
// Use standardized field names in UI
<td title={`Registration expires: ${vehicle.registrationExpirationDate || 'Not available'}`}>
  {vehicle.registrationExpirationDate || '—'}
</td>
```

---

## Validation Best Practices

### 1. Field Name Validation
```typescript
export function validateStandardizedFields(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check date field naming
  Object.keys(data).forEach(key => {
    if (isDateField(key) && !key.endsWith('Date') && !key.endsWith('At')) {
      errors.push(`Date field '${key}' should end with 'Date' or 'At'`);
    }
  });
  
  return { isValid: errors.length === 0, errors };
}
```

### 2. Type Validation
- Ensure numbers are actually numbers
- Validate date formats are ISO strings
- Check enum values against allowed options
- Verify required fields are present

---

## Migration Strategies

### 1. Gradual Migration
- Start with schema definition
- Add transformation utilities
- Update one layer at a time
- Test each layer independently

### 2. Data Migration
- Handle existing data gracefully
- Provide automatic field name mapping
- Maintain fallbacks for missing fields
- Log transformation results for verification

### 3. Testing Strategy
- Unit tests for transformation functions
- Integration tests for cross-layer compatibility
- Regression tests for backward compatibility
- Build verification for type safety

---

## Common Pitfalls to Avoid

### 1. ❌ Inconsistent Field Names
```typescript
// Bad - different names for same concept
interface VehicleA { registrationExpiry: string; }
interface VehicleB { registrationExpirationDate: string; }
```

### 2. ❌ Type Inconsistencies
```typescript
// Bad - same field, different types
interface VehicleA { year: string; }
interface VehicleB { year: number; }
```

### 3. ❌ Missing Backward Compatibility
```typescript
// Bad - breaking existing data
function loadVehicle(data: any) {
  return data.registrationExpirationDate; // Will be undefined for legacy data
}
```

### 4. ❌ Manual Field Mapping
```typescript
// Bad - hardcoded mappings that are hard to maintain
if (oldField === 'regExpiry') {
  newField = 'registrationExpirationDate';
} else if (oldField === 'insExpiry') {
  newField = 'insuranceExpirationDate';
}
```

---

## Success Metrics

### Technical Metrics
- ✅ Zero compilation errors after standardization
- ✅ All tests pass with new field names
- ✅ No data loss during migration
- ✅ Consistent field names across all layers

### Quality Metrics
- ✅ Reduced debugging time for data sync issues
- ✅ Easier onboarding for new developers
- ✅ Simplified maintenance and updates
- ✅ Better type safety and IDE support

---

## Future Considerations

### 1. API Versioning
- Plan for external API field name changes
- Provide versioned transformation functions
- Maintain multiple schema versions if needed

### 2. Database Schema Evolution
- Consider database field name migrations
- Plan for gradual rollout strategies
- Maintain compatibility during transitions

### 3. Documentation
- Keep field name documentation up to date
- Document any exceptions or special cases
- Provide examples for common transformations

---

## Conclusion

Field standardization is crucial for maintaining data consistency across complex applications. By following these best practices, teams can:

- Eliminate data synchronization issues
- Improve code maintainability
- Ensure type safety
- Provide better developer experience
- Reduce bugs related to field name mismatches

These practices should be applied proactively in new features and retroactively when refactoring existing code.

---

*Last Updated: August 8, 2025*
*Implementation Context: Fleet Management System v2.0*
*Applicable To: Multi-layer applications with data synchronization requirements*