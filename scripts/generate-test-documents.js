import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create test documents directory
const testDocsDir = path.join(__dirname, '..', 'test-documents');
if (!fs.existsSync(testDocsDir)) {
  fs.mkdirSync(testDocsDir, { recursive: true });
}

// Sample vehicle data
const largeFleetVehicles = [
  { vin: '1FUJGHDV001123456', make: 'Freightliner', model: 'Cascadia', year: 2023, plate: 'OH-FLT-001', truck: 'MTS-001' },
  { vin: '1FUJGHDV002123456', make: 'Peterbilt', model: '579', year: 2022, plate: 'OH-FLT-002', truck: 'MTS-002' },
  { vin: '1FUJGHDV003123456', make: 'Kenworth', model: 'T680', year: 2021, plate: 'OH-FLT-003', truck: 'MTS-003' },
  { vin: '1FUJGHDV004123456', make: 'Volvo', model: 'VNL', year: 2023, plate: 'OH-FLT-004', truck: 'MTS-004' },
  { vin: '1FUJGHDV005123456', make: 'Mack', model: 'Anthem', year: 2022, plate: 'OH-FLT-005', truck: 'MTS-005' }
];

const smallFleetVehicles = [
  { vin: '2FUJGHDV017890123', make: 'Freightliner', model: 'Cascadia', year: 2020, plate: 'CA-TTL-01', truck: 'TTL-01' },
  { vin: '2FUJGHDV027890123', make: 'Peterbilt', model: '579', year: 2019, plate: 'CA-TTL-02', truck: 'TTL-02' },
  { vin: '2FUJGHDV037890123', make: 'International', model: 'LT', year: 2018, plate: 'CA-TTL-03', truck: 'TTL-03' }
];

// Sample driver data
const largeFleetDrivers = [
  { id: 'MTS-001', name: 'John Smith', cdl: 'OH-CDL-45678912', medCert: 'MED-OH-2024-001-4578' },
  { id: 'MTS-002', name: 'Maria Rodriguez', cdl: 'OH-CDL-78945612', medCert: 'MED-OH-2024-002-9876' },
  { id: 'MTS-003', name: 'David Johnson', cdl: 'OH-CDL-12345678', medCert: 'MED-OH-2024-003-1234' }
];

const smallFleetDrivers = [
  { id: 'TTL-01', name: 'Robert Thompson', cdl: 'CA-CDL-87654321', medCert: 'MED-CA-2024-01-5678' },
  { id: 'TTL-02', name: 'Lisa Garcia', cdl: 'CA-CDL-23456789', medCert: 'MED-CA-2024-02-9012' }
];

function generateRegistrationHTML(vehicle, company, state) {
  const issueDate = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
  const expiryDate = new Date(issueDate.getFullYear() + 1, issueDate.getMonth(), issueDate.getDate());
  
  return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: white; }
        .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; color: #1a472a; }
        .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
        .section { margin: 15px 0; border: 1px solid #ccc; padding: 10px; }
        .section-title { font-weight: bold; background: #f0f0f0; padding: 5px; margin: -10px -10px 10px -10px; }
        .row { display: flex; justify-content: space-between; margin: 5px 0; }
        .label { font-weight: bold; }
        .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); 
                    font-size: 72px; color: rgba(0,0,0,0.1); z-index: -1; }
        .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="watermark">OFFICIAL</div>
    
    <div class="header">
        <div class="title">${state.toUpperCase()} DEPARTMENT OF MOTOR VEHICLES</div>
        <div class="subtitle">COMMERCIAL VEHICLE REGISTRATION</div>
    </div>

    <div class="section">
        <div class="section-title">REGISTRATION INFORMATION</div>
        <div class="row">
            <span><span class="label">Registration Number:</span> ${state.toUpperCase()}-REG-${Math.floor(Math.random() * 900000) + 100000}</span>
            <span><span class="label">Issue Date:</span> ${issueDate.toLocaleDateString()}</span>
        </div>
        <div class="row">
            <span><span class="label">Expiration Date:</span> ${expiryDate.toLocaleDateString()}</span>
            <span><span class="label">Plate Number:</span> ${vehicle.plate}</span>
        </div>
    </div>

    <div class="section">
        <div class="section-title">VEHICLE INFORMATION</div>
        <div class="row">
            <span><span class="label">Year:</span> ${vehicle.year}</span>
            <span><span class="label">Make:</span> ${vehicle.make}</span>
            <span><span class="label">Model:</span> ${vehicle.model}</span>
        </div>
        <div class="row">
            <span><span class="label">VIN:</span> ${vehicle.vin}</span>
            <span><span class="label">Fleet Number:</span> ${vehicle.truck}</span>
        </div>
        <div class="row">
            <span><span class="label">Body Type:</span> TRUCK TRACTOR</span>
            <span><span class="label">Fuel Type:</span> DIESEL</span>
        </div>
    </div>

    <div class="section">
        <div class="section-title">OWNER INFORMATION</div>
        <div class="row">
            <span><span class="label">Registered Owner:</span> ${company.name}</span>
        </div>
        <div class="row">
            <span><span class="label">Address:</span> ${company.address}</span>
        </div>
        <div class="row">
            <span><span class="label">DOT Number:</span> ${company.dot}</span>
            <span><span class="label">MC Number:</span> ${company.mc}</span>
        </div>
    </div>

    <div class="section">
        <div class="section-title">FEES AND TAXES</div>
        <div class="row">
            <span><span class="label">Registration Fee:</span> $${Math.floor(Math.random() * 200) + 150}.00</span>
            <span><span class="label">Weight Class:</span> 80,000 LBS</span>
        </div>
        <div class="row">
            <span><span class="label">Total Paid:</span> $${Math.floor(Math.random() * 300) + 200}.00</span>
            <span><span class="label">Method:</span> CHECK</span>
        </div>
    </div>

    <div class="footer">
        <p>This registration is valid only when displayed as required by law.</p>
        <p>Keep this document in the vehicle at all times.</p>
        <p>Document ID: ${state.toUpperCase()}-${Math.floor(Math.random() * 9000000) + 1000000}</p>
    </div>
