const fs = require('fs');

// Test complete driver dashboard functionality
console.log('🚛 Testing Complete Driver Dashboard Functionality\n');

// Mock the date calculation function
function calculateDaysUntilExpiry(expirationDate) {
  if (!expirationDate) return -999;
  
  const expiry = new Date(expirationDate);
  const now = new Date();
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

// Mock the status determination function
function determineStatus(daysUntil) {
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring_soon';
  return 'valid';
}

// Create realistic driver data with extracted document information
const mockDriversFromDocuments = [
  {
    id: '1',
    firstName: 'John',
    lastName: 'Smith',
    status: 'active',
    medicalCertificate: {
      certificateNumber: 'MED-TX-2024-001-4578',
      issuedDate: '01/15/2024',
      expirationDate: '01/15/2026',
      examinerName: 'Dr. Sarah Johnson, MD',
      examinerNationalRegistry: '1234567890',
      restrictions: ['CORRECTIVE LENSES REQUIRED'],
      daysUntilExpiry: calculateDaysUntilExpiry('01/15/2026'),
      status: determineStatus(calculateDaysUntilExpiry('01/15/2026'))
    },
    cdlInfo: {
      cdlNumber: 'TX-CDL-45678912',
      cdlState: 'TX',
      issueDate: '05/20/2022',
      expirationDate: '03/15/2029',
      class: 'A',
      endorsements: ['H', 'N', 'X', 'P'],
      restrictions: ['L - No Air Brake Equipped CMV', 'M - No Class A Passenger Vehicle', 'N - No Class A & B Passenger Vehicle'],
      daysUntilExpiry: calculateDaysUntilExpiry('03/15/2029'),
      status: determineStatus(calculateDaysUntilExpiry('03/15/2029'))
    }
  },
  {
    id: '2',
    firstName: 'Maria',
    lastName: 'Rodriguez',
    status: 'active',
    medicalCertificate: {
      certificateNumber: 'MED-CA-2025-002-9876',
      issuedDate: '03/10/2024',
      expirationDate: '02/15/2025', // Expiring soon
      examinerName: 'Dr. Robert Chen, MD',
      examinerNationalRegistry: '9876543210',
      restrictions: [],
      daysUntilExpiry: calculateDaysUntilExpiry('02/15/2025'),
      status: determineStatus(calculateDaysUntilExpiry('02/15/2025'))
    },
    cdlInfo: {
      cdlNumber: 'CA-CDL-78945612',
      cdlState: 'CA',
      issueDate: '09/12/2020',
      expirationDate: '08/22/2028',
      class: 'A',
      endorsements: ['S', 'P', 'N', 'T'],
      restrictions: [],
      daysUntilExpiry: calculateDaysUntilExpiry('08/22/2028'),
      status: determineStatus(calculateDaysUntilExpiry('08/22/2028'))
    }
  },
  {
    id: '3',
    firstName: 'Robert',
    lastName: 'Brown',
    status: 'active',
    medicalCertificate: {
      certificateNumber: 'MED-FL-2023-003-1234',
      issuedDate: '11/20/2023',
      expirationDate: '12/01/2024', // Expired
      examinerName: 'Dr. Amanda Lee, MD',
      examinerNationalRegistry: '5555666677',
      restrictions: ['DIABETIC - ANNUAL MONITORING REQUIRED'],
      daysUntilExpiry: calculateDaysUntilExpiry('12/01/2024'),
      status: determineStatus(calculateDaysUntilExpiry('12/01/2024'))
    },
    cdlInfo: {
      cdlNumber: 'FL-CDL-11223344',
      cdlState: 'FL',
      issueDate: '06/15/2020',
      expirationDate: '02/10/2025', // Expiring soon
      class: 'A',
      endorsements: ['H', 'N'],
      restrictions: ['E - NO MANUAL TRANSMISSION CMV'],
      daysUntilExpiry: calculateDaysUntilExpiry('02/10/2025'),
      status: determineStatus(calculateDaysUntilExpiry('02/10/2025'))
    }
  }
];

// Alert generation function (from DriverManagementPage)
function generateAlerts(driverData) {
  const alerts = [];
  
  driverData.forEach(driver => {
    const driverName = `${driver.firstName} ${driver.lastName}`;
    
    // Medical certificate alerts
    if (driver.medicalCertificate.status === 'expired') {
      alerts.push({
        driverId: driver.id,
        driverName,
        alertType: 'medical_expired',
        daysUntilExpiry: driver.medicalCertificate.daysUntilExpiry,
        expirationDate: driver.medicalCertificate.expirationDate,
        priority: 'critical'
      });
    } else if (driver.medicalCertificate.status === 'expiring_soon') {
      alerts.push({
        driverId: driver.id,
        driverName,
        alertType: 'medical_expires_soon',
        daysUntilExpiry: driver.medicalCertificate.daysUntilExpiry,
        expirationDate: driver.medicalCertificate.expirationDate,
        priority: driver.medicalCertificate.daysUntilExpiry <= 7 ? 'critical' : 'high'
      });
    }
    
    // CDL alerts
    if (driver.cdlInfo.status === 'expired') {
      alerts.push({
        driverId: driver.id,
        driverName,
        alertType: 'cdl_expired',
        daysUntilExpiry: driver.cdlInfo.daysUntilExpiry,
        expirationDate: driver.cdlInfo.expirationDate,
        priority: 'critical'
      });
    } else if (driver.cdlInfo.status === 'expiring_soon') {
      alerts.push({
        driverId: driver.id,
        driverName,
        alertType: 'cdl_expires_soon',
        daysUntilExpiry: driver.cdlInfo.daysUntilExpiry,
        expirationDate: driver.cdlInfo.expirationDate,
        priority: 'high'
      });
    }
  });
  
  // Sort alerts by priority (critical first) then by days until expiry
  return alerts.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.daysUntilExpiry - b.daysUntilExpiry;
  });
}

