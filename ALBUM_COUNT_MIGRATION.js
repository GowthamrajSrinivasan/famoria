/**
 * Browser Console Migration Script
 * 
 * Copy and paste this into your browser console while on localhost:3000
 * to update all existing albums with videoCount field.
 * 
 * INSTRUCTIONS:
 * 1. Open your app in the browser
 * 2. Open DevTools (F12 or Cmd+Option+I)
 * 3. Go to Console tab
 * 4. Copy and paste this entire code
 * 5. Press Enter
 * 6. Wait for "Migration complete!" message
 */

(async function migrateAlbumCounts() {
    console.log('🚀 Starting album counts migration...');

    try {
        // Import Firebase from the global window object
        const { db } = window;
        if (!db) {
            console.error('❌ Firebase not found. Make sure you\'re on the app page.');
            return;
        }

        const { collection, getDocs, updateDoc, doc, query, where } = await import('firebase/firestore');

        // Get all albums
        const albumsSnapshot = await getDocs(collection(db, 'albums'));
        console.log(`📦 Found ${albumsSnapshot.docs.length} albums to migrate`);

        let updated = 0;

        for (const albumDoc of albumsSnapshot.docs) {
            const albumId = albumDoc.id;
            const albumData = albumDoc.data();

            console.log(`\n📝 Processing: ${albumData.name}`);

            // Count photos/posts in this album
            const postsQuery = query(
                collection(db, 'posts'),
                where('albumId', '==', albumId)
            );
            const postsSnapshot = await getDocs(postsQuery);
            const photoCount = postsSnapshot.docs.length;

            // Count videos in this album
            const videosQuery = query(
                collection(db, 'videos'),
                where('albumId', '==', albumId)
            );
            const videosSnapshot = await getDocs(videosQuery);
            const videoCount = videosSnapshot.docs.length;

            console.log(`  📸 Photos: ${photoCount}, 🎬 Videos: ${videoCount}`);

            // Update album
            await updateDoc(doc(db, 'albums', albumId), {
                photoCount: photoCount,
                videoCount: videoCount
            });

            updated++;
            console.log(`  ✅ Updated!`);
        }

        console.log(`\n🎉 Migration complete! Updated ${updated} albums.`);
        console.log('💡 Refresh the page to see the updated counts.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
})();
