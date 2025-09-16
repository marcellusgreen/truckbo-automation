// AI-Powered Document Processing Service
// Processes uploaded documents using the asynchronous Google Vision API flow.

import { googleVisionProcessor, GoogleVisionProcessingResult } from './googleVisionProcessor';
import { ExtractedVehicleData, ExtractedDriverData } from '../../shared/utils/dataExtractor';
import { documentStatusPoller } from './documentStatusPoller';

export interface ProcessingResult {
  vehicleData: ExtractedVehicleData[];
  driverData: ExtractedDriverData[];
  unprocessedFiles: string[];
  errors: { fileName: string; error: string }[];
  summary: {
    totalFiles: number;
    processed: number;
    registrationDocs: number;
    insuranceDocs: number;
    medicalCertificates: number;
    cdlDocuments: number;
  };
}

export class DocumentProcessor {
  async processDocuments(files: FileList, progressCallback: (progress: number, message: string) => void): Promise<ProcessingResult> {
    const initialResults: (GoogleVisionProcessingResult & { fileName: string })[] = [];

    // 1. Upload all files and initiate processing
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = ((i + 1) / files.length) * 50; // Uploading takes first 50% of progress
      progressCallback(progress, `Uploading ${file.name}...`);
      const result = await googleVisionProcessor.processDocument(file);
      initialResults.push({ ...result, fileName: file.name });
    }

    const asyncJobs = initialResults.filter(r => r.success && r.jobId);
    const uploadErrors = initialResults.filter(r => !r.success);

    if (asyncJobs.length === 0) {
      return {
        vehicleData: [],
        driverData: [],
        unprocessedFiles: uploadErrors.map(e => e.fileName),
        errors: uploadErrors.map(e => ({ fileName: e.fileName, error: e.error || 'Upload failed' })),
        summary: { totalFiles: files.length, processed: 0, registrationDocs: 0, insuranceDocs: 0, medicalCertificates: 0, cdlDocuments: 0 },
      };
    }

    // 2. Poll for results
    progressCallback(60, `Processing ${asyncJobs.length} documents...`);
    
    let completedCount = 0;
    const totalJobs = asyncJobs.length;

    try {
      const completedResults = await documentStatusPoller.pollMultipleJobs(
        asyncJobs,
        (jobId, result) => {
          completedCount++;
          const job = asyncJobs.find(j => j.jobId === jobId);
          const progress = 60 + (40 * (completedCount / totalJobs));
          progressCallback(progress, `Processed ${job?.fileName}`);
        },
        (jobId, error) => {
          completedCount++;
          const job = asyncJobs.find(j => j.jobId === jobId);
          console.error(`❌ Job for ${job?.fileName} failed: ${error}`);
        }
      );

      // 3. Finalize and format results
      progressCallback(100, 'Finalizing results...');

      const vehicleData: ExtractedVehicleData[] = [];
      const driverData: ExtractedDriverData[] = [];
      const errors = uploadErrors.map(e => ({ fileName: e.fileName, error: e.error || 'Upload failed' }));

      Object.entries(completedResults).forEach(([jobId, result]) => {
        const job = asyncJobs.find(j => j.jobId === jobId);
        const fileName = job?.fileName || 'unknown';

        if (result && result.status === 'succeeded') {
          // The backend returns the extracted data at the root of the result object
          // We can use heuristics to determine if it's vehicle or driver data
          if (result.vin) {
            vehicleData.push({ ...result, sourceFileName: fileName } as ExtractedVehicleData);
          } else if (result.firstName) {
            driverData.push({ ...result, sourceFileName: fileName } as ExtractedDriverData);
          }
        } else {
          const errorMessage = result?.database?.error || result?.error || 'Processing failed after upload';
          errors.push({ fileName, error: errorMessage });
        }
      });

      return {
        vehicleData,
        driverData,
        unprocessedFiles: errors.map(e => e.fileName),
        errors,
        summary: {
          totalFiles: files.length,
          processed: vehicleData.length + driverData.length,
          registrationDocs: vehicleData.filter(v => v.documentType === 'registration').length,
          insuranceDocs: vehicleData.filter(v => v.documentType === 'insurance').length,
          medicalCertificates: driverData.filter(d => d.documentType === 'medical_certificate').length,
          cdlDocuments: driverData.filter(d => d.documentType === 'cdl').length,
        },
      };

    } catch (error) {
      console.error('Error during document polling:', error);
      return {
        vehicleData: [],
        driverData: [],
        unprocessedFiles: initialResults.map(r => r.fileName),
        errors: [{ fileName: 'Polling Service', error: error instanceof Error ? error.message : 'Polling failed' }],
        summary: { totalFiles: files.length, processed: 0, registrationDocs: 0, insuranceDocs: 0, medicalCertificates: 0, cdlDocuments: 0 },
      };
    }
  }
}

export const documentProcessor = new DocumentProcessor();
