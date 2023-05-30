import {
   configDefaults,
   defineConfig } from 'vitest/config'

export default defineConfig({
   test: {
      exclude: [...configDefaults.exclude],
      include: ['./test/**/*.test.ts'],
      coverage: {
         exclude: ['test/**'],
         provider: 'c8',
         reporter: ['text', 'json', 'html']
      },
      reporters: ['default', 'html'],
      globals: true
   }
});