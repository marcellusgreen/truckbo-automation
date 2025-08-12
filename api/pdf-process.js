/**
 * Vercel Serverless API Route for PDF Processing
 * Handles server-side Claude Vision PDF processing
 */

import { Anthropic } from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Validate PDF file before processing
 */
function validatePDFFile(buffer, fileName, contentType, size) {
  const errors = [];
  const details = {};
  
  // 1. Check file size (32MB limit for Claude API)
  const maxSize = 32 * 1024 * 1024; // 32MB
  if (size > maxSize) {
    errors.push(`File size ${(size / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of 32MB`);
  }
  details.fileSize = `${(size / 1024 / 1024).toFixed(2)}MB`;
  
  // 2. Check minimum file size (avoid empty files)
  if (size < 100) {
    errors.push('File appears to be empty or corrupted (less than 100 bytes)');
  }
  
  // 3. Validate content type
  const validContentTypes = ['application/pdf', 'application/x-pdf'];
  if (!validContentTypes.includes(contentType)) {
    errors.push(`Invalid file type: ${contentType}. Only PDF files are allowed.`);
  }
  details.contentType = contentType;
  
  // 4. Check file extension
  const fileExtension = fileName.toLowerCase().split('.').pop();
  if (fileExtension !== 'pdf') {
    errors.push(`Invalid file extension: .${fileExtension}. Only .pdf files are allowed.`);
  }
  details.extension = fileExtension;
  
  // 5. Basic PDF structure validation (check PDF header)
  const pdfHeader = buffer.slice(0, 4).toString();
  if (pdfHeader !== '%PDF') {
    errors.push('File does not appear to be a valid PDF (missing PDF header)');
  }
  details.hasValidPDFHeader = pdfHeader === '%PDF';
  
  return {
    isValid: errors.length === 0,
    error: errors.join('; '),
    errors: errors,
    details: details
  };
}

/**
 * Process PDF with Claude Vision API
 */
