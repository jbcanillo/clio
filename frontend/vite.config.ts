/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ include: /\.(jsx|tsx|js|ts)$/ })],
  esbuild: { loader: 'tsx', include: /src\/.*\.[jt]sx?$/, exclude: [] },
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'tsx' } } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: false,
    server: { deps: { inline: [/react-leaflet/, /@react-leaflet/] } },
  },
});
