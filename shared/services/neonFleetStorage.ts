// Neon Fleet Storage Service
// Interacts with the Neon PostgreSQL database for vehicle data

import { query } from './db';
import { VehicleRecord } from '../types/vehicleTypes';

// The interface for our storage service
export interface FleetStorage {
  getAllVehicles(): Promise<VehicleRecord[]>;
  getVehicle(id: string): Promise<VehicleRecord | null>;
  addVehicle(vehicle: Omit<VehicleRecord, 'id'>): Promise<VehicleRecord>;
  updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord | null>;
  removeVehicle(id: string): Promise<void>;
}

class NeonFleetStorage implements FleetStorage {
  async getAllVehicles(): Promise<VehicleRecord[]> {
    const res = await query('SELECT * FROM vehicles ORDER BY truck_number ASC', []);
    return res.rows;
  }

  async getVehicle(id: string): Promise<VehicleRecord | null> {
    const res = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async addVehicle(vehicle: Omit<VehicleRecord, 'id' | 'date_added' | 'last_updated'>): Promise<VehicleRecord> {
    const { 
      organization_id, vin, make, model, year, license_plate, truck_number, 
      status, compliance_status, registration_expiry, insurance_expiry 
    } = vehicle;
    
    const res = await query(
      `INSERT INTO vehicles (organization_id, vin, make, model, year, license_plate, truck_number, status, compliance_status, registration_expiry, insurance_expiry, date_added, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        organization_id, vin, make, model, year, license_plate, truck_number, 
        status, compliance_status, registration_expiry, insurance_expiry
      ]
    );
    return res.rows[0];
  }

  async updateVehicle(id: string, updates: Partial<VehicleRecord>): Promise<VehicleRecord | null> {
    const { rows } = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
    if (rows.length === 0) {
      return null;
    }

    const currentVehicle = rows[0];
    const newVehicle = { ...currentVehicle, ...updates, last_updated: new Date() };

    const { 
      organization_id, vin, make, model, year, license_plate, truck_number, 
      status, compliance_status, registration_expiry, insurance_expiry, last_updated
    } = newVehicle;

    const res = await query(
      `UPDATE vehicles SET 
        organization_id = $1, vin = $2, make = $3, model = $4, year = $5, license_plate = $6, truck_number = $7, 
        status = $8, compliance_status = $9, registration_expiry = $10, insurance_expiry = $11, last_updated = $12
       WHERE id = $13 RETURNING *`,
      [
        organization_id, vin, make, model, year, license_plate, truck_number, 
        status, compliance_status, registration_expiry, insurance_expiry, last_updated, id
      ]
    );
    return res.rows[0];
  }

  async removeVehicle(id: string): Promise<void> {
    await query('DELETE FROM vehicles WHERE id = $1', [id]);
  }
}

export const neonFleetStorage = new NeonFleetStorage();
