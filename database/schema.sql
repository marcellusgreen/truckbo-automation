-- TruckBo Fleet & Driver Compliance Database Schema
-- PostgreSQL Database Schema for Production Deployment

-- Enable UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full text search extension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ===========================================
-- ORGANIZATIONS & USERS
-- ===========================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    dot_number VARCHAR(50),
    mc_number VARCHAR(50),
    address JSONB,
    contact_info JSONB,
    subscription_tier VARCHAR(50) DEFAULT 'basic',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'user', -- admin, manager, user
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- VEHICLES
-- ===========================================

CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    vin VARCHAR(17) UNIQUE NOT NULL,
    make VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    license_plate VARCHAR(20),
    dot_number VARCHAR(50),
    truck_number VARCHAR(50), -- Internal fleet numbering
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, maintenance
    
    -- Registration Information
    registration_number VARCHAR(100),
    registration_state VARCHAR(2),
    registration_expiry DATE,
    registered_owner VARCHAR(255),
    
    -- Insurance Information  
    insurance_carrier VARCHAR(255),
    policy_number VARCHAR(100),
    insurance_expiry DATE,
    coverage_amount DECIMAL(12,2),
    
    -- Compliance Status
    compliance_status VARCHAR(20) DEFAULT 'unknown', -- compliant, warning, expired, unknown
    last_inspection_date DATE,
    next_inspection_due DATE,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_added TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_vin_length CHECK (LENGTH(vin) = 17),
    CONSTRAINT valid_year CHECK (year BETWEEN 1980 AND 2030)
);

-- ===========================================
-- DRIVERS
-- ===========================================

CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    hire_date DATE,
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, terminated
    
    -- Contact Information
    email VARCHAR(255),
    phone VARCHAR(20),
    address JSONB,
    emergency_contact JSONB,
    
    -- CDL Information
    cdl_number VARCHAR(50),
    cdl_state VARCHAR(2),
    cdl_class VARCHAR(1), -- A, B, C
    cdl_issue_date DATE,
    cdl_expiration_date DATE,
    cdl_endorsements TEXT[], -- Array of endorsement codes
    cdl_restrictions TEXT[], -- Array of restriction descriptions
    cdl_status VARCHAR(20) DEFAULT 'unknown', -- valid, expired, expiring_soon, invalid
    
    -- Medical Certificate Information
    medical_cert_number VARCHAR(100),
    medical_cert_issued_date DATE,
    medical_cert_expiration_date DATE,
    medical_examiner_name VARCHAR(255),
    medical_examiner_registry VARCHAR(50),
    medical_restrictions TEXT[],
    medical_cert_status VARCHAR(20) DEFAULT 'unknown', -- valid, expired, expiring_soon, invalid
    
    -- Additional Compliance
    background_check_date DATE,
    drug_test_date DATE,
    training_certificates TEXT[],
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_employee_per_org UNIQUE(organization_id, employee_id)
);

-- ===========================================
-- DOCUMENTS
-- ===========================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Document Classification
    document_type VARCHAR(50) NOT NULL, -- registration, insurance, medical_certificate, cdl, inspection
    document_category VARCHAR(50), -- vehicle_docs, driver_docs, compliance_docs
    
    -- File Information
    original_filename VARCHAR(255) NOT NULL,
    file_size INTEGER,
    file_type VARCHAR(50), -- application/pdf, image/jpeg, etc.
    s3_bucket VARCHAR(100),
    s3_key VARCHAR(500) NOT NULL, -- S3 object key
    s3_url TEXT, -- Pre-signed URL for access
    
    -- OCR and Extraction Data
    ocr_text TEXT, -- Full extracted text
    extraction_data JSONB, -- Structured extracted data
    extraction_confidence DECIMAL(4,2), -- 0.00 to 1.00
    processing_status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    processing_errors TEXT[],
    
    -- Entity Associations
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    
    -- Document Metadata
    document_date DATE, -- Date on the document (issue date, etc.)
    expiration_date DATE,
    issuing_authority VARCHAR(255),
    
    -- System Metadata
    uploaded_by UUID REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_confidence CHECK (extraction_confidence BETWEEN 0.00 AND 1.00)
);

