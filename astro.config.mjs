import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://daliife.github.io',
  base: '/star-trek-weather-station/',
  compressHTML: false,
});
