import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import "dotenv/config";

// Fallback to standard local development defaults if env vars are missing
const rawPort = process.env.PORT || '5173';
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  server: {
    port,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:3000',
        // It is CRITICAL that changeOrigin is false (which is the default). 
        // This ensures the Host header remains localhost:5173 so it perfectly 
        // matches the Origin header, passing your backend's CSRF check!
        changeOrigin: false, 
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    // Standard Vite natively handles the runtime error overlay.
    // Proprietary IDE plugins (Cartographer, DevBanner) have been removed.
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});