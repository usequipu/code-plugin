import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  // Quipu's plugin loader evaluates only `index.js` — there is no <link rel="stylesheet">
  // step. Monaco ships CSS for its editor chrome (cursor, suggestion widgets, etc.),
  // so we inject that CSS into a runtime <style> tag from inside the JS bundle.
  plugins: [react(), cssInjectedByJsPlugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.browser': 'true',
    'process.version': JSON.stringify(''),
  },
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: true,
  },
});