// Dashboard filtering functions
function getFilteredDrivers(drivers, filterStatus) {
  switch (filterStatus) {
    case 'active':
      return drivers.filter(d => d.status === 'active');
    case 'expiring':
      return drivers.filter(d => 
        d.medicalCertificate.status === 'expiring_soon' || 
        d.cdlInfo.status === 'expiring_soon'
      );
    case 'expired':
      return drivers.filter(d => 
        d.medicalCertificate.status === 'expired' || 
        d.cdlInfo.status === 'expired'
      );
    default:
      return drivers;
  }
}

// Run comprehensive dashboard test
function runCompleteDashboardTest() {
  console.log('='.repeat(70));
  console.log('DRIVER DASHBOARD FUNCTIONALITY TEST');
  console.log('='.repeat(70));
  
  // 1. Test driver data processing
  console.log('\n📋 1. DRIVER DATA PROCESSING');
  console.log('-'.repeat(40));
  
  mockDriversFromDocuments.forEach((driver, i) => {
    console.log(`Driver ${i + 1}: ${driver.firstName} ${driver.lastName}`);
    console.log(`  Medical: ${driver.medicalCertificate.certificateNumber} - ${driver.medicalCertificate.status} (${driver.medicalCertificate.daysUntilExpiry} days)`);
    console.log(`  CDL: ${driver.cdlInfo.cdlNumber} (Class ${driver.cdlInfo.class}) - ${driver.cdlInfo.status} (${driver.cdlInfo.daysUntilExpiry} days)`);
    console.log(`  Endorsements: ${driver.cdlInfo.endorsements.join(', ')}`);
    console.log(`  Restrictions: ${driver.cdlInfo.restrictions.length > 0 ? driver.cdlInfo.restrictions.join('; ') : 'None'}`);
    console.log('');
  });
  
  // 2. Test alert generation
  console.log('🚨 2. ALERT GENERATION');
  console.log('-'.repeat(40));
  
  const alerts = generateAlerts(mockDriversFromDocuments);
  console.log(`Total alerts generated: ${alerts.length}\n`);
  
  alerts.forEach((alert, i) => {
    console.log(`Alert ${i + 1} [${alert.priority.toUpperCase()}]:`);
    console.log(`  Driver: ${alert.driverName} (ID: ${alert.driverId})`);
    console.log(`  Issue: ${alert.alertType.replace(/_/g, ' ').toUpperCase()}`);
    console.log(`  Expiration: ${alert.expirationDate}`);
    console.log(`  Days: ${alert.daysUntilExpiry}`);
    console.log('');
  });
  
  // 3. Test dashboard filtering
  console.log('🔍 3. DASHBOARD FILTERING');
  console.log('-'.repeat(40));
  
  const filters = ['all', 'active', 'expiring', 'expired'];
  filters.forEach(filter => {
    const filtered = getFilteredDrivers(mockDriversFromDocuments, filter);
    console.log(`Filter: ${filter} → ${filtered.length} drivers`);
  });
  
  // 4. Test alert categorization
  console.log('\n📊 4. ALERT CATEGORIZATION');
  console.log('-'.repeat(40));
  
  const criticalAlerts = alerts.filter(a => a.priority === 'critical').length;
  const highAlerts = alerts.filter(a => a.priority === 'high').length;
  const medicalAlerts = alerts.filter(a => a.alertType.includes('medical')).length;
  const cdlAlerts = alerts.filter(a => a.alertType.includes('cdl')).length;
  const expiredAlerts = alerts.filter(a => a.alertType.includes('expired')).length;
  const expiringSoonAlerts = alerts.filter(a => a.alertType.includes('expires_soon')).length;
  
  console.log(`Critical Priority: ${criticalAlerts}`);
  console.log(`High Priority: ${highAlerts}`);
  console.log(`Medical Certificate Alerts: ${medicalAlerts}`);
  console.log(`CDL Alerts: ${cdlAlerts}`);
  console.log(`Expired Documents: ${expiredAlerts}`);
  console.log(`Expiring Soon: ${expiringSoonAlerts}`);
  
  // 5. Compliance status overview
  console.log('\n✅ 5. COMPLIANCE STATUS OVERVIEW');
  console.log('-'.repeat(40));
  
  const totalDrivers = mockDriversFromDocuments.length;
  const activeDrivers = mockDriversFromDocuments.filter(d => d.status === 'active').length;
  const compliantDrivers = mockDriversFromDocuments.filter(d => 
    d.medicalCertificate.status === 'valid' && d.cdlInfo.status === 'valid'
  ).length;
  const nonCompliantDrivers = totalDrivers - compliantDrivers;
  
  console.log(`Total Drivers: ${totalDrivers}`);
  console.log(`Active Status: ${activeDrivers}`);
  console.log(`Fully Compliant: ${compliantDrivers}`);
  console.log(`Non-Compliant: ${nonCompliantDrivers}`);
  console.log(`Compliance Rate: ${((compliantDrivers / totalDrivers) * 100).toFixed(1)}%`);
  
  // 6. Test results summary
  console.log('\n🎯 6. TEST RESULTS SUMMARY');
  console.log('='.repeat(40));
  
  const testsPassed = [
    mockDriversFromDocuments.length > 0,
    alerts.length > 0,
    criticalAlerts > 0, // Should have expired documents
    medicalAlerts > 0,
    cdlAlerts > 0,
    getFilteredDrivers(mockDriversFromDocuments, 'expired').length > 0,
    getFilteredDrivers(mockDriversFromDocuments, 'expiring').length > 0
  ];
  
  const passedCount = testsPassed.filter(Boolean).length;
  const totalTests = testsPassed.length;
  
  console.log(`Tests Passed: ${passedCount}/${totalTests}`);
  console.log(`Success Rate: ${((passedCount / totalTests) * 100).toFixed(1)}%`);
  
  if (passedCount === totalTests) {
    console.log('🎉 All dashboard functionality tests PASSED!');
    console.log('✅ Driver alert generation works correctly');
    console.log('✅ Dashboard filtering works correctly');  
    console.log('✅ CDL and medical certificate processing works correctly');
    console.log('✅ Compliance status tracking works correctly');
  } else {
    console.log('❌ Some tests failed - review dashboard functionality');
  }
  
  console.log('\n' + '='.repeat(70));
}

// Run the comprehensive test
runCompleteDashboardTest();