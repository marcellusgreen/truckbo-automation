/**
 * Claude Text Processor Service
 * Processes PDFs and text documents using Claude's regular API (not Vision)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ExtractedDocumentData, ClaudeProcessingResult } from './claudeVisionProcessor';

export class ClaudeTextProcessor {
  private anthropic?: Anthropic;
  private isInitialized = false;
  private static MAX_CONCURRENT_REQUESTS = 3; // Limit concurrent requests to avoid rate limits

  constructor() {
    // Get API key from environment variables (browser-compatible)
    const apiKey = (typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY) || import.meta.env.VITE_ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.warn('Claude API key not found. Document processing will be limited.');
      return;
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.isInitialized = true;
  }

  /**
   * Process PDF document by extracting text and analyzing with Claude
   */
  async processPDF(file: File): Promise<ClaudeProcessingResult> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized || !this.anthropic) {
        throw new Error('Claude processor not initialized. Check API key.');
      }

      // Extract text from PDF
      const pdfText = await this.extractTextFromPDF(file);
      
      if (!pdfText || pdfText.trim().length === 0) {
        throw new Error('No text could be extracted from PDF. The document may be image-based or corrupted.');
      }

      console.log(`📄 Extracted ${pdfText.length} characters from PDF: ${file.name}`);

      // Process the extracted text with Claude
      const result = await this.processTextWithClaude(pdfText, file.name);

      return {
        success: true,
        data: result,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Claude PDF processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown PDF processing error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Extract text from PDF file using browser APIs
   */
  private async extractTextFromPDF(file: File): Promise<string> {
    try {
      // Since Claude's API doesn't support PDFs directly, we'll need to inform the user
      // to convert PDFs to images first, or implement a different PDF parsing approach
      throw new Error(`PDF text extraction not yet implemented. Please convert "${file.name}" to JPG or PNG format for processing.`);

    } catch (error) {
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send PDF to Claude for text extraction and analysis
   */
  private async sendPDFToClaude(base64Data: string, fileName: string): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Claude API client not initialized');
    }

    try {
      // Claude's API supports PDF in the image content type
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data
              }
            },
            {
              type: 'text',
              text: `Please extract all text content from this PDF document named "${fileName}". Return only the extracted text content, maintaining the original structure and formatting as much as possible.`
            }
          ]
        }]
      });

      // Safely access the response content
      if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
        return response.content[0].text;
      }
      
      throw new Error('No text content received from Claude API');

    } catch (error) {
      throw new Error(`Claude PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process extracted text with Claude to identify compliance data
   */
  private async processTextWithClaude(text: string, fileName: string): Promise<ExtractedDocumentData> {
    if (!this.anthropic) {
      throw new Error('Claude API client not initialized');
    }

    const prompt = this.buildDocumentAnalysisPrompt(text, fileName);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      // Safely access the response content
      let responseText = '';
      if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
        responseText = response.content[0].text;
      }
      
      if (!responseText) {
        throw new Error('No response text received from Claude API');
      }
      
      // Parse the structured response
      return this.parseStructuredResponse(responseText, text);

    } catch (error) {
      throw new Error(`Claude text analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build analysis prompt for document processing
   */
  private buildDocumentAnalysisPrompt(text: string, fileName: string): string {
    return `You are an expert document processor specializing in commercial trucking compliance documents. Analyze the following text extracted from "${fileName}" and extract relevant compliance information.

DOCUMENT TEXT:
${text}

Please analyze this document and extract the following information in JSON format:

{
  "documentType": "registration" | "insurance" | "medical_certificate" | "cdl_license" | "inspection" | "permit" | "unknown",
  "confidence": 0.0 to 1.0,
  "extractedData": {
    "vin": "vehicle identification number if found",
    "licensePlate": "license plate number if found", 
    "make": "vehicle make if found",
    "model": "vehicle model if found",
    "year": "vehicle year if found",
    "driverName": "driver name if found",
    "licenseNumber": "license number if found",
    "licenseClass": "license class if found",
    "endorsements": ["endorsement1", "endorsement2"],
    "issueDate": "issue date if found",
    "expirationDate": "expiration date if found",
    "effectiveDate": "effective date if found",
    "policyNumber": "insurance policy number if found",
    "insuranceCompany": "insurance company name if found",
    "coverageAmount": "coverage amount if found",
    "medicalExaminerName": "medical examiner name if found",
    "medicalCertificateNumber": "medical certificate number if found",
    "restrictions": ["restriction1", "restriction2"],
    "registrationNumber": "registration number if found",
    "state": "state of issuance if found",
    "ownerName": "owner name if found"
  },
  "dataQuality": {
    "isComplete": true/false,
    "missingCriticalFields": ["field1", "field2"],
    "hasConflicts": false,
    "conflictDetails": []
  },
  "validationResults": {
    "vinValid": true/false,
    "datesRealistic": true/false, 
    "documentsExpired": true/false,
    "requiresImmediateAction": true/false
  },
  "processingNotes": ["note1", "note2"],
  "requiresReview": true/false,
  "autoApprovalRecommended": true/false
}

Focus on extracting vehicle identification (VINs, license plates), driver information, dates, and compliance-related data. Use high confidence only when data is clearly present. Mark for review if information is unclear or incomplete.`;
  }

  /**
   * Parse Claude's structured response into ExtractedDocumentData
   */
  private parseStructuredResponse(response: string, originalText: string): ExtractedDocumentData {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and return the structured data
      return {
        documentType: parsed.documentType || 'unknown',
        confidence: parsed.confidence || 0.5,
        extractedData: parsed.extractedData || {},
        dataQuality: parsed.dataQuality || {
          isComplete: false,
          missingCriticalFields: [],
          hasConflicts: false,
          conflictDetails: []
        },
        validationResults: parsed.validationResults || {
          vinValid: false,
          datesRealistic: true,
          documentsExpired: false,
          requiresImmediateAction: false
        },
        rawText: originalText,
        processingNotes: parsed.processingNotes || ['Processed via Claude text analysis'],
        requiresReview: parsed.requiresReview !== false,
        autoApprovalRecommended: parsed.autoApprovalRecommended === true
      };

    } catch (error) {
      // Fallback if parsing fails
      return {
        documentType: 'unknown',
        confidence: 0.3,
        extractedData: {},
        dataQuality: {
          isComplete: false,
          missingCriticalFields: ['Unable to parse response'],
          hasConflicts: false,
          conflictDetails: []
        },
        validationResults: {
          vinValid: false,
          datesRealistic: true,
          documentsExpired: false,
          requiresImmediateAction: false
        },
        rawText: originalText,
        processingNotes: ['Failed to parse structured response', 'Requires manual review'],
        requiresReview: true,
        autoApprovalRecommended: false
      };
    }
  }

  /**
   * Process multiple PDF files with progress tracking and rate limiting
   */
  async processPDFBatch(files: File[], onProgress?: (completed: number, total: number, currentFile: string) => void): Promise<ClaudeProcessingResult[]> {
    const results: ClaudeProcessingResult[] = [];
    const total = files.length;

    // Process files in batches to avoid overwhelming the API
    for (let i = 0; i < files.length; i += ClaudeTextProcessor.MAX_CONCURRENT_REQUESTS) {
      const batch = files.slice(i, i + ClaudeTextProcessor.MAX_CONCURRENT_REQUESTS);
      
      const batchPromises = batch.map(async (file, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        if (onProgress) {
          onProgress(globalIndex, total, file.name);
        }

        try {
          const result = await this.processPDF(file);
          
          if (onProgress) {
            onProgress(globalIndex + 1, total, file.name);
          }
          
          return result;
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime: 0
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add a small delay between batches to be respectful to the API
      if (i + ClaudeTextProcessor.MAX_CONCURRENT_REQUESTS < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}