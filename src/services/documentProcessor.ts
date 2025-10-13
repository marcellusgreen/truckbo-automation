// AI-Powered Document Processing Service
// Processes uploaded documents using the asynchronous Google Vision API flow.

import { googleVisionProcessor, GoogleVisionProcessingResult } from './googleVisionProcessor';
import type { ExtractedVehicleData, ExtractedDriverData } from '../../shared/utils/dataExtractor';

export type { ExtractedVehicleData, ExtractedDriverData } from '../../shared/utils/dataExtractor';
import { documentStatusPoller } from './documentStatusPoller';
import { isRefactorDebugEnabled, refactorDebugLog } from '../utils/refactorDebug';

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

const logLifecycle = (event: string, details?: Record<string, unknown>) => {
  if (isRefactorDebugEnabled()) {
    refactorDebugLog('DocumentProcessor', event, details);
  }
};

export class DocumentProcessor {
  async processDocuments(
    files: FileList,
    progressCallback: (progress: number, message: string) => void
  ): Promise<ProcessingResult> {
    const totalFiles = files.length;
    logLifecycle('start', { totalFiles });

    const initialResults: (GoogleVisionProcessingResult & { fileName: string })[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = ((i + 1) / files.length) * 50;
      progressCallback(progress, 'Uploading ' + file.name + '...');
      logLifecycle('upload:begin', { fileName: file.name, index: i + 1, totalFiles });

      const result = await googleVisionProcessor.processDocument(file);
      initialResults.push({ ...result, fileName: file.name });

      if (result.success) {
        logLifecycle('upload:queued', {
          fileName: file.name,
          jobId: result.jobId,
          hasAsyncJob: Boolean(result.jobId)
        });
      } else {
        logLifecycle('upload:error', {
          fileName: file.name,
          error: result.error ?? 'unknown-error'
        });
      }
    }

    const asyncJobs = initialResults.filter(
      (result): result is GoogleVisionProcessingResult & { fileName: string; jobId: string; statusUrl: string } =>
        Boolean(result.success && result.jobId && result.statusUrl)
    );
    const uploadErrors = initialResults.filter(r => !r.success);

    logLifecycle('jobs:queued', {
      asyncJobCount: asyncJobs.length,
      uploadErrorCount: uploadErrors.length
    });

    if (asyncJobs.length === 0) {
      return {
        vehicleData: [],
        driverData: [],
        unprocessedFiles: uploadErrors.map(e => e.fileName),
        errors: uploadErrors.map(e => ({ fileName: e.fileName, error: e.error || 'Upload failed' })),
        summary: {
          totalFiles,
          processed: 0,
          registrationDocs: 0,
          insuranceDocs: 0,
          medicalCertificates: 0,
          cdlDocuments: 0
        }
      };
    }

    progressCallback(60, 'Processing ' + asyncJobs.length + ' documents...');

    let completedCount = 0;
    const totalJobs = asyncJobs.length;

    try {
      const completedResults = await documentStatusPoller.pollMultipleJobs(
        asyncJobs.map(job => ({
          jobId: job.jobId,
          statusUrl: job.statusUrl,
          fileName: job.fileName
        })),
        (jobId, result) => {
          completedCount++;
          const job = asyncJobs.find(j => j.jobId === jobId);
          const progress = 60 + (40 * (completedCount / totalJobs));
          progressCallback(progress, 'Processed ' + (job?.fileName ?? jobId));
          logLifecycle('job:completed', {
            jobId,
            fileName: job?.fileName,
            status: result?.status
          });
        },
        (jobId, error) => {
          completedCount++;
          const job = asyncJobs.find(j => j.jobId === jobId);
          logLifecycle('job:error', {
            jobId,
            fileName: job?.fileName,
            error
          });
        }
      );

      progressCallback(100, 'Finalizing results...');

      const vehicleData: ExtractedVehicleData[] = [];
      const driverData: ExtractedDriverData[] = [];
      const errors = uploadErrors.map(e => ({ fileName: e.fileName, error: e.error || 'Upload failed' }));

      Object.entries(completedResults).forEach(([jobId, result]) => {
        const job = asyncJobs.find(j => j.jobId === jobId);
        const fileName = job?.fileName || 'unknown';

        if (result && result.status === 'succeeded') {
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

      logLifecycle('complete', {
        processedVehicles: vehicleData.length,
        processedDrivers: driverData.length,
        errorCount: errors.length
      });

      return {
        vehicleData,
        driverData,
        unprocessedFiles: errors.map(e => e.fileName),
        errors,
        summary: {
          totalFiles,
          processed: vehicleData.length + driverData.length,
          registrationDocs: vehicleData.filter(v => v.documentType === 'registration').length,
          insuranceDocs: vehicleData.filter(v => v.documentType === 'insurance').length,
          medicalCertificates: driverData.filter(d => d.documentType === 'medical_certificate').length,
          cdlDocuments: driverData.filter(d => d.documentType === 'cdl').length
        }
      };
    } catch (error) {
      logLifecycle('polling:error', {
        message: error instanceof Error ? error.message : 'Polling failed'
      });
      console.error('Error during document polling:', error);
      return {
        vehicleData: [],
        driverData: [],
        unprocessedFiles: initialResults.map(r => r.fileName),
        errors: [{ fileName: 'Polling Service', error: error instanceof Error ? error.message : 'Polling failed' }],
        summary: {
          totalFiles,
          processed: 0,
          registrationDocs: 0,
          insuranceDocs: 0,
          medicalCertificates: 0,
          cdlDocuments: 0
        }
      };
    }
  }
}

export const documentProcessor = new DocumentProcessor();
