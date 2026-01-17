import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Camera, Plus, Search, LogOut, Grid, Image as ImageIcon, FolderOpen, Users, Film, ArrowUpDown, Filter, X, Bell } from 'lucide-react';
import { Photo, Post, ViewState, Album } from './types';
import { PhotoCard } from './components/PhotoCard';
import { Uploader } from './components/Uploader';
import { PhotoLightbox } from './components/PhotoLightbox';
import { Button } from './components/Button';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UploadProvider } from './context/UploadContext';
import { UploadProgressWidget } from './components/UploadProgressWidget';
import { ToastNotification, useToast } from './components/ToastNotification';
import { Login } from './components/Login';
import { photoService } from './services/photoService';
import { AlbumGrid } from './components/AlbumGrid';
import { CreateAlbumModal } from './components/CreateAlbumModal';
import { NotificationBell } from './components/NotificationBell';
import { AlbumView } from './components/AlbumView';
import { MembersPage } from './components/MembersPage';
import { VideoGrid } from './components/VideoGrid';
import { VideoUploader } from './components/VideoUploader';
import { userService } from './services/userService';
import { subscribeToAlbums } from './services/albumService';
import { invitationService } from './services/invitationService';
// import { saveMasterKey } from './lib/crypto/keyStore'; // Removed legacy
import { familyService } from './services/familyService';
import { InviteMemberModal } from './components/InviteMemberModal';
import { FamilySetupModal } from './components/FamilySetupModal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { ImmersiveDashboard } from './components/ImmersiveDashboard';
import { useTranslation } from 'react-i18next';
import { cacheService } from './services/cacheService';
import * as photoCrypto from './lib/crypto/photoCrypto';
import * as photoKeyModule from './lib/crypto/photoKey';

