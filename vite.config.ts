import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
} as any);
