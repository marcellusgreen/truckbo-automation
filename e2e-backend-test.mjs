import fs from 'fs';
import path from 'path';
import { googleVisionProcessor } from './shared/services/googleVisionProcessor.js';
import { neonFleetStorage } from './shared/services/neonFleetStorage.js';
import pool from './shared/services/db.js';

async function runTest() {
  console.log('🚀 Starting end-to-end backend test...');

  const testFilePath = path.resolve('Code test files/Registration Package - 13788.pdf');
  let vehicleIdToCleanup = null;

  try {
    // 1. Read Test File
    console.log(`📄 Reading test file: ${testFilePath}`);
    if (!fs.existsSync(testFilePath)) {
      throw new Error(`Test file not found at: ${testFilePath}`);
    }
    const fileBuffer = fs.readFileSync(testFilePath);

    // 2. Process with Google Vision and Data Extractor
    console.log('🤖 Processing document with Google Vision...');
    const visionResult = await googleVisionProcessor.processDocument(fileBuffer, { expectedDocumentType: 'registration' });

    if (!visionResult.success || !visionResult.extractedData) {
      throw new Error(`Google Vision processing failed: ${visionResult.error}`);
    }

    console.log('✅ Vision processing successful. Extracted Data:');
    console.log(visionResult.extractedData);

    const extractedData = visionResult.extractedData;

    if (!extractedData.vin) {
      throw new Error('Extraction failed: VIN not found in document.');
    }

    // 3. Save to Neon Database
    console.log('💾 Saving extracted data to Neon database...');
    const newVehicle = {
      organization_id: '550e8400-e29b-41d4-a716-446655440000', // Sample Org ID
      vin: extractedData.vin,
      make: extractedData.make || 'Unknown',
      model: extractedData.model || 'Unknown',
      year: extractedData.year || new Date().getFullYear(),
      license_plate: extractedData.licensePlate || 'Unknown',
      truck_number: extractedData.truckNumber || `Truck #${extractedData.vin.slice(-4)}`,
      status: 'active',
      compliance_status: 'compliant',
      registration_expiry: extractedData.registrationExpirationDate ? new Date(extractedData.registrationExpirationDate) : new Date(),
      insurance_expiry: extractedData.insuranceExpirationDate ? new Date(extractedData.insuranceExpirationDate) : new Date(),
    };

    const savedVehicle = await neonFleetStorage.addVehicle(newVehicle);
    vehicleIdToCleanup = savedVehicle.id;

    if (!savedVehicle || !savedVehicle.id) {
      throw new Error('Failed to save vehicle to database.');
    }

    console.log('✅ Vehicle saved successfully to database. Saved Record:');
    console.log(savedVehicle);

    // 4. Read back from Database
    console.log(`🔍 Verifying by fetching record ${savedVehicle.id} from database...`);
    const fetchedVehicle = await neonFleetStorage.getVehicle(savedVehicle.id);

    if (!fetchedVehicle) {
      throw new Error('Verification failed: Could not fetch vehicle back from database.');
    }

    console.log('✅ Verification successful. Fetched Record:');
    console.log(fetchedVehicle);

    // 5. Final Check
    if (fetchedVehicle.vin !== extractedData.vin) {
      throw new Error(`Verification failed: VIN mismatch. Expected ${extractedData.vin}, got ${fetchedVehicle.vin}`);
    }

    console.log('🎉 End-to-end test PASSED! Data flows from Vision API to Neon DB correctly.');

  } catch (error) {
    console.error('❌ End-to-end test FAILED:', error);
  } finally {
    // 6. Cleanup
    if (vehicleIdToCleanup) {
      console.log(`🧹 Cleaning up by deleting test vehicle ${vehicleIdToCleanup}...`);
      await neonFleetStorage.removeVehicle(vehicleIdToCleanup);
      console.log('✅ Cleanup complete.');
    }
    // End the pool connection to allow the script to exit
    await pool.end();
  }
}

runTest();
