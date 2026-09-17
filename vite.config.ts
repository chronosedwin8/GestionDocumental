import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El cliente NO lleva secretos: la única variable pública es VITE_API_URL.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // Permite usar rutas relativas /api en desarrollo sin CORS.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // `DynamicIcon` resuelve iconos por nombre desde el catálogo, así que
        // lucide no se puede sacudir en árbol: se aísla en su propio chunk
        // cacheable en lugar de engordar el bundle de la aplicación.
        manualChunks: {
          icons: ['lucide-react'],
          router: ['react-router-dom'],
        },
      },
    },
  },
});
