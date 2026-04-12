import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  outDir: './dist',
  build: {
    assets: '_assets'
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'he'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  vite: {
    ssr: {
      noExternal: []
    },

    plugins: [tailwindcss()]
  }
});
