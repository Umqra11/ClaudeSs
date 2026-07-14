import { defineConfig } from 'vitest/config'

// Ayrı config: vite.config.ts'teki VitePWA eklentisi test ortamında
// gereksiz — testler saf mantık modüllerini (lib/) hedefler.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
