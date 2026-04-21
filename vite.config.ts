import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Redirect next-intl imports to our i18next compatibility layer
      'next-intl': path.resolve(__dirname, './src/i18n/compat-next-intl.ts'),
      // next-auth/react is not needed in desktop mode
      'next-auth/react': path.resolve(__dirname, './src/compat/next-auth-react.ts'),
      // next/image → plain img
      'next/image': path.resolve(__dirname, './src/compat/next-image.ts'),
      // next/navigation → react-router wrappers
      'next/navigation': path.resolve(__dirname, './src/compat/next-navigation.ts'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5173,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
