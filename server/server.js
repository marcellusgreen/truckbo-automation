/**
 * Express Server for PDF Processing
 * Handles server-side Claude Vision PDF processing
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import ServerPDFProcessor from './pdfProcessor.js';
import authRouter from './routes/auth.js';

dotenv.config();

const app = express();
const port = process.env.SERVER_PORT || 3004;

// Middleware
app.use(cors({
  origin: true, // Allow all origins temporarily for debugging
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Authentication routes
app.use('/api/auth', authRouter);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 32 * 1024 * 1024, // 32MB limit (Claude's PDF limit)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for server processing'), false);
    }
  }
});

// Initialize PDF processor
let pdfProcessor;
try {
  pdfProcessor = new ServerPDFProcessor();
  console.log('✅ Server PDF processor initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize PDF processor:', error.message);
  console.error('Make sure ANTHROPIC_API_KEY is set in your .env file');
}

/**
 * Validate PDF file before processing
 */
function validatePDFFile(buffer, fileName, mimetype, size) {
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
  
  // 3. Validate MIME type
  const validMimeTypes = ['application/pdf', 'application/x-pdf'];
  if (!validMimeTypes.includes(mimetype)) {
    errors.push(`Invalid file type: ${mimetype}. Only PDF files are allowed.`);
  }
  details.mimeType = mimetype;
  
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
  
  // 6. Check for PDF version in header
  const pdfVersionMatch = buffer.slice(0, 8).toString().match(/%PDF-(\d\.\d)/);
  if (pdfVersionMatch) {
    details.pdfVersion = pdfVersionMatch[1];
  } else {
    errors.push('Unable to determine PDF version from file header');
  }
  
  return {
    isValid: errors.length === 0,
    error: errors.join('; '),
    errors: errors,
    details: details
  };
}

/**
 * Normalize processing result to ensure consistent structure
 */
function normalizeProcessingResult(result, fileName, startTime) {
  // Handle null or undefined result
  if (!result) {
    return {
      success: false,
      error: 'PDF processing returned no result',
      processingTime: Date.now() - startTime,
      fileName: fileName
    };
  }
  
  // Handle rejection cases (when document is rejected by filtering pipeline)
  if (result.rejected === true) {
    return {
      success: false,
      rejected: true,
      error: result.rejection?.message || 'Document was rejected during processing',
      processingTime: result.processingTime || (Date.now() - startTime),
      fileName: result.fileName || fileName,
      rejectionDetails: result.rejection || {}
    };
  }
  
  // Handle manual review cases
  if (result.requiresManualReview === true) {
    return {
      success: true,
      requiresManualReview: true,
      data: result.data || {},
      reviewReason: result.reviewReason || 'Document requires manual review',
      processingTime: result.processingTime || (Date.now() - startTime),
      fileName: result.fileName || fileName,
      priority: result.priority || 'medium'
    };
  }
  
  // Handle successful processing
  if (result.success === true) {
    return {
      success: true,
      data: result.data || {},
      processingTime: result.processingTime || (Date.now() - startTime),
      fileName: result.fileName || fileName,
      documentType: result.documentType || 'unknown',
      qualityMetrics: result.qualityMetrics || {}
    };
  }
  
  // Handle error cases
  return {
    success: false,
    error: result.error || result.message || 'Unknown processing error',
    processingTime: result.processingTime || (Date.now() - startTime),
    fileName: result.fileName || fileName,
    errorDetails: result.errorDetails || {}
  };
}

// Health check endpoint with enhanced info
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    pdfProcessorReady: !!pdfProcessor,
    version: '1.0.0',
    serviceName: 'pdf-processor',
    port: port,
    capabilities: ['pdf-processing', 'batch-processing', 'vin-extraction', 'document-reconciliation'],
    environment: process.env.NODE_ENV || 'development'
  });
});

