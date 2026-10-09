import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
    __DEV__: JSON.stringify(true),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react-native': 'react-native-web',
      'llama.rn': path.resolve(__dirname, './src/services/ai/__mocks__/llama.rn.web.ts'),
      '@op-engineering/op-sqlite': path.resolve(__dirname, './src/services/transit/__mocks__/op-sqlite.web.ts'),
      'react-native-fs': path.resolve(__dirname, './src/services/storage/__mocks__/rnfs.web.ts'),
    },
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
    ],
  },
  server: {
    port: 3000,
    host: true,
  },
});
