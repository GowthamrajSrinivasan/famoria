import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationService } from '../services/notificationService';
import { Notification } from '../types';
import { NotificationItem } from './NotificationItem';

interface NotificationBellProps {
    userId: string;
    onNotificationClick: (notification: Notification) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ userId, onNotificationClick }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = notificationService.subscribeToNotifications(userId, (newNotifications) => {
            setNotifications(newNotifications);
        });
        return () => unsubscribe();
    }, [userId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const handleMarkAllRead = async () => {
        await notificationService.markAllAsRead(userId);
    };

    const handleItemClick = async (notification: Notification) => {
        if (!notification.isRead) {
            await notificationService.markAsRead(notification.id);
        }
        onNotificationClick(notification);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all"
            >
                <Bell size={20} strokeWidth={1.5} />
                {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden animate-fade-in-up z-50">
                    <div className="p-3 border-b border-stone-50 flex items-center justify-between bg-stone-50/50">
                        <h3 className="font-bold text-stone-800 text-sm">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllRead}
                                className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
                            >
                                <CheckCheck size={14} /> Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-stone-400">
                                <Bell size={32} className="mx-auto mb-2 opacity-20" />
                                <p className="text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map(notification => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onClick={handleItemClick}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
