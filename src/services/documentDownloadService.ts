// Document Download Service
// Handles downloading and exporting vehicle compliance documents

interface VehicleInfo {
  id: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  dotNumber?: string;
  mcNumber?: string;
  status?: 'active' | 'inactive' | 'maintenance';
}

export interface VehicleDocument {
  type: 'registration' | 'insurance' | 'inspection' | 'permit' | 'emissions';
  fileName: string;
  content: string;
  issueDate: string;
  expiryDate: string;
  issuingAuthority: string;
}

export interface VehicleDocumentPackage {
  vehicleId: string;
  vin: string;
  vehicleName: string;
  documents: VehicleDocument[];
  packageDate: string;
}

export class DocumentDownloadService {
  
  /**
   * Generate a mock registration document for a vehicle
   */
  private generateRegistrationDocument(vehicle: VehicleInfo): VehicleDocument {
    const content = `
VEHICLE REGISTRATION CERTIFICATE

Vehicle Information:
VIN: ${vehicle.vin}
Make: ${vehicle.make}
Model: ${vehicle.model}
Year: ${vehicle.year}
License Plate: ${vehicle.licensePlate}

Registration Details:
Registration Number: REG-${vehicle.vin.slice(-6)}
State: CA
Issue Date: ${new Date().toLocaleDateString()}
Expiry Date: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}

Registered Owner: Fleet Transportation LLC
Address: 123 Fleet St, Los Angeles, CA 90210

This certificate confirms that the above vehicle is properly registered
and authorized for commercial operation.

California Department of Motor Vehicles
    `;
    
    return {
      type: 'registration',
      fileName: `registration_${vehicle.vin}_${new Date().toISOString().slice(0, 10)}.txt`,
      content: content.trim(),
      issueDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      issuingAuthority: 'California DMV'
    };
  }

  /**
   * Generate a mock insurance certificate for a vehicle
   */
  private generateInsuranceDocument(vehicle: VehicleInfo): VehicleDocument {
    const content = `
CERTIFICATE OF LIABILITY INSURANCE

Policy Information:
Policy Number: INS-${vehicle.vin.slice(-8)}
Insurance Company: TruckGuard Insurance Co.
Policy Period: ${new Date().toLocaleDateString()} to ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}

Insured Vehicle:
VIN: ${vehicle.vin}
Year/Make/Model: ${vehicle.year} ${vehicle.make} ${vehicle.model}
License Plate: ${vehicle.licensePlate}

Coverage Limits:
Bodily Injury: $1,000,000 per person / $2,000,000 per occurrence
Property Damage: $1,000,000 per occurrence
Cargo Coverage: $100,000
Uninsured Motorist: $1,000,000

Certificate Holder: ${vehicle.make} Fleet Operations
Address: 123 Fleet Street, Los Angeles, CA 90210

This certificate is issued for information only and confers no rights
upon the certificate holder.

TruckGuard Insurance Co.
License #: CA-INS-2024-7891
    `;
    
    return {
      type: 'insurance',
      fileName: `insurance_certificate_${vehicle.vin}_${new Date().toISOString().slice(0, 10)}.txt`,
      content: content.trim(),
      issueDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      issuingAuthority: 'TruckGuard Insurance Co.'
    };
  }

  /**
   * Generate a mock DOT inspection report for a vehicle
   */
  private generateInspectionDocument(vehicle: VehicleInfo): VehicleDocument {
    const content = `
DOT SAFETY INSPECTION REPORT

Inspection Details:
Inspection Date: ${new Date().toLocaleDateString()}
Inspector: John Smith, DOT #12345
Inspection Station: Fleet Maintenance Center
Location: Los Angeles, CA

Vehicle Information:
VIN: ${vehicle.vin}
Year/Make/Model: ${vehicle.year} ${vehicle.make} ${vehicle.model}
License Plate: ${vehicle.licensePlate}
DOT Number: ${vehicle.dotNumber || 'DOT-' + vehicle.vin.slice(-6)}

Inspection Results:
✓ Brake System: PASS
✓ Steering System: PASS  
✓ Lighting System: PASS
✓ Tires: PASS
✓ Exhaust System: PASS
✓ Coupling Device: PASS
✓ Emergency Equipment: PASS

Overall Result: PASS
Next Inspection Due: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}

Inspector Signature: John Smith
DOT Certification #: CA-DOT-12345

Federal Motor Carrier Safety Administration
    `;
    
    return {
      type: 'inspection',
      fileName: `dot_inspection_${vehicle.vin}_${new Date().toISOString().slice(0, 10)}.txt`,
      content: content.trim(),
      issueDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      issuingAuthority: 'FMCSA'
    };
  }

