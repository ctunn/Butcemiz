import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
} as any);
