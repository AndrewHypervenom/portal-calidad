import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function apiPortal(): Plugin {
  return {
    name: 'portal-calidad-api',
    async configureServer(server) {
      const { crearApi } = await import('./server/api.mjs')
      server.middlewares.use(crearApi())
    },
    async configurePreviewServer(server) {
      const { crearApi } = await import('./server/api.mjs')
      server.middlewares.use(crearApi())
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(process.env.VITEST ? [] : [apiPortal()])],
  server: { port: 5191, strictPort: false, watch: { ignored: ['**/datos/**'] } },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
