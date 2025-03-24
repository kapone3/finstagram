import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Instagram, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface AuthFormProps {
  onAuthSuccess: () => void;
}

export function AuthForm({ onAuthSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        
        if (error) throw error;
        toast.success('Erfolgreich angemeldet!');
        onAuthSuccess();
      } else {
        // First check if username is already taken
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', formData.username)
          .single();

        if (existingUser) {
          throw new Error('Dieser Benutzername ist bereits vergeben');
        }

        // Create auth user
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              username: formData.username,
            },
          },
        });

        if (signUpError) throw signUpError;
        if (!data.user) throw new Error('Benutzer konnte nicht erstellt werden');

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            username: formData.username,
          })
          .select()
          .single();

        if (profileError) {
          // If profile creation fails, clean up the auth user
          await supabase.auth.admin.deleteUser(data.user.id);
          throw profileError;
        }

        // Sign in immediately after successful registration
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (signInError) throw signInError;

        toast.success('Registrierung erfolgreich!');
        onAuthSuccess();
      }
    } catch (error) {
      console.error('Auth error:', error);
      
      let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten';
      
      if (error instanceof Error) {
        if (error.message.includes('already registered')) {
          errorMessage = 'Diese E-Mail-Adresse wird bereits verwendet';
        } else if (error.message.includes('weak password')) {
          errorMessage = 'Das Passwort muss mindestens 6 Zeichen lang sein';
        } else if (error.message.includes('invalid email')) {
          errorMessage = 'Ungültige E-Mail-Adresse';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
      <div className="flex flex-col items-center mb-8">
        <Instagram className="w-16 h-16 text-black mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900">
          {isLogin ? 'Anmelden' : 'Neuen Account erstellen'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Benutzername
            </label>
            <input
              id="username"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              required={!isLogin}
              minLength={3}
              maxLength={30}
              pattern="^[a-zA-Z0-9_]+$"
              title="Nur Buchstaben, Zahlen und Unterstriche sind erlaubt"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            required
            minLength={6}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            isLogin ? 'Anmelden' : 'Registrieren'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          {isLogin ? "Noch keinen Account? Registrieren" : 'Bereits registriert? Anmelden'}
        </button>
      </div>
    </div>
  );
}