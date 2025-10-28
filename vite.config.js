import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

// Vite configuration tailored for existing ES modules, CDN externals, and Electron compatibility
export default defineConfig({
  base: './', // relative paths (important for Electron and static hosting)
  root: '.',
  publicDir: 'data', // serve data/ as static assets
  server: {
    port: 5173,
    strictPort: true,
    open: false,
    cors: true,
    proxy: {
      '/arcgis-tiles': {
        target: 'https://services.arcgisonline.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/arcgis-tiles/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    target: 'es2020',
    minify: 'terser',
    rollupOptions: {
      input: {
        main: './index.html',
      },
      // Keep CDN libraries external by not importing them from JS; they remain in index.html
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  plugins: [
    legacy({ targets: ['defaults', 'not IE 11'] }),
  ],
  optimizeDeps: {
    // Pre-bundle any deps if needed, e.g., 'shpjs' if imported from JS later
    include: [],
  },
  esbuild: {
    legalComments: 'none',
  },
});
