import 'dotenv/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';
import { cmsDevApiPlugin } from './vite-dev-api';

export default defineConfig(() => {
  const customProxyTarget = process.env.VITE_API_PROXY;

  return {
    plugins: [react(), tailwindcss(), !customProxyTarget ? cmsDevApiPlugin() : null].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: ['es2019', 'safari13'],
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/motion/')) {
              return 'vendor-motion';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      proxy: customProxyTarget
        ? {
            '/api': {
              target: customProxyTarget,
              changeOrigin: true,
              configure: (proxy) => {
                proxy.on('error', (_err, _req, res) => {
                  if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'Proxy service unavailable' }));
                  }
                });
              },
            },
          }
        : undefined,
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
