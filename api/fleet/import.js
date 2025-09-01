const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

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
}