/**
 * Document Processing Router
 * Routes files to appropriate processors with error handling and logging
 */

import { FileTypeDetector, type FileAnalysis, type ProcessorType } from './fileTypeDetector';
import { ExcelProcessor } from './excelProcessor';
import { googleVisionProcessor, type GoogleVisionProcessingResult } from './googleVisionProcessor';

export interface RoutingResult {
  success: boolean;
  fileName: string;
  processor: ProcessorType;
  analysis: FileAnalysis;
  result?: GoogleVisionProcessingResult;
  error?: string;
  processingTime: number;
}

export class DocumentRouter {
  private excelProcessor: ExcelProcessor;
  private visionProcessor: any;

  constructor() {
    this.excelProcessor = new ExcelProcessor();
    this.visionProcessor = googleVisionProcessor;
  }

  /**
   * Process a single file through the appropriate processor
   */
  async processFile(file: File): Promise<RoutingResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Analyze file type
      const analysis = FileTypeDetector.analyzeFile(file);
      
      console.log(`📋 Processing "${file.name}" via ${analysis.processor}`);
      console.log(`📝 Expected data: ${analysis.expectedData.join(', ')}`);

      // Step 2: Route to appropriate processor
      let result: ClaudeProcessingResult;

      switch (analysis.processor) {
        case 'PDF_TEXT_EXTRACTOR':
          // PDF_TEXT_EXTRACTOR is deprecated - PDFs now route to CLAUDE_VISION
          console.log(`⚠️ PDF_TEXT_EXTRACTOR is deprecated. Routing ${file.name} to Claude Vision instead.`);
          result = await this.visionProcessor.processDocument(file);
          break;

        case 'CLAUDE_VISION':
          result = await this.visionProcessor.processDocument(file);
          break;

        case 'STRUCTURED_DATA_PARSER':
          result = await this.excelProcessor.processExcel(file);
          break;

        case 'UNKNOWN':
          result = {
            success: false,
            error: analysis.reasoning,
            processingTime: 0
          };
          break;

        default:
          result = {
            success: false,
            error: `Unknown processor type: ${analysis.processor}`,
            processingTime: 0
          };
      }

      // Step 3: Validate result and return routing result
      if (!result) {
        return {
          success: false,
          fileName: file.name,
          processor: analysis.processor,
          analysis,
          result: {
            success: false,
            error: 'Processor returned undefined result',
            processingTime: 0
          },
          error: 'Processor returned undefined result',
          processingTime: Date.now() - startTime
        };
      }

      // Ensure result has required structure for downstream processing
      if (result.success && result.data && !result.data.conflicts) {
        console.warn(`⚠️ Result for ${file.name} missing conflicts structure, adding default`);
        result.data.conflicts = {
          hasConflicts: false,
          conflictDetails: []
        };
      }

      return {
        success: result.success,
        fileName: file.name,
        processor: analysis.processor,
        analysis,
        result,
        error: result.error,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error(`❌ Error processing ${file.name}:`, error);
      
      return {
        success: false,
        fileName: file.name,
        processor: 'UNKNOWN',
        analysis: {
          processor: 'UNKNOWN',
          fileType: 'Error',
          extension: '',
          contentType: 'unknown',
          reasoning: 'Processing failed due to error',
          expectedData: []
        },
        error: error instanceof Error ? error.message : 'Unknown processing error',
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process multiple files systematically with progress tracking
   */
  async processFiles(
    files: File[], 
    onProgress?: (completed: number, total: number, current: string) => void
  ): Promise<RoutingResult[]> {
    console.log(`🚀 Starting systematic processing of ${files.length} files`);
    
    const results: RoutingResult[] = [];
    const total = files.length;

    // Process files one by one to avoid overwhelming the API
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (onProgress) {
        onProgress(i, total, file.name);
      }

      console.log(`\n📄 Processing file ${i + 1}/${total}: ${file.name}`);
      
      try {
        const result = await this.processFile(file);
        results.push(result);
        
        // Log result
        if (result.success) {
          console.log(`✅ Successfully processed: ${file.name}`);
        } else {
          console.log(`❌ Failed to process: ${file.name} - ${result.error}`);
        }
        
        if (onProgress) {
          onProgress(i + 1, total, file.name);
        }

        // Small delay to be respectful to APIs
        if (i < files.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`💥 Unexpected error processing ${file.name}:`, error);
        
        results.push({
          success: false,
          fileName: file.name,
          processor: 'UNKNOWN',
          analysis: {
            processor: 'UNKNOWN',
            fileType: 'Error',
            extension: '',
            contentType: 'unknown',
            reasoning: 'Unexpected processing error',
            expectedData: []
          },
          error: error instanceof Error ? error.message : 'Unexpected error',
          processingTime: 0
        });
      }
    }

    // Generate summary
    this.logProcessingSummary(results);
    
    return results;
  }

  /**
   * Log processing summary with statistics
   */
  private logProcessingSummary(results: RoutingResult[]): void {
    const stats = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      byProcessor: {
        pdf: results.filter(r => r.processor === 'PDF_TEXT_EXTRACTOR').length,
        vision: results.filter(r => r.processor === 'CLAUDE_VISION').length,
        structured: results.filter(r => r.processor === 'STRUCTURED_DATA_PARSER').length,
        unknown: results.filter(r => r.processor === 'UNKNOWN').length
      },
      totalProcessingTime: results.reduce((sum, r) => sum + r.processingTime, 0)
    };

    console.log('\n📊 PROCESSING SUMMARY:');
    console.log(`📁 Total files: ${stats.total}`);
    console.log(`✅ Successful: ${stats.successful}`);
    console.log(`❌ Failed: ${stats.failed}`);
    console.log(`📄 PDF files: ${stats.byProcessor.pdf}`);
    console.log(`🖼️ Image files: ${stats.byProcessor.vision}`);
    console.log(`📊 Structured files: ${stats.byProcessor.structured}`);
    console.log(`❓ Unknown files: ${stats.byProcessor.unknown}`);
    console.log(`⏱️ Total processing time: ${(stats.totalProcessingTime / 1000).toFixed(2)}s`);

    // Log failed files
    const failedFiles = results.filter(r => !r.success);
    if (failedFiles.length > 0) {
      console.log('\n❌ Failed files:');
      failedFiles.forEach(f => {
        console.log(`  - ${f.fileName}: ${f.error}`);
      });
    }
  }

  /**
   * Test processing with one file of each type
   */
  async testWithSampleFiles(files: File[]): Promise<RoutingResult[]> {
    console.log('🧪 Testing with sample files...');
    
    // Get one file of each type for testing
    const analyses = FileTypeDetector.analyzeFiles(files);
    const sampleFiles: File[] = [];
    const seenProcessors = new Set<ProcessorType>();

    for (let i = 0; i < files.length && seenProcessors.size < 3; i++) {
      const analysis = analyses[i];
      if (!seenProcessors.has(analysis.processor) && analysis.processor !== 'UNKNOWN') {
        sampleFiles.push(files[i]);
        seenProcessors.add(analysis.processor);
      }
    }

    console.log(`🎯 Testing with ${sampleFiles.length} sample files`);
    
    return await this.processFiles(sampleFiles);
  }
}

// Export singleton instance
export const documentRouter = new DocumentRouter();