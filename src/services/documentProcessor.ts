// AI-Powered Document Processing Service
// Processes bulk uploaded registration and insurance documents

import * as pdfjsLib from 'pdfjs-dist/build/pdf';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

import { truckNumberParser } from '../../shared/utils/truckNumberParser';
import { createWorker, Worker } from 'tesseract.js';
import { errorHandler } from './errorHandler';
import { logger } from './logger';
import { googleVisionProcessor, type GoogleVisionProcessingResult } from './googleVisionProcessor';
import { dataExtractor, ExtractedVehicleData, ExtractedDriverData } from '../../shared/utils/dataExtractor';
import { serverPDFService } from './serverPDFService';
import { documentStatusPoller } from './documentStatusPoller';

export interface DocumentInfo {
  file: File;
  fileName: string;
  type: 'registration' | 'insurance' | 'medical_certificate' | 'cdl' | 'unknown';
  confidence: number;
}

export interface ProcessingResult {
  vehicleData: ExtractedVehicleData[];
  driverData: ExtractedDriverData[];
  unprocessedFiles: string[];
  errors: { fileName: string; error: string }[];
  asyncJobs?: { jobId: string; statusUrl: string; fileName: string }[];
  completedAsyncResults?: { [jobId: string]: any };
  summary: {
    totalFiles: number;
    processed: number;
    registrationDocs: number;
    insuranceDocs: number;
    medicalCertificates: number;
    cdlDocuments: number;
    duplicatesFound: number;
  };
}

type ClaudeProcessingResult = GoogleVisionProcessingResult;

export class DocumentProcessor {
  private async extractDataFromDocument(doc: DocumentInfo): Promise<ExtractedVehicleData | null> {
    try {
      const extractedText = await this.performOCR(doc.file);
      if (!extractedText || extractedText.trim().length < 50) {
        console.warn(`⚠️ Could not extract meaningful text from ${doc.fileName}`);
        return null;
      }
      if (doc.type !== 'registration' && doc.type !== 'insurance' && doc.type !== 'unknown') {
        console.error(`Invalid document type for vehicle processing: ${doc.type}`);
        return null;
      }
      const parsedData = await dataExtractor.parseVehicleData(extractedText, doc.type, doc.fileName);
      return parsedData;
    } catch (error) {
      console.error(`Error processing ${doc.fileName}:`, error);
      return null;
    }
  }

  private async extractDriverDataFromDocument(doc: DocumentInfo): Promise<ExtractedDriverData | null> {
    try {
      const extractedText = await this.performOCR(doc.file);
      if (!extractedText || extractedText.trim().length < 50) {
        console.warn(`⚠️ Could not extract meaningful text from ${doc.fileName}`);
        return null;
      }
      if (doc.type !== 'medical_certificate' && doc.type !== 'cdl') {
        console.error(`Invalid document type for driver processing: ${doc.type}`);
        return null;
      }
      const parsedData = await dataExtractor.parseDriverData(extractedText, doc.type, doc.fileName);
      return parsedData;
    } catch (error) {
      console.error(`Error processing driver document ${doc.fileName}:`, error);
      return null;
    }
  }

  async processDocuments(files: FileList, progressCallback: (progress: number, message: string) => void): Promise<ProcessingResult> {
    const results: ClaudeProcessingResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = ((i + 1) / files.length) * 50; // Only use first 50% for upload
      progressCallback(progress, `Processing ${file.name}...`);

      const result = await this.processDocument(file);
      results.push(result);
    }

    // Filter results - include both completed and async processing results as successful
    const successfulResults = results.filter(r => r.success);
    const asyncResults = results.filter(r => r.success && (r as any).async);

    console.log(`📊 Processing summary: ${successfulResults.length}/${files.length} successful (${asyncResults.length} async)`);

