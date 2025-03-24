import React, { useState, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Camera, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { STORAGE_CONFIG, generateStoragePath } from '../lib/storage';

interface ProfileSettingsProps {
  user: User;
  onClose: () => void;
  onUpdate: () => void;
}

export function ProfileSettings({ user, onClose, onUpdate }: ProfileSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState(user.user_metadata.username || '');
  const [fullName, setFullName] = useState(user.user_metadata.full_name || '');
  const [bio, setBio] = useState(user.user_metadata.bio || '');
  const [link, setLink] = useState(user.user_metadata.link || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (!STORAGE_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
        throw new Error('Bitte wähle ein Bild im JPEG oder PNG Format');
      }

      if (file.size > STORAGE_CONFIG.MAX_FILE_SIZE) {
        throw new Error('Das Bild darf nicht größer als 10MB sein');
      }

      const previewUrl = URL.createObjectURL(file);
      setAvatarFile(file);
      setAvatarPreview(previewUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Fehler beim Auswählen des Bildes');
      event.target.value = '';
    }
  };

  const validateLink = (url: string): boolean => {
    if (!url) return true; // Empty link is valid
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (link && !validateLink(link)) {
        throw new Error('Bitte gib eine gültige URL ein (z.B. https://example.com)');
      }

      let avatarUrl = user.user_metadata.avatar_url;

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()?.toLowerCase() || '';
        const { bucket, path } = generateStoragePath(user, 'avatars', fileExt);

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from(bucket)
          .upload(path, avatarFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw uploadError;
        }

        if (!uploadData?.path) {
          throw new Error('Fehler beim Hochladen: Keine Datei-URL erhalten');
        }

        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(uploadData.path);

        avatarUrl = publicUrl;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          username,
          full_name: fullName,
          bio,
          link,
          avatar_url: avatarUrl,
        },
      });

      if (updateError) throw updateError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          username,
          full_name: fullName,
          bio,
          link,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast.success('Profil erfolgreich aktualisiert');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error instanceof Error ? error.message : 'Fehler beim Aktualisieren des Profils');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Profil bearbeiten</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar upload */}
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <img
                src={avatarPreview || user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${username || 'User'}`}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-2 text-white hover:bg-blue-600"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={STORAGE_CONFIG.ALLOWED_IMAGE_TYPES.join(',')}
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
            <p className="text-sm text-gray-500">
              Klicke auf das Kamerasymbol, um dein Profilbild zu ändern
            </p>
          </div>

          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Benutzername
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
              Vollständiger Name
            </label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {/* Link */}
          <div>
            <label htmlFor="link" className="block text-sm font-medium text-gray-700">
              Link
            </label>
            <input
              type="url"
              id="link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Wird gespeichert...</span>
                </>
              ) : (
                <span>Speichern</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}