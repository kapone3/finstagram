import React, { useState, useEffect, useRef } from 'react';
import { Camera, Loader2, X, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { STORAGE_CONFIG, generateStoragePath } from '../lib/storage';
import toast from 'react-hot-toast';
import { User } from '@supabase/supabase-js';

interface StoryUploadProps {
  user: User;
}

export function StoryUpload({ user }: StoryUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const validateFile = (file: File) => {
    const allowedTypes = [...STORAGE_CONFIG.ALLOWED_IMAGE_TYPES, ...STORAGE_CONFIG.ALLOWED_VIDEO_TYPES];
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Ungültiges Dateiformat. Erlaubte Formate sind: JPEG, PNG, GIF und MP4.`);
    }

    if (file.size > STORAGE_CONFIG.MAX_FILE_SIZE) {
      const sizeMB = STORAGE_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
      throw new Error(`Die Datei ist zu groß. Maximale Größe ist ${sizeMB}MB.`);
    }

    if (file.size === 0) {
      throw new Error('Die Datei ist leer.');
    }

    return true;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      validateFile(file);
      const previewUrl = URL.createObjectURL(file);
      
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = previewUrl;
        
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = () => reject(new Error('Das Video kann nicht wiedergegeben werden.'));
        });
      }

      setSelectedFile(file);
      setPreview(previewUrl);
    } catch (error) {
      console.error('File validation error:', error);
      toast.error(error instanceof Error ? error.message : 'Fehler beim Auswählen der Datei');
      event.target.value = '';
    }
  };

  const clearSelection = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    if (!navigator.onLine) {
      toast.error('Keine Internetverbindung verfügbar');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
      const { bucket, path } = generateStoragePath(user, 'stories', fileExt);

      // Upload progress simulation
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 10;
        });
      }, 300);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from(bucket)
        .upload(path, selectedFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: selectedFile.type,
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        if (uploadError.message.includes('duplicate')) {
          throw new Error('Diese Datei wurde bereits hochgeladen.');
        }
        throw uploadError;
      }

      if (!uploadData?.path) {
        throw new Error('Fehler beim Hochladen: Keine Datei-URL erhalten.');
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(uploadData.path);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error: storyError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          image_url: publicUrl,
          expires_at: expiresAt.toISOString(),
        });

      if (storyError) {
        console.error('Database error:', storyError);
        // If story creation fails, clean up the uploaded file
        await supabase.storage
          .from(bucket)
          .remove([uploadData.path]);
          
        throw storyError;
      }

      toast.success('Story erfolgreich hochgeladen!');
      clearSelection();
    } catch (error) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten';
      
      if (error instanceof Error) {
        if (error.message.includes('storage/quota_exceeded')) {
          errorMessage = 'Speicherplatz-Limit überschritten';
        } else if (error.message.includes('auth/')) {
          errorMessage = 'Bitte melde dich erneut an';
        } else if (error.message.includes('permission denied')) {
          errorMessage = 'Keine Berechtigung zum Hochladen';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="relative">
      {!preview ? (
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept={[...STORAGE_CONFIG.ALLOWED_IMAGE_TYPES, ...STORAGE_CONFIG.ALLOWED_VIDEO_TYPES].join(',')}
            onChange={handleFileSelect}
            disabled={uploading || !isOnline}
            className="hidden"
          />
          <button
            onClick={handleButtonClick}
            disabled={uploading || !isOnline}
            className={`w-16 h-16 rounded-full border-2 border-dashed ${
              isOnline ? 'border-gray-300 hover:border-pink-500' : 'border-red-300'
            } flex items-center justify-center transition-colors relative ${
              (uploading || !isOnline) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            {isOnline ? (
              <Camera className="w-6 h-6 text-gray-500" />
            ) : (
              <WifiOff className="w-6 h-6 text-red-500" />
            )}
          </button>
          {!isOnline && (
            <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              <span className="text-xs text-red-500">Offline</span>
            </div>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="w-16 h-16 rounded-full overflow-hidden">
            {selectedFile?.type.startsWith('video/') ? (
              <video
                src={preview}
                className="w-full h-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={preview}
                alt="Vorschau"
                className="w-full h-full object-cover"
              />
            )}
          </div>
          
          {uploading && uploadProgress > 0 && (
            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
              <div className="text-white text-xs font-bold">
                {Math.round(uploadProgress)}%
              </div>
            </div>
          )}

          <button
            onClick={clearSelection}
            className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white hover:bg-red-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleUpload}
            disabled={uploading || !isOnline}
            className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-pink-500 text-white px-3 py-1 rounded-full text-sm hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {isOnline ? (
                  'Posten'
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    <span>Offline</span>
                  </>
                )}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}