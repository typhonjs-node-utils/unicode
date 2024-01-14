// TODO ts-node is currently broken on Node 20. Substitute to TS version when it works!

import fs                     from 'node:fs';
import https                  from 'node:https';
import stream                 from 'node:stream';
import split2                 from 'split2';

import { UnicodeTrieBuilder } from '../../unicode-trie';

import { UAX29 }              from '../types';

https.get('https://www.unicode.org/Public/15.0.0/ucd/auxiliary/GraphemeBreakProperty.txt', (res) =>
{
   const { statusCode } = res;

   if (statusCode !== 200)
   {
      console.error(`failed to request: ${statusCode}`);
      res.resume();
      return;
   }

   const trie = new UnicodeTrieBuilder(UAX29.ClusterBreak.Other);

   res
   .setEncoding('utf8')
   .pipe(split2())
   .pipe(parseLine())
   .on('data', ({ start, end, type }: { start: number, end: number, type: string }) =>
    trie.setRange(start, end, UAX29.ClusterBreak[type]))
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
      if (type === 'Extended_Pictographic') { trie.setRange(start, end, UAX29.ClusterBreak.Extended_Pictographic); }
   })
   .on('end', () =>
   {
      fs.writeFileSync(
         './src/grapheme/split/UNICODE_GRAPHEME_B64_EXT_PICT_TRIE.ts',
         `export const UNICODE_GRAPHEME_B64_EXT_PICT_TRIE = '${trie.toBuffer().toString('base64')}';`
      );
   });
});

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

         const [rawRange, type] = body.split(';').map((x) => x.trim());
         const range = rawRange.split('..').map((x) => parseInt(x, 16));

         this.push({ start: range[0], end: range[range.length > 1 ? 1 : 0], type });

         callback();
      }
   });
}
