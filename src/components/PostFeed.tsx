import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { Heart, MessageCircle, Share2, MoreHorizontal, Loader2, X, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import toast from 'react-hot-toast';

interface Profile {
  username: string;
  avatar_url: string | null;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: Profile;
}

interface Post {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  user_id: string;
  profiles: Profile;
  likes: number;
  user_has_liked: boolean;
  comments: Comment[];
}

interface PostFeedProps {
  currentUser: User | null;
  explore?: boolean;
  userPosts?: boolean;
  profileId?: string;
  onProfileClick?: (userId: string) => void;
  gridView?: boolean;
  followedOnly?: boolean;
}

export function PostFeed({ 
  currentUser, 
  explore = false, 
  userPosts = false, 
  profileId,
  onProfileClick,
  gridView = false,
  followedOnly = false
}: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchPosts = async () => {
    try {
      setError(null);
      setLoading(true);

      let query = supabase
        .from('posts')
        .select(`
          *,
          profiles!posts_user_id_fkey (
            username,
            avatar_url
          ),
          likes (
            user_id
          ),
          comments (
            id,
            content,
            created_at,
            user_id,
            profiles!comments_user_id_fkey (
              username,
              avatar_url
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (userPosts && profileId) {
        query = query.eq('user_id', profileId);
      } else if (followedOnly && currentUser) {
        const { data: followedUsers } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', currentUser.id);

        if (followedUsers && followedUsers.length > 0) {
          const followedIds = followedUsers.map(f => f.following_id);
          query = query.in('user_id', followedIds);
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (!data) {
        setPosts([]);
        return;
      }

      const formattedPosts = data.map(post => ({
        ...post,
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        user_has_liked: currentUser 
          ? Array.isArray(post.likes) && post.likes.some(like => like.user_id === currentUser.id)
          : false,
        comments: Array.isArray(post.comments) ? post.comments : []
      }));

      setPosts(formattedPosts);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError('Fehler beim Laden der Posts');
      toast.error('Fehler beim Laden der Posts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();

    const postsSubscription = supabase
      .channel('posts_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts'
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      postsSubscription.unsubscribe();
    };
  }, [currentUser, explore, userPosts, profileId, followedOnly]);

  const handleLike = async (postId: string, currentlyLiked: boolean) => {
    if (!currentUser) {
      toast.error('Bitte melde dich an, um Posts zu liken');
      return;
    }

    try {
      if (currentlyLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .match({ 
            post_id: postId, 
            user_id: currentUser.id 
          });

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ 
            post_id: postId, 
            user_id: currentUser.id 
          });

        if (error) throw error;
      }

      setPosts(posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            likes: currentlyLiked ? post.likes - 1 : post.likes + 1,
            user_has_liked: !currentlyLiked
          };
        }
        return post;
      }));

      if (selectedPost?.id === postId) {
        setSelectedPost(prev => prev ? {
          ...prev,
          likes: currentlyLiked ? prev.likes - 1 : prev.likes + 1,
          user_has_liked: !currentlyLiked
        } : null);
      }
    } catch (error) {
      console.error('Error handling like:', error);
      toast.error('Fehler beim Liken des Posts');
    }
  };

  const handleComment = async (postId: string) => {
    if (!currentUser) {
      toast.error('Bitte melde dich an, um zu kommentieren');
      return;
    }

    if (!newComment.trim()) {
      return;
    }

    try {
      setSubmittingComment(true);

      const { data: comment, error: commentError } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: currentUser.id,
          content: newComment.trim()
        })
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles!comments_user_id_fkey (
            username,
            avatar_url
          )
        `)
        .single();

      if (commentError) throw commentError;

      setPosts(posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            comments: [...post.comments, comment]
          };
        }
        return post;
      }));

      if (selectedPost?.id === postId) {
        setSelectedPost(prev => prev ? {
          ...prev,
          comments: [...prev.comments, comment]
        } : null);
      }

      setNewComment('');
      toast.success('Kommentar wurde hinzugefügt');
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Fehler beim Hinzufügen des Kommentars');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string, postId: string) => {
    if (!currentUser) return;

    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .match({ id: commentId });

      if (error) throw error;

      setPosts(posts.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            comments: post.comments.filter(comment => comment.id !== commentId)
          };
        }
        return post;
      }));

      if (selectedPost?.id === postId) {
        setSelectedPost(prev => prev ? {
          ...prev,
          comments: prev.comments.filter(comment => comment.id !== commentId)
        } : null);
      }

      toast.success('Kommentar wurde gelöscht');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Fehler beim Löschen des Kommentars');
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (confirm('Möchtest du diesen Post wirklich löschen?')) {
      try {
        const { error } = await supabase
          .from('posts')
          .delete()
          .match({ id: postId });
        
        if (error) throw error;
        
        toast.success('Post wurde gelöscht');
        setSelectedPost(null);
        fetchPosts();
      } catch (error) {
        console.error('Error deleting post:', error);
        toast.error('Fehler beim Löschen des Posts');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        {error}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {userPosts ? 'Noch keine Posts vorhanden' : 'Keine Posts gefunden'}
      </div>
    );
  }

  if (gridView) {
    return (
      <>
        <div className="grid grid-cols-3 gap-1">
          {posts.map(post => (
            <div 
              key={post.id} 
              className="relative aspect-square cursor-pointer"
              onClick={() => setSelectedPost(post)}
            >
              <img
                src={post.image_url}
                alt={post.caption || 'Post'}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-opacity flex items-center justify-center opacity-0 hover:opacity-100">
                <div className="flex items-center space-x-8 text-white">
                  <div className="flex items-center">
                    <Heart className="w-6 h-6 mr-2" fill="white" />
                    <span className="font-semibold">{post.likes}</span>
                  </div>
                  <div className="flex items-center">
                    <MessageCircle className="w-6 h-6 mr-2" fill="white" />
                    <span className="font-semibold">{post.comments.length}</span>
                  </div>
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
              className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Left side - Image */}
              <div className="w-[60%] bg-black flex items-center">
                <img
                  src={selectedPost.image_url}
                  alt={selectedPost.caption || 'Post'}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Right side - Post details */}
              <div className="w-[40%] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b flex items-center justify-between">
                  <button
                    onClick={() => onProfileClick?.(selectedPost.user_id)}
                    className="flex items-center space-x-3 hover:opacity-75"
                  >
                    <img
                      src={selectedPost.profiles.avatar_url || `https://ui-avatars.com/api/?name=${selectedPost.profiles.username}`}
                      alt={selectedPost.profiles.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <span className="font-semibold">{selectedPost.profiles.username}</span>
                  </button>
                  <div className="flex items-center space-x-2">
                    {currentUser?.id === selectedPost.user_id && (
                      <button 
                        onClick={() => handleDeletePost(selectedPost.id)}
                        className="text-gray-500 hover:text-red-500"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedPost(null)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* Comments section */}
                <div className="flex-1 overflow-y-auto p-4">
                  {selectedPost.caption && (
                    <div className="flex items-start space-x-3 mb-4">
                      <img
                        src={selectedPost.profiles.avatar_url || `https://ui-avatars.com/api/?name=${selectedPost.profiles.username}`}
                        alt={selectedPost.profiles.username}
                        className="w-8 h-8 rounded-full"
                      />
                      <div>
                        <span className="font-semibold mr-2">{selectedPost.profiles.username}</span>
                        <span>{selectedPost.caption}</span>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDistanceToNow(new Date(selectedPost.created_at), { addSuffix: true, locale: de })}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedPost.comments.map(comment => (
                    <div key={comment.id} className="flex items-start space-x-3 mb-4">
                      <img
                        src={comment.profiles.avatar_url || `https://ui-avatars.com/api/?name=${comment.profiles.username}`}
                        alt={comment.profiles.username}
                        className="w-8 h-8 rounded-full"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-semibold mr-2">{comment.profiles.username}</span>
                            <span>{comment.content}</span>
                          </div>
                          {currentUser?.id === comment.user_id && (
                            <button
                              onClick={() => handleDeleteComment(comment.id, selectedPost.id)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: de })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions and comment input */}
                <div className="p-4 border-t">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => handleLike(selectedPost.id, selectedPost.user_has_liked)}
                      className={`${selectedPost.user_has_liked ? 'text-red-500' : 'text-gray-500'} hover:text-red-500`}
                    >
                      <Heart className={`w-6 h-6 ${selectedPost.user_has_liked ? 'fill-current' : ''}`} />
                    </button>
                    <button className="text-gray-500 hover:text-gray-700">
                      <MessageCircle className="w-6 h-6" />
                    </button>
                    <button className="text-gray-500 hover:text-gray-700">
                      <Share2 className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="mt-2 font-semibold">
                    {selectedPost.likes} {selectedPost.likes === 1 ? 'Like' : 'Likes'}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(selectedPost.created_at), { addSuffix: true, locale: de })}
                  </p>

                  {/* Comment input */}
                  <div className="mt-4 flex items-center space-x-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Kommentieren..."
                      className="flex-1 border-none focus:ring-0 text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !submittingComment) {
                          handleComment(selectedPost.id);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleComment(selectedPost.id)}
                      disabled={!newComment.trim() || submittingComment}
                      className="text-blue-500 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingComment ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {posts.map(post => (
        <article key={post.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Post Header */}
          <div className="p-4 flex items-center justify-between">
            <button
              onClick={() => onProfileClick?.(post.user_id)}
              className="flex items-center space-x-3 hover:opacity-75 transition-opacity"
            >
              <img
                src={post.profiles.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles.username}`}
                alt={post.profiles.username}
                className="w-8 h-8 rounded-full"
              />
              <span className="font-semibold">{post.profiles.username}</span>
            </button>
            {currentUser?.id === post.user_id && (
              <button 
                onClick={() => handleDeletePost(post.id)}
                className="text-gray-500 hover:text-red-500"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Post Image */}
          <img
            src={post.image_url}
            alt="Post"
            className="w-full"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.src = 'https://via.placeholder.com/800x600?text=Bild+nicht+verfügbar';
            }}
          />

          {/* Post Actions */}
          <div className="p-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleLike(post.id, post.user_has_liked)}
                className={`${post.user_has_liked ? 'text-red-500' : 'text-gray-500'} hover:text-red-500`}
              >
                <Heart className={`w-6 h-6 ${post.user_has_liked ? 'fill-current' : ''}`} />
              </button>
              <button 
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setSelectedPost(post)}
              >
                <MessageCircle className="w-6 h-6" />
              </button>
              <button className="text-gray-500 hover:text-gray-700">
                <Share2 className="w-6 h-6" />
              </button>
            </div>

            {/* Likes Count */}
            <div className="mt-2 font-semibold">
              {post.likes} {post.likes === 1 ? 'Like' : 'Likes'}
            </div>

            {/* Caption */}
            {post.caption && (
              <p className="mt-2">
                <button
                  onClick={() => onProfileClick?.(post.user_id)}
                  className="font-semibold mr-2 hover:opacity-75 transition-opacity"
                >
                  {post.profiles.username}
                </button>
                {post.caption}
              </p>
            )}

            {/* Comments preview */}
            {post.comments.length > 0 && (
              <button
                onClick={() => setSelectedPost(post)}
                className="mt-2 text-gray-500 text-sm"
              >
                {post.comments.length === 1
                  ? '1 Kommentar anzeigen'
                  : `Alle ${post.comments.length} Kommentare anzeigen`}
              </button>
            )}

            {/* Comment input */}
            <div className="mt-4 flex items-center space-x-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Kommentieren..."
                className="flex-1 border-none focus:ring-0 text-sm"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !submittingComment) {
                    handleComment(post.id);
                  }
                }}
              />
              <button
                onClick={() => handleComment(post.id)}
                disabled={!newComment.trim() || submittingComment}
                className="text-blue-500 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingComment ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Timestamp */}
            <p className="mt-2 text-sm text-gray-500">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: de })}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}