/**
 * Client-side service for server-side PDF processing
 * Communicates with Express server for Claude Vision PDF processing
 * Now with dynamic server discovery
 */

import { serverDiscovery, type ServerInfo } from './serverDiscovery';

export interface ServerPDFResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime: number;
  fileName: string;
}

export interface BatchPDFResult {
  totalFiles: number;
  successful: number;
  failed: number;
  results: ServerPDFResult[];
}

class ServerPDFService {
  private currentServer: ServerInfo | null = null;

  constructor() {
    console.log('📡 ServerPDFService initialized with dynamic discovery');
  }

  /**
   * Get current server URL with automatic discovery
   */
  private async getServerUrl(): Promise<string> {
    // Check if we're in production (Vercel) or development
    const isProduction = import.meta.env.PROD || window.location.hostname !== 'localhost';
    
    if (isProduction) {
      // In production, use the same domain for API calls
      const baseUrl = `${window.location.protocol}//${window.location.host}`;
      console.log(`📡 Using production API endpoint: ${baseUrl}/api`);
      return baseUrl;
    }

    // Development mode - use dynamic server discovery
    // Check if current server is still healthy
    if (this.currentServer) {
      const isHealthy = await serverDiscovery.checkCurrentServerHealth();
      if (isHealthy) {
        return this.currentServer.url;
      }
    }

    // Discover new server
    const server = await serverDiscovery.getBestServer();
    if (!server) {
      throw new Error('No PDF processing servers available. Please ensure the server is running.');
    }

    this.currentServer = server;
    return server.url;
  }

  /**
   * Check if PDF processing server is available
   */
  async checkServerHealth(): Promise<boolean> {
    try {
      const serverUrl = await this.getServerUrl();
      console.log(`🔍 Checking server health at: ${serverUrl}/health`);
      
      const response = await fetch(`${serverUrl}/health`);
      const data = await response.json();
      console.log(`✅ Server health response:`, data);
      const healthData = data.data;
      console.log(`🔍 Health check details - status: ${healthData?.status}, pdfProcessorReady: ${healthData?.pdfProcessorReady}`);
      
      const isHealthy = data.status === 'success' && 
                       healthData?.status === 'healthy' && 
                       healthData?.pdfProcessorReady === true;
      
      if (!isHealthy && this.currentServer) {
        // Mark current server as unhealthy and clear it
        this.currentServer.status = 'unhealthy';
        this.currentServer = null;
      }
      
      return isHealthy;
    } catch (error) {
      console.error(`❌ PDF server health check failed:`, error);
      
      // Clear current server on failure
      this.currentServer = null;
      
      return false;
    }
  }

  /**
   * Process a single PDF file on the server with comprehensive error handling
   */
  async processPDF(file: File): Promise<ServerPDFResult> {
    const startTime = Date.now();
    
    try {
      console.log(`📤 Sending PDF to server: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

      // 1. Client-side file validation
      const validationError = this.validatePDFFile(file);
      if (validationError) {
        console.error(`❌ Client validation failed for ${file.name}:`, validationError);
        return {
          success: false,
          error: `File validation failed: ${validationError}`,
          processingTime: Date.now() - startTime,
          fileName: file.name
        };
      }

      // 2. Get server URL with automatic discovery
      const serverUrl = await this.getServerUrl();
      console.log(`📡 Using server: ${serverUrl}`);

      // 3. Prepare and send request
      const formData = new FormData();
      formData.append('documents', file);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

      const endpoint = `${serverUrl}/api/v1/documents/process`;
      
      console.log(`📍 PDF Processing endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 4. Handle different response types
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        
        console.error(`❌ Server returned error ${response.status} for ${file.name}:`, errorData);
        console.error(`📝 Full server error response:`, {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          headers: Object.fromEntries(response.headers.entries()),
          errorData
        });
        
        return {
          success: false,
          error: errorMessage,
          processingTime: errorData.processingTime || (Date.now() - startTime),
          fileName: file.name,
          serverDetails: errorData
        };
      }

      // 5. Parse and validate response
      const result = await response.json();
      
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format from server');
      }

      // 6. Log result and handle successful processing
      const status = result.success ? 'SUCCESS' : 
                   result.rejected ? 'REJECTED' : 
                   result.requiresManualReview ? 'REVIEW_NEEDED' : 'FAILED';
      
      console.log(`📥 Server response for ${file.name}: ${status} (${(Date.now() - startTime)}ms)`);
      
      if (result.rejected) {
        console.log(`🚫 Document rejected: ${result.error}`);
        console.log(`💡 Suggestions: ${result.rejectionDetails?.suggestions?.join(', ') || 'None provided'}`);
      }
      
      if (result.requiresManualReview) {
        console.log(`👁️ Manual review required: ${result.reviewReason}`);
      }

      
      return {
        ...result,
        processingTime: result.processingTime || (Date.now() - startTime),
        fileName: file.name
      };

    } catch (error) {
      console.error(`❌ Server PDF processing failed for ${file.name}:`, error);
      
      // Handle specific error types
      let errorMessage = 'Unknown server error';
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Network error: Unable to reach PDF processing server';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Processing timeout: PDF processing took too long (3+ minutes)';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        error: errorMessage,
        processingTime: Date.now() - startTime,
        fileName: file.name
      };
    }
  }

  /**
   * Client-side PDF file validation
   */
  private validatePDFFile(file: File): string | null {
    // Check file type
    if (file.type !== 'application/pdf') {
      return `Invalid file type: ${file.type}. Only PDF files are supported.`;
    }

    // Check file size (32MB limit)
    const maxSize = 32 * 1024 * 1024; // 32MB
    if (file.size > maxSize) {
      return `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 32MB.`;
    }

    // Check minimum size
    if (file.size < 100) {
      return 'File appears to be empty or corrupted (less than 100 bytes).';
    }

    // Check file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.pdf')) {
      return 'Invalid file extension. Only .pdf files are supported.';
    }

    return null; // No validation errors
  }

  /**
   * Process multiple PDF files on the server
   */
  async processPDFBatch(files: File[]): Promise<BatchPDFResult> {
    try {
      console.log(`📤 Sending ${files.length} PDFs to server for batch processing`);

      const formData = new FormData();
      files.forEach(file => {
        formData.append('pdfs', file);
      });

      const serverUrl = await this.getServerUrl();
      const response = await fetch(`${serverUrl}/api/process-pdfs-batch`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log(`📥 Batch processing complete: ${result.successful}/${result.totalFiles} successful`);
      
      return result;

    } catch (error) {
      console.error('❌ Server batch PDF processing failed:', error);
      
      return {
        totalFiles: files.length,
        successful: 0,
        failed: files.length,
        results: files.map(file => ({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown server error',
          processingTime: 0,
          fileName: file.name
        }))
      };
    }
  }

  /**
   * Process single PDF with progress callback
   */
  async processPDFWithProgress(
    file: File, 
    onProgress?: (progress: number, message: string) => void
  ): Promise<ServerPDFResult> {
    onProgress?.(10, `Uploading ${file.name} to server...`);
    
    const result = await this.processPDF(file);
    
    onProgress?.(100, result.success ? 'Processing complete!' : 'Processing failed');
    
    return result;
  }
}

// Export singleton instance
export const serverPDFService = new ServerPDFService();