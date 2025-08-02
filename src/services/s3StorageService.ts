// S3 Document Storage Service
// Handles secure document upload, storage, and retrieval with AWS S3

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string; // For S3-compatible services
}

export interface UploadResult {
  success: boolean;
  s3Key: string;
  s3Url: string;
  fileSize: number;
  contentType: string;
  uploadedAt: Date;
  error?: string;
}

export interface DocumentMetadata {
  organizationId: string;
  documentType: 'registration' | 'insurance' | 'medical_certificate' | 'cdl' | 'inspection' | 'permit';
  entityType: 'vehicle' | 'driver';
  entityId: string;
  originalFilename: string;
}

export class S3StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private readonly URL_EXPIRY_SECONDS = 7200; // 2 hours

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && { endpoint: config.endpoint }),
    });
  }

  /**
   * Upload a document to S3 with proper organization and security
   */
  async uploadDocument(
    file: File | Buffer, 
    metadata: DocumentMetadata
  ): Promise<UploadResult> {
    try {
      // Generate secure S3 key
      const s3Key = this.generateS3Key(metadata);
      
      // Determine content type
      const contentType = file instanceof File ? file.type : 'application/octet-stream';
      
      // Get file buffer
      const fileBuffer = file instanceof File ? 
        Buffer.from(await file.arrayBuffer()) : 
        file;

      // Prepare upload command
      const uploadCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: {
          organizationId: metadata.organizationId,
          documentType: metadata.documentType,
          entityType: metadata.entityType,
          entityId: metadata.entityId,
          originalFilename: metadata.originalFilename,
          uploadedAt: new Date().toISOString(),
        },
        // Security settings
        ServerSideEncryption: 'AES256',
        // Prevent public access
        ACL: 'private',
      });

      // Execute upload
      await this.s3Client.send(uploadCommand);

      // Generate pre-signed URL for access
      const s3Url = await this.generatePresignedUrl(s3Key, 'get');

      return {
        success: true,
        s3Key,
        s3Url,
        fileSize: fileBuffer.length,
        contentType,
        uploadedAt: new Date(),
      };

    } catch (error) {
      console.error('S3 upload failed:', error);
      return {
        success: false,
        s3Key: '',
        s3Url: '',
        fileSize: 0,
        contentType: '',
        uploadedAt: new Date(),
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Generate a secure, organized S3 key for the document
   */
  private generateS3Key(metadata: DocumentMetadata): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    
    // Structure: org/{orgId}/{entityType}/{entityId}/{docType}/{date}_{filename}_{random}
    const fileExtension = this.getFileExtension(metadata.originalFilename);
    const sanitizedFilename = this.sanitizeFilename(metadata.originalFilename);
    
    return [
      'documents',
      metadata.organizationId,
      metadata.entityType, // vehicle or driver
      metadata.entityId,
      metadata.documentType,
      `${timestamp}_${sanitizedFilename}_${randomSuffix}${fileExtension}`
    ].join('/');
  }

  /**
   * Generate pre-signed URL for secure document access
   */
  async generatePresignedUrl(
    s3Key: string, 
    operation: 'get' | 'put' = 'get',
    expirySeconds: number = this.URL_EXPIRY_SECONDS
  ): Promise<string> {
    try {
      const command = operation === 'get' 
        ? new GetObjectCommand({ Bucket: this.bucketName, Key: s3Key })
        : new PutObjectCommand({ Bucket: this.bucketName, Key: s3Key });

      return await getSignedUrl(this.s3Client, command, { 
        expiresIn: expirySeconds 
      });
    } catch (error) {
      console.error('Failed to generate pre-signed URL:', error);
      throw new Error(`Failed to generate ${operation} URL for ${s3Key}`);
    }
  }

  /**
   * Check if document exists in S3
   */
  async documentExists(s3Key: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete document from S3
   */
  async deleteDocument(s3Key: string): Promise<boolean> {
    try {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      }));
      return true;
    } catch (error) {
      console.error('Failed to delete document:', error);
      return false;
    }
  }

  /**
   * Get document metadata without downloading
   */
  async getDocumentMetadata(s3Key: string): Promise<any> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });
      
      const response = await this.s3Client.send(command);
      
      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
        etag: response.ETag,
      };
    } catch (error) {
      console.error('Failed to get document metadata:', error);
      throw new Error(`Failed to get metadata for ${s3Key}`);
    }
  }

  /**
   * Batch upload multiple documents
   */
  async uploadMultipleDocuments(
    uploads: Array<{ file: File | Buffer; metadata: DocumentMetadata }>
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    
    // Process uploads in parallel with concurrency limit
    const BATCH_SIZE = 5;
    for (let i = 0; i < uploads.length; i += BATCH_SIZE) {
      const batch = uploads.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(({ file, metadata }) => 
        this.uploadDocument(file, metadata)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Generate pre-signed URLs for multiple documents
   */
  async generateMultiplePresignedUrls(
    s3Keys: string[], 
    operation: 'get' | 'put' = 'get'
  ): Promise<Array<{ s3Key: string; url: string; error?: string }>> {
    const results = await Promise.allSettled(
      s3Keys.map(async (s3Key) => ({
        s3Key,
        url: await this.generatePresignedUrl(s3Key, operation),
      }))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          s3Key: s3Keys[index],
          url: '',
          error: result.reason.message,
        };
      }
    });
  }

  /**
   * Clean up expired documents (for GDPR compliance)
   */
  async cleanupExpiredDocuments(
    organizationId: string,
    retentionDays: number = 2555 // 7 years default
  ): Promise<number> {
    // This would typically be implemented as a scheduled job
    // For now, return a placeholder
    console.log(`Cleanup scheduled for org ${organizationId} with ${retentionDays} days retention`);
    return 0;
  }

  // Helper methods
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot) : '';
  }

  private sanitizeFilename(filename: string): string {
    // Remove extension and sanitize for S3 key
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    return nameWithoutExt
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase()
      .substring(0, 50); // Limit length
  }

  /**
   * Health check for S3 connectivity
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      // Try to list bucket contents (just to test connectivity)
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: 'health-check-key-that-does-not-exist',
      }));
      
      // If we get here without throwing, connection is working
      // (The 404 is expected for a non-existent key)
      return { healthy: true };
    } catch (error: any) {
      // 404 is expected and means S3 is reachable
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return { healthy: true };
      }
      
      return { 
        healthy: false, 
        error: error.message || 'S3 connection failed' 
      };
    }
  }
}

// Factory function for creating S3 service instance
export function createS3StorageService(config?: Partial<S3Config>): S3StorageService {
  const defaultConfig: S3Config = {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    bucketName: process.env.S3_BUCKET_NAME || 'truckbo-documents',
    ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Validate required config
  if (!finalConfig.accessKeyId || !finalConfig.secretAccessKey) {
    throw new Error('AWS credentials are required for S3 storage service');
  }

  if (!finalConfig.bucketName) {
    throw new Error('S3 bucket name is required');
  }

  return new S3StorageService(finalConfig);
}

// Example usage types for documentation
export interface S3ServiceExample {
  // Upload a vehicle registration document
  uploadVehicleDocument: (file: File, vehicleId: string, organizationId: string) => Promise<UploadResult>;
  
  // Upload a driver medical certificate
  uploadDriverDocument: (file: File, driverId: string, organizationId: string) => Promise<UploadResult>;
  
  // Get secure URL for document viewing
  getDocumentUrl: (s3Key: string) => Promise<string>;
}