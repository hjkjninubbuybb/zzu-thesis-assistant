import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'rag-portals',
      configureServer(server) {
        return () => {
          const addr = server.httpServer?.address();
          const port = typeof addr === 'object' && addr ? addr.port : 5173;
          server.config.logger.info(
            `\n  📚  学生端:  \x1b[36mhttp://localhost:${port}/student\x1b[0m` +
              `\n  🎓  管理端:  \x1b[36mhttp://localhost:${port}/admin\x1b[0m\n`,
          );
        };
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@features': path.resolve(__dirname, './src/features'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@pages': path.resolve(__dirname, './src/pages'),
    },
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
