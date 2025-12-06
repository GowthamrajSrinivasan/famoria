import React from 'react';
import { X, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { UploadProgress } from '../types';

interface UploadQueueProps {
    uploads: UploadProgress[];
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
}

export const UploadQueue: React.FC<UploadQueueProps> = ({
    uploads,
    onCancel,
    onRetry
}) => {
    if (uploads.length === 0) return null;

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-lg p-4 max-h-96 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-stone-800">
                    Uploading {uploads.filter(u => u.status !== 'complete').length} of {uploads.length}
                </h3>
                <span className="text-xs text-stone-500">
                    {uploads.filter(u => u.status === 'complete').length} completed
                </span>
            </div>

            <div className="space-y-3">
                {uploads.map((upload) => (
                    <div
                        key={upload.id}
                        className={`
              p-3 rounded-xl border transition-all
              ${upload.status === 'complete'
                                ? 'bg-green-50 border-green-200'
                                : upload.status === 'error'
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-stone-50 border-stone-200'
                            }
            `}
                    >
                        <div className="flex items-start gap-3">
                            {/* Thumbnail */}
                            <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-stone-200">
                                {upload.thumbnailUrl ? (
                                    <img
                                        src={upload.thumbnailUrl}
                                        alt={upload.file.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-6 h-6 border-2 border-stone-300 border-t-orange-500 rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-stone-800 truncate">
                                            {upload.file.name}
                                        </p>
                                        <p className="text-xs text-stone-500">
                                            {formatFileSize(upload.file.size)}
                                        </p>
                                    </div>

                                    {/* Status Icon */}
                                    <div className="flex-shrink-0">
                                        {upload.status === 'complete' && (
                                            <CheckCircle size={20} className="text-green-500" />
                                        )}
                                        {upload.status === 'error' && (
                                            <AlertCircle size={20} className="text-red-500" />
                                        )}
                                        {(upload.status === 'uploading' || upload.status === 'processing') && (
                                            <Loader size={20} className="text-orange-500 animate-spin" />
                                        )}
                                        {upload.status === 'pending' && (
                                            <div className="w-5 h-5 rounded-full bg-stone-300" />
                                        )}
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                {upload.status !== 'complete' && upload.status !== 'error' && (
                                    <div className="mt-2">
                                        <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-orange-500 transition-all duration-300 ease-out"
                                                style={{ width: `${upload.progress}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-xs text-stone-500">
                                                {upload.status === 'processing' ? 'Processing...' : `${upload.progress}%`}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Error Message */}
                                {upload.status === 'error' && upload.error && (
                                    <p className="text-xs text-red-600 mt-1">{upload.error}</p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex-shrink-0 flex items-center gap-1">
                                {upload.status === 'error' && (
                                    <button
                                        onClick={() => onRetry(upload.id)}
                                        className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-600 text-xs font-medium"
                                    >
                                        Retry
                                    </button>
                                )}
                                {upload.status !== 'complete' && (
                                    <button
                                        onClick={() => onCancel(upload.id)}
                                        className="p-1.5 hover:bg-stone-200 rounded-lg transition-colors"
                                    >
                                        <X size={16} className="text-stone-600" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Summary */}
            {uploads.every(u => u.status === 'complete') && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                    <p className="text-sm font-medium text-green-700">
                        ✨ All files uploaded successfully!
                    </p>
                </div>
            )}
        </div>
    );
};
