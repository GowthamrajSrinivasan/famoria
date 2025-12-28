/**
 * Migration Script: Add videoCount to existing albums
 * 
 * This script updates all existing albums to include the videoCount field
 * and recalculates both photoCount and videoCount based on actual data.
 * 
 * Run this once to migrate existing data.
 */

import { db } from '../lib/firebase';
import { collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore';

async function migrateAlbumCounts() {
    console.log('Starting album counts migration...');

    try {
        // Get all albums
        const albumsSnapshot = await getDocs(collection(db, 'albums'));
        console.log(`Found ${albumsSnapshot.docs.length} albums to migrate`);

        let updated = 0;

        for (const albumDoc of albumsSnapshot.docs) {
            const albumId = albumDoc.id;
            const albumData = albumDoc.data();

            console.log(`\nProcessing album: ${albumData.name} (${albumId})`);

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

            console.log(`  Photos: ${photoCount}, Videos: ${videoCount}`);

            // Update album with correct counts
            await updateDoc(doc(db, 'albums', albumId), {
                photoCount: photoCount,
                videoCount: videoCount
            });

            updated++;
            console.log(`  ✓ Updated`);
        }

        console.log(`\n✅ Migration complete! Updated ${updated} albums.`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration
migrateAlbumCounts()
    .then(() => {
        console.log('\n🎉 All done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration failed:', error);
        process.exit(1);
    });
