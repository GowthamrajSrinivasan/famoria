import { useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes
const LAST_ACTIVE_KEY = 'famoria_last_active';

export function useAutoLock() {
    const { isFamilyAuthenticated, lockFamily } = useAuth();

    // We only need to lock if we are currently authenticated
    const shouldLock = isFamilyAuthenticated;

    const lock = useCallback(() => {
        if (shouldLock) {
            console.log('🔒 Auto-locking session due to inactivity');
            lockFamily();
        }
    }, [shouldLock, lockFamily]);

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
        if (!shouldLock) return;

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
            checkAutoLock();
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
    }, [shouldLock, lock, updateActivity, checkAutoLock]);

    return { lock };
}
