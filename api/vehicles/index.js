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

const generateTruckNumber = async (organizationId) => {
  try {
    // Get existing truck numbers to determine next sequential number
    const existingQuery = `
      SELECT truck_number 
      FROM vehicles 
      WHERE organization_id = $1 
        AND truck_number ~ '^Truck #[0-9]+$'
      ORDER BY truck_number
    `;
    
    const result = await pool.query(existingQuery, [organizationId]);
    const existingNumbers = result.rows
      .map(row => row.truck_number)
      .filter(num => num?.match(/^Truck #\d+$/))
      .map(num => parseInt(num.replace('Truck #', '')))
      .filter(num => !isNaN(num));
    
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    return `Truck #${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating truck number:', error);
    return `Truck #001`;
  }
};

export default async function handler(req, res) {
  const organizationId = getOrganizationId();

  if (req.method === 'POST') {
    // Add new vehicle
    const vehicle = req.body;
    
    if (!vehicle.vin || !vehicle.make || !vehicle.model) {
      res.status(400).json({ 
        error: 'Missing required fields: vin, make, model' 
      });
      return;
    }

    try {
      // Check for duplicate VIN
      const existingCheck = await pool.query(
        'SELECT id FROM vehicles WHERE vin = $1 AND organization_id = $2',
        [vehicle.vin, organizationId]
      );
      
      if (existingCheck.rows.length > 0) {
        res.status(409).json({ 
          error: `Vehicle with VIN ${vehicle.vin} already exists` 
        });
        return;
      }

      // Generate truck number if not provided
      const truckNumber = vehicle.truckNumber || await generateTruckNumber(organizationId);

      // Insert vehicle using standardized field names
      const insertQuery = `
        INSERT INTO vehicles (
          organization_id, vin, make, model, year, license_plate, dot_number,
          truck_number, status, registration_number, registration_state,
          registration_expiry, registered_owner, insurance_carrier, policy_number,
          insurance_expiry, coverage_amount, compliance_status, last_inspection_date,
          next_inspection_due
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *, created_at as date_added, updated_at as last_updated
      `;
      
      const values = [
        organizationId, vehicle.vin, vehicle.make, vehicle.model,
        vehicle.year, vehicle.licensePlate, vehicle.dotNumber, truckNumber,
        vehicle.status || 'active', vehicle.registrationNumber, vehicle.registrationState,
        vehicle.registrationExpirationDate, vehicle.registeredOwner, vehicle.insuranceCarrier,
        vehicle.policyNumber, vehicle.insuranceExpirationDate, vehicle.coverageAmount,
        vehicle.complianceStatus, vehicle.lastInspectionDate, vehicle.nextInspectionDue
      ];

      const result = await pool.query(insertQuery, values);
      const insertedVehicle = standardizeVehicleRecord(result.rows[0]);
      
      res.status(201).json(insertedVehicle);
    } catch (error) {
      console.error('Failed to add vehicle to PostgreSQL:', error);
      res.status(500).json({ error: 'Failed to add vehicle' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}