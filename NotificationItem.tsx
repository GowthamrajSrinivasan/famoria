import React from 'react';
import { Notification } from '../types';
import { Heart, MessageCircle, User, Image as ImageIcon } from 'lucide-react';

interface NotificationItemProps {
    notification: Notification;
    onClick: (notification: Notification) => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClick }) => {
    const getIcon = () => {
        switch (notification.type) {
            case 'like': return <Heart size={14} className="text-red-500 fill-red-500" />;
            case 'comment': return <MessageCircle size={14} className="text-blue-500 fill-blue-500" />;
            case 'tag': return <User size={14} className="text-orange-500" />;
            default: return <ImageIcon size={14} className="text-stone-500" />;
        }
    };

    const getTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    return (
        <div
            onClick={() => onClick(notification)}
            className={`p-3 hover:bg-stone-50 cursor-pointer transition-colors flex gap-3 items-start border-b border-stone-50 last:border-0 ${!notification.isRead ? 'bg-orange-50/30' : ''}`}
        >
            <div className="relative">
                <img
                    src={notification.actorAvatar || `https://ui-avatars.com/api/?name=${notification.actorName}`}
                    alt={notification.actorName}
                    className="w-10 h-10 rounded-full object-cover border border-stone-100"
                />
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-stone-100">
                    {getIcon()}
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-800 leading-snug">
                    <span className="font-semibold">{notification.actorName}</span> {notification.message.replace(notification.actorName, '')}
                </p>
                <p className="text-xs text-stone-400 mt-1">{getTimeAgo(notification.createdAt)}</p>
            </div>

            {!notification.isRead && (
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0" />
            )}
        </div>
    );
};
