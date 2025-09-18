// Google Vision Processor - Environment Agnostic
// Handles document processing using Google Vision API, including async GCS workflow.

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage, File } from '@google-cloud/storage';
import { logger, LogContext } from './logger';
import { dataExtractor } from '../utils/dataExtractor';
import { v4 as uuidv4 } from 'uuid';
import { documentProcessingJobs, DocumentProcessingJobRecord } from './documentProcessingJobs';

type VisionClientOptions = ConstructorParameters<typeof ImageAnnotatorClient>[0];
type StorageClientOptions = ConstructorParameters<typeof Storage>[0];

// Document processing result interface
export interface GoogleVisionProcessingResult {
  text: string;
  documentType?: string;
  extractedData?: any;
  confidence?: number;
  requiresReview?: boolean;
  autoApprovalRecommended?: boolean;
  processingNotes?: string[];
  warnings?: string[];
  errors?: string[];
}

export interface GoogleVisionAsyncResult {
  status: 'processing' | 'succeeded' | 'failed';
  result?: any;
  job?: DocumentProcessingJobRecord;
}

const INPUT_BUCKET = 'truckbo-gcs-input-documents';
const OUTPUT_BUCKET = 'truckbo-gcs-output-results';

export class GoogleVisionProcessor {
  private visionClient: ImageAnnotatorClient;
  private storageClient: Storage;
  private readonly context: LogContext = { layer: 'processor', component: 'GoogleVisionProcessor' };

