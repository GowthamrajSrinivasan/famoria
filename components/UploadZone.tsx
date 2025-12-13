import React, { useCallback } from 'react';
import { Upload, Image as ImageIcon, Film } from 'lucide-react';

interface UploadZoneProps {
    onFilesSelected: (files: File[]) => void;
    accept?: string;
    maxFiles?: number;
    disabled?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
    onFilesSelected,
    accept = 'image/*,video/*',
    maxFiles = 20,
    disabled = false
}) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
            setIsDragOver(true);
        }
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (disabled) return;

        const files = Array.from(e.dataTransfer.files);
        const validFiles = files.slice(0, maxFiles);

        if (validFiles.length > 0) {
            onFilesSelected(validFiles);
        }
    }, [disabled, maxFiles, onFilesSelected]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            onFilesSelected(files);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    const handleClick = () => {
        if (!disabled) {
            fileInputRef.current?.click();
        }
    };

    return (
        <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
        relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
        transition-all duration-300 ease-in-out
        ${isDragOver
                    ? 'border-orange-500 bg-orange-50 scale-[1.02]'
                    : 'border-stone-300 bg-stone-50 hover:border-orange-400 hover:bg-orange-50/50'
                }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                multiple
                onChange={handleFileSelect}
                className="hidden"
                disabled={disabled}
            />

            <div className="flex flex-col items-center gap-4">
                {/* Icon */}
                <div className={`
          w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300
          ${isDragOver
                        ? 'bg-orange-500 scale-110'
                        : 'bg-gradient-to-br from-orange-400 to-orange-600'
                    }
        `}>
                    <Upload size={36} className="text-white" />
                </div>

                {/* Text */}
                <div>
                    <h3 className="text-xl font-semibold text-stone-800 mb-2">
                        {isDragOver ? 'Drop files here' : 'Upload Photos & Videos'}
                    </h3>
                    <p className="text-stone-500 mb-1">
                        Drag and drop files here or click to browse
                    </p>
                    <p className="text-sm text-stone-400">
                        Supports JPG, PNG, WebP, HEIC, MP4, MOV
                    </p>
                </div>

                {/* File Type Icons */}
                <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2 text-stone-400">
                        <ImageIcon size={20} />
                        <span className="text-sm">Photos</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-stone-300" />
                    <div className="flex items-center gap-2 text-stone-400">
                        <Film size={20} />
                        <span className="text-sm">Videos</span>
                    </div>
                </div>

                {/* Limits */}
                <div className="mt-2 text-xs text-stone-400">
                    Max {maxFiles} files • Photos: 50MB • Videos: 100MB
                </div>
            </div>

            {/* Animated Border Effect */}
            {isDragOver && (
                <div className="absolute inset-0 rounded-2xl border-2 border-orange-500 animate-pulse pointer-events-none" />
            )}
        </div>
    );
};
