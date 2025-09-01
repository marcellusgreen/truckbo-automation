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
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { days = 30 } = req.query;
  const organizationId = getOrganizationId();
  const daysThreshold = parseInt(days);

  if (isNaN(daysThreshold) || daysThreshold < 0) {
    res.status(400).json({ error: 'Invalid days parameter, must be a positive number' });
    return;
  }

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
        training_certificates, created_at as date_added, updated_at as last_updated,
        (cdl_expiration_date - CURRENT_DATE) as cdl_days_left,
        (medical_cert_expiration_date - CURRENT_DATE) as medical_days_left
      FROM drivers 
      WHERE organization_id = $1 
      AND status = 'active'
      AND (
        (cdl_expiration_date IS NOT NULL AND cdl_expiration_date <= CURRENT_DATE + INTERVAL '${daysThreshold} days') 
        OR 
        (medical_cert_expiration_date IS NOT NULL AND medical_cert_expiration_date <= CURRENT_DATE + INTERVAL '${daysThreshold} days')
      )
      ORDER BY 
        LEAST(
          COALESCE(cdl_expiration_date, '9999-12-31'::date), 
          COALESCE(medical_cert_expiration_date, '9999-12-31'::date)
        ) ASC
    `;

    const result = await pool.query(query, [organizationId]);
    const expiringDrivers = result.rows.map(record => {
      const standardized = standardizeDriverRecord(record);
      
      // Add expiration details for frontend
      standardized.expirationDetails = {
        cdlExpiring: record.cdl_days_left !== null && record.cdl_days_left <= daysThreshold,
        medicalExpiring: record.medical_days_left !== null && record.medical_days_left <= daysThreshold,
        cdlDaysLeft: record.cdl_days_left,
        medicalDaysLeft: record.medical_days_left,
        nearestExpirationDays: Math.min(
          record.cdl_days_left || Infinity,
          record.medical_days_left || Infinity
        )
      };
      
      return standardized;
    });
    
    res.status(200).json({
      drivers: expiringDrivers,
      count: expiringDrivers.length,
      daysThreshold: daysThreshold,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting drivers with expiring certificates from PostgreSQL:', error);
    res.status(500).json({ 
      error: 'Failed to get drivers with expiring certificates',
      drivers: [],
      count: 0
    });
  }
}