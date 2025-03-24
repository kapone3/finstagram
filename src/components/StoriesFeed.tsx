import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Story {
  id: string;
  user_id: string;
  image_url: string;
  expires_at: string;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

interface StoryGroup {
  user_id: string;
  username: string;
  avatar_url: string | null;
  stories: Story[];
  latest_story_created_at: string;
}

interface StoriesFeedProps {
  currentUser: User | null;
  profileId?: string;
  children?: React.ReactNode;
  onProfileClick?: (userId: string) => void;
  followedOnly?: boolean;
}

export function StoriesFeed({ currentUser, profileId, children, onProfileClick, followedOnly = false }: StoriesFeedProps) {
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<StoryGroup | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const progressBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const storyTimeout = useRef<NodeJS.Timeout>();
  const touchStart = useRef<number>(0);

  useEffect(() => {
    fetchStories();
    
    const storiesSubscription = supabase
      .channel('stories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, fetchStories)
      .subscribe();

    return () => {
      storiesSubscription.unsubscribe();
      if (storyTimeout.current) clearTimeout(storyTimeout.current);
    };
  }, [profileId, followedOnly, currentUser]);

  const fetchStories = async () => {
    try {
      let followedUserIds: string[] | null = null;

      if (followedOnly && currentUser) {
        const { data: followedUsers, error: followedError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', currentUser.id);

        if (followedError) throw followedError;

        if (!followedUsers || followedUsers.length === 0) {
          setStoryGroups([]);
          setLoading(false);
          return;
        }

        followedUserIds = followedUsers.map(follow => follow.following_id);
      }

      let query = supabase
        .from('stories')
        .select(`
          *,
          profiles!stories_user_id_fkey (
            username,
            avatar_url
          )
        `)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (profileId) {
        query = query.eq('user_id', profileId);
      } else if (followedUserIds) {
        query = query.in('user_id', followedUserIds);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group stories by user and track latest story date
      const groups = (data || []).reduce<Record<string, StoryGroup>>((acc, story) => {
        if (!acc[story.user_id]) {
          const isCurrentUser = currentUser && story.user_id === currentUser.id;
          acc[story.user_id] = {
            user_id: story.user_id,
            username: story.profiles.username,
            avatar_url: isCurrentUser ? currentUser.user_metadata.avatar_url : story.profiles.avatar_url,
            stories: [],
            latest_story_created_at: story.created_at
          };
        }
        
        // Update latest story date if this story is more recent
        if (story.created_at > acc[story.user_id].latest_story_created_at) {
          acc[story.user_id].latest_story_created_at = story.created_at;
        }
        
        acc[story.user_id].stories.push(story);
        return acc;
      }, {});

      // Convert to array and sort by latest story date
      const sortedGroups = Object.values(groups).sort((a, b) => 
        new Date(b.latest_story_created_at).getTime() - new Date(a.latest_story_created_at).getTime()
      );

      setStoryGroups(sortedGroups);
    } catch (error) {
      console.error('Error fetching stories:', error);
      toast.error('Fehler beim Laden der Stories');
    } finally {
      setLoading(false);
    }
  };

  const handleStoryGroupClick = (group: StoryGroup) => {
    setSelectedGroup(group);
    setCurrentStoryIndex(0);
    startStoryProgress();
  };

  const startStoryProgress = () => {
    progressBarRefs.current.forEach((ref, index) => {
      if (ref) {
        ref.style.animation = 'none';
        ref.offsetHeight;
        
        if (index < currentStoryIndex) {
          ref.style.width = '100%';
        } else if (index === currentStoryIndex) {
          ref.style.animation = 'progress 15s linear';
        } else {
          ref.style.width = '0';
        }
      }
    });

    if (storyTimeout.current) {
      clearTimeout(storyTimeout.current);
    }

    storyTimeout.current = setTimeout(() => {
      handleNextStory();
    }, 15000);
  };

  const handlePrevStory = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (currentStoryIndex > 0) {
      setIsTransitioning(true);
      setCurrentStoryIndex(prev => prev - 1);
      startStoryProgress();
    }
  };

  const handleNextStory = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedGroup && currentStoryIndex < selectedGroup.stories.length - 1) {
      setIsTransitioning(true);
      setCurrentStoryIndex(prev => prev + 1);
      startStoryProgress();
    } else {
      setSelectedGroup(null);
      setCurrentStoryIndex(0);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart.current - touchEnd;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handleNextStory();
      } else {
        handlePrevStory();
      }
    }
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (selectedGroup) {
        if (e.key === 'ArrowLeft') {
          handlePrevStory();
        } else if (e.key === 'ArrowRight' || e.key === ' ') {
          handleNextStory();
        } else if (e.key === 'Escape') {
          setSelectedGroup(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedGroup, currentStoryIndex]);

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (storyGroups.length === 0) {
    if (profileId && children) {
      return <div className="relative">{children}</div>;
    }
    return (
      <div className="p-4 text-center text-gray-500">
        {followedOnly ? 'Keine Stories von gefolgten Nutzern' : 'Keine Stories verfügbar'}
      </div>
    );
  }

  if (profileId && children) {
    const group = storyGroups[0];
    return (
      <div className="relative">
        <div className="w-full h-full rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 to-pink-500">
          <div className="w-full h-full rounded-full bg-white p-[2px]">
            {children}
          </div>
        </div>
        <button
          onClick={() => handleStoryGroupClick(group)}
          className="absolute inset-0 rounded-full cursor-pointer"
        />
        {selectedGroup && (
          <div 
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
            onClick={() => setSelectedGroup(null)}
          >
            <div 
              className="relative w-full h-full md:w-[420px] md:h-[calc(420px*16/9)] mx-auto"
              onClick={e => e.stopPropagation()}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <button
                onClick={() => setSelectedGroup(null)}
                className="absolute top-4 right-4 text-white z-10 hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Progress bars */}
              <div className="absolute top-0 left-0 right-0 flex space-x-1 p-2">
                {selectedGroup.stories.map((story, index) => (
                  <div
                    key={story.id}
                    className="h-0.5 bg-gray-700 flex-1"
                  >
                    <div
                      ref={el => progressBarRefs.current[index] = el}
                      className="h-full bg-white"
                      style={{
                        width: index < currentStoryIndex ? '100%' : '0',
                        animation: index === currentStoryIndex && !isTransitioning ? 'progress 15s linear' : 'none'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Navigation buttons */}
              {currentStoryIndex > 0 && (
                <button
                  onClick={handlePrevStory}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
              )}
              {selectedGroup && currentStoryIndex < selectedGroup.stories.length - 1 && (
                <button
                  onClick={handleNextStory}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              )}

              {/* Story content */}
              <div className="relative h-full">
                {selectedGroup.stories[currentStoryIndex].image_url.toLowerCase().endsWith('.mp4') ? (
                  <video
                    src={selectedGroup.stories[currentStoryIndex].image_url}
                    className="w-full h-full object-cover"
                    controls
                    autoPlay
                    playsInline
                    onEnded={handleNextStory}
                  />
                ) : (
                  <img
                    src={selectedGroup.stories[currentStoryIndex].image_url}
                    alt="Story"
                    className="w-full h-full object-cover"
                    onLoad={() => {
                      setIsTransitioning(false);
                      startStoryProgress();
                    }}
                  />
                )}
                
                {/* User info */}
                <div className="absolute top-4 left-4 flex items-center space-x-3 text-white">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onProfileClick) {
                        onProfileClick(selectedGroup.user_id);
                        setSelectedGroup(null);
                      }
                    }}
                    className="flex items-center space-x-3 hover:opacity-75"
                  >
                    <img
                      src={selectedGroup.avatar_url || `https://ui-avatars.com/api/?name=${selectedGroup.username}`}
                      alt={selectedGroup.username}
                      className="w-8 h-8 rounded-full border border-white"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold">{selectedGroup.username}</span>
                      <span className="text-xs opacity-75">
                        {formatDistanceToNow(new Date(selectedGroup.stories[currentStoryIndex].created_at), { addSuffix: true, locale: de })}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex space-x-4 overflow-x-auto p-4 scrollbar-hide">
        {storyGroups.map((group) => (
          <button
            key={group.user_id}
            onClick={() => handleStoryGroupClick(group)}
            className="flex flex-col items-center space-y-2"
          >
            <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 to-pink-500">
              <div className="w-full h-full rounded-full bg-white p-[2px]">
                <img
                  src={group.avatar_url || `https://ui-avatars.com/api/?name=${group.username}`}
                  alt={group.username}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
            </div>
            <span className="text-xs text-gray-600 truncate w-16">
              {group.username}
            </span>
          </button>
        ))}
      </div>

      {/* Story viewer modal */}
      {selectedGroup && (
        <div 
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setSelectedGroup(null)}
        >
          <div 
            className="relative w-full h-full md:w-[420px] md:h-[calc(420px*16/9)] mx-auto"
            onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <button
              onClick={() => setSelectedGroup(null)}
              className="absolute top-4 right-4 text-white z-10 hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Progress bars */}
            <div className="absolute top-0 left-0 right-0 flex space-x-1 p-2">
              {selectedGroup.stories.map((story, index) => (
                <div
                  key={story.id}
                  className="h-0.5 bg-gray-700 flex-1"
                >
                  <div
                    ref={el => progressBarRefs.current[index] = el}
                    className="h-full bg-white"
                    style={{
                      width: index < currentStoryIndex ? '100%' : '0',
                      animation: index === currentStoryIndex && !isTransitioning ? 'progress 15s linear' : 'none'
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Story content */}
            <div className="relative h-full">
              {selectedGroup.stories[currentStoryIndex].image_url.toLowerCase().endsWith('.mp4') ? (
                <video
                  src={selectedGroup.stories[currentStoryIndex].image_url}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  playsInline
                  onEnded={handleNextStory}
                />
              ) : (
                <img
                  src={selectedGroup.stories[currentStoryIndex].image_url}
                  alt="Story"
                  className="w-full h-full object-cover"
                  onLoad={() => {
                    setIsTransitioning(false);
                    startStoryProgress();
                  }}
                />
              )}
              
              {/* User info */}
              <div className="absolute top-4 left-4 flex items-center space-x-3 text-white">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onProfileClick) {
                      onProfileClick(selectedGroup.user_id);
                      setSelectedGroup(null);
                    }
                  }}
                  className="flex items-center space-x-3 hover:opacity-75"
                >
                  <img
                    src={selectedGroup.avatar_url || `https://ui-avatars.com/api/?name=${selectedGroup.username}`}
                    alt={selectedGroup.username}
                    className="w-8 h-8 rounded-full border border-white"
                  />
                  <div className="flex flex-col">
                    <span className="font-semibold">{selectedGroup.username}</span>
                    <span className="text-xs opacity-75">
                      {formatDistanceToNow(new Date(selectedGroup.stories[currentStoryIndex].created_at), { addSuffix: true, locale: de })}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progress {
          from { width: 0; }
          to { width: 100%; }
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}