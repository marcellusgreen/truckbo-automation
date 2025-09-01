export interface GoogleVisionProcessingResult {
  success: boolean;
  text?: string;
  error?: string;
  confidence?: number;
}

class GoogleVisionProcessor {
  async processDocument(file: File): Promise<GoogleVisionProcessingResult> {
    try {
      // Create form data to send to server API
      const formData = new FormData();
      formData.append('image', file);

      const baseUrl = import.meta.env.DEV ? '' : window.location.origin;
      const response = await fetch(`${baseUrl}/api/documents/process-image`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.message || 'Google Vision API request failed'
        };
      }

      return {
        success: result.success,
        text: result.text,
        confidence: result.confidence,
        error: result.error
      };

    } catch (error) {
      console.error('Google Vision API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Google Vision API error'
      };
    }
  }
}

export const googleVisionProcessor = new GoogleVisionProcessor();