-- ===========================================
-- DOCUMENT PROCESSING JOBS
-- ===========================================

CREATE TABLE document_processing_jobs (
    job_id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    mime_type TEXT,
    file_size BIGINT,
    gcs_input_bucket TEXT NOT NULL,
    gcs_input_object TEXT NOT NULL,
    gcs_output_bucket TEXT NOT NULL,
    gcs_output_prefix TEXT NOT NULL,
    result_object TEXT,
    status VARCHAR(20) DEFAULT 'processing', -- processing, succeeded, failed
    error_message TEXT,
    cleanup_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_document_jobs_status ON document_processing_jobs(status);
-- ===========================================
-- COMPLIANCE ALERTS
-- ===========================================

CREATE TABLE compliance_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Alert Classification
    alert_type VARCHAR(50) NOT NULL, -- medical_expired, cdl_expired, registration_expired, etc.
    alert_category VARCHAR(50) NOT NULL, -- vehicle_compliance, driver_compliance, document_missing
    priority VARCHAR(20) DEFAULT 'medium', -- critical, high, medium, low
    severity VARCHAR(20) DEFAULT 'warning', -- critical, warning, info
    
    -- Alert Details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    recommended_action TEXT,
    
    -- Entity References
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    
    -- Alert Status
    status VARCHAR(20) DEFAULT 'active', -- active, acknowledged, resolved, dismissed
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    
    -- Timing Information
    expiration_date DATE, -- When the compliance item expires
    days_until_expiry INTEGER, -- Calculated field for sorting
    reminder_sent_at TIMESTAMP WITH TIME ZONE,
    next_reminder_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- AUDIT LOG
-- ===========================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Action Details
    action VARCHAR(100) NOT NULL, -- create, update, delete, login, document_upload, etc.
    entity_type VARCHAR(50), -- vehicle, driver, document, alert
    entity_id UUID,
    
    -- Change Information
    changes JSONB, -- Before/after values for updates
    ip_address INET,
    user_agent TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- INDEXES FOR PERFORMANCE
-- ===========================================

-- Organizations
CREATE INDEX idx_organizations_dot_number ON organizations(dot_number);

-- Users
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);

-- Vehicles
CREATE INDEX idx_vehicles_organization_id ON vehicles(organization_id);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_compliance_status ON vehicles(compliance_status);
CREATE INDEX idx_vehicles_registration_expiry ON vehicles(registration_expiry);
CREATE INDEX idx_vehicles_insurance_expiry ON vehicles(insurance_expiry);

-- Drivers
CREATE INDEX idx_drivers_organization_id ON drivers(organization_id);
CREATE INDEX idx_drivers_employee_id ON drivers(employee_id);
CREATE INDEX idx_drivers_cdl_number ON drivers(cdl_number);
CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_cdl_expiration_date ON drivers(cdl_expiration_date);
CREATE INDEX idx_drivers_medical_cert_expiration_date ON drivers(medical_cert_expiration_date);

-- Documents
CREATE INDEX idx_documents_organization_id ON documents(organization_id);
CREATE INDEX idx_documents_vehicle_id ON documents(vehicle_id);
CREATE INDEX idx_documents_driver_id ON documents(driver_id);
CREATE INDEX idx_documents_document_type ON documents(document_type);
CREATE INDEX idx_documents_processing_status ON documents(processing_status);
CREATE INDEX idx_documents_expiration_date ON documents(expiration_date);
CREATE INDEX idx_documents_s3_key ON documents(s3_key);

-- Full text search on OCR text
CREATE INDEX idx_documents_ocr_text_fts ON documents USING gin(to_tsvector('english', ocr_text));

-- Compliance Alerts
CREATE INDEX idx_compliance_alerts_organization_id ON compliance_alerts(organization_id);
CREATE INDEX idx_compliance_alerts_vehicle_id ON compliance_alerts(vehicle_id);
CREATE INDEX idx_compliance_alerts_driver_id ON compliance_alerts(driver_id);
CREATE INDEX idx_compliance_alerts_status ON compliance_alerts(status);
CREATE INDEX idx_compliance_alerts_priority ON compliance_alerts(priority);
CREATE INDEX idx_compliance_alerts_alert_type ON compliance_alerts(alert_type);
CREATE INDEX idx_compliance_alerts_expiration_date ON compliance_alerts(expiration_date);

