import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      minify: false,
      sourcemap: false,
      rollupOptions: {
        output: {
          generatedCode: {
            constBindings: false,
          },
          manualChunks(id) {
            // Isolate @supabase packages into their own chunk — they have complex
            // internal circular deps that Rollup can mis-order, causing TDZ.
            if (id.includes('@supabase')) return 'vendor-supabase';
            // Isolate lucide-react to avoid cross-chunk binding TDZ with lazy screens.
            if (id.includes('lucide-react')) return 'vendor-lucide';
            // All other node_modules go to a shared vendor chunk loaded before app code.
            if (id.includes('node_modules')) return 'vendor';
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
