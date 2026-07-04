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
        // Firebase chunk'ı DAHİL tüm derleme çıktıları precache'te: her SW
        // sürümü kendi chunk setini bütün taşır. (Chunk hariç tutulduğunda,
        // yeni deploy eski hash'li dosyayı sunucudan sildiği için bayat
        // istemcilerde dinamik import patlıyor ve oturum çözülemiyordu.)
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // 684KB'lık firebase chunk'ının precache'e girebilmesi için sınır
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
})
