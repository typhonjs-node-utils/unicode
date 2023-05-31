import typescript          from '@rollup/plugin-typescript';
import dts                 from 'rollup-plugin-dts';

// Produce sourcemaps or not.
const sourcemap = true;

export default () =>
{
   return [
      {   // This bundle is for the Node distribution.
         input: 'src/index.ts',
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

      {   // This bundle is for bundled types.
         input: 'src/index.ts',
         output: [{
            file: `./dist/index.d.mts`,
            format: 'es',
            sourcemap: false
         }],
         plugins: [
            typescript({ include: ['src/**/*'], sourceMap: false, inlineSources: false }),
            dts()
         ]
      }
   ];
};
