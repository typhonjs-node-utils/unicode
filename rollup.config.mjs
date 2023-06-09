import replace    from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import dts        from 'rollup-plugin-dts';

// Produce sourcemaps or not.
const sourcemap = true;

/**
 * @type {import('@rollup/plugin-replace').RollupReplaceOptions}
 */
const replaceOptions = {
   values: {
      '#runtime/data/compress': 'fflate',
      '#runtime/data/format/base64': 'js-base64',
   },
   preventAssignment: true,
   delimiters: ['', '']
};

const externalTRL = [/#runtime\/*/g];

export default () =>
{
   return [
      // Main Distribution Bundles -----------------------------------------------------------------------------------
      {
         input: 'src/grapheme/index.ts',
         output: [{
            file: './dist/index.js',
            format: 'es',
            generatedCode: { constBindings: true },
            sourcemap,
         }],
         plugins: [
            replace(replaceOptions),
            typescript({ include: ['src/**/*'] })
         ]
      },
      {
         input: 'src/unicode-trie/index.ts',
         output: [{
            file: './dist/unicode-trie/index.js',
            format: 'es',
            generatedCode: { constBindings: true },
            sourcemap,
         }],
         plugins: [
            replace(replaceOptions),
            typescript({ include: ['src/**/*'] })
         ]
      },

      // Main TS Declaration Bundles ---------------------------------------------------------------------------------
      {
         input: 'src/grapheme/index.ts',
         output: [{
            file: `./dist/index.d.ts`,
            format: 'es',
            sourcemap: false
         }],
         plugins: [
            replace(replaceOptions),
            dts()
         ]
      },
      {
         input: 'src/unicode-trie/index.ts',
         output: [{
            file: `./dist/unicode-trie/index.d.ts`,
            format: 'es',
            sourcemap: false
         }],
         plugins: [
            replace(replaceOptions),
            dts()
         ]
      },

      // TRL Distribution Bundles ------------------------------------------------------------------------------------
      {
         input: 'src/grapheme/index.ts',
         output: [{
            file: './dist-trl/index.js',
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
            file: './dist-trl/unicode-trie/index.js',
            format: 'es',
            generatedCode: { constBindings: true },
            sourcemap,
         }],
         plugins: [
            typescript({ include: ['src/**/*'] })
         ]
      },

      // TRL TS Declaration Bundles ----------------------------------------------------------------------------------
      {
         input: 'src/grapheme/index.ts',
         output: [{
            file: `./dist-trl/index.d.ts`,
            format: 'es',
            sourcemap: false
         }],
         plugins: [
            dts()
         ]
      },
      {   // This bundle is for bundled types.
         input: 'src/unicode-trie/index.ts',
         output: [{
            file: `./dist-trl/unicode-trie/index.d.ts`,
            format: 'es',
            sourcemap: false
         }],
         plugins: [
            dts()
         ]
      },
   ];
};
