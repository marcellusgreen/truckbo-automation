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
  const { id } = req.query;
  const organizationId = getOrganizationId();

  if (req.method === 'PUT') {
    // Update existing driver
    const updates = req.body;
    
    try {
      // Build dynamic UPDATE query
      const setClause = [];
      const values = [];
      let paramCount = 1;
      
      // Map frontend field names to database column names
      const fieldMappings = {
        'employeeId': 'employee_id',
        'firstName': 'first_name',
        'lastName': 'last_name',
        'dateOfBirth': 'date_of_birth',
        'hireDate': 'hire_date'
      };
      
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'dateAdded' || key === 'lastUpdated') continue;
        
        // Handle nested CDL info updates
        if (key === 'cdlInfo' && value) {
          if (value.cdlNumber !== undefined) {
            setClause.push(`cdl_number = $${paramCount}`);
            values.push(value.cdlNumber);
            paramCount++;
          }
          if (value.cdlState !== undefined) {
            setClause.push(`cdl_state = $${paramCount}`);
            values.push(value.cdlState);
            paramCount++;
          }
          if (value.class !== undefined) {
            setClause.push(`cdl_class = $${paramCount}`);
            values.push(value.class);
            paramCount++;
          }
          if (value.issueDate !== undefined) {
            setClause.push(`cdl_issue_date = $${paramCount}`);
            values.push(value.issueDate);
            paramCount++;
          }
          if (value.expirationDate !== undefined) {
            setClause.push(`cdl_expiration_date = $${paramCount}`);
            values.push(value.expirationDate);
            paramCount++;
          }
          if (value.endorsements !== undefined) {
            setClause.push(`cdl_endorsements = $${paramCount}`);
            values.push(value.endorsements);
            paramCount++;
          }
          if (value.restrictions !== undefined) {
            setClause.push(`cdl_restrictions = $${paramCount}`);
            values.push(value.restrictions);
            paramCount++;
          }
          if (value.status !== undefined) {
            setClause.push(`cdl_status = $${paramCount}`);
            values.push(value.status);
            paramCount++;
          }
          continue;
        }
        
        // Handle nested medical certificate updates
        if (key === 'medicalCertificate' && value) {
          if (value.certificateNumber !== undefined) {
            setClause.push(`medical_cert_number = $${paramCount}`);
            values.push(value.certificateNumber);
            paramCount++;
          }
          if (value.issuedDate !== undefined) {
            setClause.push(`medical_cert_issued_date = $${paramCount}`);
            values.push(value.issuedDate);
            paramCount++;
          }
          if (value.expirationDate !== undefined) {
            setClause.push(`medical_cert_expiration_date = $${paramCount}`);
            values.push(value.expirationDate);
            paramCount++;
          }
          if (value.examinerName !== undefined) {
            setClause.push(`medical_examiner_name = $${paramCount}`);
            values.push(value.examinerName);
            paramCount++;
          }
          if (value.examinerNationalRegistry !== undefined) {
            setClause.push(`medical_examiner_registry = $${paramCount}`);
            values.push(value.examinerNationalRegistry);
            paramCount++;
          }
          if (value.restrictions !== undefined) {
            setClause.push(`medical_restrictions = $${paramCount}`);
            values.push(value.restrictions);
            paramCount++;
          }
          if (value.status !== undefined) {
            setClause.push(`medical_cert_status = $${paramCount}`);
            values.push(value.status);
            paramCount++;
          }
          continue;
        }
        
        // Handle other fields
        const dbColumn = fieldMappings[key] || key;
        setClause.push(`${dbColumn} = $${paramCount}`);
        
        // Handle JSON fields
        if (key === 'address' || key === 'emergencyContact') {
          values.push(value ? JSON.stringify(value) : null);
        } else {
          values.push(value);
        }
        paramCount++;
      }
      
      if (setClause.length === 0) {
        res.status(400).json({ error: 'No valid fields to update' });
        return;
      }
      
      // Add updated_at timestamp
      setClause.push('updated_at = CURRENT_TIMESTAMP');
      
      const updateQuery = `
        UPDATE drivers 
        SET ${setClause.join(', ')} 
        WHERE id = $${paramCount} AND organization_id = $${paramCount + 1}
        RETURNING *, created_at as date_added, updated_at as last_updated
      `;
      
      values.push(id, organizationId);

      const result = await pool.query(updateQuery, values);
      
      if (result.rows.length === 0) {
        res.status(404).json({ error: `Driver with ID ${id} not found` });
        return;
      }

      const updatedDriver = standardizeDriverRecord(result.rows[0]);
      res.status(200).json(updatedDriver);
    } catch (error) {
      console.error('Failed to update driver in PostgreSQL:', error);
      res.status(500).json({ error: 'Failed to update driver' });
    }
  } else {
    res.setHeader('Allow', ['PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}