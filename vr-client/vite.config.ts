import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    open: false,
    https: false // Note: WebXR requires HTTPS in production, but can use HTTP for local dev
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000
  },
  define: {
    // Inject build timestamp as environment variable
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(Date.now())
  }
});

