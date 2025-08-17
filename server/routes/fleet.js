import express from 'express';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

const getOrganizationId = () => {
  // TODO: Replace with actual authentication/authorization to get the user's organization ID
  return '550e8400-e29b-41d4-a716-446655440000';
};

const standardizeVehicleRecord = (record) => {
  const standardized = {
    ...record,
    licensePlate: record.license_plate || record.licensePlate,
    dotNumber: record.dot_number || record.dotNumber,
    truckNumber: record.truck_number || record.truckNumber,
    registrationNumber: record.registration_number || record.registrationNumber,
    registrationState: record.registration_state || record.registrationState,
    registrationExpirationDate: record.registration_expiry || record.registrationExpirationDate,
    registeredOwner: record.registered_owner || record.registeredOwner,
    insuranceCarrier: record.insurance_carrier || record.insuranceCarrier,
    policyNumber: record.policy_number || record.policyNumber,
    insuranceExpirationDate: record.insurance_expiry || record.insuranceExpirationDate,
    coverageAmount: record.coverage_amount || record.coverageAmount,
    complianceStatus: record.compliance_status || record.complianceStatus,
    lastInspectionDate: record.last_inspection_date || record.lastInspectionDate,
    nextInspectionDue: record.next_inspection_due || record.nextInspectionDue,
    dateAdded: record.date_added || record.dateAdded || record.created_at,
    lastUpdated: record.last_updated || record.lastUpdated || record.updated_at,
    organizationId: record.organization_id || record.organizationId
  };
  return standardized;
};

