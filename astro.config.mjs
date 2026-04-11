import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  outDir: './dist',
  build: {
    assets: '_assets'
  },
  vite: {
    ssr: {
      noExternal: []
    },

    plugins: [tailwindcss()]
  }
});