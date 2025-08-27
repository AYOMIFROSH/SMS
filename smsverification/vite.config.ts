import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command, mode }) => {
  // Load environment variables based on mode
  const env = loadEnv(mode, process.cwd(), '');

  const isProduction = mode === 'production';
  const isDevelopment = mode === 'development';

  return {
    plugins: [
      react(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@types': path.resolve(__dirname, './src/types'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@services': path.resolve(__dirname, './src/services'),
        '@assets': path.resolve(__dirname, './src/assets'),
      },
    },

    // Environment-specific server configuration
    server: isDevelopment ? {
      port: parseInt(env.VITE_DEV_PORT) || 5173,
      host: true, // Allow external connections
      strictPort: true,
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
      },
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5000',
          changeOrigin: true,
          secure: false, // Set to true in production with HTTPS
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Proxy error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Sending Request:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Received Response:', proxyRes.statusCode, req.url);
            });
          },
        },
      },
    } : undefined,

    // Production build optimizations
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: !isProduction, // Source maps only in non-production
      minify: isProduction ? 'terser' : false,

      // Chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            // Separate vendor chunk for React
            vendor: ['react', 'react-dom'],

            // Utility libraries chunk (only include installed packages)
            utils: ['axios'],
          },
          // Asset naming for better caching
          chunkFileNames: isProduction
            ? 'assets/js/[name].[hash].js'
            : 'assets/js/[name].js',
          entryFileNames: isProduction
            ? 'assets/js/[name].[hash].js'
            : 'assets/js/[name].js',
          assetFileNames: isProduction
            ? 'assets/[ext]/[name].[hash].[ext]'
            : 'assets/[ext]/[name].[ext]',
        },
      },

      // Terser options for production minification
      terserOptions: isProduction ? {
        compress: {
          drop_console: true, // Remove console logs in production
          drop_debugger: true,
        },
      } : undefined,

      // Build target for better browser support
      target: 'es2020',
    },

    // Define global constants
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },

    // CSS handling
    css: {
      devSourcemap: isDevelopment,
      preprocessorOptions: {
        scss: {
          // Global SCSS variables if using SCSS
          additionalData: `@import "@/styles/variables.scss";`,
        },
      },
    },

    // Preview server configuration (for production preview)
    preview: {
      port: parseInt(env.VITE_PREVIEW_PORT) || 4173,
      host: true,
      strictPort: true,
    },

    // Optimization
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
      ],
    },

    // Security headers for development (production should be handled by your server)
    // Note: Headers are already included in the server config above
  };
});