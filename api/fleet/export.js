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
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

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
}