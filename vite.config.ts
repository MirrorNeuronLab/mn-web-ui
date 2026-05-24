import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiHost = process.env.MN_API_HOST || 'localhost'
const apiPort = process.env.MN_API_PORT || '54001'
const webUiHost = process.env.MN_WEB_UI_HOST || 'localhost'
const webUiPort = Number(process.env.MN_WEB_UI_PORT || '55173')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ['VITE_', 'MN_'],
  server: {
    host: webUiHost,
    port: webUiPort,
    proxy: {
      '/api': {
        target: `http://${apiHost}:${apiPort}`,
        changeOrigin: true,
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: [...configDefaults.exclude, 'e2e/**'],
  }
})