    // If there are async results, poll for completion
    if (asyncResults.length > 0) {
      progressCallback(60, 'Waiting for document processing to complete...');

      const asyncJobs = asyncResults.map(r => ({
        jobId: (r as any).jobId,
        statusUrl: (r as any).statusUrl,
        fileName: files[results.indexOf(r)]?.name || 'unknown'
      }));

      console.log(`🔄 Polling ${asyncJobs.length} async jobs for completion`);

      try {
        const completedResults = await documentStatusPoller.pollMultipleJobs(
          asyncJobs,
          (jobId, result) => {
            console.log(`✅ Job ${jobId} completed`);
            progressCallback(60 + (30 / asyncJobs.length), `Processing completed for ${asyncJobs.find(j => j.jobId === jobId)?.fileName}`);
          },
          (jobId, error) => {
            console.error(`❌ Job ${jobId} failed: ${error}`);
          }
        );

        progressCallback(95, 'Finalizing results...');

        // Extract vehicle and driver data from completed results
        const completedVehicleData: ExtractedVehicleData[] = [];
        const completedDriverData: ExtractedDriverData[] = [];

        Object.entries(completedResults).forEach(([jobId, result]) => {
          if (result && result.extractedData) {
            // Check if it's vehicle data (has VIN) or driver data (has firstName/lastName)
            if (result.extractedData.vin) {
              completedVehicleData.push(result.extractedData as ExtractedVehicleData);
            } else if (result.extractedData.firstName && result.extractedData.lastName) {
              completedDriverData.push(result.extractedData as ExtractedDriverData);
            }
          }
        });

        progressCallback(100, 'Processing complete!');

        return {
          vehicleData: completedVehicleData,
          driverData: completedDriverData,
          unprocessedFiles: results.filter(r => !r.success).map(r => r.error || 'Unknown error'),
          errors: results.filter(r => !r.success).map(r => ({ fileName: 'unknown', error: r.error || 'Unknown error' })),
          asyncJobs,
          completedAsyncResults: completedResults,
          summary: {
            totalFiles: files.length,
            processed: successfulResults.length,
            registrationDocs: completedVehicleData.filter(v => v.documentType === 'registration').length,
            insuranceDocs: completedVehicleData.filter(v => v.documentType === 'insurance').length,
            medicalCertificates: completedDriverData.filter(d => d.documentType === 'medical_certificate').length,
            cdlDocuments: completedDriverData.filter(d => d.documentType === 'cdl').length,
            duplicatesFound: 0
          }
        };

      } catch (error) {
        console.error('❌ Error polling async jobs:', error);

        // Return partial results even if polling fails
        progressCallback(100, 'Processing completed with some errors');

        return {
          vehicleData: [],
          driverData: [],
          unprocessedFiles: results.filter(r => !r.success).map(r => r.error || 'Unknown error'),
          errors: [...results.filter(r => !r.success).map(r => ({ fileName: 'unknown', error: r.error || 'Unknown error' })),
                   { fileName: 'async_polling', error: error instanceof Error ? error.message : 'Async polling failed' }],
          asyncJobs: asyncResults.map(r => ({
            jobId: (r as any).jobId,
            statusUrl: (r as any).statusUrl,
            fileName: files[results.indexOf(r)]?.name || 'unknown'
          })),
          summary: {
            totalFiles: files.length,
            processed: 0, // Mark as 0 since we couldn't get final results
            registrationDocs: 0,
            insuranceDocs: 0,
            medicalCertificates: 0,
            cdlDocuments: 0,
            duplicatesFound: 0
          }
        };
      }
    }

    // Handle synchronous results (no async jobs)
    const vehicleData = results
      .filter(r => r.success && r.data?.documentType !== 'medical_certificate' && r.data?.documentType !== 'cdl_license')
      .map(r => r.data) as ExtractedVehicleData[];

    const driverData = results
      .filter(r => r.success && (r.data?.documentType === 'medical_certificate' || r.data?.documentType === 'cdl_license'))
      .map(r => r.data) as ExtractedDriverData[];

