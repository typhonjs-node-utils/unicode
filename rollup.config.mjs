import typescript          from '@rollup/plugin-typescript';
import dts                 from 'rollup-plugin-dts';

// Produce sourcemaps or not.
const sourcemap = true;

export default () =>
{
   return [
      {   // This bundle is for the Node distribution.
         input: 'src/grapheme/index.ts',
         output: [{
            file: './dist/index.js',
            format: 'es',
            generatedCode: { constBindings: true },
            sourcemap,
         }],
         plugins: [
            typescript({ include: ['src/**/*'] })
         ]
      },
      {   // This bundle is for the Node distribution.
         input: 'src/unicode-trie/index.ts',
         output: [{
            file: './dist/unicode-trie/index.js',
            format: 'es',
            generatedCode: { constBindings: true },
            sourcemap,
         }],
         plugins: [
            typescript({ include: ['src/**/*'] })
         ]
      },

      {   // This bundle is for bundled types.
         input: 'src/grapheme/index.ts',
         output: [{
            file: `./dist/index.d.mts`,
            format: 'es',
            sourcemap: false
         }],
         plugins: [
            typescript({ include: ['src/**/*'], sourceMap: false, inlineSources: false }),
            dts()
         ]
      },
      {   // This bundle is for bundled types.
         input: 'src/unicode-trie/index.ts',
         output: [{
            file: `./dist/unicode-trie/index.d.mts`,
            format: 'es',
            sourcemap: false
         }],
         plugins: [
            typescript({ include: ['src/**/*'], sourceMap: false, inlineSources: false }),
            dts()
         ]
      },
   ];
};
