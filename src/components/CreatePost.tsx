import React, { useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { STORAGE_CONFIG, generateStoragePath } from '../lib/storage';
import toast from 'react-hot-toast';
import { User } from '@supabase/supabase-js';

interface CreatePostProps {
  user: User;
}

export function CreatePost({ user }: CreatePostProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');

  const validateFile = (file: File) => {
    if (!STORAGE_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error('Nur JPEG, PNG und GIF Dateien sind erlaubt');
    }

    if (file.size > STORAGE_CONFIG.MAX_FILE_SIZE) {
      throw new Error('Die Datei darf nicht größer als 10MB sein');
    }

    if (file.size === 0) {
      throw new Error('Die Datei ist leer');
    }

    return true;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      validateFile(file);
      const previewUrl = URL.createObjectURL(file);
      
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => reject(new Error('Das Bild konnte nicht geladen werden'));
        img.src = previewUrl;
      });

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
    setCaption('');
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Bitte wähle ein Bild aus');
      return;
    }

    try {
      setUploading(true);

      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
      const { bucket, path } = generateStoragePath(user, 'posts', fileExt);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from(bucket)
        .upload(path, selectedFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: selectedFile.type,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        if (uploadError.message.includes('duplicate')) {
          throw new Error('Diese Datei wurde bereits hochgeladen');
        }
        throw uploadError;
      }

      if (!uploadData?.path) {
        throw new Error('Fehler beim Hochladen: Keine Datei-URL erhalten');
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(uploadData.path);

      const { error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          image_url: publicUrl,
          caption: caption.trim() || null,
        });

      if (postError) {
        console.error('Database error:', postError);
        await supabase.storage
          .from(bucket)
          .remove([uploadData.path]);
          
        throw postError;
      }

      toast.success('Post erfolgreich erstellt!');
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
    }
  };

  return (
    <div className="space-y-4">
      {!preview ? (
        <div className="relative">
          <input
            type="file"
            accept={STORAGE_CONFIG.ALLOWED_IMAGE_TYPES.join(',')}
            onChange={handleFileSelect}
            disabled={uploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          <div className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-pink-500 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Camera className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">Klicke hier, um ein Bild hochzuladen</p>
            <p className="text-sm text-gray-500 mt-2">JPEG, PNG oder GIF • Max. 10MB</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <img
              src={preview}
              alt="Vorschau"
              className="w-full rounded-lg"
            />
            
            <button
              onClick={clearSelection}
              className="absolute top-2 right-2 bg-red-500 rounded-full p-1 text-white hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Schreibe eine Bildunterschrift..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            rows={3}
            maxLength={2200}
            disabled={uploading}
          />

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-pink-500 text-white py-2 px-4 rounded-lg hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Wird hochgeladen...
              </>
            ) : (
              'Post erstellen'
            )}
          </button>
        </div>
      )}
    </div>
  );
}