</body>
</html>`;
}

function generateInsuranceHTML(vehicle, company, carrier) {
  const issueDate = new Date();
  const expiryDate = new Date(issueDate.getFullYear(), issueDate.getMonth() + 6, issueDate.getDate());
  
  return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: white; }
        .header { text-align: center; border: 2px solid #0066cc; padding: 15px; margin-bottom: 20px; background: #f8f9fa; }
        .company-name { font-size: 20px; font-weight: bold; color: #0066cc; }
        .doc-title { font-size: 16px; margin-top: 5px; }
        .section { margin: 15px 0; padding: 10px; border-left: 4px solid #0066cc; }
        .section-title { font-weight: bold; font-size: 14px; color: #0066cc; margin-bottom: 10px; }
        .row { margin: 8px 0; }
        .label { font-weight: bold; display: inline-block; width: 150px; }
        .important { background: #fff3cd; padding: 10px; border: 1px solid #ffeaa7; margin: 10px 0; }
        .footer { margin-top: 30px; font-size: 11px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">${carrier} INSURANCE COMPANY</div>
        <div class="doc-title">COMMERCIAL AUTO LIABILITY CERTIFICATE</div>
    </div>

    <div class="section">
        <div class="section-title">POLICY INFORMATION</div>
        <div class="row">
            <span class="label">Policy Number:</span> CAL-${Math.floor(Math.random() * 9000000) + 1000000}
        </div>
        <div class="row">
            <span class="label">Effective Date:</span> ${issueDate.toLocaleDateString()}
        </div>
        <div class="row">
            <span class="label">Expiration Date:</span> ${expiryDate.toLocaleDateString()}
        </div>
        <div class="row">
            <span class="label">Coverage Territory:</span> United States and Canada
        </div>
    </div>

    <div class="section">
        <div class="section-title">NAMED INSURED</div>
        <div class="row">
            <span class="label">Company Name:</span> ${company.name}
        </div>
        <div class="row">
            <span class="label">Address:</span> ${company.address}
        </div>
        <div class="row">
            <span class="label">DOT Number:</span> ${company.dot}
        </div>
    </div>

    <div class="section">
        <div class="section-title">VEHICLE INFORMATION</div>
        <div class="row">
            <span class="label">Year/Make/Model:</span> ${vehicle.year} ${vehicle.make} ${vehicle.model}
        </div>
        <div class="row">
            <span class="label">VIN:</span> ${vehicle.vin}
        </div>
        <div class="row">
            <span class="label">License Plate:</span> ${vehicle.plate}
        </div>
        <div class="row">
            <span class="label">Fleet Number:</span> ${vehicle.truck}
        </div>
    </div>

    <div class="section">
        <div class="section-title">COVERAGE LIMITS</div>
        <div class="row">
            <span class="label">Liability:</span> $1,000,000 Combined Single Limit
        </div>
        <div class="row">
            <span class="label">Cargo:</span> $100,000 per occurrence
        </div>
        <div class="row">
            <span class="label">Physical Damage:</span> Actual Cash Value
        </div>
        <div class="row">
            <span class="label">Deductible:</span> $1,000 Comprehensive / $2,500 Collision
        </div>
    </div>

    <div class="important">
        <strong>IMPORTANT:</strong> This certificate is issued for information purposes only and does not 
        afford coverage to the certificate holder. Coverage is subject to all terms, conditions, and 
        exclusions of the policy.
    </div>

    <div class="footer">
        <p><strong>Authorized Representative:</strong> Sarah Johnson, Underwriter</p>
        <p><strong>Date Issued:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Certificate ID:</strong> CERT-${Math.floor(Math.random() * 900000) + 100000}</p>
        <p>24/7 Claims Reporting: 1-800-555-CLAIM | Policy Service: 1-800-555-POLICY</p>
    </div>
</body>
</html>`;
}

