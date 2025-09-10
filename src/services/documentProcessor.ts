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

  // ... (The rest of the DocumentProcessor class, without the moved parsing methods)
}

export const documentProcessor = new DocumentProcessor();
