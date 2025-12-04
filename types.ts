export interface Photo {
  id: string;
  url: string; // Base64 or URL
  caption: string;
  tags: string[];
  date: string;
  author: string;
  authorId?: string;
  likes?: string[]; // Array of user IDs
  commentsCount?: number;
  isAiGenerated?: boolean;
  originalPhotoId?: string; // If this is an edit
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
}

export enum ViewState {
  GALLERY = 'GALLERY',
  UPLOAD = 'UPLOAD',
  ALBUMS = 'ALBUMS'
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