import fs            from 'node:fs';

import {
   graphemeIterator,
   graphemeSplit }   from '../../src';

describe('Grapheme API Tests', () =>
{
   describe('GraphemeBreakTest', () =>
   {
      const tests = parseTestData();

      describe('graphemeSplit(string)', () =>
      {
         for (const test of tests)
         {
            it(test.description, () =>
            {
               const got = graphemeSplit(test.expected.join(''));

               assert.deepStrictEqual(
                got,
                test.expected,
                `unexpected grapheme clusters. expected: ${test.expected}, but got: ${got} # ${test.description}`
               );
            });
         }
      });

      describe('graphemeIterator(string)', () =>
      {
         for (const test of tests)
         {
            it(test.description, () =>
            {
               const got = [...graphemeIterator(test.expected.join(''))];

               assert.deepStrictEqual(
                got,
                test.expected,
                `unexpected grapheme clusters. expected: ${test.expected}, but got: ${got} # ${test.description}`
               );
            });
         }
      });

      describe.skip('Iterator Test', () =>
      {
         it('graphemeIterator', () =>
         {
            // const result = [...graphemeIterator('👨‍👩‍👧🌈🍎🚀🎈🍕')];
            const result = [...graphemeIterator('👨‍👩‍👧👨‍👩‍👧‍👦👩‍👩‍👦‍👦👨‍👨‍👧‍👧👩‍❤️‍👩👨‍❤️‍👨👩‍❤️‍💋‍👨👨‍🍳')];
            // const result = [...graphemeIterator('👩‍❤️‍👩')];
            // const result = [...graphemeIterator('👩‍❤️‍👩👨‍❤️‍👨👩‍❤️‍💋‍👨')];
            // const result = graphemeSplit('👩‍❤️‍👩👨‍❤️‍👨👩‍❤️‍💋‍👨');
            // const result = graphemeSplit('👨‍👩‍👧🌈🍎🚀🎈🍕');

            console.log(`!!! RESULT: `, result);
            console.log(`!!! RESULT: `, result.join(''));
         });
      });
   });
});

function parseTestData()
{
   const breakTestLines = fs.readFileSync('./test/fixture/GraphemeBreakTest.txt', 'utf-8').split('\n');

   const tests = [];

   for (const line of breakTestLines)
   {
      if (line.startsWith('#')) { continue; }

      const [body, description] = line.split("#");
      const test = body.trim();

      const graphemeClusters = test
       .split("÷")
       .filter((x) => x.length > 0)
       .map((x) => {
          const codePoints = x
           .split("×")
           .map((y) => parseInt(y.trim(), 16));
          return String.fromCodePoint(...codePoints);
       });

      tests.push({ expected: graphemeClusters, description });
   }

   return tests;
}