-- Audit Log
CREATE INDEX idx_audit_log_organization_id ON audit_log(organization_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- ===========================================
-- FUNCTIONS AND TRIGGERS
-- ===========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all main tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_compliance_alerts_updated_at BEFORE UPDATE ON compliance_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate days until expiry for alerts
CREATE OR REPLACE FUNCTION calculate_days_until_expiry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expiration_date IS NOT NULL THEN
        NEW.days_until_expiry = (NEW.expiration_date - CURRENT_DATE);
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_compliance_alert_days BEFORE INSERT OR UPDATE ON compliance_alerts FOR EACH ROW EXECUTE FUNCTION calculate_days_until_expiry();

-- ===========================================
-- VIEWS FOR COMMON QUERIES
-- ===========================================

-- Vehicle compliance overview
CREATE VIEW vehicle_compliance_overview AS
SELECT 
    v.id,
    v.organization_id,
    v.vin,
    v.make,
    v.model,
    v.year,
    v.license_plate,
    v.truck_number,
    v.status,
    v.compliance_status,
    v.registration_expiry,
    v.insurance_expiry,
    (v.registration_expiry - CURRENT_DATE) as registration_days_left,
    (v.insurance_expiry - CURRENT_DATE) as insurance_days_left,
    COUNT(ca.id) as active_alerts
FROM vehicles v
LEFT JOIN compliance_alerts ca ON v.id = ca.vehicle_id AND ca.status = 'active'
GROUP BY v.id;

-- Driver compliance overview  
CREATE VIEW driver_compliance_overview AS
SELECT 
    d.id,
    d.organization_id,
    d.employee_id,
    d.first_name,
    d.last_name,
    d.status,
    d.cdl_number,
    d.cdl_class,
    d.cdl_expiration_date,
    d.cdl_status,
    d.medical_cert_expiration_date,
    d.medical_cert_status,
    (d.cdl_expiration_date - CURRENT_DATE) as cdl_days_left,
    (d.medical_cert_expiration_date - CURRENT_DATE) as medical_days_left,
    COUNT(ca.id) as active_alerts
FROM drivers d
LEFT JOIN compliance_alerts ca ON d.id = ca.driver_id AND ca.status = 'active'
GROUP BY d.id;

-- Organization dashboard summary
CREATE VIEW organization_dashboard AS
SELECT 
    org.id,
    org.name,
    COUNT(DISTINCT v.id) as total_vehicles,
    COUNT(DISTINCT d.id) as total_drivers,
    COUNT(DISTINCT doc.id) as total_documents,
    COUNT(DISTINCT CASE WHEN ca.priority = 'critical' THEN ca.id END) as critical_alerts,
    COUNT(DISTINCT CASE WHEN ca.priority = 'high' THEN ca.id END) as high_alerts,
    COUNT(DISTINCT CASE WHEN v.compliance_status = 'compliant' THEN v.id END) as compliant_vehicles,
    COUNT(DISTINCT CASE WHEN d.cdl_status = 'valid' AND d.medical_cert_status = 'valid' THEN d.id END) as compliant_drivers
FROM organizations org
LEFT JOIN vehicles v ON org.id = v.organization_id
LEFT JOIN drivers d ON org.id = d.organization_id  
LEFT JOIN documents doc ON org.id = doc.organization_id
LEFT JOIN compliance_alerts ca ON org.id = ca.organization_id AND ca.status = 'active'
GROUP BY org.id, org.name;

-- ===========================================
-- SAMPLE DATA FOR DEVELOPMENT
-- ===========================================

-- Insert sample organization
INSERT INTO organizations (id, name, dot_number, mc_number) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'Sample Trucking LLC', 'DOT123456', 'MC987654');

-- Insert sample user
INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'admin@sampletrucking.com', '$2b$10$dummy_hash', 'John', 'Admin', 'admin');

COMMENT ON SCHEMA public IS 'TruckBo Fleet & Driver Compliance Database - Production Schema v1.0';

