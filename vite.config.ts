import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA manifest'i Faz 5'te cilalanacak; şimdilik temel kurulabilirlik yeterli.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'KPSS Takip',
        short_name: 'KPSS Takip',
        description: 'KPSS çalışma süresi takibi',
        lang: 'tr',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0f766e',
        background_color: '#f6f7f7',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})
