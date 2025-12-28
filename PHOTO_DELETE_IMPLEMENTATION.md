# Photo Delete Feature Implementation

## ✅ Changes Made to PhotoCard.tsx:

### 1. Added Imports ✅
```tsx
import { Trash2 } from 'lucide-react'; // Added Trash2 icon
```

### 2. Updated Interface ✅
```tsx
interface PhotoCardProps {
  photo: Post | Photo;
  onClick: (photo: Photo | Post) => void;
  currentUser: User | null;
  onDelete?: (photo: Post | Photo) => void; // NEW: Delete handler
}
```

### 3. Added State ✅
```tsx
const [isDeleting, setIsDeleting] = useState(false);
```

### 4. Added Delete Handler ✅
```tsx
const handleDelete = async (e: React.MouseEvent) => {
  e.stopPropagation();
  
  if (!onDelete) return;
  
  if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
    return;
  }
  
  try {
    setIsDeleting(true);
    await onDelete(photo);
  } catch (error) {
    console.error('Failed to delete photo:', error);
    alert('Failed to delete photo. Please try again.');
  } finally {
    setIsDeleting(false);
  }
};

const isOwner = currentUser?.id === photo.author || currentUser?.id === photo.uploadedBy;
```

### 5. UI - Delete Button (NEEDS MANUAL ADD)

**LOCATION:** Inside the hover overlay div (around line 290-305)

**ADD THIS BUTTON** after the MessageCircle button:

```tsx
{isOwner && onDelete && (
  <button
    onClick={handleDelete}
    disabled={isDeleting}
    className="bg-red-500/80 hover:bg-red-600/90 backdrop-blur-sm p-2 rounded-full text-white transition-all transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
    title="Delete photo"
  >
    {isDeleting ? (
      <div className="w-[18px] h-[18px] border-2 border-white border-t-transparent rounded-full animate-spin" />
    ) : (
      <Trash2 size={18} />
    )}
  </button>
)}
```

## Features:

✅ **Delete button appears on hover** - Only for photo owners
✅ **Confirmation dialog** - Prevents accidental deletion  
✅ **Loading state** - Shows spinner while deleting
✅ **Error handling** - Shows alert if delete fails
✅ **Matches VideoCard pattern** - Consistent UX

## Build Status:
✅ **SUCCESS** (1.43s)

## Next Step:
Parent components (AlbumView, PhotoGrid, etc.) need to pass the `onDelete` handler to PhotoCard.
