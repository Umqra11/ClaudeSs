import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'KPSS Takip',
        short_name: 'KPSS Takip',
        description:
          'KPSS çalışma süresi takibi — kronometre, haftalık toplam ve arkadaş odalarıyla canlı sıralama',
        lang: 'tr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f766e',
        background_color: '#f6f7f7',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Firebase Auth yardımcı yolları SPA fallback'ine takılmasın
        navigateFallbackDenylist: [/^\/__\//],
        // Not: runtimeCaching tanımlanmadı — Firestore/googleapis istekleri
        // service worker cache'ine girmez, daima ağa gider.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Firebase chunk'ı precache dışı: yerel modda hiç indirilmez;
        // Firebase modunda zaten ağ varken dinamik olarak yüklenir.
        globIgnores: ['**/firebaseBackend-*.js'],
      },
    }),
  ],
})