  /**
   * Download a single document for a vehicle
   */
  downloadSingleDocument(vehicle: VehicleInfo, documentType: 'registration' | 'insurance' | 'inspection'): void {
    let document: VehicleDocument;
    
    switch (documentType) {
      case 'registration':
        document = this.generateRegistrationDocument(vehicle);
        break;
      case 'insurance':
        document = this.generateInsuranceDocument(vehicle);
        break;
      case 'inspection':
        document = this.generateInspectionDocument(vehicle);
        break;
      default:
        throw new Error(`Unsupported document type: ${documentType}`);
    }
    
    this.triggerDownload(document.content, document.fileName, 'text/plain');
  }

  /**
   * Download all documents for a vehicle as a ZIP-like package
   */
  downloadVehiclePackage(vehicle: VehicleInfo): void {
    const registration = this.generateRegistrationDocument(vehicle);
    const insurance = this.generateInsuranceDocument(vehicle);
    const inspection = this.generateInspectionDocument(vehicle);
    
    const packageContent = `
VEHICLE DOCUMENT PACKAGE
Generated: ${new Date().toLocaleString()}
Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
VIN: ${vehicle.vin}
License Plate: ${vehicle.licensePlate}

=== INCLUDED DOCUMENTS ===
1. ${registration.fileName}
2. ${insurance.fileName}
3. ${inspection.fileName}

===============================

REGISTRATION CERTIFICATE:
${registration.content}

===============================

INSURANCE CERTIFICATE:
${insurance.content}

===============================

DOT INSPECTION REPORT:
${inspection.content}

===============================

Package generated by TruckBo Fleet Management System
For questions, contact your fleet administrator.
    `;
    
    const packageFileName = `vehicle_documents_${vehicle.vin}_${new Date().toISOString().slice(0, 10)}.txt`;
    this.triggerDownload(packageContent.trim(), packageFileName, 'text/plain');
  }

  /**
   * Download compliance summary for DOT audit
   */
  downloadComplianceSummary(vehicles: VehicleInfo[]): void {
    const summaryContent = `
FLEET COMPLIANCE SUMMARY REPORT
Generated: ${new Date().toLocaleString()}
Total Vehicles: ${vehicles.length}

=== VEHICLE COMPLIANCE STATUS ===

${vehicles.map((vehicle, index) => `
${index + 1}. ${vehicle.year} ${vehicle.make} ${vehicle.model}
   VIN: ${vehicle.vin}
   License Plate: ${vehicle.licensePlate}
   Status: ${(vehicle.status || 'unknown').toUpperCase()}
   
   Registration: ✓ Valid until ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}
   Insurance: ✓ Valid until ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}
   DOT Inspection: ✓ Valid until ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}
`).join('\n')}

=== COMPLIANCE SUMMARY ===
✓ All vehicles have current registration
✓ All vehicles have valid insurance coverage
✓ All vehicles have passed DOT inspections
✓ No expired documents found
✓ Fleet is compliant for commercial operation

Report generated by TruckBo Fleet Management System
This report is suitable for DOT audit purposes.

Fleet Administrator: TruckBo User
Company: Fleet Transportation LLC
Date: ${new Date().toLocaleDateString()}
    `;
    
    const fileName = `fleet_compliance_summary_${new Date().toISOString().slice(0, 10)}.txt`;
    this.triggerDownload(summaryContent.trim(), fileName, 'text/plain');
  }

  /**
   * Trigger browser download for file content
   */
  private triggerDownload(content: string, fileName: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    window.URL.revokeObjectURL(url);
  }

  /**
   * Generate email-ready document content
   */
  prepareEmailDocument(vehicle: VehicleInfo, documentType: 'registration' | 'insurance' | 'inspection'): string {
    let document: VehicleDocument;
    
    switch (documentType) {
      case 'registration':
        document = this.generateRegistrationDocument(vehicle);
        break;
      case 'insurance':
        document = this.generateInsuranceDocument(vehicle);
        break;
      case 'inspection':
        document = this.generateInspectionDocument(vehicle);
        break;
      default:
        throw new Error(`Unsupported document type: ${documentType}`);
    }
    
    return `Subject: ${documentType.charAt(0).toUpperCase() + documentType.slice(1)} Document - ${vehicle.vin}

${document.content}

---
Sent from TruckBo Fleet Management System`;
  }
}

export const documentDownloadService = new DocumentDownloadService();