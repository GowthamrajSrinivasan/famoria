# Famoria: Mobile Implementation Specification

This document provides the technical blueprints and database schemas required to replicate the Famoria web application features in a mobile environment.

---

## 1. Authentication & User Schema
Users are authenticated via Firebase Auth. The profile data is synced to the `users` collection.

### Database Schema: `users/{userId}`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | Firebase UID |
| `name` | string | User display name |
| `email` | string | User email |
| `avatar` | string | URL to profile picture |
| `families` | array[string] | List of Family IDs the user belongs to |
| `memberships` | map | `{ familyId: { role: 'admin'\|'member', joinedAt: timestamp } }` |
| `plan` | string | 'Lite', 'Pro', or 'Ultimate' |

> [!IMPORTANT]
> **Mobile Tip**: Use `Firebase Auth` for seamless login. Store the active session context globally.

---

## 2. End-to-End Encryption (E2EE)
Famoria uses a hierarchical key system. No media is readable without the **Family Master Key (FMK)**.

### Architecture
1.  **Family Master Key (FMK)**: 256-bit key generated per family.
2.  **Photo-Specific Key**: Derived from `HKDF(FMK, PhotoID)`.
3.  **Algorithm**: AES-256-GCM.

### Key Storage & Sync
- **Local**: Use **SecureStore** (iOS Keychain / Android Keystore).
- **Backup**: Encrypted copy stored in the user's **Google Drive AppData** (invisible to user).

### Schema for Encrypted Metadata (Stored in Photo/Post)
| Field | Type | Description |
| :--- | :--- | :--- |
| `encryptedMetadata` | string | Base64 AES-GCM string (caption, tags, etc.) |
| `metadataIv` | string | 12-byte IV (Base64) |
| `metadataAuthTag` | string | AES-GCM Auth Tag (Base64) |

---

## 3. Albums & Access Control
Albums manage visibility via groups or individual members.

### Database Schema: `albums/{albumId}`
| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | string | Album name (public or encrypted) |
| `description` | string | Optional description |
| `createdBy` | string | User ID of creator |
| `accessType` | string | `'groups'` or `'members'` |
| `selectedGroups` | array[string] | Group IDs (if `accessType == 'groups'`) |
| `members` | array[string] | List of User IDs allowed to view |

### Member Management Logic
- Only the `createdBy` user (Creator) can add/remove members or groups.
- If `accessType` is `'groups'`, the `members` array should be automatically synced with all members of the selected groups.

---

## 4. Groups & Social Circles
Groups allow for easier management of album permissions.

### Database Schema: `groups/{groupId}`
| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | string | Group name |
| `description`| string | Optional description |
| `createdBy` | string | User ID of creator |
| `members` | array[string] | List of User IDs in this group |
| `color` | string | Hex color for UI representation |
| `icon` | string | Emoji or icon string |

---

## 5. Invitations & Onboarding
How new users are added to families and albums.

### Database Schema: `invitations/{token}`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | Unique 32-char nanoID (The Token) |
| `familyId` | string | Family ID to join |
| `albumId` | string | Optional: Specific album to join |
| `invitedBy` | string | User ID of inviter |
| `status` | string | `'pending'`, `'accepted'`, `'expired'` |
| `expiresAt` | number | Timestamp (7 days validity) |

> [!CAUTION]
> **Key Sharing**: The **Family Master Key (FMK)** is never stored in the database. When sharing an invite via a link, the key is passed as a **URL fragment** (e.g., `famoria.com/invite/TOKEN#MASTER_KEY`). This ensures the key never touches the server.

---

## 6. Photos & Posts (The Feed)
Famoria supports multi-image posts (up to 10 images).

### Database Schema: `posts/{postId}`
| Field | Type | Description |
| :--- | :--- | :--- |
| `albumId` | string | Reference to parent Album |
| `authorId` | string | User ID of uploader |
| `photoIds` | array[string] | Ordered list of internal Photo IDs |
| `coverPhotoId` | string | ID of the primary photo to show in feed |
| `likes` | array[string] | User IDs who liked the post |
| `commentsCount` | number | Atomic count of comments |
| `isEncrypted` | boolean | Set to `true` |

### Photo Details: `albums/{albumId}/photos/{photoId}`
(Sensitive data is stored in the album subcollection for better security isolation)
| Field | Type | Description |
| :--- | :--- | :--- |
| `url` | string | Firebase Storage path to `.enc` file |
| `thumbnailUrl` | string | Path to encrypted thumbnail |
| `postId` | string | Reference to parent Post |
| `orderInPost`| number | 0-indexed position |

---

## 5. Upload Pipeline & Parallel Processing
To handle multi-image uploads without blocking the UI.

### The Worker Pattern
- **Concurrency Limit**: 3 (processes 3 images at a time).
- **Phase 1 (Instant)**: Extract metadata, generate thumbnail, encrypt both, write Firestore records.
- **Phase 2 (Background)**: Encrypt full-res image, upload blob, update status to `complete`.

> [!TIP]
> **Mobile Implementation**: Use a `WorkManager` (Android) or `BackgroundTasks` (iOS) to ensure Phase 2 finishes even if the user minimizes the app.

---

## 6. Interactions & Notifications
Real-time social features.

### Comments: `posts/{postId}/comments/{commentId}`
- **Operations**: Use `increment(1)` and `increment(-1)` for the `commentsCount` on the parent post to avoid race conditions.
- **Likes**: Use `arrayUnion(userId)` and `arrayRemove(userId)` for atomic updates.

### Notifications: `notifications/{notifId}`
| Field | Type | Description |
| :--- | :--- | :--- |
| `userId` | string | Recipient User ID |
| `type` | string | `'like'`, `'comment'`, `'tag'`, `'join'` |
| `actorId` | string | Triggering User ID |
| `photoId` | string | Optional: Reference to content |
| `isRead` | boolean | Default `false` |

---

## 7. AI Analysis (Gemini)
Optional background processing for smarter organization.
- **Trigger**: Post-upload hook or cloud function.
- **Output**: Generates `aiTags` and `suggestedAlbum` based on image content.
- **Implementation**: Fetch decrypted image, send to Gemini API, update Firestore.
