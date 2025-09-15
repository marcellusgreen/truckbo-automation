"use strict";
// Google Vision Processor - Environment Agnostic
// Handles document processing using Google Vision API, including async GCS workflow.
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleVisionProcessor = exports.GoogleVisionProcessor = void 0;
const vision_1 = require("@google-cloud/vision");
const storage_1 = require("@google-cloud/storage");
const logger_1 = require("./logger");
const dataExtractor_1 = require("../utils/dataExtractor");
const uuid_1 = require("uuid");
const INPUT_BUCKET = 'truckbo-gcs-input-documents';
const OUTPUT_BUCKET = 'truckbo-gcs-output-results';
class GoogleVisionProcessor {
    constructor() {
        Object.defineProperty(this, "visionClient", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "storageClient", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { layer: 'processor', component: 'GoogleVisionProcessor' }
        });
        Object.defineProperty(this, "operationToFileMapping", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        }); // Maps operation name to GCS filename
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        let clientOptions = {};
        if (credentialsJson) {
            try {
                const credentials = JSON.parse(credentialsJson);
                clientOptions = { credentials };
                logger_1.logger.info("Initializing Google Cloud clients with credentials from environment variable.", this.context);
            }
            catch (error) {
                logger_1.logger.warn("Failed to parse GOOGLE_APPLICATION_CREDENTIALS as JSON. Assuming it's a file path.", this.context, error);
                clientOptions = { keyFilename: credentialsJson };
            }
        }
        else {
            logger_1.logger.warn("GOOGLE_APPLICATION_CREDENTIALS environment variable not set. Using default credentials.", this.context);
        }
        this.visionClient = new vision_1.ImageAnnotatorClient(clientOptions);
        this.storageClient = new storage_1.Storage(clientOptions);
    }
    /**
     * Processes a document asynchronously using GCS for large files.
     * @param fileBuffer The buffer of the file to process.
     * @param originalName The original name of the file.
     * @param mimeType The mime type of the file.
     * @returns The name of the long-running operation.
     */
    async processDocumentAsync(fileBuffer, originalName, mimeType) {
        const gcsFileName = `${(0, uuid_1.v4)()}-${originalName}`;
        logger_1.logger.info(`Uploading ${originalName} to GCS as ${gcsFileName}`, this.context);
        // 1. Upload file to GCS
        await this.storageClient.bucket(INPUT_BUCKET).file(gcsFileName).save(fileBuffer, {
            contentType: mimeType,
        });
        const gcsSourceUri = `gs://${INPUT_BUCKET}/${gcsFileName}`;
        const gcsDestinationUri = `gs://${OUTPUT_BUCKET}/${gcsFileName}-results/`;
        logger_1.logger.info(`Starting async Vision API job for ${gcsSourceUri}`, this.context);
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
        logger_1.logger.info(`Vision API job started. Operation name: ${operationName}`, this.context);
        // Store the mapping between operation name and GCS filename
        this.operationToFileMapping.set(operationName, gcsFileName);
        return operationName;
    }
    /**
     * Checks the status of a long-running operation and retrieves the result.
     * @param operationName The name of the operation to check.
     * @returns The processing result or a status indicating it's still running.
     */
    async getAsyncResult(operationName) {
        // NOTE: In a real app, you might not want to wait. This is a simplified example.
        // The `operation.promise()` method polls until the operation is complete.
        const operation = await this.visionClient.checkAsyncBatchAnnotateFilesProgress(operationName);
        if (!operation.done) {
            logger_1.logger.info(`Operation ${operationName} is still processing.`, this.context);
            return { status: 'processing' };
        }
        if (operation.error) {
            logger_1.logger.error(`Operation ${operationName} failed.`, this.context, operation.error);
            return { status: 'failed', result: operation.error };
        }
        logger_1.logger.info(`Operation ${operationName} succeeded. Fetching results from GCS.`, this.context);
        // 3. Fetch the results from the output GCS bucket
        const gcsFileName = this.operationToFileMapping.get(operationName);
        if (!gcsFileName) {
            throw new Error(`No GCS filename found for operation: ${operationName}`);
        }
        logger_1.logger.info(`Looking for results with GCS filename: ${gcsFileName}`, this.context);
        const [files] = await this.storageClient.bucket(OUTPUT_BUCKET).getFiles({ prefix: `${gcsFileName}-results/` });
        logger_1.logger.info(`Looking for files with prefix: ${gcsFileName}-results/, found ${files.length} files`, this.context);
        if (files.length === 0) {
            throw new Error(`Vision API job completed, but no output file was found in GCS with prefix: ${gcsFileName}-results/`);
        }
        // Find the JSON output file
        const resultFile = files.find((file) => file.name.endsWith('.json'));
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
    async extractStructuredData(text, expectedType) {
        logger_1.logger.debug('Extracting structured data from text', { ...this.context, operation: 'extractStructuredData' });
        const docType = expectedType || 'unknown';
        // This logic remains the same as before
        if (docType === 'registration' || docType === 'insurance' || docType === 'unknown') {
            return dataExtractor_1.dataExtractor.parseVehicleData(text, docType, 'server-processed-async');
        }
        else if (docType === 'medical_certificate' || docType === 'cdl_license') {
            return dataExtractor_1.dataExtractor.parseDriverData(text, docType === 'cdl_license' ? 'cdl' : docType, 'server-processed-async');
        }
        else {
            return { documentType: 'unknown', processingNotes: ['Could not determine document type.'] };
        }
    }
    async cleanupGcsFiles(operationName) {
        try {
            logger_1.logger.info(`Cleaning up GCS files for operation ${operationName}`, this.context);
            const [inputFiles] = await this.storageClient.bucket(INPUT_BUCKET).getFiles({ prefix: operationName });
            const [outputFiles] = await this.storageClient.bucket(OUTPUT_BUCKET).getFiles({ prefix: `${operationName}-results/` });
            const deletePromises = [...inputFiles, ...outputFiles].map(file => file.delete());
            await Promise.all(deletePromises);
            logger_1.logger.info(`Successfully deleted ${deletePromises.length} GCS files.`, this.context);
        }
        catch (error) {
            logger_1.logger.error(`Failed to clean up GCS files for ${operationName}`, this.context, error);
            // Don't throw, just log the error
        }
    }
}
exports.GoogleVisionProcessor = GoogleVisionProcessor;
exports.googleVisionProcessor = new GoogleVisionProcessor();
