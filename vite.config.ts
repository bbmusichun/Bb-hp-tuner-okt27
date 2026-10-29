import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        // Keep the personal reference recording available after the app has been installed/offline-cached.
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,txt,woff2,mp3}'],
          // An unrelated 6 MB AI Studio image is too large for precache; omit it but keep the small handpan MP3.
          globIgnores: ['**/assets/aistudio/IMG_5394_912014bf.png'],
        },
        manifest: {
          id: '/',
          name: 'Hangoal – Handpan hangoló és felhangelemző',
          short_name: 'Hangoal',
          description: 'Mobil handpan hangoló valós idejű hangfelismeréssel, felhangelemzéssel, hangszerprofilokkal és mérési naplóval.',
          theme_color: '#0d1117',
          background_color: '#090d16',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
