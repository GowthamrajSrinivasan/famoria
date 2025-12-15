import React, { useState } from 'react';
import { X, Minimize2, Maximize2, CheckCircle, XCircle, RefreshCw, Upload, Image as ImageIcon } from 'lucide-react';
import { useUpload } from '../context/UploadContext';

interface UploadProgressWidgetProps {
    onClose?: (completedCount: number, failedCount: number, totalCount: number) => void;
}

export const UploadProgressWidget: React.FC<UploadProgressWidgetProps> = ({ onClose }) => {
    const { tasks, cancelUpload, retryUpload, clearCompleted } = useUpload();
    const [isMinimized, setIsMinimized] = useState(false);

    // Only show if there are active uploads
    const activeTasks = tasks.filter(t => t.status !== 'complete');
    const completedTasks = tasks.filter(t => t.status === 'complete');
    const failedTasks = tasks.filter(t => t.status === 'failed');

    if (tasks.length === 0) return null;

    const totalProgress = tasks.length > 0
        ? tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length
        : 0;

    const allComplete = activeTasks.length === 0 && tasks.length > 0;

    const handleClose = () => {
        // Notify parent component about upload status for toast notification
        if (onClose) {
            onClose(completedTasks.length, failedTasks.length, tasks.length);
        }
        // Clear completed tasks from state
        clearCompleted();
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 w-96 bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-pink-500 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                    <Upload size={18} />
                    <span className="font-bold text-sm">
                        {allComplete
                            ? `${tasks.length} upload${tasks.length > 1 ? 's' : ''} complete`
                            : `Uploading ${activeTasks.length} of ${tasks.length}`
                        }
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white"
                        title={isMinimized ? "Expand" : "Minimize"}
                    >
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>

                    <button
                        onClick={handleClose}
                        className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Progress Bar */}
            {!allComplete && (
                <div className="h-1.5 bg-stone-100">
                    <div
                        className="h-full bg-gradient-to-r from-orange-500 to-pink-500 transition-all duration-300"
                        style={{ width: `${totalProgress}%` }}
                    />
                </div>
            )}

            {/* Content */}
            {!isMinimized && (
                <div className="max-h-96 overflow-y-auto">
                    {/* Active Uploads */}
                    {activeTasks.map((task) => (
                        <div key={task.id} className="px-4 py-3 border-b border-stone-100 hover:bg-stone-50 transition-colors">
                            <div className="flex items-start gap-3">
                                {/* Thumbnail Preview */}
                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-stone-100 flex-shrink-0">
                                    <img
                                        src={task.thumbnailUrl}
                                        alt="Uploading"
                                        className="w-full h-full object-cover"
                                    />
                                    {task.status === 'encrypting' && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>

                                {/* Upload Details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-sm font-medium text-stone-800 truncate">
                                            {task.file.name}
                                        </p>
                                        {task.status === 'failed' ? (
                                            <button
                                                onClick={() => retryUpload(task.id)}
                                                className="p-1 hover:bg-orange-100 rounded transition-colors"
                                                title="Retry"
                                            >
                                                <RefreshCw size={14} className="text-orange-600" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => cancelUpload(task.id)}
                                                className="p-1 hover:bg-red-100 rounded transition-colors"
                                                title="Cancel"
                                            >
                                                <X size={14} className="text-red-600" />
                                            </button>
                                        )}
                                    </div>

                                    {task.status === 'failed' ? (
                                        <div className="flex items-center gap-1 text-red-600">
                                            <XCircle size={12} />
                                            <span className="text-xs">{task.error || 'Upload failed'}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="flex-1 h-1 bg-stone-200 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-orange-500 to-pink-500 transition-all duration-300"
                                                        style={{ width: `${task.progress}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-stone-500 font-medium">{task.progress}%</span>
                                            </div>

                                            <p className="text-xs text-stone-500 capitalize">
                                                {task.status === 'encrypting' && '🔐 Encrypting...'}
                                                {task.status === 'uploading-thumbnail' && '📸 Uploading thumbnail...'}
                                                {task.status === 'uploading-full' && '📤 Uploading full image...'}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Completed Uploads */}
                    {completedTasks.length > 0 && (
                        <div className="px-4 py-3 bg-green-50 border-b border-green-100">
                            <div className="flex items-center gap-2 text-green-700">
                                <CheckCircle size={16} />
                                <span className="text-sm font-medium">
                                    {completedTasks.length} upload{completedTasks.length > 1 ? 's' : ''} complete
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Failed Uploads */}
                    {failedTasks.length > 0 && (
                        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-red-700">
                                    <XCircle size={16} />
                                    <span className="text-sm font-medium">
                                        {failedTasks.length} upload{failedTasks.length > 1 ? 's' : ''} failed
                                    </span>
                                </div>
                                <button
                                    onClick={() => failedTasks.forEach(t => retryUpload(t.id))}
                                    className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                                >
                                    <RefreshCw size={12} />
                                    Retry All
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Minimized Summary */}
            {isMinimized && (
                <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-stone-600">
                        {allComplete ? 'All uploads complete' : `${Math.round(totalProgress)}% complete`}
                    </span>
                    {allComplete && (
                        <CheckCircle size={16} className="text-green-600" />
                    )}
                </div>
            )}
        </div>
    );
};
