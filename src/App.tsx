import React, { useEffect, useState, useCallback } from 'react';
import { AuthForm } from './components/AuthForm';
import { StoriesFeed } from './components/StoriesFeed';
import { StoryUpload } from './components/StoryUpload';
import { PostFeed } from './components/PostFeed';
import { CreatePost } from './components/CreatePost';
import { Navigation } from './components/Navigation';
import { ProfileSettings } from './components/ProfileSettings';
import { NotificationsPage } from './components/NotificationsPage';
import { MessagesPage } from './components/MessagesPage';
import { supabase } from './lib/supabase';
import { LogOut, ArrowLeft, Settings, Grid, Bookmark, TagIcon, UserPlus, UserMinus, Loader2, MessageCircle, Search } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { usePullToRefresh } from './hooks/usePullToRefresh';

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  link: string | null;
}

interface FollowCounts {
  followers: number;
  following: number;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [profilePostsTab, setProfilePostsTab] = useState<'posts' | 'saved' | 'tagged'>('posts');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [followCounts, setFollowCounts] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [selectedMessageUser, setSelectedMessageUser] = useState<Profile | null>(null);
  const [canMessage, setCanMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [postCount, setPostCount] = useState(0);

  const handleRefresh = useCallback(async () => {
    if (!selectedProfile) return;

    try {
      // Refresh profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', selectedProfile.id)
        .single();

      if (profileError) throw profileError;
      setSelectedProfile(profile);

      // Refresh follow counts
      await fetchFollowCounts();
      await checkIfFollowing();

      toast.success('Profil aktualisiert');
    } catch (error) {
      console.error('Error refreshing profile:', error);
      toast.error('Fehler beim Aktualisieren');
    }
  }, [selectedProfile]);

  const { containerRef, refreshing } = usePullToRefresh({
    onRefresh: handleRefresh,
    pullDistance: 100,
    resistance: 3,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      // Subscribe to notifications
      const notificationsSubscription = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchUnreadNotificationsCount();
          }
        )
        .subscribe();

      // Initial fetch
      fetchUnreadNotificationsCount();

      return () => {
        notificationsSubscription.unsubscribe();
      };
    }
  }, [user]);

  useEffect(() => {
    if (selectedProfile) {
      fetchFollowCounts();
      checkIfFollowing();
      checkCanMessage();

      // Subscribe to follows table changes for real-time updates
      const followsSubscription = supabase
        .channel('follows_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'follows',
            filter: `OR(following_id=eq.${selectedProfile.id},follower_id=eq.${selectedProfile.id})`
          },
          () => {
            fetchFollowCounts();
            checkIfFollowing();
            checkCanMessage();
          }
        )
        .subscribe();

      return () => {
        followsSubscription.unsubscribe();
      };
    }
  }, [selectedProfile, user]);

  const checkCanMessage = async () => {
    if (!user || !selectedProfile || selectedProfile.id === user.id) {
      setCanMessage(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .rpc('can_message_user', {
          receiver_id: selectedProfile.id
        });

      if (error) throw error;
      setCanMessage(data);
    } catch (error) {
      console.error('Error checking message permission:', error);
      setCanMessage(false);
    }
  };

  const fetchUnreadNotificationsCount = async () => {
    if (!user) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadNotifications(count || 0);
    } catch (error) {
      console.error('Error fetching unread notifications count:', error);
    }
  };

  const fetchFollowCounts = async () => {
    if (!selectedProfile) return;

    try {
      // Get followers count
      const { count: followersCount, error: followersError } = await supabase
        .from('follows')
        .select('*', { count: 'exact' })
        .eq('following_id', selectedProfile.id);

      if (followersError) throw followersError;

      // Get following count
      const { count: followingCount, error: followingError } = await supabase
        .from('follows')
        .select('*', { count: 'exact' })
        .eq('follower_id', selectedProfile.id);

      if (followingError) throw followingError;

      setFollowCounts({
        followers: followersCount || 0,
        following: followingCount || 0
      });
    } catch (error) {
      console.error('Error fetching follow counts:', error);
    }
  };

  const checkIfFollowing = async () => {
    if (!user || !selectedProfile || selectedProfile.id === user.id) return;

    try {
      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id)
        .eq('following_id', selectedProfile.id);

      if (error) throw error;
      setIsFollowing(count === 1);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  };

  const handleFollow = async () => {
    if (!user || !selectedProfile || selectedProfile.id === user.id) return;

    try {
      setFollowLoading(true);

      if (isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', selectedProfile.id);

        if (error) throw error;

        setFollowCounts(prev => ({
          ...prev,
          followers: prev.followers - 1
        }));
        setIsFollowing(false);
        toast.success(`Du folgst ${selectedProfile.username} nicht mehr`);
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: user.id,
            following_id: selectedProfile.id
          });

        if (error) throw error;

        setFollowCounts(prev => ({
          ...prev,
          followers: prev.followers + 1
        }));
        setIsFollowing(true);
        toast.success(`Du folgst jetzt ${selectedProfile.username}`);
      }
    } catch (error) {
      console.error('Error handling follow:', error);
      toast.error('Ein Fehler ist aufgetreten');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleProfileClick = async (userId: string) => {
    try {
      setLoadingProfile(true);
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      setSelectedProfile(profile);
      setActiveTab('profile');
      setProfilePostsTab('posts');
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'profile' && user) {
      handleProfileClick(user.id);
    }
    if (tab === 'messages') {
      setShowMessages(true);
    }
  };

  const handleBackToHome = () => {
    setSelectedProfile(null);
    setActiveTab('home');
    setProfilePostsTab('posts');
  };

  const handleMessage = (profile: Profile) => {
    setSelectedMessageUser(profile);
    setShowMessages(true);
    setActiveTab('messages');
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching profiles:', error);
      toast.error('Fehler bei der Suche');
    } finally {
      setSearchLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user) {
        setUser(session.session.user);
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-center" />
      
      {user ? (
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-40">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center">
                {(activeTab === 'profile' && selectedProfile) || (activeTab === 'messages' && selectedMessageUser) ? (
                  <button
                    onClick={() => {
                      if (activeTab === 'messages') {
                        setSelectedMessageUser(null);
                      } else {
                        handleBackToHome();
                      }
                    }}
                    className="mr-4 text-gray-600 hover:text-gray-900"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                ) : null}
                <h1 className="text-2xl font-bold">
                  {activeTab === 'profile' && selectedProfile
                    ? selectedProfile.username
                    : activeTab === 'activity'
                    ? 'Benachrichtigungen'
                    : activeTab === 'messages'
                    ? 'Nachrichten'
                    : activeTab === 'explore'
                    ? 'Entdecken'
                    : 'Instagram Clone'}
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                {activeTab === 'profile' && (!selectedProfile || selectedProfile.id === user.id) && (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="text-gray-600 hover:text-gray-900"
                  >
                    <Settings className="w-6 h-6" />
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Abmelden
                </button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="mt-16 pb-16">
            {activeTab === 'home' && (
              <div className="px-4">
                {/* Stories Section */}
                <div className="bg-white border border-gray-200 rounded-lg mb-4">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center space-x-4">
                      <StoryUpload user={user} />
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">Story hinzufügen</h2>
                        <p className="text-sm text-gray-500">Teile einen Moment mit deinen Followern</p>
                      </div>
                    </div>
                  </div>
                  <StoriesFeed 
                    currentUser={user} 
                    onProfileClick={handleProfileClick}
                    followedOnly={false}
                  />
                </div>

                {/* Posts Feed */}
                <PostFeed 
                  currentUser={user} 
                  onProfileClick={handleProfileClick}
                  followedOnly={true}
                />
              </div>
            )}

            {activeTab === 'create' && (
              <div className="px-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h2 className="text-xl font-bold mb-4">Neuen Post erstellen</h2>
                  <CreatePost user={user} />
                </div>
              </div>
            )}

            {activeTab === 'explore' && (
              <div className="px-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Suche"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {searchQuery ? (
                    <div className="space-y-2">
                      {searchLoading ? (
                        <div className="flex justify-center p-4">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map(profile => (
                          <button
                            key={profile.id}
                            onClick={() => {
                              handleProfileClick(profile.id);
                              setSearchQuery('');
                              setSearchResults([]);
                            }}
                            className="w-full flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg"
                          >
                            <img
                              src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.username}`}
                              alt={profile.username}
                              className="w-10 h-10 rounded-full"
                            />
                            <div className="flex-1 text-left">
                              <div className="font-semibold">{profile.username}</div>
                              {profile.full_name && (
                                <div className="text-sm text-gray-500">{profile.full_name}</div>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="text-center text-gray-500 py-4">
                          Keine Ergebnisse gefunden
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <StoriesFeed 
                        currentUser={user} 
                        onProfileClick={handleProfileClick}
                        followedOnly={true}
                      />
                      <PostFeed 
                        currentUser={user} 
                        explore={true} 
                        onProfileClick={handleProfileClick} 
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <NotificationsPage currentUser={user} onProfileClick={handleProfileClick} />
            )}

            {activeTab === 'messages' && (
              <MessagesPage 
                currentUser={user} 
                selectedUser={selectedMessageUser}
                onProfileClick={handleProfileClick}
                onClose={() => {
                  setShowMessages(false);
                  setSelectedMessageUser(null);
                  setActiveTab('home');
                }}
              />
            )}

            {activeTab === 'profile' && (
              <div 
                ref={containerRef}
                className="bg-white transition-transform"
              >
                {loadingProfile ? (
                  <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : (
                  <>
                    {/* Pull to refresh indicator */}
                    {refreshing && (
                      <div className="absolute top-0 left-0 right-0 flex justify-center py-2">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                      </div>
                    )}
                    
                    <div className="max-w-4xl mx-auto px-4 py-8">
                      <div className="flex">
                        {/* Profile Picture */}
                        <div className="w-[290px] flex justify-center">
                          <div className="w-[150px] h-[150px]">
                            <StoriesFeed 
                              currentUser={user} 
                              profileId={selectedProfile?.id || user.id}
                              onProfileClick={handleProfileClick}
                            >
                              <img
                                src={
                                  selectedProfile?.id === user.id || !selectedProfile
                                    ? user.user_metadata.avatar_url || `https://ui-avatars.com/api/?name=${user.user_metadata.username || 'User'}`
                                    : selectedProfile?.avatar_url || `https://ui-avatars.com/api/?name=${selectedProfile?.username || 'User'}`
                                }
                                alt="Profile"
                                className="w-full h-full rounded-full object-cover"
                              />
                            </StoriesFeed>
                          </div>
                        </div>

                        {/* Profile Info */}
                        <div className="flex-1">
                          <div className="flex items-center mb-4">
                            <h2 className="text-xl">
                              {selectedProfile?.username || user.user_metadata.username || user.email}
                            </h2>
                            {selectedProfile && selectedProfile.id !== user.id ? (
                              <div className="ml-4 space-x-2">
                                <button
                                  onClick={handleFollow}
                                  disabled={followLoading}
                                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                                    isFollowing
                                      ? 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                      : 'bg-blue-500 text-white hover:bg-blue-600'
                                  } flex items-center space-x-1`}
                                >
                                  {followLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : isFollowing ? (
                                    <>
                                      <UserMinus className="w-4 h-4" />
                                      <span>Entfolgen</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserPlus className="w-4 h-4" />
                                      <span>Folgen</span>
                                    </>
                                  )}
                                </button>
                                {canMessage && (
                                  <button
                                    onClick={() => handleMessage(selectedProfile)}
                                    className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-200 flex items-center space-x-1"
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                    <span>Nachricht</span>
                                  </button>
                                )}
                              </div>
                            ) : (!selectedProfile || selectedProfile.id === user.id) && (
                              <div className="ml-4 space-x-2">
                                <button
                                  onClick={() => setShowSettings(true)}
                                  className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-100"
                                >
                                  Profil bearbeiten
                                </button>
                                <button
                                  onClick={() => setShowSettings(true)}
                                  className="p-2 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100"
                                >
                                  <Settings className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex space-x-10 mb-4">
                            <div>
                              <span className="font-semibold">{postCount}</span>{' '}
                              <span className="text-gray-600">Beiträge</span>
                            </div>
                            <button className="hover:opacity-75">
                              <span className="font-semibold">{followCounts.followers}</span>{' '}
                              <span className="text-gray-600">Follower</span>
                            </button>
                            <button className="hover:opacity-75">
                              <span className="font-semibold">{followCounts.following}</span>{' '}
                              <span className="text-gray-600">folgt</span>
                            </button>
                          </div>

                          <div>
                            <p className="font-semibold">
                              {selectedProfile?.id === user.id || !selectedProfile
                                ? user.user_metadata.full_name
                                : selectedProfile?.full_name}
                            </p>
                            <p className="whitespace-pre-line">
                              {selectedProfile?.id === user.id || !selectedProfile
                                ? user.user_metadata.bio || 'Keine Bio vorhanden'
                                : selectedProfile?.bio || 'Keine Bio vorhanden'}
                            </p>
                            {(selectedProfile?.link || (selectedProfile?.id === user.id && user.user_metadata.link)) && (
                              <a
                                href={selectedProfile?.id === user.id ? user.user_metadata.link : selectedProfile?.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                              >
                                {selectedProfile?.id === user.id ? user.user_metadata.link : selectedProfile?.link}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Posts Tabs */}
                    <div className="border-t border-gray-200">
                      <div className="max-w-4xl mx-auto flex justify-center">
                        <button
                          onClick={() => setProfilePostsTab('posts')}
                          className={`flex items-center px-4 py-3 space-x-2 border-t ${
                            profilePostsTab === 'posts' 
                              ? 'border-black text-black font-semibold -mt-px' 
                              : 'border-transparent text-gray-500'
                          }`}
                        >
                          <Grid className="w-4 h-4" />
                          <span className="text-xs tracking-wider uppercase">Beiträge</span>
                        </button>
                        <button
                          onClick={() => setProfilePostsTab('saved')}
                          className={`flex items-center px-4 py-3 space-x-2 border-t ${
                            profilePostsTab === 'saved' 
                              ? 'border-black text-black font-semibold -mt-px' 
                              : 'border-transparent text-gray-500'
                          }`}
                        >
                          <Bookmark className="w-4 h-4" />
                          <span className="text-xs tracking-wider uppercase">Gespeichert</span>
                        </button>
                        <button
                          onClick={() => setProfilePostsTab('tagged')}
                          className={`flex items-center px-4 py-3 space-x-2 border-t ${
                            profilePostsTab === 'tagged' 
                              ? 'border-black text-black font-semibold -mt-px' 
                              : 'border-transparent text-gray-500'
                          }`}
                        >
                          <TagIcon className="w-4 h-4" />
                          <span className="text-xs tracking-wider uppercase">Markiert</span>
                        </button>
                      </div>
                    </div>

                    {/* Posts Grid */}
                    <div className="max-w-4xl mx-auto px-4">
                      {profilePostsTab === 'posts' && (
                        <PostFeed 
                          currentUser={user}
                          userPosts={true}
                          profileId={selectedProfile?.id || user.id}
                          onProfileClick={handleProfileClick}
                          gridView={true}
                          onPostCountChange={setPostCount}
                        />
                      )}
                      {profilePostsTab === 'saved' && (
                        <div className="py-8 text-center text-gray-500">
                          Keine gespeicherten Beiträge
                        </div>
                      )}
                      {profilePostsTab === 'tagged' && (
                        <div className="py-8 text-center text-gray-500">
                          Keine markierten Beiträge
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </main>

          {/* Bottom Navigation */}
          <Navigation 
            activeTab={activeTab} 
            setActiveTab={handleTabChange}
            unreadNotifications={unreadNotifications}
            user={user}
          />

          {/* Settings Modal */}
          {showSettings && user && (
            <ProfileSettings
              user={user}
              onClose={() => setShowSettings(false)}
              onUpdate={refreshProfile}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col space-y-6 p-4">
          <div className="bg-white rounded-lg shadow">
            <StoriesFeed currentUser={null} />
          </div>
          <div className="flex justify-center">
            <AuthForm onAuthSuccess={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;