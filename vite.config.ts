import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// Base44 sandbox/preview only: a service worker in the dev preview caches the app, so a
// stale precache from an earlier (possibly broken) build keeps being served and an update
// looks like it never started. Gate on the exact flag value; unset/other values keep the
// project's original behaviour.
const previewMode = process.env.BASE44_PREVIEW_MODE === '1';

const previewServiceWorkerCleanup = () => ({
  name: 'base44-preview-sw-cleanup',
  transformIndexHtml: () => [
    {
      tag: 'script',
      injectTo: 'head-prepend' as const,
      children: `(function(){if(!('serviceWorker' in navigator))return;var had=!!navigator.serviceWorker.controller;navigator.serviceWorker.getRegistrations().then(function(regs){if(regs.length)had=true;return Promise.all(regs.map(function(r){return r.unregister();}));}).then(function(){return window.caches?caches.keys():[];}).then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));}).then(function(){if(had&&!sessionStorage.getItem('base44-preview-sw-cleared')){sessionStorage.setItem('base44-preview-sw-cleared','1');location.reload();}}).catch(function(){});})();`,
    },
  ],
});

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      ...(previewMode ? [previewServiceWorkerCleanup()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Resonix Handpan Tuner & Acoustic Lab',
          short_name: 'Resonix',
          description: 'Precision multi-partial Handpan Tuner & Acoustic Spectral Analyzer',
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
          // No dev service worker in the sandbox preview (see previewMode above).
          enabled: !previewMode,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
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
