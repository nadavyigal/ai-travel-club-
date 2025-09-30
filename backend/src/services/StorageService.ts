import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

export interface FileUploadResult {
  success: boolean;
  data?: {
    id: string;
    path: string;
    fullPath: string;
    publicUrl?: string;
  };
  error?: string;
}

export interface FileUploadOptions {
  userId: string;
  bucket: 'travel-photos' | 'travel-documents' | 'avatars';
  fileName?: string;
  folder?: string;
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

export class StorageService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    file: Buffer | ArrayBuffer | File,
    options: FileUploadOptions
  ): Promise<FileUploadResult> {
    try {
      const { userId, bucket, fileName, folder, contentType, cacheControl, upsert } = options;

      // Generate file path: userId/folder/fileName or userId/fileName
      const fileId = uuidv4();
      const extension = fileName ? fileName.split('.').pop() : 'bin';
      const generatedFileName = fileName || `${fileId}.${extension}`;

      const pathParts = [userId];
      if (folder) {
        pathParts.push(folder);
      }
      pathParts.push(generatedFileName);

      const filePath = pathParts.join('/');

      // Upload to Supabase Storage
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType,
          cacheControl: cacheControl || '3600', // 1 hour default
          upsert: upsert || false,
        });

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      // Get public URL for public buckets
      let publicUrl: string | undefined;
      if (bucket === 'travel-photos' || bucket === 'avatars') {
        const { data: urlData } = this.supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);
        publicUrl = urlData.publicUrl;
      }

      return {
        success: true,
        data: {
          id: fileId,
          path: filePath,
          fullPath: data.path,
          publicUrl
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Upload failed'
      };
    }
  }

  /**
   * Delete a file from Supabase Storage
   */
  async deleteFile(bucket: string, path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Delete failed'
      };
    }
  }

  /**
   * Get a signed URL for private files (travel-documents)
   */
  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        url: data.signedUrl
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to generate signed URL'
      };
    }
  }

  /**
   * List files in a user's folder
   */
  async listUserFiles(
    bucket: string,
    userId: string,
    folder?: string
  ): Promise<{ success: boolean; files?: any[]; error?: string }> {
    try {
      const path = folder ? `${userId}/${folder}` : userId;

      const { data, error } = await this.supabase.storage
        .from(bucket)
        .list(path);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        files: data || []
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to list files'
      };
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(bucket: string, path: string): Promise<{ success: boolean; info?: any; error?: string }> {
    try {
      // Try to get file metadata by listing the parent directory
      const pathParts = path.split('/');
      const fileName = pathParts.pop();
      const directory = pathParts.join('/');

      const { data, error } = await this.supabase.storage
        .from(bucket)
        .list(directory);

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      const fileInfo = data?.find(file => file.name === fileName);

      if (!fileInfo) {
        return {
          success: false,
          error: 'File not found'
        };
      }

      return {
        success: true,
        info: fileInfo
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to get file info'
      };
    }
  }

  /**
   * Validate file type and size
   */
  validateFile(file: any, bucket: string): { valid: boolean; error?: string } {
    const bucketLimits = {
      'travel-photos': {
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      },
      'travel-documents': {
        maxSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/json']
      },
      'avatars': {
        maxSize: 2 * 1024 * 1024, // 2MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
      }
    };

    const limits = bucketLimits[bucket as keyof typeof bucketLimits];
    if (!limits) {
      return { valid: false, error: 'Invalid bucket' };
    }

    // Check file size
    if (file.size > limits.maxSize) {
      return {
        valid: false,
        error: `File too large. Max size: ${limits.maxSize / 1024 / 1024}MB`
      };
    }

    // Check file type
    if (file.type && !limits.allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${limits.allowedTypes.join(', ')}`
      };
    }

    return { valid: true };
  }
}