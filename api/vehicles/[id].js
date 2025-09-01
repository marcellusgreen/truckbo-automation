const { Pool } = require('pg');

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

export default async function handler(req, res) {
  const { id } = req.query;
  const organizationId = getOrganizationId();

  if (req.method === 'PUT') {
    // Update existing vehicle
    const updates = req.body;
    
    try {
      // Build dynamic UPDATE query with standardized field names
      const setClause = [];
      const values = [];
      let paramCount = 1;
      
      // Map frontend field names to database column names
      const fieldMappings = {
        'registrationExpirationDate': 'registration_expiry',
        'insuranceExpirationDate': 'insurance_expiry',
        'licensePlate': 'license_plate',
        'dotNumber': 'dot_number',
        'truckNumber': 'truck_number',
        'registrationNumber': 'registration_number',
        'registrationState': 'registration_state',
        'registeredOwner': 'registered_owner',
        'insuranceCarrier': 'insurance_carrier',
        'policyNumber': 'policy_number',
        'coverageAmount': 'coverage_amount',
        'complianceStatus': 'compliance_status',
        'lastInspectionDate': 'last_inspection_date',
        'nextInspectionDue': 'next_inspection_due'
      };
      
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'dateAdded' || key === 'lastUpdated') continue;
        
        const dbColumn = fieldMappings[key] || key;
        setClause.push(`${dbColumn} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
      
      if (setClause.length === 0) {
        res.status(400).json({ error: 'No valid fields to update' });
        return;
      }
      
      // Add updated_at timestamp
      setClause.push('updated_at = CURRENT_TIMESTAMP');
      
      const updateQuery = `
        UPDATE vehicles 
        SET ${setClause.join(', ')} 
        WHERE id = $${paramCount} AND organization_id = $${paramCount + 1}
        RETURNING *, created_at as date_added, updated_at as last_updated
      `;
      
      values.push(id, organizationId);

      const result = await pool.query(updateQuery, values);
      
      if (result.rows.length === 0) {
        res.status(404).json({ error: `Vehicle with ID ${id} not found` });
        return;
      }

      const updatedVehicle = standardizeVehicleRecord(result.rows[0]);
      res.status(200).json(updatedVehicle);
    } catch (error) {
      console.error('Failed to update vehicle in PostgreSQL:', error);
      res.status(500).json({ error: 'Failed to update vehicle' });
    }
  } else if (req.method === 'DELETE') {
    // Remove vehicle
    try {
      const result = await pool.query(
        'DELETE FROM vehicles WHERE id = $1 AND organization_id = $2 RETURNING vin',
        [id, organizationId]
      );
      
      if (result.rows.length === 0) {
        res.status(404).json({ error: `Vehicle with ID ${id} not found` });
        return;
      }

      res.status(200).json({ 
        success: true, 
        message: `Vehicle with VIN ${result.rows[0].vin} removed successfully` 
      });
    } catch (error) {
      console.error('Error removing vehicle from PostgreSQL:', error);
      res.status(500).json({ error: 'Failed to remove vehicle' });
    }
  } else {
    res.setHeader('Allow', ['PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}