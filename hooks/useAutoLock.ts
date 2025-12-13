import { useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes
const LAST_ACTIVE_KEY = 'famoria_last_active';

export function useAutoLock() {
    const { albumKeys, lockAll } = useAuth();
    const hasUnlockedAlbums = Object.keys(albumKeys).length > 0;

    const lock = useCallback(() => {
        if (hasUnlockedAlbums) {
            console.log('🔒 Auto-locking session due to inactivity');
            lockAll();
        }
    }, [hasUnlockedAlbums, lockAll]);

    const updateActivity = useCallback(() => {
        localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    }, []);

    const checkAutoLock = useCallback(() => {
        const lastActive = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
        const now = Date.now();
        if (now - lastActive > AUTO_LOCK_MS) {
            lock();
        }
    }, [lock]);

    useEffect(() => {
        if (!hasUnlockedAlbums) return;

        // Initialize activity timestamp
        updateActivity();

        // Event listeners for user activity
        const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
        const handleActivity = () => {
            updateActivity();
        };

        // Throttle activity updates to once per second to avoid perf hit
        let throttleTimeout: NodeJS.Timeout | null = null;
        const throttledHandler = () => {
            if (!throttleTimeout) {
                handleActivity();
                throttleTimeout = setTimeout(() => {
                    throttleTimeout = null;
                }, 1000);
            }
        };

        events.forEach(event => window.addEventListener(event, throttledHandler));

        // Visibility change handler
        const handleVisibilityChange = () => {
            if (document.hidden) {
                lock();
            } else {
                checkAutoLock();
            }
        };

        // Check periodically
        const interval = setInterval(checkAutoLock, 60 * 1000); // Check every minute

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            events.forEach(event => window.removeEventListener(event, throttledHandler));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(interval);
            if (throttleTimeout) clearTimeout(throttleTimeout);
        };
    }, [hasUnlockedAlbums, lock, updateActivity, checkAutoLock]);

    return { lock };
}