function ProtectedApp() {
  const { t } = useTranslation();
  const { user, loading, signOut, isFamilyAuthenticated, googleAccessToken, familyKey } = useAuth();
  const { toasts, addToast, removeToast } = useToast();
  // Default to Dashboard
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [posts, setPosts] = useState<Post[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'liked' | 'commented'>('newest');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | Post | null>(null);

  // Filter state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedUploaders, setSelectedUploaders] = useState<string[]>([]);
  const [selectedAlbums, setSelectedAlbums] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<{ id: string, name: string }[]>([]);
  const [availableAlbums, setAvailableAlbums] = useState<Album[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Album state
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteAlbumId, setInviteAlbumId] = useState<string | undefined>(undefined);

  const isProcessingInvite = React.useRef(false);

  // Load cached data on mount for faster initial rendering
  useEffect(() => {
    const loadCachedData = async () => {
      console.log('[App] Loading cached data for landing page...');
      try {
        const [cachedPosts, cachedAlbums] = await Promise.all([
          cacheService.getCachedMetadata<Post[]>('latestPosts'),
          cacheService.getCachedMetadata<Album[]>('latestAlbums')
        ]);

        if (cachedPosts && posts.length === 0) {
          console.log(`[App] 🚀 Initializing with ${cachedPosts.length} cached posts`);
          setPosts(cachedPosts);
        }

        if (cachedAlbums && availableAlbums.length === 0) {
          console.log(`[App] 🚀 Initializing with ${cachedAlbums.length} cached albums`);
          setAvailableAlbums(cachedAlbums);
        }
      } catch (err) {
        console.error('[App] Failed to load cached data:', err);
      }
    };

    loadCachedData();
  }, []); // Only on mount

  // Handle Invitation Links
  useEffect(() => {
    const handleInviteLink = async () => {
      // Prevent multiple executions
      if (isProcessingInvite.current) return;

      const urlParams = new URLSearchParams(window.location.search);
      const inviteToken = urlParams.get('invite');
      const hashParams = new URLSearchParams(window.location.hash.slice(1)); // remove #
      const keyBase64 = hashParams.get('key');

      if (inviteToken && keyBase64) {
        // Store in session storage to survive login/redirects
        sessionStorage.setItem('pendingInviteToken', inviteToken);
        sessionStorage.setItem('pendingInviteKey', keyBase64);

        // Clean URL to avoid leaking key in history/screenshots
        window.history.replaceState({}, '', window.location.pathname);

        // If user is not logged in, show toast once
        if (!user) {
          isProcessingInvite.current = true;
          addToast(t('toast_signin_invite'), 'info');
          // Reset after a delay to allow for future attempts if needed, 
          // though usually this is a one-off per page load
          setTimeout(() => { isProcessingInvite.current = false; }, 2000);
          return;
        }
      }

      // Check for pending invite in storage if user is logged in
      if (user) {
        const pendingToken = sessionStorage.getItem('pendingInviteToken');
        const pendingKey = sessionStorage.getItem('pendingInviteKey');

        if (pendingToken && pendingKey) {
          isProcessingInvite.current = true;

          try {
            addToast(t('toast_accepting_invite'), 'info');
            const invite = await invitationService.acceptInvitation(pendingToken, user.id);


            // Save the Family Key
            if (pendingKey) {
              await familyService.acceptFamilyInvite(pendingKey, googleAccessToken || undefined);
              addToast(t('toast_invite_accepted_unlocked'), 'success');

              // If we were not authenticated before, reload to init context
              if (!isFamilyAuthenticated) {
                window.location.reload();
              }
            } else {
              addToast(t('toast_invite_accepted'), 'success');
            }

            sessionStorage.removeItem('pendingInviteToken');
            sessionStorage.removeItem('pendingInviteKey');

          } catch (error) {
            console.error('Failed to accept invitation:', error);
            // Only show error if it's not "already accepted" or similar harmless error
            addToast(t('toast_invite_failed'), 'error');

            // Critical: Remove tokens to prevent infinite retry loop
            sessionStorage.removeItem('pendingInviteToken');
            sessionStorage.removeItem('pendingInviteKey');
          } finally {
            // Keep locked for this session to prevent re-runs on other prop updates
            // or set false if you want to allow re-trying on error
            isProcessingInvite.current = false;
          }
        }
      }
    };

    handleInviteLink();
  }, [user, addToast, googleAccessToken, isFamilyAuthenticated]);

  // Subscribe to real-time posts feed
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = photoService.subscribeToPostsFeed(user.id, async (newPosts) => {
        if (isMounted) {
          // Decrypt posts
          const decrypted = await Promise.all(newPosts.map(async (post) => {
            if (familyKey && post.isEncrypted && (post as any).encryptedMetadata) {
              try {
                const postKey = await photoKeyModule.derivePhotoKey(familyKey, post.id);
                const metadata = await photoCrypto.decryptMetadata({
                  encrypted: (post as any).encryptedMetadata,
                  iv: (post as any).metadataIv,
                  authTag: (post as any).metadataAuthTag
                }, postKey);
                return {
                  ...post,
                  caption: metadata.caption || post.caption,
                  tags: metadata.tags || post.tags,
                  location: metadata.location || post.location
                };
              } catch (err) {
                console.error(`[App] Failed to decrypt post ${post.id}:`, err);
                return post;
              }
            }
            return post;
          }));

          setPosts(decrypted);
        }
      });
    } catch (error) {
      console.error('[App] Error subscribing to posts feed:', error);
    }

    return () => {
      isMounted = false;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.error('[App] Error unsubscribing from posts feed:', error);
        }
      }
    };
  }, [user, familyKey]);

  // Fetch users and albums for filters
  useEffect(() => {
    if (!user) return;

    const fetchFilterData = async () => {
      try {
        const users = await userService.getAllUsers();
        setAvailableUsers(users.map(u => ({ id: u.id, name: u.name })));
      } catch (error) {
        console.error('[App] Error fetching users:', error);
      }
    };

    const unsubscribeAlbums = subscribeToAlbums(user.id, async (albums) => {
      const decrypted = await Promise.all(albums.map(async (album) => {
        if (familyKey && album.encryptedName) {
          try {
            const metadata = await photoCrypto.decryptMetadata({
              encrypted: album.encryptedName,
              iv: album.metadataIv!,
              authTag: album.metadataAuthTag!
            }, familyKey);
            return {
              ...album,
              name: metadata.name,
              description: metadata.description
            };
          } catch (err) {
            console.error(`[App] Failed to decrypt album ${album.id}:`, err);
            return album;
          }
        }
        return album;
      }));
      setAvailableAlbums(decrypted);
    });

    fetchFilterData();

    return () => {
      unsubscribeAlbums();
    };
  }, [user, familyKey]);

  // Filter, search, and sort posts
  useEffect(() => {
    let result = posts;

    // Apply tag filter
    if (selectedTags.length > 0) {
      result = result.filter(p =>
        selectedTags.some(tag => p.tags.includes(tag))
      );
    }

    // Apply uploader filter
    if (selectedUploaders.length > 0) {
      result = result.filter(p => selectedUploaders.includes(p.authorId));
    }

    // Apply album filter
    if (selectedAlbums.length > 0) {
      result = result.filter(p => p.albumId && selectedAlbums.includes(p.albumId));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.caption.toLowerCase().includes(query) ||
        p.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt - a.createdAt;
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'liked':
          return (b.likes?.length || 0) - (a.likes?.length || 0);
        case 'commented':
          return (b.commentsCount || 0) - (a.commentsCount || 0);
        default:
          return 0;
      }
    });

    setFilteredPosts(sorted);
  }, [searchQuery, posts, sortBy, selectedTags, selectedUploaders, selectedAlbums]);

  const handleUploadComplete = useCallback((newPostOrPosts: Post | Post[] | Photo) => {
    // Optimistically add post(s) to state for immediate UI feedback
    // The real-time listener will sync it properly
    setPosts(prevPosts => {
      // Handle Photo (from Lightbox update) by casting or ignoring. 
      // Ideally Lightbox should pass Post if updating a Post.
      // For now, we assume if it's not array and lacks photoIds, might be a Photo update 
      // which fits awkwardly. We'll cast to any to allow it in state 
      // (Post and Photo are similar enough for UI often).
      const newItems = Array.isArray(newPostOrPosts) ? newPostOrPosts : [newPostOrPosts];
      const validPosts = newItems.filter(item => 'photoIds' in item || 'url' in item) as Post[];

      // Note: This appends new items. If it's an update, this might duplicate.
      // But we are preserving existing behavior for now.
      return [...validPosts, ...prevPosts];
    });
    setView(ViewState.GALLERY);
  }, []);

  // Extract unique tags from posts
  const uniqueTags = Array.from(new Set(posts.flatMap(p => p.tags)));

  // Count active filters
  const activeFilterCount = selectedTags.length + selectedUploaders.length + selectedAlbums.length;

  // Clear all filters
  const clearFilters = () => {
    setSelectedTags([]);
    setSelectedUploaders([]);
    setSelectedAlbums([]);
    setShowFilters(false);
  };

  const handleNotificationClick = (notification: any) => {
    if (notification.photoId) {
      // Navigate to gallery view
      setView(ViewState.GALLERY);
      // Find and open the photo in lightbox
      const post = posts.find(p => p.id === notification.photoId);
      if (post) {
        setSelectedPhoto(post);
      }
    }
  };

  if (!user) {
    return <Login />;
  }

  // If user is authenticated but Family Key is not set up/unlocked
  if (user && !isFamilyAuthenticated) {
    return <FamilySetupModal />;
  }

  if (view === ViewState.DASHBOARD) {
    return (
      <>
        <ImmersiveDashboard
          currentUser={user}
          posts={posts}
          onNavigate={setView}
          onSignOut={signOut}
          onAddNewMemory={() => setView(ViewState.UPLOAD)}
        />
        {/* Toast Notifications - Keep them global */}
        <ToastNotification toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf9] font-sans text-stone-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-white/50 supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setView(ViewState.GALLERY)}
          >
            <div className="bg-gradient-to-br from-orange-400 to-orange-500 p-2.5 rounded-xl text-white shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform duration-300">
              <Camera size={22} fill="currentColor" className="opacity-95" strokeWidth={1.5} />
            </div>
            <span className="text-xl font-bold tracking-tight text-stone-800 font-serif">Famoria</span>
          </div>

          {view === ViewState.GALLERY && (
            <div className="hidden md:block flex-1 max-w-md mx-12">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input
                  type="text"
                  placeholder={t('search_placeholder')}
                  className="w-full pl-11 pr-4 py-2.5 bg-stone-100/50 border border-transparent rounded-full text-sm focus:ring-2 focus:ring-orange-100 focus:bg-white focus:border-orange-200 transition-all placeholder:text-stone-400 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 sm:gap-6">
            {/* View Tabs */}
            <div className="hidden md:flex items-center gap-2 bg-stone-100 p-1.5 rounded-xl">
              <button
                onClick={() => setView(ViewState.GALLERY)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === ViewState.GALLERY || view === ViewState.UPLOAD
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
                  }`}
              >
                <Grid size={16} className="inline mr-1.5" />
                {t('nav_gallery')}
              </button>
              <button
                onClick={() => setView(ViewState.ALBUMS)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === ViewState.ALBUMS || view === ViewState.ALBUM_VIEW
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
                  }`}
              >
                <FolderOpen size={16} className="inline mr-1.5" />
                {t('nav_albums')}
              </button>
              <button
                onClick={() => setView(ViewState.VIDEOS)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === ViewState.VIDEOS
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
                  }`}
              >
                <Film size={16} className="inline mr-1.5" />
                {t('nav_videos')}
              </button>
              <button
                onClick={() => setView(ViewState.MEMBERS)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === ViewState.MEMBERS
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
                  }`}
              >
                <Users size={16} className="inline mr-1.5" />
                {t('nav_members')}
              </button>
            </div>

            <div className="flex items-center gap-3 pl-6">
              <LanguageSwitcher />
              {/* Notification Bell */}
              <NotificationBell
                userId={user.id}
                onNotificationClick={handleNotificationClick}
              />

              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-stone-800 leading-none">{user.name}</p>
                <p className="text-[11px] font-medium text-stone-400 mt-1 uppercase tracking-wide">{t('role_family_member')}</p>
              </div>
              <div className="relative">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover"
                />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              <button
                onClick={signOut}
                className="p-2.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all"
                title={t('sign_out')}
              >
                <LogOut size={20} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {view === ViewState.GALLERY && (
          <div className="animate-fade-in-up">
            <div className="flex flex-col gap-6 mb-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-stone-800 mb-2 font-serif">{t('family_feed')}</h1>
                  <p className="text-stone-500">
                    <span dangerouslySetInnerHTML={{ __html: t('shared_moments_count', { count: posts.length }) }}></span>
                  </p>
                </div>
                <Button
                  onClick={() => setView(ViewState.UPLOAD)}
                  className="shadow-xl shadow-orange-500/20 hover:shadow-orange-500/30 transition-all active:scale-95"
                >
                  <Plus size={20} className="mr-2" strokeWidth={2.5} />
                  {t('add_memory')}
                </Button>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-3">
                <ArrowUpDown size={18} className="text-stone-400" />
                <span className="text-sm font-medium text-stone-600">{t('sort_by')}</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all cursor-pointer hover:border-stone-300"
                >
                  <option value="newest">{t('sort_newest')}</option>
                  <option value="oldest">{t('sort_oldest')}</option>
                  <option value="liked">{t('sort_liked')}</option>
                  <option value="commented">{t('sort_commented')}</option>
                </select>
              </div>

              {/* Filter Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeFilterCount > 0
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'bg-white border border-stone-200 text-stone-700 hover:border-stone-300'
                    }`}
                >
                  <Filter size={16} />
                  <span>{t('filters')}</span>
                  {activeFilterCount > 0 && (
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-stone-500 hover:text-stone-700 font-medium"
                  >
                    {t('clear_all')}
                  </button>
                )}
              </div>
            </div>

            {/* Active Filter Chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 items-center animate-in fade-in slide-in-from-top-2 duration-200">
                <span className="text-sm font-medium text-stone-600">{t('active_filters')}</span>
                {selectedTags.map(tag => {
                  const user = availableUsers.find(u => u.id === tag);
                  const displayName = user?.name || tag;
                  return (
                    <div key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm font-medium transition-all hover:bg-orange-200">
                      <span>{displayName}</span>
                      <button
                        onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                        className="hover:text-orange-900 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                {selectedUploaders.map(uploaderId => {
                  const user = availableUsers.find(u => u.id === uploaderId);
                  return (
                    <div key={uploaderId} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium transition-all hover:bg-blue-200">
                      <span>{user?.name || uploaderId}</span>
                      <button
                        onClick={() => setSelectedUploaders(selectedUploaders.filter(u => u !== uploaderId))}
                        className="hover:text-blue-900 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                {selectedAlbums.map(albumId => {
                  const album = availableAlbums.find(a => a.id === albumId);
                  return (
                    <div key={albumId} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium transition-all hover:bg-purple-200">
                      <span>{album?.name || albumId}</span>
                      <button
                        onClick={() => setSelectedAlbums(selectedAlbums.filter(a => a !== albumId))}
                        className="hover:text-purple-900 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Filter Panel */}
            {showFilters && (
              <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-lg shadow-stone-200/50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Tags Filter */}
                  <div>
                    <label className="block text-sm font-semibold text-stone-800 mb-3">
                      {t('filter_tagged_people')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {uniqueTags.length === 0 ? (
                        <p className="text-sm text-stone-400">{t('no_tags')}</p>
                      ) : (
                        uniqueTags.map(tag => {
                          const user = availableUsers.find(u => u.id === tag);
                          const displayName = user?.name || tag;
                          const isSelected = selectedTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedTags(selectedTags.filter(t => t !== tag));
                                } else {
                                  setSelectedTags([...selectedTags, tag]);
                                }
                              }}
                              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-in-out ${isSelected
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30 hover:bg-orange-600'
                                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 hover:shadow-sm'
                                }`}
                            >
                              {displayName}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Uploader Filter */}
                  <div>
                    <label className="block text-sm font-semibold text-stone-800 mb-3">
                      {t('filter_uploaded_by')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableUsers.map(user => {
                        const isSelected = selectedUploaders.includes(user.id);
                        return (
                          <button
                            key={user.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedUploaders(selectedUploaders.filter(u => u !== user.id));
                              } else {
                                setSelectedUploaders([...selectedUploaders, user.id]);
                              }
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-in-out ${isSelected
                              ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30 hover:bg-blue-600'
                              : 'bg-stone-100 text-stone-700 hover:bg-stone-200 hover:shadow-sm'
                              }`}
                          >
                            {user.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Albums Filter */}
                  <div>
                    <label className="block text-sm font-semibold text-stone-800 mb-3">
                      {t('filter_albums')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableAlbums.length === 0 ? (
                        <p className="text-sm text-stone-400">{t('no_albums')}</p>
                      ) : (
                        availableAlbums.map(album => {
                          const isSelected = selectedAlbums.includes(album.id);
                          return (
                            <button
                              key={album.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedAlbums(selectedAlbums.filter(a => a !== album.id));
                                } else {
                                  setSelectedAlbums([...selectedAlbums, album.id]);
                                }
                              }}
                              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-in-out ${isSelected
                                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30 hover:bg-purple-600'
                                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 hover:shadow-sm'
                                }`}
                            >
                              {album.name}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {filteredPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-stone-100 border-dashed">
                <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                  <ImageIcon size={32} />
                </div>
                <h3 className="text-lg font-semibold text-stone-700 mb-1">{t('no_memories_found')}</h3>
                <p className="text-stone-400 max-w-xs mx-auto">{t('no_memories_hint')}</p>
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
                {filteredPosts.map((post) => (
                  <PhotoCard
                    key={post.id}
                    photo={post as any}
                    onClick={setSelectedPhoto}
                    currentUser={user}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {view === ViewState.UPLOAD && (
          <div className="max-w-3xl mx-auto animate-fade-in-up">
            <button
              className="group flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors mb-6 pl-1"
              onClick={() => setView(ViewState.GALLERY)}
            >
              <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> {t('back_to_gallery')}
            </button>
            <Uploader
              onUploadComplete={handleUploadComplete}
              onCancel={() => setView(ViewState.GALLERY)}
            />
          </div>
        )}

        {view === ViewState.ALBUMS && (
          <div className="animate-fade-in-up">
            <AlbumGrid
              currentUserId={user?.id}
              onCreateAlbum={() => setShowCreateAlbumModal(true)}
              onEditAlbum={(album) => {
                console.log('[App] OnEditAlbum called with album:', album);
                console.log('[App] Album groups field:', album.groups);
                console.log('[App] Album members field:', album.members);
                setEditAlbum(album);
                setShowCreateAlbumModal(true);
              }}
              onViewAlbum={(album) => {
                setSelectedAlbum(album);
                setView(ViewState.ALBUM_VIEW);
              }}
            />
          </div>
        )}

        {view === ViewState.ALBUM_VIEW && selectedAlbum && (
          <div className="animate-fade-in-up">
            <AlbumView
              album={selectedAlbum}
              currentUserId={user?.id}
              currentUser={user}
              onBack={() => setView(ViewState.ALBUMS)}
              onEdit={() => {
                setEditAlbum(selectedAlbum);
                setShowCreateAlbumModal(true);
              }}
              onDelete={() => {
                setView(ViewState.ALBUMS);
                setSelectedAlbum(null);
              }}
              onUpload={() => setView(ViewState.UPLOAD)}
              onUploadVideo={() => setView(ViewState.VIDEO_UPLOAD)}
              onPhotoClick={(photo) => setSelectedPhoto(photo)}
            />
          </div>
        )}

        {view === ViewState.VIDEO_UPLOAD && selectedAlbum && (
          <div className="max-w-3xl mx-auto animate-fade-in-up">
            <button
              className="group flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors mb-6 pl-1"
              onClick={() => setView(ViewState.ALBUM_VIEW)}
            >
              <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> {t('back_to_album')}
            </button>
            <VideoUploader
              currentUser={user!}
              albumId={selectedAlbum.id}
              onUploadComplete={() => setView(ViewState.ALBUM_VIEW)}
              onClose={() => setView(ViewState.ALBUM_VIEW)}
            />
          </div>
        )}

        {view === ViewState.VIDEOS && (
          <div className="animate-fade-in-up">
            <VideoGrid currentUser={user} />
          </div>
        )}

        {view === ViewState.MEMBERS && (
          <div className="animate-fade-in-up">
            <MembersPage
              onBack={() => setView(ViewState.GALLERY)}
              currentUserId={user?.id}
              onInvite={() => {
                setInviteAlbumId(undefined);
                setShowInviteModal(true);
              }}
            />
          </div>
        )}
      </main>

      {/* Lightbox for Comments and Details */}
      {selectedPhoto && (
        <PhotoLightbox
          photo={selectedPhoto}
          currentUser={user}
          onClose={() => setSelectedPhoto(null)}
          onPhotoUpdate={handleUploadComplete}
        />
      )}

      {/* Upload Progress Widget */}
      <UploadProgressWidget
        onClose={(completedCount, failedCount, totalCount) => {
          // Show toast notification with upload status
          if (failedCount > 0) {
            addToast(
              `${completedCount} of ${totalCount} photos uploaded successfully. ${failedCount} failed.`,
              'error',
              7000
            );
          } else if (completedCount > 0) {
            addToast(
              `${completedCount} photo${completedCount > 1 ? 's' : ''} uploaded successfully!`,
              'success',
              5000
            );
          }
        }}
      />

      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* Album Creation Modal */}
      <CreateAlbumModal
        isOpen={showCreateAlbumModal}
        onClose={() => {
          setShowCreateAlbumModal(false);
          setEditAlbum(null);
        }}
        onSuccess={(_albumId) => {
          setShowCreateAlbumModal(false);
          setEditAlbum(null);
        }}
        currentUserId={user?.id || ''}
        editAlbum={editAlbum}
      />

      {showInviteModal && user && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          albumId={inviteAlbumId}
          currUserId={user.id}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UploadProvider>
        <ProtectedApp />
      </UploadProvider>
    </AuthProvider>
  );
}