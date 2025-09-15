// API Test Suite
// Comprehensive tests for the standardized API endpoints, now including large file uploads.

import { logger } from '../../../shared/services/logger';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch, { RequestInit, Response } from 'node-fetch';

// Test configuration
const BASE_URL = 'http://localhost:3001/api/v1';
const TEST_TIMEOUT = 180000; // 3 minutes for long async tests
const POLLING_INTERVAL = 10000; // 10 seconds
const LARGE_PDF_PATH = './Code test files/Registration Package - 13788.pdf';

// Define the credentials object first to avoid parsing issues with build tools
const credentialsObject = {
    type: 'service_account',
    project_id: 'wired-armor-471701-i1',
    private_key_id: 'c743e06cc4d65b9f9896c8b39172183e89729d91',
    private_key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDXFlyv3V1KSmUR
XQjcBQzoQP4txQ2aVe8fxh1tye/Qni9Mks3qSU/FYiJ4ELyAKinGx3qgFcIozctg
sT8ddHDcIMF/BN9vavQWo9WwUp1MM6jtCAvbVUalQpvl1RuF7IWjcnY0HKtpuADv
pyPMfcDU31CuqPhnp4FbCA50zJ5eh+ksIImZ2hPsx01WNB6AjIhaWOQoX7ICb2E5
P3r6LQSxx+31efJFZ2cSeukBatZFck5AKpqqYTKpGSEbRc9AIDPF0KWkd1Vdpnqs
vGJz8LYVDGAw2+ARFIvygq9V8pJ6bq9ZGTIH02v57LyUzXod3bQ7QA5BLAU3Fmrb
GwA3tWA5AgMBAAECggEAQmtnZ++F9YEPwNLn/3mXyMj5NQ0a7EQJOdimEddANT4E
ATN8XxMQjTWGy2jvrOxYRkgnd/QAJzWVzmAty1y1VpQJndMwE1Y3vzs6iw44uU5
Dyli7/JfhH0TQ2ARxcOKaTTZh7IqxNTLhTYp+eYDfDkR4z3Op8O0UHYmcK8XYL0q
pwQbqlnW9ndjORR8fk+eOxG1Vb3eryQd3eLwy8g63ep8RMozuC1PLayGkP0nCIA+
nonC49ALJu/yhRCO4TVZUQon9O88VR6yEooHW/RCq1v7mgTh3UlCXyxdTqauYku/z
1IAl8M8CYsDUewqPKR6ciE3h85o2tOCx23eysef9+QKBgQDyIIb3JI1eyHfVfgTc
QotZosCdzn+3herccANTcHQGLIUnafN1FyC+aGsDSm6KfhP54fsPay/cPGcHS2UW
D2xU3qSdQy0FdZtmiBH6WkFe34Ffu+Eg/KDRNRmvIgf5HLZLq7X1Qx/HnGbi66rj
Nxz5HFLl/2HTehZT7t1jpR6hEwKBgQDjaTi+kuFfc1CI3V/jg0wJA1czaLxGuYDW
bPwdO29KSf5daWqaZXCjUFSbMLPJ+Ws+Moci9JBqC/kmU0SfkwgYktj0Max1UGDw
e+prWjoUzb6kq71J1a+8t5o/kGS2yDJlfjsEnGnuXiPTly9c5Rx+npRhSY30Hx4C
Rt36w/0vAwKBgD8XVLPPdXruN7OMu819FXyM2S4Foef7YECCe4thcQouzZ+AjyzC
kwiqgr//xCAYTDI/vUC+SGFV5+7RqYx/BlZzEWfdGj0i8RRdfnnCzOfgy4Bbn4UN
7wW0lXW6I2O5JJNBMhJKtlw4F+MnT4cXVFhhFgTSb/ZACNNkGZIec4W7AoGBAOBv
8HjlLViuzkTFduVrp5cdnOo369lBK050sT2IcwW2kTxP1c4bX1dO6LFhF4+2gYkZ
BRYSmJSQzIxukcOLsOnPxB79B1+gvIubQHhCzB/MDuMmO+Kq6o4uBiXFtCBQ5KwW
MNkUJdgDQQiKpUvhMoYkq/x4Q4kzTMKifmIHG9FRAoGAT4DH40tF7+Si3adkUx3S
ay2J2t5v+HEqTkPEAo3CRmxYUqf9MA2QhZbpYaZXW7skdwhvuVZTpJtZ4RpuMHDC
bSS9BP+Yzd7dPoaDsQhRuKGzQckot0g8/6CBTlUCqJoqcdObdO/6dZlDaGuh3DhI
xw6QqEJXFvYmvOEWqd4T4q8=
-----END PRIVATE KEY-----
`,
    client_email: 'truckbo-vision-processor@wired-armor-471701-i1.iam.gserviceaccount.com',
    client_id: '115807599899740429951',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/truckbo-vision-processor%40wired-armor-471701-i1.iam.gserviceaccount.com',
    universe_domain: 'googleapis.com',
};
const GOOGLE_CREDENTIALS = JSON.stringify(credentialsObject);

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
  response?: any;
}

class ApiTester {
  private results: TestResult[] = [];
  private server: any;

  constructor() {
    console.log('🧪 API Test Suite Initializing...
');
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting API Tests
');
    
    try {
      await this.startApiServer();
      await this.waitForServer();
      
      await this.testHealthEndpoints();
      await this.testLargeDocumentUpload();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed to run:', error);
      process.exit(1); // Exit with failure code if setup fails
    } finally {
      await this.stopApiServer();
    }
  }

  private async startApiServer(): Promise<void> {
    console.log('🔧 Starting API server for testing...');
    try {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = GOOGLE_CREDENTIALS;
      const appModule = await import('../app');
      const app = appModule.default;
      // Use port 0 to let the OS assign a random available port
      this.server = app.listen(0, () => {
        const port = this.server.address().port;
        process.env.TEST_SERVER_PORT = String(port);
        console.log(`✅ Test API server started on port ${port}
`);
      });
    } catch (error) {
      console.error('❌ Failed to start API server:', error);
      throw error;
    }
  }

  private async waitForServer(): Promise<void> {
    console.log('⏳ Waiting for server to be ready...');
    const port = process.env.TEST_SERVER_PORT;
    if (!port) throw new Error('Server port not set');

    for (let i = 0; i < 15; i++) {
      try {
        const response = await fetch(`http://localhost:${port}/health`);
        if (response.ok) {
          console.log('✅ Server is ready
');
          return;
        }
      } catch { /* Ignore */ }
      await this.sleep(1000);
    }
    throw new Error('Server failed to start within timeout');
  }

  private async stopApiServer(): Promise<void> {
    if (this.server) {
      console.log('
🔧 Stopping test server...');
      return new Promise(resolve => this.server.close(resolve));
    }
  }

  private async testHealthEndpoints(): Promise<void> {
    console.log('🔍 Testing Health Endpoint...');
    await this.runTest('Health Check', async () => {
      const port = process.env.TEST_SERVER_PORT;
      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();
      this.assert(response.status === 200, 'Health endpoint should return 200');
      return data;
    });
    console.log();
  }

  private async testLargeDocumentUpload(): Promise<void> {
    console.log('📄 Testing Large Document Async Upload...');
    await this.runTest('POST /documents/process (Large PDF)', async () => {
      const testStartTime = Date.now();
      const port = process.env.TEST_SERVER_PORT;
      
      console.log(`  -> Uploading ${LARGE_PDF_PATH}...`);
      const form = new FormData();
      form.append('document', fs.createReadStream(LARGE_PDF_PATH));
      
      const uploadResponse = await fetch(`http://localhost:${port}/api/v1/documents/process`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      });

      this.assert(uploadResponse.status === 202, `Expected 202 Accepted, got ${uploadResponse.status}`);
      const uploadResult = await uploadResponse.json();
      const { jobId, statusUrl } = uploadResult.data;
      this.assert(!!jobId, 'Response should contain a job ID');
      console.log(`  -> Job started: ${jobId}`);

      let finalResult;
      while (Date.now() - testStartTime < TEST_TIMEOUT) {
        await this.sleep(POLLING_INTERVAL);
        console.log(`  -> Polling status...`);
        const statusResponse = await fetch(`http://localhost:${port}${statusUrl}`);
        const statusData = await statusResponse.json();

        if (statusData.data.status === 'succeeded') {
          console.log('  -> Processing succeeded!');
          finalResult = statusData.data;
          break;
        } else if (statusData.data.status === 'failed') {
          throw new Error(`Processing failed: ${JSON.stringify(statusData.data.errors)}`);
        }
      }

      this.assert(!!finalResult, 'Test timed out waiting for processing to complete.');
      this.assert(finalResult.text && finalResult.text.length > 100, 'Final result should have extracted text.');
      this.assert(finalResult.extractedData && finalResult.extractedData.vin, 'Final result should have a VIN.');

      return finalResult;
    });
    console.log();
  }

  private async runTest(name: string, testFunction: () => Promise<any>): Promise<void> {
    const startTime = Date.now();
    try {
      console.log(`  ⏳ ${name}...`);
      const result = await testFunction();
      const duration = Date.now() - startTime;
      this.results.push({ name, status: 'pass', duration });
      console.log(`  ✅ ${name} - ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, status: 'fail', duration, error: errorMessage });
      console.log(`  ❌ ${name} - ${duration}ms`);
      console.log(`     Error: ${errorMessage}`);
    }
  }

  private assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateReport(): void {
    console.log('
' + '='.repeat(60));
    console.log('🎯 API TEST REPORT');
    console.log('='.repeat(60));
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    if (failed > 0) {
      console.log(`
❌ Failed Tests:
`);
      this.results.filter(r => r.status === 'fail').forEach(test => {
        console.log(`  • ${test.name}: ${test.error}`);
      });
    }
    console.log(`
Overall Results: ✅ Passed: ${passed}, ❌ Failed: ${failed}`);
    if (failed === 0) {
      console.log(`
🎉 All tests passed!`);
    } else {
      console.log(`
⚠️  Some tests failed. Please review issues.`);
      process.exit(1); // Exit with failure code if any test fails
    }
    console.log('
' + '='.repeat(60));
  }
}

// Run tests
const tester = new ApiTester();
tester.runAllTests();
