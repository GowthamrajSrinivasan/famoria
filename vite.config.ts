import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React into its own chunk
          'react-vendor': ['react', 'react-dom'],
          // Split Firebase into its own chunk (large library)
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          // Split Gemini AI into its own chunk
          'gemini': ['@google/genai'],
          // Split UI components
          'ui': ['lucide-react']
        }
      }
    },
    // Increase chunk size warning limit (we've split the chunks properly)
    chunkSizeWarningLimit: 600
  }
});
