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
const documentProcessingJobs_1 = require("./documentProcessingJobs");
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
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        let visionOptions = {};
        let storageOptions = {};
        if (credentialsJson) {
            try {
                const credentials = JSON.parse(credentialsJson);
                visionOptions = { credentials };
                storageOptions = { credentials };
                logger_1.logger.info('Initializing Google Cloud clients with credentials from environment variable.', this.context);
            }
            catch (error) {
                logger_1.logger.warn('Failed to parse GOOGLE_APPLICATION_CREDENTIALS as JSON. Assuming it\'s a file path.', this.context, error);
                visionOptions = { keyFilename: credentialsJson };
                storageOptions = { keyFilename: credentialsJson };
            }
        }
        else {
            logger_1.logger.warn('GOOGLE_APPLICATION_CREDENTIALS environment variable not set. Using default credentials.', this.context);
        }
        this.visionClient = new vision_1.ImageAnnotatorClient(visionOptions);
        this.storageClient = new storage_1.Storage(storageOptions);
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
        await documentProcessingJobs_1.documentProcessingJobs.recordJobStart({
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
    async getAsyncResult(operationName) {
        const jobRecord = await documentProcessingJobs_1.documentProcessingJobs.getJob(operationName);
        if (!jobRecord) {
            throw new Error(`No persisted job metadata found for operation: ${operationName}`);
        }
        const operation = await this.visionClient.checkAsyncBatchAnnotateFilesProgress(operationName);
        if (!operation.done) {
            logger_1.logger.info(`Operation ${operationName} is still processing.`, this.context);
            return { status: 'processing', job: jobRecord };
        }
        if (operation.error) {
            const message = operation.error.message || 'Vision API reported an error';
            await documentProcessingJobs_1.documentProcessingJobs.markFailed(operationName, message);
            logger_1.logger.error(`Operation ${operationName} failed.`, this.context, operation.error);
            return { status: 'failed', result: operation.error, job: { ...jobRecord, status: 'failed', errorMessage: message } };
        }
        logger_1.logger.info(`Operation ${operationName} succeeded. Fetching results from GCS.`, this.context);
        const [files] = await this.storageClient
            .bucket(jobRecord.gcsOutputBucket)
            .getFiles({ prefix: jobRecord.gcsOutputPrefix });
        logger_1.logger.info(`Looking for files with prefix: ${jobRecord.gcsOutputPrefix}, found ${files.length} files`, this.context);
        if (files.length === 0) {
            throw new Error(`Vision API job completed, but no output file was found in GCS with prefix: ${jobRecord.gcsOutputPrefix}`);
        }
        // Find the JSON output file
        const resultFile = files.find((file) => file.name.endsWith('.json'));
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
        const updatedJob = await documentProcessingJobs_1.documentProcessingJobs.markSucceeded(operationName, rawResult) || jobRecord;
        return {
            status: 'succeeded',
            result: { text: fullText, ...structuredData },
            job: updatedJob
        };
    }
    /**
     * Extracts structured data from raw text. Made public for use after PDF splitting.
     */
    async extractStructuredData(text, expectedType, sourceFileName) {
        logger_1.logger.debug('Extracting structured data from text', { ...this.context, operation: 'extractStructuredData' });
        const docType = expectedType || 'unknown';
        const fileName = sourceFileName || 'server-processed-async';
        if (docType === 'registration' || docType === 'insurance' || docType === 'unknown') {
            return dataExtractor_1.dataExtractor.parseVehicleData(text, docType, fileName);
        }
        else if (docType === 'medical_certificate' || docType === 'cdl_license' || docType === 'cdl') {
            const driverDocType = docType === 'cdl_license' ? 'cdl' : docType;
            return dataExtractor_1.dataExtractor.parseDriverData(text, driverDocType, fileName);
        }
        else {
            return { documentType: 'unknown', processingNotes: ['Could not determine document type.'] };
        }
    }
    /**
     * Finalize a job once persistence succeeds. Optionally cleans up GCS artifacts.
     */
    async finalizeJob(jobId, options = {}) {
        const { cleanup = true } = options;
        const jobRecord = await documentProcessingJobs_1.documentProcessingJobs.getJob(jobId);
        if (!jobRecord) {
            logger_1.logger.warn('Attempted to finalize unknown job', this.context, { jobId });
            return;
        }
        if (!cleanup) {
            logger_1.logger.info('Finalize called without cleanup; leaving artifacts in place', this.context, { jobId });
            return;
        }
        await this.cleanupJobArtifacts(jobRecord);
    }
    async cleanupJobArtifacts(job) {
        try {
            logger_1.logger.info(`Cleaning up GCS files for operation ${job.jobId}`, this.context);
            const deletions = [];
            const inputFile = this.storageClient.bucket(job.gcsInputBucket).file(job.gcsInputObject);
            deletions.push(this.deleteIfExists(inputFile));
            const [outputFiles] = await this.storageClient.bucket(job.gcsOutputBucket).getFiles({ prefix: job.gcsOutputPrefix });
            for (const file of outputFiles) {
                deletions.push(this.deleteIfExists(file));
            }
            await Promise.all(deletions);
            await documentProcessingJobs_1.documentProcessingJobs.markCleanupStatus(job.jobId, 'completed');
            logger_1.logger.info(`Successfully deleted ${deletions.length} GCS files.`, this.context, { jobId: job.jobId });
        }
        catch (error) {
            logger_1.logger.error(`Failed to clean up GCS files for ${job.jobId}`, this.context, error);
            await documentProcessingJobs_1.documentProcessingJobs.markCleanupStatus(job.jobId, 'failed', error.message);
        }
    }
    async deleteIfExists(file) {
        try {
            await file.delete();
        }
        catch (error) {
            if (error?.code === 404) {
                logger_1.logger.debug('File already deleted during cleanup', { ...this.context, operation: 'deleteIfExists' }, { file: file.name });
                return;
            }
            throw error;
        }
    }
}
exports.GoogleVisionProcessor = GoogleVisionProcessor;
exports.googleVisionProcessor = new GoogleVisionProcessor();
