import {
   configDefaults,
   defineConfig } from 'vitest/config'

export default defineConfig({
   test: {
      exclude: [...configDefaults.exclude],
      include: ['./test/**/*.test.ts'],
      coverage: {
         include: ['src/**'],
         exclude: ['test/**', 'src/grapheme/generate/**', 'src/unicode-trie/types.ts'],
         provider: 'v8',
         reporter: ['text', 'json', 'html']
      },
      reporters: ['default', 'html'],
      globals: true
   }
});
