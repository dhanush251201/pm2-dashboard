import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = `http://127.0.0.1:${process.env.PM2_DASHBOARD_PORT || 9700}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    proxy: {
      '/api': { target: api },
      '/ws': { target: api.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
