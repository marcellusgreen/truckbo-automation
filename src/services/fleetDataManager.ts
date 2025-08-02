import { FleetVehicle, ProcessedVehicle, ComplianceTask, FleetStats, ComplianceStats } from '../types';
import { 
  DEFAULT_MILEAGE_MIN, 
  DEFAULT_MILEAGE_MAX, 
  DOT_NUMBER_MIN, 
  DOT_NUMBER_MAX, 
  MC_NUMBER_MIN, 
  MC_NUMBER_MAX, 
  LICENSE_PLATE_PREFIX,
  DEFAULT_COMPLIANCE_EXPIRY,
  DEFAULT_COMPLIANCE_DAYS,
  ID_SUFFIX_LENGTH
} from '../constants';

export class FleetDataManager {
  private vehicles: FleetVehicle[] = [];
  private complianceTasks: ComplianceTask[] = [];
  private subscribers: (() => void)[] = [];

  constructor() {
    // Initialize with empty arrays - no mock data
  }

  subscribe(callback: () => void) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notify() {
    this.subscribers.forEach(callback => callback());
  }

  getAllVehicles(): FleetVehicle[] {
    return [...this.vehicles];
  }

  getAllComplianceTasks(): ComplianceTask[] {
    return [...this.complianceTasks];
  }

  addVehicles(processedVehicles: ProcessedVehicle[]): FleetVehicle[] {
    const newVehicles: FleetVehicle[] = processedVehicles
      .filter(v => v.status === 'success')
      .map(vehicle => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, ID_SUFFIX_LENGTH),
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        licensePlate: `${LICENSE_PLATE_PREFIX}-${vehicle.vin.slice(-3)}`,
        status: 'active' as const,
        mileage: Math.floor(Math.random() * (DEFAULT_MILEAGE_MAX - DEFAULT_MILEAGE_MIN)) + DEFAULT_MILEAGE_MIN,
        fuelType: vehicle.fuelType,
        maxWeight: vehicle.maxWeight,
        vehicleClass: vehicle.vehicleClass,
        dotNumber: `DOT${Math.floor(Math.random() * (DOT_NUMBER_MAX - DOT_NUMBER_MIN)) + DOT_NUMBER_MIN}`,
        mcNumber: `MC${Math.floor(Math.random() * (MC_NUMBER_MAX - MC_NUMBER_MIN)) + MC_NUMBER_MIN}`,
        purchaseDate: new Date().toISOString().split('T')[0],
        compliance: {
          dotInspection: { status: 'compliant', expiryDate: DEFAULT_COMPLIANCE_EXPIRY.DOT_INSPECTION, daysUntilExpiry: DEFAULT_COMPLIANCE_DAYS.DOT_INSPECTION },
          registration: { status: 'compliant', expiryDate: DEFAULT_COMPLIANCE_EXPIRY.REGISTRATION, daysUntilExpiry: DEFAULT_COMPLIANCE_DAYS.REGISTRATION },
          insurance: { status: 'compliant', expiryDate: DEFAULT_COMPLIANCE_EXPIRY.INSURANCE, daysUntilExpiry: DEFAULT_COMPLIANCE_DAYS.INSURANCE },
          ifta: { status: 'compliant', expiryDate: DEFAULT_COMPLIANCE_EXPIRY.IFTA, daysUntilExpiry: DEFAULT_COMPLIANCE_DAYS.IFTA },
          statePermits: { status: 'compliant', expiryDate: DEFAULT_COMPLIANCE_EXPIRY.STATE_PERMITS, daysUntilExpiry: DEFAULT_COMPLIANCE_DAYS.STATE_PERMITS },
          emissions: { status: 'compliant', expiryDate: DEFAULT_COMPLIANCE_EXPIRY.EMISSIONS, daysUntilExpiry: DEFAULT_COMPLIANCE_DAYS.EMISSIONS },
          weightCert: { status: 'compliant', expiryDate: DEFAULT_COMPLIANCE_EXPIRY.WEIGHT_CERT, daysUntilExpiry: DEFAULT_COMPLIANCE_DAYS.WEIGHT_CERT }
        }
      }));

    this.vehicles.push(...newVehicles);

    // No automatic compliance task generation

    this.notify();
    return newVehicles;
  }

  updateTaskStatus(taskId: string, status: ComplianceTask['status']) {
    const taskIndex = this.complianceTasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      this.complianceTasks[taskIndex] = {
        ...this.complianceTasks[taskIndex],
        status,
        updatedDate: new Date().toISOString(),
        completedDate: status === 'completed' ? new Date().toISOString() : undefined
      };
      this.notify();
    }
  }

  getFleetStats(): FleetStats {
    const total = this.vehicles.length;
    const active = this.vehicles.filter(v => v.status === 'active').length;
    const inactive = this.vehicles.filter(v => v.status === 'inactive').length;

    // Compliance warnings and expirations
    let warnings = 0;
    let expired = 0;

    this.vehicles.forEach(vehicle => {
      Object.values(vehicle.compliance).forEach(item => {
        if (item.status === 'warning') warnings++;
        if (item.status === 'expired') expired++;
      });
    });

    return {
      total,
      active,
      inactive,
      complianceWarnings: warnings,
      complianceExpired: expired
    };
  }

  getComplianceStats(): ComplianceStats {
    const total = this.complianceTasks.length;
    const pending = this.complianceTasks.filter(t => t.status === 'pending').length;
    const inProgress = this.complianceTasks.filter(t => t.status === 'in_progress').length;
    const completed = this.complianceTasks.filter(t => t.status === 'completed').length;
    const overdue = this.complianceTasks.filter(t => t.status === 'overdue').length;
    const critical = this.complianceTasks.filter(t => t.priority === 'critical').length;
    const high = this.complianceTasks.filter(t => t.priority === 'high').length;

    return {
      total,
      pending,
      inProgress,
      completed,
      overdue,
      critical,
      high
    };
  }
}

// Global fleet data manager instance
export const fleetDataManager = new FleetDataManager();