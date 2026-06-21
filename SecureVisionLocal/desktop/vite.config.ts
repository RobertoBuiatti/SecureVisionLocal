import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'node:path';

// Configuração do Vite + Electron.
// - O renderer (UI React) é servido/empacotado pelo Vite.
// - O main process e o preload são compilados pelo vite-plugin-electron.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@core': resolve(__dirname, 'electron/core'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        // Processo principal (Node.js)
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // Módulos nativos / com binários não devem ser empacotados pelo Rollup.
              external: [
                'better-sqlite3',
                'fluent-ffmpeg',
                'ffmpeg-static',
                'onvif',
                'node-ssdp',
                'bonjour-service',
                'ws',
                'electron-updater',
                'onnxruntime-node',
              ],
            },
          },
        },
      },
      {
        // Script de preload (bridge segura)
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: { outDir: 'dist-electron' },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
});
