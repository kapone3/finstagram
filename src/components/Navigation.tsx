import React from 'react';
import { Home, Search, PlusSquare, Heart, MessageCircle } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unreadNotifications?: number;
  user: User | null;
}

export function Navigation({ activeTab, setActiveTab, unreadNotifications = 0, user }: NavigationProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex justify-around py-2">
          <button
            onClick={() => setActiveTab('home')}
            className={`p-2 rounded-lg ${activeTab === 'home' ? 'text-pink-500' : 'text-gray-500'}`}
          >
            <Home className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab('explore')}
            className={`p-2 rounded-lg ${activeTab === 'explore' ? 'text-pink-500' : 'text-gray-500'}`}
          >
            <Search className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`p-2 rounded-lg ${activeTab === 'create' ? 'text-pink-500' : 'text-gray-500'}`}
          >
            <PlusSquare className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`p-2 rounded-lg relative ${activeTab === 'activity' ? 'text-pink-500' : 'text-gray-500'}`}
          >
            <Heart className="w-6 h-6" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`p-2 rounded-lg relative ${activeTab === 'messages' ? 'text-pink-500' : 'text-gray-500'}`}
          >
            <MessageCircle className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`relative ${activeTab === 'profile' ? 'ring-2 ring-pink-500 ring-offset-2' : ''} rounded-full overflow-hidden w-6 h-6`}
          >
            <img
              src={user?.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${user?.user_metadata?.username || 'User'}`}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </div>
    </nav>
  );
}