export interface GoogleVisionProcessingResult {
  success: boolean;
  jobId?: string;
  status?: string;
  statusUrl?: string;
  error?: string;
  // This interface will be used for the initial response from the async processing endpoint
}

class GoogleVisionProcessor {
  async processDocument(file: File): Promise<GoogleVisionProcessingResult> {
    try {
      const formData = new FormData();
      // The backend route handler uses multer with `upload.fields`, which can accept 'document' or 'image'
      formData.append('document', file);

      // The API is versioned and the correct endpoint is /api/v1/documents/process
      // The base URL handling can be tricky. Assuming a proxy is set up or the API is on the same host.
      const response = await fetch(`/api/v1/documents/process`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        // Use the error message from the API response if available
        throw new Error(result.error?.userMessage || result.message || 'API request failed');
      }

      // The successful response (202Accepted) contains the job details in the `data` property
      if (result.data && result.data.jobId) {
        return {
          success: true,
          jobId: result.data.jobId,
          status: result.data.status,
          statusUrl: result.data.statusUrl,
        };
      } else {
        // This case indicates an unexpected successful response format
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Google Vision API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Google Vision API error',
      };
    }
  }
}

export const googleVisionProcessor = new GoogleVisionProcessor();