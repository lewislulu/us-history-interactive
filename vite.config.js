import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    target: 'es2018',
    outDir: 'dist',
    assetsDir: 'assets',
  },
  assetsInclude: ['**/*.md'],
});
