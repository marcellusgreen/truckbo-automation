/**
 * Status Mapping Utilities
 * Simplifies complex status conversions between different data systems
 * **MEDIUM PRIORITY FIX: Centralized status mapping logic**
 */

// ===== TYPE DEFINITIONS =====

export type ComplianceStatus = 
  | 'compliant' 
  | 'non_compliant' 
  | 'expires_soon' 
  | 'review_needed' 
  | 'incomplete'
  | 'missing'
  | 'under_review'
  | 'invalid'
  | 'expired'
  | 'current';

export type VehicleDisplayStatus = 'active' | 'inactive' | 'maintenance';

export type ComplianceDisplayStatus = 'active' | 'warning' | 'expired';

export type UrgencyLevel = 'expired' | 'critical' | 'warning' | 'normal';

// ===== MAPPING FUNCTIONS =====

/**
 * Convert compliance status to vehicle display status
 * Used in fleet table and vehicle cards
 */
export const mapComplianceToVehicleStatus = (complianceStatus?: string | null): VehicleDisplayStatus => {
  if (!complianceStatus) return 'active';
  
  switch (complianceStatus.toLowerCase()) {
    case 'compliant':
    case 'expires_soon':
    case 'current':
    case 'review_needed':
      return 'active';
      
    case 'non_compliant':
    case 'expired':
    case 'invalid':
      return 'inactive';
      
    case 'incomplete':
    case 'missing':
    case 'under_review':
      return 'maintenance';
      
    default:
      console.warn(`Unknown compliance status: ${complianceStatus}, defaulting to active`);
      return 'active';
  }
};

/**
 * Convert compliance status to display status for UI components
 * Used for color coding and icons
 */
export const mapComplianceToDisplayStatus = (complianceStatus?: string | null): ComplianceDisplayStatus => {
  if (!complianceStatus) return 'warning';
  
  switch (complianceStatus.toLowerCase()) {
    case 'compliant':
    case 'current':
      return 'active';
      
    case 'expires_soon':
    case 'review_needed':
    case 'incomplete':
    case 'under_review':
      return 'warning';
      
    case 'non_compliant':
    case 'expired':
    case 'invalid':
    case 'missing':
      return 'expired';
      
    default:
      console.warn(`Unknown compliance status: ${complianceStatus}, defaulting to warning`);
      return 'warning';
  }
};

/**
 * Determine urgency level based on days until expiry
 * Used for document expiration warnings
 */
export const mapDaysToUrgency = (daysUntilExpiry?: number | null): UrgencyLevel => {
  if (daysUntilExpiry === null || daysUntilExpiry === undefined) return 'normal';
  
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 7) return 'critical';
  if (daysUntilExpiry <= 30) return 'warning';
  return 'normal';
};

/**
 * Get human-readable status label
 * Used for displaying status text to users
 */
export const getStatusLabel = (status: ComplianceStatus | VehicleDisplayStatus): string => {
  const labels: Record<string, string> = {
    // Compliance statuses
    'compliant': 'Compliant',
    'non_compliant': 'Non-Compliant',
    'expires_soon': 'Expires Soon',
    'review_needed': 'Needs Review',
    'incomplete': 'Incomplete',
    'missing': 'Missing',
    'under_review': 'Under Review',
    'invalid': 'Invalid',
    'expired': 'Expired',
    'current': 'Current',
    
    // Vehicle display statuses
    'active': 'Active',
    'inactive': 'Inactive', 
    'maintenance': 'Maintenance',
    
    // Display statuses
    'warning': 'Warning'
  };
  
  return labels[status.toLowerCase()] || status;
};

/**
 * Get status color class for Tailwind CSS
 * Used for consistent color coding across the UI
 */
export const getStatusColorClass = (status: ComplianceDisplayStatus): string => {
  const colorClasses = {
    'active': 'text-green-600 bg-green-100',
    'warning': 'text-yellow-600 bg-yellow-100', 
    'expired': 'text-red-600 bg-red-100'
  };
  
  return colorClasses[status];
};

/**
 * Get urgency color class for Tailwind CSS
 * Used for expiration warnings and alerts
 */
export const getUrgencyColorClass = (urgency: UrgencyLevel): string => {
  const urgencyColors = {
    'normal': 'text-green-600 bg-green-100',
    'warning': 'text-yellow-600 bg-yellow-100',
    'critical': 'text-orange-600 bg-orange-100',
    'expired': 'text-red-600 bg-red-100'
  };
  
  return urgencyColors[urgency];
};

// ===== UTILITY FUNCTIONS =====

/**
 * Safe status conversion with fallback
 * Handles null/undefined values gracefully
 */
export const safeStatusMap = <T extends string>(
  status: string | null | undefined,
  mapping: Record<string, T>,
  fallback: T
): T => {
  if (!status) return fallback;
  
  const lowercaseStatus = status.toLowerCase();
  return mapping[lowercaseStatus] || fallback;
};

/**
 * Validate if a status is a known compliance status
 * Used for input validation and error checking
 */
export const isValidComplianceStatus = (status: string): status is ComplianceStatus => {
  const validStatuses: ComplianceStatus[] = [
    'compliant', 'non_compliant', 'expires_soon', 'review_needed', 
    'incomplete', 'missing', 'under_review', 'invalid', 'expired', 'current'
  ];
  
  return validStatuses.includes(status as ComplianceStatus);
};

/**
 * Convert multiple statuses for bulk operations
 * Used when processing arrays of vehicles or documents
 */
export const mapMultipleStatuses = <T>(
  statuses: (string | null | undefined)[],
  mapper: (status: string | null | undefined) => T
): T[] => {
  return statuses.map(status => mapper(status));
};

// ===== DEFAULT EXPORTS =====
export default {
  mapComplianceToVehicleStatus,
  mapComplianceToDisplayStatus,
  mapDaysToUrgency,
  getStatusLabel,
  getStatusColorClass,
  getUrgencyColorClass,
  safeStatusMap,
  isValidComplianceStatus,
  mapMultipleStatuses
};