  constructor() {
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    let visionOptions: VisionClientOptions = {};
    let storageOptions: StorageClientOptions = {};

    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        visionOptions = { credentials };
        storageOptions = { credentials };
        logger.info('Initializing Google Cloud clients with credentials from environment variable.', this.context);
      } catch (error) {
        logger.warn('Failed to parse GOOGLE_APPLICATION_CREDENTIALS as JSON. Assuming it\'s a file path.', this.context, error as Error);
        visionOptions = { keyFilename: credentialsJson };
        storageOptions = { keyFilename: credentialsJson };
      }
    } else {
      logger.warn('GOOGLE_APPLICATION_CREDENTIALS environment variable not set. Using default credentials.', this.context);
    }

    this.visionClient = new ImageAnnotatorClient(visionOptions);
    this.storageClient = new Storage(storageOptions);
  }

  /**
   * Processes a document asynchronously using GCS for large files.
   * @param fileBuffer The buffer of the file to process.
   * @param originalName The original name of the file.
   * @param mimeType The mime type of the file.
   * @returns The name of the long-running operation.
   */
  async processDocumentAsync(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const gcsFileName = `${uuidv4()}-${originalName}`;
    logger.info(`Uploading ${originalName} to GCS as ${gcsFileName}`, this.context);

    // 1. Upload file to GCS
    await this.storageClient.bucket(INPUT_BUCKET).file(gcsFileName).save(fileBuffer, {
      contentType: mimeType,
    });

    const gcsSourceUri = `gs://${INPUT_BUCKET}/${gcsFileName}`;
    const gcsDestinationUri = `gs://${OUTPUT_BUCKET}/${gcsFileName}-results/`;

    logger.info(`Starting async Vision API job for ${gcsSourceUri}`, this.context);

    // 2. Start the async Vision API job
    const [operation] = await this.visionClient.asyncBatchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            gcsSource: {
              uri: gcsSourceUri,
            },
            mimeType: mimeType,
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          outputConfig: {
            gcsDestination: {
              uri: gcsDestinationUri,
            },
            batchSize: 1, // Process one file at a time
          },
        },
      ],
    });

    const operationName = operation.name;
    if (!operationName) {
      throw new Error('Failed to get operation name from Vision API.');
    }
    logger.info(`Vision API job started. Operation name: ${operationName}`, this.context);

    await documentProcessingJobs.recordJobStart({
      jobId: operationName,
      originalFilename: originalName,
      mimeType,
      fileSize: fileBuffer.length,
      gcsInputBucket: INPUT_BUCKET,
      gcsInputObject: gcsFileName,
      gcsOutputBucket: OUTPUT_BUCKET,
      gcsOutputPrefix: `${gcsFileName}-results/`
    });

    return operationName;
  }

  /**
   * Checks the status of a long-running operation and retrieves the result.
   * @param operationName The name of the operation to check.
   * @returns The processing result or a status indicating it's still running.
   */
  async getAsyncResult(operationName: string): Promise<GoogleVisionAsyncResult> {
    const jobRecord = await documentProcessingJobs.getJob(operationName);
    if (!jobRecord) {
      throw new Error(`No persisted job metadata found for operation: ${operationName}`);
    }

    const operation = await this.visionClient.checkAsyncBatchAnnotateFilesProgress(operationName);

    if (!operation.done) {
      logger.info(`Operation ${operationName} is still processing.`, this.context);
      return { status: 'processing', job: jobRecord };
    }

    if (operation.error) {
      const message = operation.error.message || 'Vision API reported an error';
      await documentProcessingJobs.markFailed(operationName, message);
      logger.error(`Operation ${operationName} failed.`, this.context, operation.error as Error);
      return { status: 'failed', result: operation.error, job: { ...jobRecord, status: 'failed', errorMessage: message } };
    }

    logger.info(`Operation ${operationName} succeeded. Fetching results from GCS.`, this.context);

    const [files] = await this.storageClient
      .bucket(jobRecord.gcsOutputBucket)
      .getFiles({ prefix: jobRecord.gcsOutputPrefix });
    logger.info(`Looking for files with prefix: ${jobRecord.gcsOutputPrefix}, found ${files.length} files`, this.context);

    if (files.length === 0) {
      throw new Error(`Vision API job completed, but no output file was found in GCS with prefix: ${jobRecord.gcsOutputPrefix}`);
    }

    // Find the JSON output file
    const resultFile = files.find((file: File) => file.name.endsWith('.json'));
    if (!resultFile) {
      throw new Error('No JSON output file found in the result folder.');
    }

    const [contents] = await resultFile.download();
    const rawResult = contents.toString('utf8');
    const resultJson = JSON.parse(rawResult);

    // The result JSON is complex; we need to extract the text.
    const fullText = resultJson.responses[0].fullTextAnnotation?.text || '';

    // 4. Perform data extraction on the combined text
    const structuredData = await this.extractStructuredData(fullText, undefined, jobRecord.originalFilename);

    const updatedJob = await documentProcessingJobs.markSucceeded(operationName, rawResult) || jobRecord;

    return {
      status: 'succeeded',
      result: { text: fullText, ...structuredData },
      job: updatedJob
    };
  }

  /**
   * Extracts structured data from raw text. Made public for use after PDF splitting.
   */
  async extractStructuredData(text: string, expectedType?: string, sourceFileName?: string): Promise<Partial<any>> {
    logger.debug('Extracting structured data from text', { ...this.context, operation: 'extractStructuredData' });
    const docType = expectedType || 'unknown';
    const fileName = sourceFileName || 'server-processed-async';

    if (docType === 'registration' || docType === 'insurance' || docType === 'unknown') {
      return dataExtractor.parseVehicleData(text, docType, fileName);
    } else if (docType === 'medical_certificate' || docType === 'cdl_license' || docType === 'cdl') {
      const driverDocType = docType === 'cdl_license' ? 'cdl' : docType;
      return dataExtractor.parseDriverData(text, driverDocType, fileName);
    } else {
      return { documentType: 'unknown', processingNotes: ['Could not determine document type.'] };
    }
  }

  /**
   * Finalize a job once persistence succeeds. Optionally cleans up GCS artifacts.
   */
  async finalizeJob(jobId: string, options: { cleanup?: boolean } = {}): Promise<void> {
    const { cleanup = true } = options;
    const jobRecord = await documentProcessingJobs.getJob(jobId);
    if (!jobRecord) {
      logger.warn('Attempted to finalize unknown job', this.context, { jobId });
      return;
    }

    if (!cleanup) {
      logger.info('Finalize called without cleanup; leaving artifacts in place', this.context, { jobId });
      return;
    }

    await this.cleanupJobArtifacts(jobRecord);
  }

  private async cleanupJobArtifacts(job: DocumentProcessingJobRecord): Promise<void> {
    try {
      logger.info(`Cleaning up GCS files for operation ${job.jobId}`, this.context);

      const deletions: Promise<unknown>[] = [];
      const inputFile = this.storageClient.bucket(job.gcsInputBucket).file(job.gcsInputObject);
      deletions.push(this.deleteIfExists(inputFile));

      const [outputFiles] = await this.storageClient.bucket(job.gcsOutputBucket).getFiles({ prefix: job.gcsOutputPrefix });
      for (const file of outputFiles) {
        deletions.push(this.deleteIfExists(file));
      }

      await Promise.all(deletions);
      await documentProcessingJobs.markCleanupStatus(job.jobId, 'completed');
      logger.info(`Successfully deleted ${deletions.length} GCS files.`, this.context, { jobId: job.jobId });
    } catch (error) {
      logger.error(`Failed to clean up GCS files for ${job.jobId}`, this.context, error as Error);
      await documentProcessingJobs.markCleanupStatus(job.jobId, 'failed', (error as Error).message);
    }
  }

  private async deleteIfExists(file: File): Promise<void> {
    try {
      await file.delete();
    } catch (error: any) {
      if (error?.code === 404) {
        logger.debug('File already deleted during cleanup', { ...this.context, operation: 'deleteIfExists' }, { file: file.name });
        return;
      }
      throw error;
    }
  }
}

export const googleVisionProcessor = new GoogleVisionProcessor();
