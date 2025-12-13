// V4 Cross-Tab Synchronization
// Handles sharing unlocked album keys across browser tabs via BroadcastChannel

const CHANNEL_NAME = 'famoria_key_sync';

interface KeySyncCallbacks {
    onUnlock: (albumId: string, key: Uint8Array) => void;
    onLockAll: () => void;
    getKeys: () => Record<string, Uint8Array>;
}

export function setupKeySync(callbacks: KeySyncCallbacks): () => void {
    const channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = (event) => {
        const { type, albumId, key } = event.data;

        switch (type) {
            case 'REQUEST_KEY':
                // Another tab is asking for keys
                const keys = callbacks.getKeys();
                if (keys[albumId]) {
                    channel.postMessage({
                        type: 'SYNC_KEY',
                        albumId,
                        key: Array.from(keys[albumId])
                    });
                }
                break;

            case 'SYNC_KEY':
                // Received key from another tab
                if (key && albumId) {
                    callbacks.onUnlock(albumId, new Uint8Array(key));
                }
                break;

            case 'LOCK_ALL':
                // Another tab requested global lock
                callbacks.onLockAll();
                break;
        }
    };

    // Cleanup function
    return () => {
        channel.close();
    };
}

export function broadcastUnlock(albumId: string, key: Uint8Array) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({
        type: 'SYNC_KEY',
        albumId,
        key: Array.from(key)
    });
    channel.close();
}

export function broadcastLock() {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'LOCK_ALL' });
    channel.close();
}
