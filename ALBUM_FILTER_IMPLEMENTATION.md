# Album Filter Buttons Implementation - TODO

## 🎯 **Objective:**

Add filter buttons to AlbumView to show:
- **"All"** - All photos and videos
- **"Photos"** - Only photos
- **"Videos"** - Only videos

---

## 📝 **Implementation Steps:**

### **Step 1: Update Import**s

```tsx
// Add to imports in AlbumView.tsx
import { Film, Grid as GridIcon } from 'lucide-react';
import { Video } from '../types';
import { VideoCard } from './VideoCard';
import { videoService } from '../services/videoService';
```

### **Step 2: Add State Variables**

```tsx
// Add these state variables
const [videos, setVideos] = useState<Video[]>([]);
const [mediaFilter, setMediaFilter] = useState<'all' | 'photos' | 'videos'>('all');
const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
```

### **Step 3: Update useEffect to Load Videos**

```tsx
useEffect(() => {
    setLoading(true);
    
    // Subscribe to photos
    const unsubscribePhotos = photoService.subscribeToAlbumPhotos(
        album.id,
        (albumPhotos) => {
            setPhotos(albumPhotos);
            setLoading(false);
        }
    );

    // Subscribe to videos for this album
    const unsubscribeVideos = videoService.subscribeToVideos(
        (albumVideos) => {
            setVideos(albumVideos);
        },
        album.id  // albumId as second parameter
    );

    return () => {
        unsubscribePhotos();
        unsubscribeVideos();
    };
}, [album.id]);
```

### **Step 4: Add Filter Buttons UI**

Add this BEFORE the photos grid section:

```tsx
{/* Filter Buttons */}
<div className="mb-6 flex items-center gap-3 bg-stone-50 p-1.5 rounded-xl w-fit">
    <button
        onClick={() => setMediaFilter('all')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            mediaFilter === 'all'
                ? 'bg-white text-orange-500 shadow-sm'
                : 'text-stone-600 hover:text-stone-800'
        }`}
    >
        <GridIcon size={16} />
        All ({photos.length + videos.length})
    </button>
    
    <button
        onClick={() => setMediaFilter('photos')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            mediaFilter === 'photos'
                ? 'bg-white text-orange-500 shadow-sm'
                : 'text-stone-600 hover:text-stone-800'
        }`}
    >
        <ImageIcon size={16} />
        Photos ({photos.length})
    </button>
    
    <button
        onClick={() => setMediaFilter('videos')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            mediaFilter === 'videos'
                ? 'bg-white text-orange-500 shadow-sm'
                : 'text-stone-600 hover:text-stone-800'
        }`}
    >
        <Film size={16} />
        Videos ({videos.length})
    </button>
</div>
```

### **Step 5: Update Grid Rendering**

Replace the current photos grid rendering with conditional rendering:

```tsx
{/* Photos - show when filter is 'all' or 'photos' */}
{(mediaFilter === 'all' || mediaFilter === 'photos') && photos.length > 0 && (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {photos.map((photo) => (
            <PhotoCard
                key={photo.id}
                photo={photo}
                // ... existing props
            />
        ))}
    </div>
)}

{/* Videos - show when filter is 'all' or 'videos' */}
{(mediaFilter === 'all' || mediaFilter === 'videos') && videos.length > 0 && (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map((video) => (
            <VideoCard
                key={video.id}
                video={video}
                currentUser={currentUser}
                onClick={() => setSelectedVideo(video)}
                onDelete={isOwner ? (videoId) => videoService.deleteVideo(videoId, currentUserId!) : undefined}
                onLike={currentUser ? (videoId) => videoService.toggleLike(videoId, currentUser.id) : undefined}
            />
        ))}
    </div>
)}
```

### **Step 6: Update Empty State**

Update empty state to be filter-aware:

```tsx
{loading ? (
    <LoadingSpinner />
) : ((mediaFilter === 'all' && photos.length === 0 && videos.length === 0) ||
     (mediaFilter === 'photos' && photos.length === 0) ||
     (mediaFilter === 'videos' && videos.length === 0)) ? (
    <EmptyState 
        message={
            mediaFilter === 'photos' ? 'No photos in this album' :
            mediaFilter === 'videos' ? 'No videos in this album' :
            'This album is empty'
        }
    />
) : (
    // ... render grids
)}
```

---

## 🎨 **Visual Structure:**

```
Album View
├── Header with title & actions
├── Filter Buttons
│   ├── [All (5)]     ← active: orange bg
│   ├── [Photos (3)]
│   └── [Videos (2)]
├── Conditional Grid
│   ├── Photos Grid (if filter allows)
│   └── Videos Grid (if filter allows)
```

---

## ✅ **Testing Checklist:**

- [ ] Click "All" - shows both photos and videos
- [ ] Click "Photos" - shows only photos
- [ ] Click "Videos" - shows only videos
- [ ] Counts update correctly
- [ ] Empty state shows correct message
- [ ] Videos can be played
- [ ] Photos can be viewed

---

**This is a manual guide - the file needs to be edited carefully to avoid breaking existing functionality!**
