/**
 * Image Utilities for Thumbnail Generation and Optimization
 * Supports client-side image processing before encryption
 */

/**
 * Get dimensions of an image file
 */
export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.width, height: img.height });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
}

/**
 * Generate a thumbnail from an image file
 * @param file Original image file
 * @param maxSize Maximum width/height (maintains aspect ratio)
 * @param quality WebP compression quality (0-1, default 0.8)
 * @returns Thumbnail as Blob (WebP format)
 */
export async function generateThumbnail(
    file: File,
    maxSize: number = 400,
    quality: number = 0.8
): Promise<Blob> {
    const dimensions = await getImageDimensions(file);
    const { width, height } = dimensions;

    // Calculate scaled dimensions maintaining aspect ratio
    let scaledWidth = width;
    let scaledHeight = height;

    if (width > height) {
        if (width > maxSize) {
            scaledWidth = maxSize;
            scaledHeight = (height * maxSize) / width;
        }
    } else {
        if (height > maxSize) {
            scaledHeight = maxSize;
            scaledWidth = (width * maxSize) / height;
        }
    }

    // Create canvas for resizing
    const canvas = document.createElement('canvas');
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    // Load and draw image
    const img = new Image();
    const url = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
        img.onload = () => {
            URL.revokeObjectURL(url);

            // Enable image smoothing for better quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Draw scaled image
            ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

            // Convert to WebP blob
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error('Failed to create thumbnail blob'));
                        return;
                    }
                    resolve(blob);
                },
                'image/webp',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for thumbnail'));
        };

        img.src = url;
    });
}

/**
 * Check if file is an image
 */
export function isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Estimate compression ratio for thumbnail vs original
 */
export async function estimateCompressionRatio(original: File, thumbnail: Blob): Promise<number> {
    const originalSize = original.size;
    const thumbnailSize = thumbnail.size;
    return originalSize / thumbnailSize;
}
