import React, { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Heart, MessageCircle, UserPlus, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Post {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  user: {
    username: string;
    avatar_url: string | null;
  };
}

interface Notification {
  id: string;
  user_id: string;
  source_user_id: string;
  notification_type: 'like' | 'comment' | 'follow';
  reference_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  source_user: {
    username: string;
    avatar_url: string | null;
  };
}

interface NotificationsPageProps {
  currentUser: User;
  onProfileClick?: (userId: string) => void;
}

export function NotificationsPage({ currentUser, onProfileClick }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);

  useEffect(() => {
    fetchNotifications();

    // Subscribe to notifications table changes
    const notificationsSubscription = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      notificationsSubscription.unsubscribe();
    };
  }, [currentUser.id]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          source_user:profiles!notifications_source_user_id_fkey(
            username,
            avatar_url
          )
        `)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setNotifications(data || []);

      // Mark all notifications as read
      const unreadNotifications = data?.filter(n => !n.is_read) || [];
      if (unreadNotifications.length > 0) {
        const { error: updateError } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', currentUser.id)
          .eq('is_read', false);

        if (updateError) throw updateError;
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast.error('Fehler beim Laden der Benachrichtigungen');
    } finally {
      setLoading(false);
    }
  };

  const handlePostClick = async (postId: string) => {
    try {
      setLoadingPost(true);
      const { data: post, error } = await supabase
        .from('posts')
        .select(`
          *,
          user:profiles!posts_user_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('id', postId)
        .single();

      if (error) throw error;

      setSelectedPost(post);
    } catch (error) {
      console.error('Error fetching post:', error);
      toast.error('Beitrag konnte nicht geladen werden');
    } finally {
      setLoadingPost(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="w-6 h-6 text-red-500" fill="currentColor" />;
      case 'comment':
        return <MessageCircle className="w-6 h-6 text-blue-500" />;
      case 'follow':
        return <UserPlus className="w-6 h-6 text-green-500" />;
      default:
        return null;
    }
  };

  const renderNotificationMessage = (notification: Notification) => {
    const { message, notification_type, reference_id } = notification;
    
    if ((notification_type === 'like' || notification_type === 'comment') && reference_id) {
      const parts = message.split('Beitrag');
      return (
        <>
          {parts[0]}
          <button
            onClick={() => handlePostClick(reference_id)}
            className="text-blue-500 hover:underline focus:outline-none font-medium"
          >
            Beitrag
          </button>
          {parts[1]}
        </>
      );
    }
    
    return message;
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-gray-500">
        <p className="text-lg">Keine Benachrichtigungen vorhanden</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="space-y-4">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`bg-white p-4 rounded-lg border ${
              !notification.is_read ? 'border-pink-200 bg-pink-50' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center space-x-4">
              <button
                onClick={() => onProfileClick?.(notification.source_user_id)}
                className="flex-shrink-0"
              >
                <img
                  src={notification.source_user.avatar_url || `https://ui-avatars.com/api/?name=${notification.source_user.username}`}
                  alt={notification.source_user.username}
                  className="w-10 h-10 rounded-full"
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onProfileClick?.(notification.source_user_id)}
                    className="font-semibold hover:underline"
                  >
                    {notification.source_user.username}
                  </button>
                  <span className="text-gray-600">
                    {renderNotificationMessage(notification)}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  {formatDistanceToNow(new Date(notification.created_at), {
                    addSuffix: true,
                    locale: de,
                  })}
                </p>
              </div>
              <div className="flex-shrink-0">
                {getNotificationIcon(notification.notification_type)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Post Modal */}
      {selectedPost && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div 
            className="bg-white rounded-lg max-w-2xl w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {loadingPost ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
              </div>
            ) : (
              <>
                <div className="p-4 border-b flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <img
                      src={selectedPost.user.avatar_url || `https://ui-avatars.com/api/?name=${selectedPost.user.username}`}
                      alt={selectedPost.user.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <span className="font-semibold">{selectedPost.user.username}</span>
                  </div>
                  <button
                    onClick={() => setSelectedPost(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <img
                  src={selectedPost.image_url}
                  alt="Post"
                  className="w-full h-auto"
                />
                {selectedPost.caption && (
                  <div className="p-4 border-t">
                    <p>
                      <span className="font-semibold mr-2">{selectedPost.user.username}</span>
                      {selectedPost.caption}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(selectedPost.created_at), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}