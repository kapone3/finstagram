import { User } from '@supabase/supabase-js';

export const STORAGE_CONFIG = {
  BUCKET_NAME: 'imageupload',
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif'],
  ALLOWED_VIDEO_TYPES: ['video/mp4'],
} as const;

export function validateFile(file: File, allowedTypes: string[]) {
  if (!file) {
    throw new Error('Keine Datei ausgewählt');
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      `Ungültiges Dateiformat. Erlaubte Formate: ${allowedTypes
        .map(type => type.split('/')[1].toUpperCase())
        .join(', ')}`
    );
  }

  if (file.size > STORAGE_CONFIG.MAX_FILE_SIZE) {
    const sizeMB = STORAGE_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
    throw new Error(`Die Datei ist zu groß. Maximale Größe ist ${sizeMB}MB`);
  }

  if (file.size === 0) {
    throw new Error('Die Datei ist leer');
  }

  return true;
}

export function generateStoragePath(user: User, type: 'posts' | 'stories' | 'avatars', fileExt: string) {
  if (!user?.id) {
    throw new Error('Benutzer-ID ist erforderlich');
  }

  // Clean and validate file extension
  const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanExt) {
    throw new Error('Ungültige Dateiendung');
  }

  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  
  return {
    bucket: STORAGE_CONFIG.BUCKET_NAME,
    path: `${type}/${user.id}/${timestamp}_${uuid}.${cleanExt}`,
  };
}

export async function uploadFile(
  user: User,
  file: File,
  type: 'posts' | 'stories' | 'avatars',
  supabase: any,
  onProgress?: (progress: number) => void
) {
  try {
    // Validate file
    validateFile(
      file,
      type === 'posts' || type === 'stories'
        ? [...STORAGE_CONFIG.ALLOWED_IMAGE_TYPES, ...STORAGE_CONFIG.ALLOWED_VIDEO_TYPES]
        : STORAGE_CONFIG.ALLOWED_IMAGE_TYPES
    );

    // Generate storage path
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const { bucket, path } = generateStoragePath(user, type, fileExt);

    // Upload file with retries
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      try {
        // Upload the file
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          });

        if (uploadError) {
          if (uploadError.message.includes('duplicate')) {
            throw new Error('Diese Datei wurde bereits hochgeladen');
          }
          throw uploadError;
        }

        if (!uploadData?.path) {
          throw new Error('Fehler beim Hochladen: Keine Datei-URL erhalten');
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(uploadData.path);

        if (!urlData?.publicUrl) {
          throw new Error('Fehler beim Generieren der öffentlichen URL');
        }

        // Verify upload
        const { data: fileExists, error: listError } = await supabase.storage
          .from(bucket)
          .list(path.split('/').slice(0, -1).join('/'), {
            limit: 1,
            search: path.split('/').pop(),
          });

        if (listError) {
          throw listError;
        }

        if (!fileExists?.length) {
          throw new Error('Datei wurde nicht korrekt gespeichert');
        }

        return {
          path: uploadData.path,
          url: urlData.publicUrl,
        };
      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          continue;
        }
        
        throw error;
      }
    }

    throw lastError || new Error('Upload fehlgeschlagen nach mehreren Versuchen');
  } catch (error) {
    console.error('Upload error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('storage/quota_exceeded')) {
        throw new Error('Speicherplatz-Limit überschritten');
      }
      if (error.message.includes('auth/')) {
        throw new Error('Bitte melde dich erneut an');
      }
      if (error.message.includes('permission denied')) {
        throw new Error('Keine Berechtigung zum Hochladen');
      }
      throw error;
    }
    
    throw new Error('Ein unerwarteter Fehler ist aufgetreten');
  }
}