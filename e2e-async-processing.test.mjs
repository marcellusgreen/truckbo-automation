import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3000';
const PDF_PATH = './Code test files/Registration Package - 15780.pdf';
const TEST_TIMEOUT = 180000; // 3 minutes for the full async process
const POLLING_INTERVAL = 5000; // 5 seconds

let serverProcess;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  console.log('Starting server for testing...');
  const env = { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: './google_credentials.json' };
  serverProcess = exec('npm run api:dev', { env });

  serverProcess.stdout.on('data', (data) => console.log(`[SERVER STDOUT]: ${data}`));
  serverProcess.stderr.on('data', (data) => console.error(`[SERVER STDERR]: ${data}`));

  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (response.ok) {
        console.log('Server is ready.');
        return;
      }
    } catch (e) { /* Ignore */ }
    await sleep(1000);
  }
  throw new Error('Server failed to start in time.');
}

async function runTest() {
  const testStartTime = Date.now();
  console.log(`--- Running Async Processing E2E Test ---`);
  try {
    await startServer();

    // Step 1: Upload the document and get a job ID
    console.log(`Uploading test file: ${PDF_PATH}`);
    const form = new FormData();
    form.append('document', fs.createReadStream(PDF_PATH));

    const uploadResponse = await fetch(`${API_BASE_URL}/api/v1/documents/process`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (uploadResponse.status !== 202) {
      throw new Error(`Expected status 202 Accepted but got ${uploadResponse.status}`);
    }

    const { data: { jobId, statusUrl } } = await uploadResponse.json();
    console.log(`Processing job started with ID: ${jobId}`);

    // Step 2: Poll the status endpoint
    let finalResult;
    while (Date.now() - testStartTime < TEST_TIMEOUT) {
      console.log(`Polling status URL: ${statusUrl}...`);
      const statusResponse = await fetch(`${API_BASE_URL}${statusUrl}`);

      if (!statusResponse.ok) {
        throw new Error(`Status request failed with ${statusResponse.status}: ${await statusResponse.text()}`);
      }

      const statusData = await statusResponse.json();

      if (statusData.data.status === 'succeeded') {
        console.log('Processing succeeded!');
        finalResult = statusData.data;
        break;
      } else if (statusData.data.status === 'failed') {
        throw new Error(`Processing failed: ${JSON.stringify(statusData.data.errors)}`);
      } else {
        // Still processing, wait and poll again
        await sleep(POLLING_INTERVAL);
      }
    }

    if (!finalResult) {
      throw new Error('Test timed out waiting for processing to complete.');
    }

    // Step 3: Verify the final result
    console.log('Final result structure:', JSON.stringify(finalResult, null, 2));

    if (!finalResult.text || finalResult.text.length < 100) {
        throw new Error('Final result does not contain extracted text.');
    }

    // Check if VIN is directly in finalResult or in extractedData
    const vin = finalResult.vin || (finalResult.extractedData && finalResult.extractedData.vin);
    if (!vin) {
        throw new Error('Final result does not contain a VIN. Available fields: ' + Object.keys(finalResult).join(', '));
    }

    console.log('--- ✅ TEST PASSED ---');
    console.log(`File processed successfully. Extracted VIN: ${vin}`);

  } catch (error) {
    console.error('--- ❌ TEST FAILED ---');
    console.error(error);
    process.exit(1);
  } finally {
    if (serverProcess) {
      console.log('Stopping server...');
      serverProcess.kill();
    }
  }
}

runTest();