import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadNodeConfig, publicBrowserConfig } from './config/node'

const nodeConfig = loadNodeConfig()
const appConfig = nodeConfig.app

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __MN_WEB_CONFIG__: JSON.stringify(publicBrowserConfig(nodeConfig.raw)),
  },
  server: {
    host: appConfig.webUiHost,
    port: appConfig.webUiPort,
    proxy: {
      '/api': {
        target: `http://${appConfig.apiHost}:${appConfig.apiPort}`,
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
