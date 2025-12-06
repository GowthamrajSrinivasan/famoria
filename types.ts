export interface Photo {
  id: string;
  albumId?: string; // Album this photo belongs to
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
  ALBUMS = 'ALBUMS',
  ALBUM_VIEW = 'ALBUM_VIEW'
}

export interface Album {
  id: string;
  name: string; // Required, max 50 chars
  description?: string; // Optional, max 500 chars
  coverPhoto?: string; // URL to cover photo
  createdBy: string; // User ID
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  privacy: 'private' | 'family' | 'public';
  members: string[]; // Array of user IDs who can access
  photoCount?: number; // Cached count
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