    return {
      vehicleData,
      driverData,
      unprocessedFiles: results.filter(r => !r.success).map(r => r.error || 'Unknown error'),
      errors: results.filter(r => !r.success).map(r => ({ fileName: 'unknown', error: r.error || 'Unknown error' })),
      summary: {
        totalFiles: files.length,
        processed: successfulResults.length,
        registrationDocs: vehicleData.filter(v => v.documentType === 'registration').length,
        insuranceDocs: vehicleData.filter(v => v.documentType === 'insurance').length,
        medicalCertificates: driverData.filter(d => d.documentType === 'medical_certificate').length,
        cdlDocuments: driverData.filter(d => d.documentType === 'cdl').length,
        duplicatesFound: 0
      }
    };
  }

  async processDocument(
    file: File | Blob,
    options: {
      maxRetries?: number;
      timeout?: number;
      expectedDocumentType?: string;
    } = {}
  ): Promise<GoogleVisionProcessingResult> {
    const startTime = Date.now();
    
    try {
      if (file.type === 'application/pdf') {
        if (typeof pdfjsLib === 'undefined') {
          console.log('📄 pdfjsLib not available, using server-side PDF processing');
          return await this.processTextBasedPDF(file, options, startTime);
        }
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdf.getPage(1);
        const textContent = await page.getTextContent();

        if (textContent.items.length > 0) {
          // Text-based PDF, use server-side processing
          return await this.processTextBasedPDF(file, options, startTime);
        } else {
          // Image-based PDF, convert to image and process
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport: viewport }).promise;

          const base64Data = canvas.toDataURL('image/jpeg');
          const mimeType = 'image/jpeg';

          return await this.processImageDocument(base64Data.split(',')[1], mimeType, options, startTime);
        }
      } else {
        // Handle other file types (images)
        const mimeType = file.type;
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64Data = btoa(binaryString);
        
        return await this.processImageDocument(base64Data, mimeType, options, startTime);
      }
      
    } catch (error) {
      console.error('Google Vision processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error',
        processingTime: Date.now() - startTime
      };
    }
  }

  private async processTextBasedPDF(
    file: File | Blob,
    options: any,
    startTime: number
  ): Promise<GoogleVisionProcessingResult> {
    // Use server-side processing for text-based PDFs
    console.log(`📄 Text-based PDF file detected: ${(file as File).name} - routing to server for processing`);
    
    try {
      const serverAvailable = await serverPDFService.checkServerHealth();
      
      if (!serverAvailable) {
        return {
          success: false,
          error: `PDF processing server is not available. "${(file as File).name}" cannot be processed.`,
          processingTime: Date.now() - startTime
        };
      }
      
      const serverResult = await serverPDFService.processPDF(file);

      if (!serverResult.success) {
        return {
          success: false,
          error: `Server PDF processing failed: ${serverResult.error}`,
          processingTime: Date.now() - startTime
        };
      }

      // Handle async processing response
      if (serverResult.async && serverResult.jobId) {
        console.log(`🔄 Document processing started async - Job ID: ${serverResult.jobId}`);

        // For now, return success with async info
        // TODO: Implement proper async polling and status checking
        return {
          success: true,
          async: true,
          jobId: serverResult.jobId,
          statusUrl: serverResult.statusUrl,
          status: 'processing',
          data: {
            documentType: 'registration', // Default assumption for now
            text: 'Processing...',
            message: 'Document uploaded and processing started asynchronously'
          },
          processingTime: serverResult.processingTime,
        };
      }

      // Handle synchronous processing response (legacy)
      return {
        success: true,
        data: serverResult.data,
        processingTime: serverResult.processingTime,
      };
      
    } catch (error) {
      console.error('Server PDF processing error:', error);
      return {
        success: false,
        error: `PDF processing failed: ${error instanceof Error ? error.message : 'Server error'}`,
        processingTime: Date.now() - startTime
      };
    }
  }
  
  private async processImageDocument(
    base64Data: string,
    mimeType: string,
    options: any,
    startTime: number
  ): Promise<GoogleVisionProcessingResult> {
    try {
      // Create a file-like object from base64 data for Google Vision
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const file = new File([bytes], 'document', { type: mimeType });
      
      // Process with Google Vision
      const result = await googleVisionProcessor.processDocument(file);
      
      if (result.success && result.text) {
        return {
          success: true,
          text: result.text
        };
      } else {
        return {
          success: false,
          error: result.error || 'Google Vision processing failed'
        };
      }

    } catch (error) {
      console.error('Google Vision API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google Vision API error'
      };
    }
  }

  private async performOCR(file: File): Promise<string> {
    // For images, we can use browser-based OCR
    if (file.type.startsWith('image/')) {
      return await this.extractTextFromImage(file);
    }
    
    // For PDFs, we'd need a PDF processing library
    if (file.type === 'application/pdf') {
      return await this.extractTextFromPDF(file);
    }
    
    // For other formats, try to read as text
    return await this.readAsText(file);
  }

  private async extractTextFromImage(file: File): Promise<string> {
    let worker: Worker | null = null;
    
    try {
      console.log(`🔍 Starting OCR processing for image: ${file.name}`);
      errorHandler.showInfo(`Processing ${file.name} with OCR...`);
      
      worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            // Could emit progress events here for UI updates
          }
        }
      });
      
      // Configure OCR for better accuracy with documents
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:-/#$%&()[]{}|'
      });
      
      // Perform OCR
      const { data: { text } } = await worker.recognize(file);
      
      await worker.terminate();
      worker = null;
      
      console.log(`✅ OCR completed for ${file.name}, extracted ${text.length} characters`);
      
      // If OCR returns very little text, show warning and fallback
      if (text.trim().length < 50) {
        errorHandler.handleOCRError(
          new Error('Insufficient text extracted'),
          file.name,
          () => this.extractTextFromImage(file)
        );
        console.log(`⚠️ OCR extracted too little text, using fallback mock data for ${file.name}`);
        return "";
      }
      
      errorHandler.showSuccess(`Successfully processed ${file.name}`);
      return text;
      
    } catch (error) {
      // Ensure worker is terminated on error
      if (worker) {
        try {
          await worker.terminate();
        } catch (terminateError) {
          console.error('Failed to terminate OCR worker:', terminateError);
        }
      }
      
      errorHandler.handleOCRError(
        error,
        file.name,
        () => this.extractTextFromImage(file)
      );
      
      console.log(`🔄 Falling back to mock OCR data for ${file.name}`);
      return "";
    }
  }

  private async extractTextFromPDF(file: File): Promise<string> {
    let worker: Worker | null = null;
    
    try {
      console.log(`🔍 Starting PDF processing: ${file.name}`);
      errorHandler.showInfo(`Processing PDF ${file.name}...`);
      
      // First try to extract text content directly
      const textContent = await this.readAsText(file);
      if (textContent && textContent.length > 50 && !textContent.includes('%PDF') && !textContent.includes('PDF-')) {
        console.log(`✅ Direct text extraction successful for ${file.name}`);
        errorHandler.showSuccess(`Successfully extracted text from ${file.name}`);
        return textContent;
      }
      
      // If direct text extraction fails, use OCR on the PDF
      errorHandler.showInfo(`Direct text extraction failed, using OCR for ${file.name}...`);
      
      worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`PDF OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      // Configure for document OCR
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:-/#$%&()[]{}|'
      });
      
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      worker = null;
      
      console.log(`✅ PDF OCR completed for ${file.name}, extracted ${text.length} characters`);
      
      // If OCR returns very little text, show warning and fallback
      if (text.trim().length < 50) {
        errorHandler.handleOCRError(
          new Error('Insufficient text extracted from PDF'),
          file.name,
          () => this.extractTextFromPDF(file)
        );
        console.log(`⚠️ PDF OCR extracted too little text, using fallback mock data for ${file.name}`);
        return "";
      }
      
      errorHandler.showSuccess(`Successfully processed PDF ${file.name}`);
      return text;
      
    } catch (error) {
      // Ensure worker is terminated on error
      if (worker) {
        try {
          await worker.terminate();
        } catch (terminateError) {
          console.error('Failed to terminate PDF OCR worker:', terminateError);
        }
      }
      
      errorHandler.handleOCRError(
        error,
        file.name,
        () => this.extractTextFromPDF(file)
      );
      
      console.log(`🔄 Falling back to mock PDF data for ${file.name}`);
      return "";
    }
  }

  private async readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}

export const documentProcessor = new DocumentProcessor();