// Google Vision Processor - Environment Agnostic
// Handles document processing using Google Vision API, including async GCS workflow.

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import { logger, LogContext } from './logger';
import { dataExtractor } from '../utils/dataExtractor';
import { v4 as uuidv4 } from 'uuid';

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

const INPUT_BUCKET = 'truckbo-gcs-input-documents';
const OUTPUT_BUCKET = 'truckbo-gcs-output-results';

export class GoogleVisionProcessor {
  private visionClient: ImageAnnotatorClient;
  private storageClient: Storage;
  private readonly context: LogContext = { layer: 'processor', component: 'GoogleVisionProcessor' };
  private operationToFileMapping: Map<string, string> = new Map(); // Maps operation name to GCS filename

  constructor() {
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    let clientOptions = {};

    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        clientOptions = { credentials };
        logger.info("Initializing Google Cloud clients with credentials from environment variable.", this.context);
      } catch (error) {
        logger.warn("Failed to parse GOOGLE_APPLICATION_CREDENTIALS as JSON. Assuming it's a file path.", this.context, error);
        clientOptions = { keyFilename: credentialsJson };
      }
    } else {
      logger.warn("GOOGLE_APPLICATION_CREDENTIALS environment variable not set. Using default credentials.", this.context);
    }

    this.visionClient = new ImageAnnotatorClient(clientOptions);
    this.storageClient = new Storage(clientOptions);
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
    logger.info(`Vision API job started. Operation name: ${operationName}`, this.context);

    // Store the mapping between operation name and GCS filename
    this.operationToFileMapping.set(operationName, gcsFileName);

    return operationName;
  }

  /**
   * Checks the status of a long-running operation and retrieves the result.
   * @param operationName The name of the operation to check.
   * @returns The processing result or a status indicating it's still running.
   */
  async getAsyncResult(operationName: string): Promise<{ status: 'processing' | 'succeeded' | 'failed', result?: any }> {
    // NOTE: In a real app, you might not want to wait. This is a simplified example.
    // The `operation.promise()` method polls until the operation is complete.
    const operation = await this.visionClient.checkAsyncBatchAnnotateFilesProgress(operationName);

    if (!operation.done) {
      logger.info(`Operation ${operationName} is still processing.`, this.context);
      return { status: 'processing' };
    }

    if (operation.error) {
      logger.error(`Operation ${operationName} failed.`, this.context, operation.error);
      return { status: 'failed', result: operation.error };
    }

    logger.info(`Operation ${operationName} succeeded. Fetching results from GCS.`, this.context);

    // 3. Fetch the results from the output GCS bucket
    const gcsFileName = this.operationToFileMapping.get(operationName);
    if (!gcsFileName) {
      throw new Error(`No GCS filename found for operation: ${operationName}`);
    }

    logger.info(`Looking for results with GCS filename: ${gcsFileName}`, this.context);

    const [files] = await this.storageClient.bucket(OUTPUT_BUCKET).getFiles({ prefix: `${gcsFileName}-results/` });
    logger.info(`Looking for files with prefix: ${gcsFileName}-results/, found ${files.length} files`, this.context);

    if (files.length === 0) {
      throw new Error(`Vision API job completed, but no output file was found in GCS with prefix: ${gcsFileName}-results/`);
    }

    // Find the JSON output file
    const resultFile = files.find(file => file.name.endsWith('.json'));
    if (!resultFile) {
      throw new Error('No JSON output file found in the result folder.');
    }

    const [contents] = await resultFile.download();
    const resultJson = JSON.parse(contents.toString());

    // The result JSON is complex; we need to extract the text.
    const fullText = resultJson.responses[0].fullTextAnnotation.text;

    // 4. Perform data extraction on the combined text
    const structuredData = await this.extractStructuredData(fullText);

    // 5. Clean up GCS files
    await this.cleanupGcsFiles(operationName);

    return { status: 'succeeded', result: { text: fullText, ...structuredData } };
  }

  /**
   * Extracts structured data from raw text. Made public for use after PDF splitting.
   */
  async extractStructuredData(text: string, expectedType?: string): Promise<Partial<any>> {
    logger.debug('Extracting structured data from text', { ...this.context, operation: 'extractStructuredData' });
    const docType = expectedType || 'unknown';
    // This logic remains the same as before
    if (docType === 'registration' || docType === 'insurance' || docType === 'unknown') {
      return dataExtractor.parseVehicleData(text, docType, 'server-processed-async');
    } else if (docType === 'medical_certificate' || docType === 'cdl_license') {
      return dataExtractor.parseDriverData(text, docType === 'cdl_license' ? 'cdl' : docType, 'server-processed-async');
    } else {
      return { documentType: 'unknown', processingNotes: ['Could not determine document type.'] };
    }
  }

  private async cleanupGcsFiles(operationName: string): Promise<void> {
    try {
        logger.info(`Cleaning up GCS files for operation ${operationName}`, this.context);
        const [inputFiles] = await this.storageClient.bucket(INPUT_BUCKET).getFiles({ prefix: operationName });
        const [outputFiles] = await this.storageClient.bucket(OUTPUT_BUCKET).getFiles({ prefix: `${operationName}-results/` });

        const deletePromises = [...inputFiles, ...outputFiles].map(file => file.delete());
        await Promise.all(deletePromises);
        logger.info(`Successfully deleted ${deletePromises.length} GCS files.`, this.context);
    } catch(error) {
        logger.error(`Failed to clean up GCS files for ${operationName}`, this.context, error);
        // Don't throw, just log the error
    }
  }
}

export const googleVisionProcessor = new GoogleVisionProcessor();
