// TODO Stick with old CJS data generation script until ts-node works on Node 20.. Oi!

const fs =           require('node:fs');
const https =        require('node:https');
const stream =       require('node:stream');
const split2 =       require('split2');

function parseLine()
{
   return new stream.Transform({
      decodeStrings: false,
      readableObjectMode: true,

      transform(line, encoding, callback)
      {
         const body = line.split('#')[0];

         if (body.trim().length === 0)
         {
            callback();
            return;
         }

         const [rawRange, type] = body.split(";").map((x) => x.trim());
         const range = rawRange.split("..").map((x) => parseInt(x, 16));

         this.push({ start: range[0], end: range[range.length > 1 ? 1 : 0], type });

         callback();
      }
   });
}

/**
 * Defines useful constants from Unicode Annex #29 - Unicode Text Segmentation.
 *
 * TODO: Nasty side effect of not being able to use TS / access internal enum. This will go away when switching to TS.
 *
 * @see https://www.unicode.org/reports/tr29
 */
let UAX29;
(function (UAX29) {
   (function (ClusterBreak) {
      ClusterBreak[ClusterBreak["Other"] = 0] = "Other";
      ClusterBreak[ClusterBreak["CR"] = 1] = "CR";
      ClusterBreak[ClusterBreak["LF"] = 2] = "LF";
      ClusterBreak[ClusterBreak["Control"] = 4] = "Control";
      ClusterBreak[ClusterBreak["Extend"] = 8] = "Extend";
      ClusterBreak[ClusterBreak["ZWJ"] = 16] = "ZWJ";
      ClusterBreak[ClusterBreak["Regional_Indicator"] = 32] = "Regional_Indicator";
      ClusterBreak[ClusterBreak["Prepend"] = 64] = "Prepend";
      ClusterBreak[ClusterBreak["SpacingMark"] = 128] = "SpacingMark";
      ClusterBreak[ClusterBreak["L"] = 256] = "L";
      ClusterBreak[ClusterBreak["V"] = 512] = "V";
      ClusterBreak[ClusterBreak["T"] = 1024] = "T";
      ClusterBreak[ClusterBreak["LV"] = 2048] = "LV";
      ClusterBreak[ClusterBreak["LVT"] = 4096] = "LVT";
      ClusterBreak[ClusterBreak["Extended_Pictographic"] = 8192] = "Extended_Pictographic";
   })(UAX29.ClusterBreak || (UAX29.ClusterBreak = {}));
})(UAX29 || (UAX29 = {}));

// Main --------------------------------------------------------------------------------------------------------------

(async () => {
   const Module = await import('../../../dist/unicode-trie/index.js')
   const UnicodeTrieBuilder = Module.UnicodeTrieBuilder;
   const CB = UAX29.ClusterBreak;

   https.get('https://www.unicode.org/Public/15.0.0/ucd/auxiliary/GraphemeBreakProperty.txt', (res) =>
   {
      const { statusCode } = res;
      if (statusCode !== 200)
      {
         console.error(`failed to request: ${statusCode}`);
         res.resume();
         return;
      }

      const trie = new UnicodeTrieBuilder(CB.Other);

      res
      .setEncoding('utf8')
      .pipe(split2())
      .pipe(parseLine())
      .on('data', ({ start, end, type }) => trie.setRange(start, end, CB[type]))
      .on('end', () =>
      {
         fs.writeFileSync(
            './src/grapheme/split/UNICODE_GRAPHEME_B64_TYPE_TRIE.ts',
            `export const UNICODE_GRAPHEME_B64_TYPE_TRIE = '${trie.toBuffer().toString('base64')}';`
         );
      });
   });

   https.get('https://www.unicode.org/Public/15.0.0/ucd/emoji/emoji-data.txt', (res) =>
   {
      const { statusCode } = res;
      if (statusCode !== 200)
      {
         console.error(`failed to request: ${statusCode}`);
         res.resume();
         return;
      }

       const trie = new UnicodeTrieBuilder();
       res
       .setEncoding('utf8')
       .pipe(split2())
       .pipe(parseLine())
       .on('data', ({ start, end, type }) =>
       {
          if (type === 'Extended_Pictographic') { trie.setRange(start, end, CB.Extended_Pictographic); }
       })
       .on('end', () =>
       {
          fs.writeFileSync(
             './src/grapheme/split/UNICODE_GRAPHEME_B64_EXT_PICT_TRIE.ts',
             `export const UNICODE_GRAPHEME_B64_EXT_PICT_TRIE = '${trie.toBuffer().toString('base64')}';`
          );
       });
   });
})();