async function processPDFWithClaude(pdfBuffer, fileName) {
  const startTime = Date.now();
  
  try {
    console.log(`📄 Processing PDF: ${fileName} (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

    // Convert buffer to base64
    const base64Data = pdfBuffer.toString('base64');

    // Enhanced prompt for comprehensive vehicle document extraction
    const prompt = `You are a specialized AI for extracting vehicle registration and insurance data from fleet management documents. 

Please analyze this PDF document and extract ALL vehicle information you can find. Look for:

VEHICLE IDENTIFICATION:
- VIN (Vehicle Identification Number) - 17 characters, look carefully
- License plate numbers
- DOT numbers 
- MC numbers
- Make, model, year
- Vehicle/unit/truck numbers

REGISTRATION INFORMATION:
- Registration number/ID
- Registration state
- Registration expiration date
- Registered owner name
- Registration fees/amounts

INSURANCE INFORMATION:  
- Insurance carrier/company name
- Policy number
- Insurance expiration date
- Coverage amounts
- Agent information

IMPORTANT EXTRACTION RULES:
1. Extract ALL vehicles found in the document (some documents contain multiple vehicles)
2. For dates, convert to YYYY-MM-DD format
3. Clean and standardize data (remove extra spaces, fix capitalization)
4. If a field is not found or unclear, set it as null
5. For VINs, ensure they are exactly 17 characters
6. Group related information by vehicle when multiple vehicles are present

Return the data as a JSON array where each object represents one vehicle:
[
  {
    "vin": "1HGBH41JXMN109186",
    "licensePlate": "ABC123",
    "dotNumber": "DOT123456",
    "mcNumber": "MC987654", 
    "make": "Freightliner",
    "model": "Cascadia",
    "year": 2022,
    "truckNumber": "Unit 001",
    "registrationNumber": "REG123456",
    "registrationState": "TX", 
    "registrationExpirationDate": "2024-12-31",
    "registeredOwner": "Sample Trucking LLC",
    "insuranceCarrier": "State Farm",
    "policyNumber": "POL123456789",
    "insuranceExpirationDate": "2024-06-30",
    "coverageAmount": 1000000,
    "extractionConfidence": 0.95,
    "needsReview": false
  }
]

If no vehicles are found, return an empty array [].`;

    // Send to Claude Vision API
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Data
            }
          }
        ]
      }]
    });

    const processingTime = Date.now() - startTime;
    console.log(`⏱️ Claude Vision processing completed in ${processingTime}ms`);

    // Extract and parse the JSON response
    const extractedText = response.content[0].text;
    console.log('🔍 Claude Vision raw response:', extractedText);

    // Try to extract JSON from the response
    let extractedData = [];
    try {
      // Look for JSON array in the response
      const jsonMatch = extractedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        // Try to find JSON object and wrap in array
        const objMatch = extractedText.match(/\{[\s\S]*\}/);
        if (objMatch) {
          const obj = JSON.parse(objMatch[0]);
          extractedData = [obj];
        } else {
          console.warn('⚠️ No valid JSON found in Claude response');
          extractedData = [];
        }
      }
    } catch (parseError) {
      console.error('❌ Error parsing Claude JSON response:', parseError);
      console.log('Raw response that failed to parse:', extractedText);
      
      // Return a basic structure if parsing fails
      extractedData = [{
        vin: null,
        licensePlate: null,
        make: null,
        model: null,
        year: null,
        extractionConfidence: 0.3,
        needsReview: true,
        rawResponse: extractedText,
        parseError: parseError.message
      }];
    }

    console.log(`✅ Successfully extracted data for ${extractedData.length} vehicle(s)`);

    return {
      success: true,
      data: extractedData,
      processingTime: processingTime,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      },
      metadata: {
        fileName: fileName,
        fileSize: pdfBuffer.length,
        processingTimestamp: new Date().toISOString(),
        claudeModel: "claude-3-5-sonnet-20241022"
      }
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Claude Vision processing error:', error);
    
    return {
      success: false,
      error: error.message,
      processingTime: processingTime,
      data: [],
      metadata: {
        fileName: fileName,
        fileSize: pdfBuffer.length,
        processingTimestamp: new Date().toISOString(),
        errorType: error.constructor.name
      }
    };
  }
}

/**
 * Parse multipart form data (simple implementation for Vercel)
 */
function parseMultipartData(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  
  while (true) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;
    
    if (start > 0) {
      const partData = buffer.slice(start, boundaryIndex);
      
      // Find the double CRLF that separates headers from body
      const headerEndIndex = partData.indexOf('\r\n\r\n');
      if (headerEndIndex !== -1) {
        const headers = partData.slice(0, headerEndIndex).toString();
        const body = partData.slice(headerEndIndex + 4);
        
        // Extract filename and content type from headers
        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/);
        
        if (nameMatch) {
          parts.push({
            name: nameMatch[1],
            filename: filenameMatch ? filenameMatch[1] : null,
            contentType: contentTypeMatch ? contentTypeMatch[1] : 'text/plain',
            data: body
          });
        }
      }
    }
    
    start = boundaryIndex + boundaryBuffer.length;
  }
  
  return parts;
}

// Main Vercel serverless function
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Health check endpoint
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'TruckBo PDF Processing API',
      version: '2.0',
      timestamp: new Date().toISOString(),
      environment: 'Vercel Serverless',
      claudeApiConfigured: !!process.env.ANTHROPIC_API_KEY
    });
  }

  // Handle PDF processing
  if (req.method === 'POST') {
    try {
      // Check if Anthropic API key is configured
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({
          success: false,
          error: 'Anthropic API key not configured',
          details: 'ANTHROPIC_API_KEY environment variable is required'
        });
      }

      const contentType = req.headers['content-type'];
      
      if (!contentType || !contentType.includes('multipart/form-data')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid content type',
          details: 'Expected multipart/form-data'
        });
      }

      // Extract boundary from content type
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) {
        return res.status(400).json({
          success: false,
          error: 'Missing boundary in content type'
        });
      }

      const boundary = boundaryMatch[1];

      // Get request body as buffer
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Parse multipart data
      const parts = parseMultipartData(buffer, boundary);
      
      // Find the PDF file part
      const pdfPart = parts.find(part => part.name === 'pdf' || part.contentType === 'application/pdf');
      
      if (!pdfPart) {
        return res.status(400).json({
          success: false,
          error: 'No PDF file found in request',
          details: 'Expected a PDF file in the "pdf" field'
        });
      }

      const fileName = pdfPart.filename || 'unknown.pdf';
      const pdfBuffer = pdfPart.data;

      console.log(`📥 Received PDF upload: ${fileName} (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

      // Validate the PDF file
      const validation = validatePDFFile(pdfBuffer, fileName, pdfPart.contentType, pdfBuffer.length);
      
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'PDF validation failed',
          details: validation.error,
          validation: validation
        });
      }

      console.log('✅ PDF validation passed:', validation.details);

      // Process with Claude Vision
      const result = await processPDFWithClaude(pdfBuffer, fileName);
      
      return res.status(200).json(result);

    } catch (error) {
      console.error('❌ Serverless function error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Method not allowed
  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
    allowedMethods: ['GET', 'POST', 'OPTIONS']
  });
}