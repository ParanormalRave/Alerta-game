import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  // Rapier ships as a WASM-backed package; let Vite serve it without pre-bundling.
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  // Pin an inline (empty) PostCSS config so Vite does NOT walk up to a stray
  // postcss.config.js in a parent directory (e.g. the user home folder).
  css: {
    postcss: {},
  },
  build: {
    target: 'esnext',
  },
});
