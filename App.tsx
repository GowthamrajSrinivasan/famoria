import React, { useState, useEffect } from 'react';
import { Camera, Plus, Search, LogOut, Grid, Image as ImageIcon, FolderOpen } from 'lucide-react';
import { Photo, ViewState, Album } from './types';
import { PhotoCard } from './components/PhotoCard';
import { Uploader } from './components/Uploader';
import { PhotoLightbox } from './components/PhotoLightbox';
import { Button } from './components/Button';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { photoService } from './services/photoService';
import { AlbumGrid } from './components/AlbumGrid';
import { CreateAlbumModal } from './components/CreateAlbumModal';
import { AlbumView } from './components/AlbumView';

function ProtectedApp() {
  const { user, loading, signOut } = useAuth();
  const [view, setView] = useState<ViewState>(ViewState.GALLERY);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Album state
  const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Subscribe to real-time feed
  useEffect(() => {
    if (!user) return;

    const unsubscribe = photoService.subscribeToFeed((newPhotos) => {
      setPhotos(newPhotos);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPhotos(photos);
      return;
    }
    const query = searchQuery.toLowerCase();
    const filtered = photos.filter(p =>
      p.caption.toLowerCase().includes(query) ||
      p.tags.some(t => t.toLowerCase().includes(query))
    );
    setFilteredPhotos(filtered);
  }, [searchQuery, photos]);

  const handleUploadComplete = (newPhoto: Photo) => {
    // Optimistically add photo to state for immediate UI feedback
    // The real-time listener will sync it properly
    setPhotos(prevPhotos => [newPhoto, ...prevPhotos]);
    setView(ViewState.GALLERY);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
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
                  placeholder="Search memories..."
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
                Gallery
              </button>
              <button
                onClick={() => setView(ViewState.ALBUMS)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === ViewState.ALBUMS || view === ViewState.ALBUM_VIEW
                  ? 'bg-white text-stone-800 shadow-sm'
                  : 'text-stone-500 hover:text-stone-700'
                  }`}
              >
                <FolderOpen size={16} className="inline mr-1.5" />
                Albums
              </button>
            </div>

            <div className="flex items-center gap-3 pl-6">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-stone-800 leading-none">{user.name}</p>
                <p className="text-[11px] font-medium text-stone-400 mt-1 uppercase tracking-wide">Family Member</p>
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
                title="Sign Out"
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
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <h1 className="text-3xl font-bold text-stone-800 mb-2 font-serif">Family Feed</h1>
                <p className="text-stone-500">
                  You have <span className="font-semibold text-stone-800">{photos.length}</span> shared moments
                </p>
              </div>
              <Button
                onClick={() => setView(ViewState.UPLOAD)}
                className="shadow-xl shadow-orange-500/20 hover:shadow-orange-500/30 transition-all active:scale-95"
              >
                <Plus size={20} className="mr-2" strokeWidth={2.5} />
                Add New Memory
              </Button>
            </div>

            {filteredPhotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-stone-100 border-dashed">
                <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                  <ImageIcon size={32} />
                </div>
                <h3 className="text-lg font-semibold text-stone-700 mb-1">No memories found</h3>
                <p className="text-stone-400 max-w-xs mx-auto">Try a different search term or add a new photo to your collection.</p>
              </div>
            ) : (
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
                {filteredPhotos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
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
              <span className="group-hover:-translate-x-1 transition-transform">&larr;</span> Back to Gallery
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
              onPhotoClick={(photo) => setSelectedPhoto(photo)}
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
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProtectedApp />
    </AuthProvider>
  );
}