export interface Photo {
  id: string;
  albumId?: string; // Album this photo belongs to
  postId?: string; // Reference to parent Post (for multi-image posts)
  orderInPost?: number; // Position in multi-image post (0-indexed)
  url: string; // Base64 or URL
  thumbnailUrl?: string; // Thumbnail URL
  caption: string;
  tags: string[]; // Tagged user IDs
  date: string;
  author: string;
  authorId?: string;
  likes?: string[]; // Array of user IDs
  commentsCount?: number;
  isAiGenerated?: boolean;
  originalPhotoId?: string; // If this is an edit
  isEncrypted?: boolean; // Whether this photo is encrypted
  albumPhotoId?: string; // Reference to the photo in album subcollection (for encrypted photos)
  // Enhanced fields for upload
  filename?: string;
  fileSize?: number;
  fileType?: string;
  width?: number;
  height?: number;
  uploadedAt?: number;
  aiTags?: string[]; // AI-generated tags
  analysis?: Record<string, any>; // AI analysis data
  aiProcessed?: boolean;
}

export interface Post {
  id: string;
  albumId?: string; // Album this post belongs to
  caption: string;
  tags: string[];
  date: string;
  author: string;
  authorId: string;
  photoIds: string[]; // Array of photo IDs in this post (1 or more, max 10)
  coverPhotoId: string; // Primary photo to show in feed (first photo)
  createdAt: number;
  isEncrypted?: boolean;
  likes?: string[];
  commentsCount?: number;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatar: string;
  createdAt?: string;
  lastLogin?: string;
  plan?: 'Lite' | 'Pro' | 'Ultimate';
}

export interface UserUsage {
  editsUsed: number;
  limit: number;
  plan: 'Lite' | 'Pro' | 'Ultimate';
}

export interface Comment {
  id: string;
  photoId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: number; // Timestamp
  updatedAt?: number; // Timestamp for edits
  likes?: string[]; // Array of user IDs who liked this comment
  replyTo?: string; // ID of parent comment if this is a reply
  mentions?: string[]; // Array of mentioned user IDs
  voiceNote?: {
    audioUrl: string;
    transcription?: string;
    duration: number;
  };
}


export enum ViewState {
  GALLERY = 'GALLERY',
  UPLOAD = 'UPLOAD',
  VIDEO_UPLOAD = 'VIDEO_UPLOAD',
  ALBUMS = 'ALBUMS',
  ALBUM_VIEW = 'ALBUM_VIEW',
  MEMBERS = 'MEMBERS',
  VIDEOS = 'VIDEOS'
}

export interface Album {
  id: string;
  name: string; // Required, max 50 chars
  description?: string; // Optional, max 500 chars
  coverPhoto?: string; // Public Firebase Storage URL for cover image
  createdBy: string; // User ID
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  accessType: 'groups' | 'members'; // Groups or individual members
  selectedGroups?: string[]; // Array of group IDs (if accessType is 'groups')
  members: string[]; // Array of user IDs who can access (if accessType is 'members', or expanded from groups)
  photoCount?: number; // Cached count of photos/posts
  videoCount?: number; // Cached count of videos
}

export interface UploadProgress {
  id: string;
  file: File;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
  thumbnailUrl?: string;
  photoId?: string;
}

export interface AIAnalysisResult {
  caption: string;
  tags: string[];
  suggestedAlbum: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'like' | 'comment' | 'tag' | 'mention';
  actorName: string;
  actorAvatar?: string;
  message: string;
  photoId?: string;
  createdAt: number;
  isRead: boolean;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string; // User ID of creator
  createdAt: number;
  updatedAt: number;
  members: string[]; // Array of user IDs
  color?: string; // Optional color for the group
  icon?: string; // Optional icon/emoji for the group
}

export interface Video {
  id: string;
  url: string;
  thumbnailUrl?: string;
  title: string;
  description?: string;
  tags: string[];

  // Metadata
  duration: number;
  size: number;
  format: string;
  resolution: string;
  aspectRatio: string;

  // Upload info
  uploadedBy: string;
  author: string;
  uploadDate: any;

  // Interactions
  likes: string[];
  commentsCount: number;
  viewsCount: number;

  // Organization
  albumId?: string;
  isProcessing: boolean;
  processingError?: string;

  // Privacy
  isPublic: boolean;
  allowedUsers?: string[];

  createdAt: any;
  updatedAt: any;
}

export interface VideoUploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}