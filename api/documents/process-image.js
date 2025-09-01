/**
 * Vercel Serverless Function - Image Processing with Google Vision
 * Processes images using Google Cloud Vision API
 */

import { ImageAnnotatorClient } from '@google-cloud/vision';
import formidable from 'formidable';

// CORS headers
const headers = {
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
};

export default async function handler(req, res) {
  // Set CORS headers
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    // Initialize Google Vision client
    const client = new ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
    });

    // Parse form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true
    });

    const [fields, files] = await form.parse(req);
    const file = files.image?.[0];

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Process image with Google Vision
    const [result] = await client.documentTextDetection(file.filepath);
    const fullTextAnnotation = result.fullTextAnnotation;

    if (result.error) {
      console.error('Google Vision API error:', result.error);
      return res.status(500).json({
        success: false,
        message: 'Google Vision processing failed',
        error: result.error.message
      });
    }

    res.json({
      success: true,
      text: fullTextAnnotation?.text || '',
      confidence: fullTextAnnotation?.pages?.[0]?.confidence || 0
    });

  } catch (error) {
    console.error('Server error during image processing:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during image processing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Configure Next.js API route
export const config = {
  api: {
    bodyParser: false, // Required for formidable
  },
};