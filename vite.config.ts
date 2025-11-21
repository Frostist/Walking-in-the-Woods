import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000 // Increase warning limit to 1MB (optional)
  },
  define: {
    // Inject build timestamp as environment variable
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(Date.now())
  }
});

