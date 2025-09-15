"use strict";
// Neon Fleet Storage Service
// Interacts with the Neon PostgreSQL database for vehicle data
Object.defineProperty(exports, "__esModule", { value: true });
exports.neonFleetStorage = void 0;
const db_1 = require("./db");
class NeonFleetStorage {
    async getAllVehicles() {
        const res = await (0, db_1.query)('SELECT * FROM vehicles ORDER BY truck_number ASC', []);
        return res.rows;
    }
    async getVehicle(id) {
        const res = await (0, db_1.query)('SELECT * FROM vehicles WHERE id = $1', [id]);
        return res.rows[0] || null;
    }
    async addVehicle(vehicle) {
        const { organizationId, vin, make, model, year, licensePlate, truckNumber, status, complianceStatus, registrationExpirationDate, insuranceExpirationDate } = vehicle;
        const res = await (0, db_1.query)(`INSERT INTO vehicles (organization_id, vin, make, model, year, license_plate, truck_number, status, compliance_status, registration_expiry, insurance_expiry, date_added, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`, [
            organizationId, vin, make, model, year, licensePlate, truckNumber,
            status, complianceStatus, registrationExpirationDate, insuranceExpirationDate
        ]);
        return res.rows[0];
    }
    async updateVehicle(id, updates) {
        const { rows } = await (0, db_1.query)('SELECT * FROM vehicles WHERE id = $1', [id]);
        if (rows.length === 0) {
            return null;
        }
        const currentVehicle = rows[0];
        const newVehicle = { ...currentVehicle, ...updates, lastUpdated: new Date().toISOString() };
        const { organizationId, vin, make, model, year, licensePlate, truckNumber, status, complianceStatus, registrationExpirationDate, insuranceExpirationDate, lastUpdated } = newVehicle;
        const res = await (0, db_1.query)(`UPDATE vehicles SET 
        organization_id = $1, vin = $2, make = $3, model = $4, year = $5, license_plate = $6, truck_number = $7, 
        status = $8, compliance_status = $9, registration_expiry = $10, insurance_expiry = $11, last_updated = $12
       WHERE id = $13 RETURNING *`, [
            organizationId, vin, make, model, year, licensePlate, truckNumber,
            status, complianceStatus, registrationExpirationDate, insuranceExpirationDate, lastUpdated, id
        ]);
        return res.rows[0];
    }
    async removeVehicle(id) {
        await (0, db_1.query)('DELETE FROM vehicles WHERE id = $1', [id]);
    }
}
exports.neonFleetStorage = new NeonFleetStorage();