// PDF processing endpoint with comprehensive validation and error handling
app.post('/api/process-pdf', upload.single('pdf'), async (req, res) => {
  const startTime = Date.now();
  let fileName = 'unknown';
  
  try {
    // 1. Check if PDF processor is initialized
    if (!pdfProcessor) {
      console.error('❌ PDF processor not initialized');
      return res.status(500).json({
        success: false,
        error: 'PDF processor not initialized. Check server configuration.',
        processingTime: Date.now() - startTime,
        fileName: fileName
      });
    }

    // 2. Validate file upload
    if (!req.file) {
      console.error('❌ No PDF file provided in request');
      return res.status(400).json({
        success: false,
        error: 'No PDF file provided. Please select a PDF file to upload.',
        processingTime: Date.now() - startTime,
        fileName: fileName
      });
    }

    const { buffer, originalname, mimetype, size } = req.file;
    fileName = originalname || 'unknown.pdf';
    
    console.log(`📄 Received PDF processing request: ${fileName} (${buffer.length} bytes, ${mimetype})`);
    
    // 3. Validate PDF file properties
    const validationResult = validatePDFFile(buffer, fileName, mimetype, size);
    if (!validationResult.isValid) {
      console.error(`❌ PDF validation failed: ${validationResult.error}`);
      return res.status(400).json({
        success: false,
        error: `PDF validation failed: ${validationResult.error}`,
        processingTime: Date.now() - startTime,
        fileName: fileName,
        validationDetails: validationResult.details
      });
    }

    // 4. Process PDF with timeout protection
    console.log(`🚀 Starting PDF processing for: ${fileName}`);
    
    const processingPromise = pdfProcessor.processPDF(buffer, fileName);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PDF processing timeout after 120 seconds')), 120000);
    });
    
    const result = await Promise.race([processingPromise, timeoutPromise]);
    
    // 5. Validate and normalize result
    const normalizedResult = normalizeProcessingResult(result, fileName, startTime);
    
    console.log(`✅ PDF processing completed for ${fileName}: ${normalizedResult.success ? 'SUCCESS' : 'FAILED'}`);
    
    // 6. Return appropriate response
    const statusCode = normalizedResult.success ? 200 : 422; // 422 for processing failures
    res.status(statusCode).json(normalizedResult);
    
  } catch (error) {
    console.error(`❌ PDF processing endpoint error for ${fileName}:`, error);
    console.error('Error stack:', error.stack);
    
    // Ensure we always return a properly structured error response
    const errorResponse = {
      success: false,
      error: error.message || error.toString() || 'Internal server error during PDF processing',
      processingTime: Date.now() - startTime,
      fileName: fileName,
      errorDetails: {
        type: error.name || 'UnknownError',
        message: error.message || 'No error message available',
        timestamp: new Date().toISOString()
      }
    };
    
    res.status(500).json(errorResponse);
  }
});

// Batch PDF processing endpoint
app.post('/api/process-pdfs-batch', upload.array('pdfs', 20), async (req, res) => {
  try {
    if (!pdfProcessor) {
      return res.status(500).json({
        success: false,
        error: 'PDF processor not initialized. Check server configuration.'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No PDF files provided'
      });
    }

    console.log(`📄 Batch processing ${req.files.length} PDFs`);
    
    const results = [];
    
    // Process each PDF
    for (const file of req.files) {
      const result = await pdfProcessor.processPDF(file.buffer, file.originalname);
      results.push(result);
      
      // Small delay to be respectful to Claude API
      if (results.length < req.files.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    const summary = {
      totalFiles: req.files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: results
    };
    
    console.log(`✅ Batch processing complete: ${summary.successful}/${summary.totalFiles} successful`);
    
    res.json(summary);
    
  } catch (error) {
    console.error('Batch PDF processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during batch PDF processing'
    });
  }
});


// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'PDF file too large. Maximum size is 32MB.'
      });
    }
  }
  
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 PDF Processing Server running on http://localhost:${port}`);
  console.log(`📄 Ready to process PDFs with Claude Vision`);
  console.log(`🔑 API Key configured: ${!!process.env.ANTHROPIC_API_KEY || !!process.env.VITE_ANTHROPIC_API_KEY}`);
});

export default app;