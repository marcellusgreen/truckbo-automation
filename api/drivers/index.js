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

const standardizeDriverRecord = (record) => {
  const standardized = {
    ...record,
    organizationId: record.organization_id || record.organizationId,
    employeeId: record.employee_id || record.employeeId,
    firstName: record.first_name || record.firstName,
    lastName: record.last_name || record.lastName,
    dateOfBirth: record.date_of_birth || record.dateOfBirth,
    hireDate: record.hire_date || record.hireDate,
    dateAdded: record.date_added || record.dateAdded || record.created_at,
    lastUpdated: record.last_updated || record.lastUpdated || record.updated_at,
    
    // CDL Information
    cdlInfo: {
      cdlNumber: record.cdl_number || record.cdlNumber,
      cdlState: record.cdl_state || record.cdlState,
      class: record.cdl_class || record.class,
      issueDate: record.cdl_issue_date || record.issueDate,
      expirationDate: record.cdl_expiration_date || record.expirationDate,
      endorsements: record.cdl_endorsements || record.endorsements || [],
      restrictions: record.cdl_restrictions || record.restrictions || [],
      status: record.cdl_status || record.status || 'unknown',
      daysUntilExpiry: record.cdl_expiration_date ? 
        Math.ceil((new Date(record.cdl_expiration_date) - new Date()) / (1000 * 60 * 60 * 24)) : null
    },
    
    // Medical Certificate
    medicalCertificate: {
      certificateNumber: record.medical_cert_number || record.certificateNumber,
      issuedDate: record.medical_cert_issued_date || record.issuedDate,
      expirationDate: record.medical_cert_expiration_date || record.expirationDate,
      examinerName: record.medical_examiner_name || record.examinerName,
      examinerNationalRegistry: record.medical_examiner_registry || record.examinerNationalRegistry,
      restrictions: record.medical_restrictions || record.restrictions || [],
      status: record.medical_cert_status || record.status || 'unknown',
      daysUntilExpiry: record.medical_cert_expiration_date ? 
        Math.ceil((new Date(record.medical_cert_expiration_date) - new Date()) / (1000 * 60 * 60 * 24)) : null
    },
    
    // Additional fields
    backgroundCheckDate: record.background_check_date || record.backgroundCheckDate,
    drugTestDate: record.drug_test_date || record.drugTestDate,
    trainingCertificates: record.training_certificates || record.trainingCertificates || []
  };
  
  return standardized;
};

export default async function handler(req, res) {
  const organizationId = getOrganizationId();

  if (req.method === 'GET') {
    // Get all drivers
    try {
      const query = `
        SELECT 
          id, organization_id, employee_id, first_name, last_name, date_of_birth,
          hire_date, status, email, phone, address, emergency_contact,
          cdl_number, cdl_state, cdl_class, cdl_issue_date, cdl_expiration_date,
          cdl_endorsements, cdl_restrictions, cdl_status,
          medical_cert_number, medical_cert_issued_date, medical_cert_expiration_date,
          medical_examiner_name, medical_examiner_registry, medical_restrictions,
          medical_cert_status, background_check_date, drug_test_date,
          training_certificates, created_at as date_added, updated_at as last_updated
        FROM drivers 
        WHERE organization_id = $1 
        ORDER BY created_at DESC
      `;

      const result = await pool.query(query, [organizationId]);
      const standardizedData = result.rows.map(standardizeDriverRecord);
      res.status(200).json(standardizedData);
    } catch (error) {
      console.error('Failed to load drivers from PostgreSQL:', error);
      res.status(500).json({ error: 'Failed to load drivers' });
    }
  } else if (req.method === 'POST') {
    // Add new driver
    const driver = req.body;
    
    if (!driver.firstName || !driver.lastName || !driver.employeeId) {
      res.status(400).json({ 
        error: 'Missing required fields: firstName, lastName, employeeId' 
      });
      return;
    }

    try {
      // Check for duplicate employee ID
      const existingCheck = await pool.query(
        'SELECT id FROM drivers WHERE employee_id = $1 AND organization_id = $2',
        [driver.employeeId, organizationId]
      );
      
      if (existingCheck.rows.length > 0) {
        res.status(409).json({ 
          error: `Driver with employee ID ${driver.employeeId} already exists` 
        });
        return;
      }

      // Insert driver
      const insertQuery = `
        INSERT INTO drivers (
          organization_id, employee_id, first_name, last_name, date_of_birth,
          hire_date, status, email, phone, address, emergency_contact,
          cdl_number, cdl_state, cdl_class, cdl_issue_date, cdl_expiration_date,
          cdl_endorsements, cdl_restrictions, cdl_status,
          medical_cert_number, medical_cert_issued_date, medical_cert_expiration_date,
          medical_examiner_name, medical_examiner_registry, medical_restrictions,
          medical_cert_status, background_check_date, drug_test_date, training_certificates
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
        RETURNING *, created_at as date_added, updated_at as last_updated
      `;
      
      const values = [
        organizationId, driver.employeeId, driver.firstName, driver.lastName,
        driver.dateOfBirth, driver.hireDate, driver.status || 'active',
        driver.email, driver.phone, driver.address ? JSON.stringify(driver.address) : null,
        driver.emergencyContact ? JSON.stringify(driver.emergencyContact) : null,
        driver.cdlInfo?.cdlNumber, driver.cdlInfo?.cdlState, driver.cdlInfo?.class,
        driver.cdlInfo?.issueDate, driver.cdlInfo?.expirationDate,
        driver.cdlInfo?.endorsements, driver.cdlInfo?.restrictions, driver.cdlInfo?.status,
        driver.medicalCertificate?.certificateNumber, driver.medicalCertificate?.issuedDate,
        driver.medicalCertificate?.expirationDate, driver.medicalCertificate?.examinerName,
        driver.medicalCertificate?.examinerNationalRegistry, driver.medicalCertificate?.restrictions,
        driver.medicalCertificate?.status, driver.backgroundCheckDate, driver.drugTestDate,
        driver.trainingCertificates
      ];

      const result = await pool.query(insertQuery, values);
      const insertedDriver = standardizeDriverRecord(result.rows[0]);
      
      res.status(201).json(insertedDriver);
    } catch (error) {
      console.error('Failed to add driver to PostgreSQL:', error);
      res.status(500).json({ error: 'Failed to add driver' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}