// GET /api/fleet - Fetch all vehicles
router.get('/', async (req, res) => {
  const organizationId = getOrganizationId();

  try {
    const query = `
      SELECT 
        id, organization_id, vin, make, model, year, license_plate, dot_number,
        truck_number, status, registration_number, registration_state,
        registration_expiry as registration_expiration_date, registered_owner,
        insurance_carrier, policy_number, insurance_expiry as insurance_expiration_date,
        coverage_amount, compliance_status, last_inspection_date, next_inspection_due,
        created_at as date_added, updated_at as last_updated
      FROM vehicles 
      WHERE organization_id = $1 
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [organizationId]);
    const standardizedData = result.rows.map(standardizeVehicleRecord);
    res.status(200).json(standardizedData);
  } catch (error) {
    console.error('Failed to load fleet data from PostgreSQL:', error);
    res.status(500).json({ error: 'Failed to load fleet data' });
  }
});

// POST /api/fleet - Save a fleet of vehicles
router.post('/', async (req, res) => {
  const vehicles = req.body;
  const organizationId = getOrganizationId();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Clear existing vehicles for this organization
    await client.query('DELETE FROM vehicles WHERE organization_id = $1', [organizationId]);

    // Insert all vehicles
    for (const vehicle of vehicles) {
      const insertQuery = `
        INSERT INTO vehicles (
          id, organization_id, vin, make, model, year, license_plate, dot_number,
          truck_number, status, registration_number, registration_state,
          registration_expiry, registered_owner, insurance_carrier, policy_number,
          insurance_expiry, coverage_amount, compliance_status, last_inspection_date,
          next_inspection_due, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      `;
      const values = [
        vehicle.id || uuidv4(), vehicle.organizationId || organizationId,
        vehicle.vin, vehicle.make, vehicle.model, vehicle.year, vehicle.licensePlate,
        vehicle.dotNumber, vehicle.truckNumber, vehicle.status, vehicle.registrationNumber,
        vehicle.registrationState, vehicle.registrationExpirationDate, vehicle.registeredOwner,
        vehicle.insuranceCarrier, vehicle.policyNumber, vehicle.insuranceExpirationDate,
        vehicle.coverageAmount, vehicle.complianceStatus, vehicle.lastInspectionDate,
        vehicle.nextInspectionDue, vehicle.dateAdded, vehicle.lastUpdated
      ];
      await client.query(insertQuery, values);
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: `Successfully saved ${vehicles.length} vehicles` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to save fleet data to PostgreSQL:', error);
    res.status(500).json({ error: 'Failed to save fleet data' });
  } finally {
    client.release();
  }
});

// DELETE /api/fleet - Clear the entire fleet
router.delete('/', async (req, res) => {
  const organizationId = getOrganizationId();
  
  try {
    await pool.query('DELETE FROM vehicles WHERE organization_id = $1', [organizationId]);
    res.status(200).json({ success: true, message: 'Fleet cleared successfully' });
  } catch (error) {
    console.error('Failed to clear fleet data from PostgreSQL:', error);
    res.status(500).json({ error: 'Failed to clear fleet data' });
  }
});

// GET /api/fleet/stats - Get fleet statistics
router.get('/stats', async (req, res) => {
  const organizationId = getOrganizationId();

  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive,
        COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as recently_added
      FROM vehicles 
      WHERE organization_id = $1
    `;
    
    const result = await pool.query(statsQuery, [organizationId]);
    const stats = result.rows[0];
    
    const fleetStats = {
      total: parseInt(stats.total),
      active: parseInt(stats.active),
      inactive: parseInt(stats.inactive),
      recentlyAdded: parseInt(stats.recently_added)
    };
    
    res.status(200).json(fleetStats);
  } catch (error) {
    console.error('Error getting fleet stats from PostgreSQL:', error);
    res.status(500).json({ 
      error: 'Failed to get fleet statistics',
      stats: { total: 0, active: 0, inactive: 0, recentlyAdded: 0 }
    });
  }
});

// GET /api/fleet/export - Export the fleet as JSON
router.get('/export', async (req, res) => {
  const organizationId = getOrganizationId();

  try {
    const query = `
      SELECT 
        id, organization_id, vin, make, model, year, license_plate, dot_number,
        truck_number, status, registration_number, registration_state,
        registration_expiry as registration_expiration_date, registered_owner,
        insurance_carrier, policy_number, insurance_expiry as insurance_expiration_date,
        coverage_amount, compliance_status, last_inspection_date, next_inspection_due,
        created_at as date_added, updated_at as last_updated
      FROM vehicles 
      WHERE organization_id = $1 
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [organizationId]);
    const standardizedData = result.rows.map(standardizeVehicleRecord);
    
    // Return JSON export data
    res.status(200).json({ 
      exportData: JSON.stringify(standardizedData, null, 2),
      count: standardizedData.length,
      exportedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to export fleet data from PostgreSQL:', error);
    res.status(500).json({ error: 'Failed to export fleet data' });
  }
});

// POST /api/fleet/import - Import a fleet from JSON
router.post('/import', async (req, res) => {
  const { jsonData } = req.body;
  const organizationId = getOrganizationId();

  if (!jsonData) {
    res.status(400).json({ 
      success: false, 
      message: 'Missing jsonData in request body' 
    });
    return;
  }

  try {
    let importedVehicles;
    
    try {
      importedVehicles = JSON.parse(jsonData);
    } catch (parseError) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid JSON format in import data' 
      });
      return;
    }
    
    if (!Array.isArray(importedVehicles)) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid data format - expected array of vehicles' 
      });
      return;
    }

    // Validate each vehicle has required fields
    const validated = importedVehicles.filter(v => v.vin && v.make && v.model);
    
    if (validated.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'No valid vehicles found in import data' 
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear existing vehicles for this organization
      await client.query('DELETE FROM vehicles WHERE organization_id = $1', [organizationId]);

      // Insert all validated vehicles
      for (const vehicle of validated) {
        const insertQuery = `
          INSERT INTO vehicles (
            id, organization_id, vin, make, model, year, license_plate, dot_number,
            truck_number, status, registration_number, registration_state,
            registration_expiry, registered_owner, insurance_carrier, policy_number,
            insurance_expiry, coverage_amount, compliance_status, last_inspection_date,
            next_inspection_due, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        `;
        const values = [
          vehicle.id || uuidv4(), vehicle.organizationId || organizationId,
          vehicle.vin, vehicle.make, vehicle.model, vehicle.year, vehicle.licensePlate,
          vehicle.dotNumber, vehicle.truckNumber, vehicle.status || 'active', 
          vehicle.registrationNumber, vehicle.registrationState, vehicle.registrationExpirationDate, 
          vehicle.registeredOwner, vehicle.insuranceCarrier, vehicle.policyNumber,
          vehicle.insuranceExpirationDate, vehicle.coverageAmount, vehicle.complianceStatus,
          vehicle.lastInspectionDate, vehicle.nextInspectionDue, 
          vehicle.dateAdded || new Date().toISOString(), 
          vehicle.lastUpdated || new Date().toISOString()
        ];
        await client.query(insertQuery, values);
      }

      await client.query('COMMIT');
      
      res.status(200).json({
        success: true,
        message: `Successfully imported ${validated.length} vehicles`,
        count: validated.length
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to import fleet data to PostgreSQL:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to import vehicles due to database error'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Import failed:', error);
    res.status(500).json({
      success: false,
      message: `Import failed: ${error.message}`
    });
  }
});

export default router;