function generateCDLHTML(driver, state) {
  const issueDate = new Date(2019 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
  const expiryDate = new Date(issueDate.getFullYear() + 4, issueDate.getMonth(), issueDate.getDate());
  
  return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 15px; background: linear-gradient(135deg, #e3f2fd 0%, #ffffff 100%); }
        .license { width: 400px; height: 250px; border: 2px solid #1976d2; border-radius: 8px; 
                  padding: 15px; background: white; position: relative; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .header { text-align: center; color: #1976d2; font-weight: bold; font-size: 14px; margin-bottom: 10px; }
        .cdl-title { font-size: 18px; color: #d32f2f; font-weight: bold; text-align: center; margin-bottom: 15px; }
        .photo-area { width: 80px; height: 100px; border: 1px solid #666; float: right; 
                     background: #f5f5f5; text-align: center; padding-top: 35px; font-size: 12px; color: #666; }
        .info { font-size: 11px; line-height: 1.3; }
        .row { margin: 3px 0; }
        .label { font-weight: bold; display: inline-block; width: 60px; }
        .endorsements { margin-top: 10px; font-size: 10px; }
        .restrictions { margin-top: 5px; font-size: 10px; color: #d32f2f; }
        .footer { position: absolute; bottom: 10px; right: 15px; font-size: 8px; color: #666; }
    </style>
</head>
<body>
    <div class="license">
        <div class="header">${state.toUpperCase()} DEPARTMENT OF MOTOR VEHICLES</div>
        <div class="cdl-title">COMMERCIAL DRIVER LICENSE</div>
        
        <div class="photo-area">PHOTO</div>
        
        <div class="info">
            <div class="row">
                <span class="label">CDL:</span> ${driver.cdl}
            </div>
            <div class="row">
                <span class="label">Name:</span> ${driver.name.toUpperCase()}
            </div>
            <div class="row">
                <span class="label">Class:</span> A
            </div>
            <div class="row">
                <span class="label">DOB:</span> ${new Date(1970 + Math.floor(Math.random() * 40), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toLocaleDateString()}
            </div>
            <div class="row">
                <span class="label">Issue:</span> ${issueDate.toLocaleDateString()}
            </div>
            <div class="row">
                <span class="label">Exp:</span> ${expiryDate.toLocaleDateString()}
            </div>
        </div>
        
        <div class="endorsements">
            <strong>Endorsements:</strong> H (Hazmat), N (Tank Vehicle), X (Hazmat + Tank)
        </div>
        
        <div class="restrictions">
            <strong>Restrictions:</strong> None
        </div>
        
        <div class="footer">
            Doc: ${state.toUpperCase()}-${Math.floor(Math.random() * 9000) + 1000}
        </div>
    </div>
</body>
</html>`;
}

function generateMedicalCertHTML(driver) {
  const examDate = new Date();
  const expiryDate = new Date(examDate.getFullYear() + 2, examDate.getMonth(), examDate.getDate());
  
  return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: white; }
        .header { text-align: center; border-bottom: 2px solid #2e7d32; padding-bottom: 15px; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: bold; color: #2e7d32; }
        .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
        .cert-number { font-size: 16px; font-weight: bold; margin-top: 10px; }
        .section { margin: 15px 0; border: 1px solid #ddd; padding: 12px; }
        .section-title { font-weight: bold; color: #2e7d32; margin-bottom: 8px; }
        .row { margin: 5px 0; }
        .label { font-weight: bold; display: inline-block; width: 140px; }
        .stamp-area { border: 2px dashed #2e7d32; padding: 20px; text-align: center; 
                     background: #f1f8e9; margin: 20px 0; }
        .footer { margin-top: 30px; font-size: 11px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">U.S. DEPARTMENT OF TRANSPORTATION</div>
        <div class="subtitle">Federal Motor Carrier Safety Administration</div>
        <div class="title">MEDICAL EXAMINER'S CERTIFICATE</div>
        <div class="cert-number">Certificate Number: ${driver.medCert}</div>
    </div>

    <div class="section">
        <div class="section-title">DRIVER INFORMATION</div>
        <div class="row">
            <span class="label">Driver Name:</span> ${driver.name}
        </div>
        <div class="row">
            <span class="label">CDL Number:</span> ${driver.cdl}
        </div>
        <div class="row">
            <span class="label">Date of Birth:</span> ${new Date(1970 + Math.floor(Math.random() * 40), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toLocaleDateString()}
        </div>
    </div>

    <div class="section">
        <div class="section-title">MEDICAL EXAMINATION</div>
        <div class="row">
            <span class="label">Examination Date:</span> ${examDate.toLocaleDateString()}
        </div>
        <div class="row">
            <span class="label">Certificate Expires:</span> ${expiryDate.toLocaleDateString()}
        </div>
        <div class="row">
            <span class="label">Medical Examiner:</span> Dr. ${['Jennifer Adams', 'Michael Brown', 'Sarah Davis', 'Robert Wilson'][Math.floor(Math.random() * 4)]}
        </div>
        <div class="row">
            <span class="label">Registry Number:</span> ME-${Math.floor(Math.random() * 900000) + 100000}
        </div>
    </div>

    <div class="section">
        <div class="section-title">CERTIFICATION</div>
        <div class="row">
            <span class="label">Driver Status:</span> ✓ QUALIFIED TO OPERATE COMMERCIAL MOTOR VEHICLE
        </div>
        <div class="row">
            <span class="label">Certificate Type:</span> Two-Year Certificate
        </div>
        <div class="row">
            <span class="label">Restrictions:</span> None
        </div>
    </div>

    <div class="stamp-area">
        <div style="font-weight: bold; font-size: 14px;">MEDICAL EXAMINER CERTIFICATION</div>
        <div style="margin: 10px 0;">This is to certify that the above-named driver has been examined 
        and is physically qualified to operate a commercial motor vehicle in accordance with 
        49 CFR 391.41.</div>
        <div style="margin-top: 15px; font-weight: bold;">
            Dr. ${['Jennifer Adams', 'Michael Brown', 'Sarah Davis', 'Robert Wilson'][Math.floor(Math.random() * 4)]}<br>
            Licensed Medical Examiner
        </div>
    </div>

    <div class="footer">
        <p><strong>Important:</strong> This certificate must be carried when operating a commercial motor vehicle.</p>
        <p>Form MCSA-5876: Medical Examiner's Certificate</p>
        <p>OMB Control No. 2126-0006</p>
    </div>
</body>
</html>`;
}

// Generate documents
console.log('🗂️  Generating Test Documents');
console.log('==============================\n');

const companies = {
  large: {
    name: 'Midwest Transport Solutions LLC',
    address: '2847 Industrial Boulevard, Columbus, OH 43228',
    dot: 'DOT-123456789',
    mc: 'MC-789456'
  },
  small: {
    name: 'Thompson Trucking & Logistics',
    address: '1456 County Road 42, Bakersfield, CA 93308',
    dot: 'DOT-987654321',
    mc: 'MC-456123'
  }
};

const insuranceCarriers = ['Progressive', 'National General', 'Great West', 'Canal Insurance'];

// Create large fleet documents (organized)
fs.mkdirSync(path.join(testDocsDir, 'large-fleet', 'registrations'), { recursive: true });
fs.mkdirSync(path.join(testDocsDir, 'large-fleet', 'insurance'), { recursive: true });
fs.mkdirSync(path.join(testDocsDir, 'large-fleet', 'drivers'), { recursive: true });

largeFleetVehicles.forEach((vehicle, index) => {
  // Registration documents
  const regHTML = generateRegistrationHTML(vehicle, companies.large, 'ohio');
  fs.writeFileSync(
    path.join(testDocsDir, 'large-fleet', 'registrations', `registration_${vehicle.truck}.html`),
    regHTML
  );
  
  // Insurance documents
  const insHTML = generateInsuranceHTML(vehicle, companies.large, insuranceCarriers[index % insuranceCarriers.length]);
  fs.writeFileSync(
    path.join(testDocsDir, 'large-fleet', 'insurance', `insurance_${vehicle.truck}.html`),
    insHTML
  );
});

largeFleetDrivers.forEach((driver) => {
  // CDL documents
  const cdlHTML = generateCDLHTML(driver, 'ohio');
  fs.writeFileSync(
    path.join(testDocsDir, 'large-fleet', 'drivers', `cdl_${driver.id}.html`),
    cdlHTML
  );
  
  // Medical certificates
  const medHTML = generateMedicalCertHTML(driver);
  fs.writeFileSync(
    path.join(testDocsDir, 'large-fleet', 'drivers', `medical_${driver.id}.html`),
    medHTML
  );
});

// Create small fleet documents (mixed with irrelevant docs)
fs.mkdirSync(path.join(testDocsDir, 'small-fleet', 'mixed-docs'), { recursive: true });

smallFleetVehicles.forEach((vehicle, index) => {
  // Mix of relevant and irrelevant documents
  
  // Relevant documents
  const regHTML = generateRegistrationHTML(vehicle, companies.small, 'california');
  fs.writeFileSync(
    path.join(testDocsDir, 'small-fleet', 'mixed-docs', `random_doc_${index * 10 + 1}.html`),
    regHTML
  );
  
  const insHTML = generateInsuranceHTML(vehicle, companies.small, insuranceCarriers[index % insuranceCarriers.length]);
  fs.writeFileSync(
    path.join(testDocsDir, 'small-fleet', 'mixed-docs', `paperwork_${index * 10 + 5}.html`),
    insHTML
  );
});

smallFleetDrivers.forEach((driver, index) => {
  const cdlHTML = generateCDLHTML(driver, 'california');
  fs.writeFileSync(
    path.join(testDocsDir, 'small-fleet', 'mixed-docs', `scan_${index * 15 + 3}.html`),
    cdlHTML
  );
  
  const medHTML = generateMedicalCertHTML(driver);
  fs.writeFileSync(
    path.join(testDocsDir, 'small-fleet', 'mixed-docs', `document_${index * 15 + 8}.html`),
    medHTML
  );
});

// Generate irrelevant documents for small fleet
const irrelevantDocs = [
  { name: 'fuel_receipt_001.html', content: '<html><body><h1>FUEL RECEIPT</h1><p>Shell Station - $247.89</p><p>Date: 03/15/2024</p></body></html>' },
  { name: 'maintenance_invoice.html', content: '<html><body><h1>Maintenance Invoice</h1><p>Oil Change - $89.99</p><p>Joe\'s Truck Shop</p></body></html>' },
  { name: 'personal_tax_return.html', content: '<html><body><h1>Form 1040</h1><p>Personal Tax Return 2023</p><p>Robert Thompson</p></body></html>' },
  { name: 'bank_statement.html', content: '<html><body><h1>Wells Fargo Bank Statement</h1><p>Thompson Trucking Account</p><p>Balance: $12,456.78</p></body></html>' },
  { name: 'loading_ticket.html', content: '<html><body><h1>Bill of Lading</h1><p>Load #: BL-456789</p><p>Destination: Phoenix, AZ</p></body></html>' },
  { name: 'permit_receipt.html', content: '<html><body><h1>Oversize Permit</h1><p>California DOT</p><p>Permit #: CA-OS-2024-1234</p></body></html>' }
];

irrelevantDocs.forEach((doc, index) => {
  fs.writeFileSync(
    path.join(testDocsDir, 'small-fleet', 'mixed-docs', `misc_${index + 20}.html`),
    doc.content
  );
});

console.log('✅ Generated test documents:');
console.log(`📁 Large Fleet (Organized):`);
console.log(`   - ${largeFleetVehicles.length} registration documents`);
console.log(`   - ${largeFleetVehicles.length} insurance documents`);  
console.log(`   - ${largeFleetDrivers.length} CDL documents`);
console.log(`   - ${largeFleetDrivers.length} medical certificates`);
console.log(`📁 Small Fleet (Mixed):`);
console.log(`   - ${smallFleetVehicles.length} registration documents (mixed in)`);
console.log(`   - ${smallFleetVehicles.length} insurance documents (mixed in)`);
console.log(`   - ${smallFleetDrivers.length} CDL documents (mixed in)`);
console.log(`   - ${smallFleetDrivers.length} medical certificates (mixed in)`);
console.log(`   - ${irrelevantDocs.length} irrelevant documents`);
console.log(`\n🎯 Documents saved to: ${testDocsDir}`);