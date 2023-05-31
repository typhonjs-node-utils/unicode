import fs               from 'node:fs';
import { Transform }    from 'node:stream';
import { pipeline }     from 'node:stream/promises';

import {
   ClusterBreak,
   UnicodeTrieBuilder } from '../../../dist/index.js';

const splitIntoLines = new Transform({
   readableObjectMode: true,
   transform(chunk, encoding, callback)
   {
      const lines = chunk.toString().split('\n');

      for (const line of lines) { this.push(line); }

      callback();
   },
});

function parseLine()
{
   return new Transform({
      decodeStrings: false,
      readableObjectMode: true,

      transform(line, encoding, callback)
      {
// console.log(`! L: `, line);
         const body = line.split('#')[0];
         if (body.trim().length === 0)
         {
            callback();
            return;
         }

         const [rawRange, type] = body.split(';').map((x) => x.trim());
         const range = rawRange.split('..').map((x) => parseInt(x, 16));

         if (range.length > 1)
         {
            this.push({ start: range[0], end: range[1], type });
         }
         else
         {
            this.push({ start: range[0], end: range[0], type });
         }
         callback();
      },
   });
}

async function fetchAndProcess(url, fileName, defaultType, typeFilter)
{
   const response = await fetch(url);
   if (!response.ok)
   {
      console.error(`Failed to fetch: ${response.status}`);
      return;
   }

   const trie = new UnicodeTrieBuilder(defaultType);

   await pipeline(
    response.body,
    new TextDecoderStream(),
    splitIntoLines,
    parseLine(),
    new Transform({
       objectMode: true,
       transform({ start, end, type }, encoding, callback)
       {
console.log(`! start: ${start}; end: ${end}; type: ${type}`)
          if (!typeFilter || type === typeFilter) { trie.setRange(start, end, ClusterBreak[type]); }

          callback();
       },
    })
   );

   fs.writeFileSync(fileName, JSON.stringify({ data: Buffer.from(trie.toBuffer()).toString('base64') }));
}

console.log(`Processing: https://www.unicode.org/Public/15.0.0/ucd/auxiliary/GraphemeBreakProperty.txt`);

await fetchAndProcess(
 'https://www.unicode.org/Public/15.0.0/ucd/auxiliary/GraphemeBreakProperty.txt',
 './typeTrie.json',
 ClusterBreak.Other
);

console.log(`Processing: https://www.unicode.org/Public/15.0.0/ucd/emoji/emoji-data.txt`);

await fetchAndProcess(
 'https://www.unicode.org/Public/15.0.0/ucd/emoji/emoji-data.txt',
 './extPict.json',
 undefined,
 'Extended_Pictographic'
);


// import fs      from 'node:fs';
// import stream  from 'node:stream';
//
// import { UnicodeTrieBuilder } from '../../../dist/index.js';
//
// const linesStream = require("@orisano/lines-stream");
//
// const types = require("./types");
//
// function parseLine() {
//    return new stream.Transform({
//       decodeStrings: false,
//       readableObjectMode: true,
//
//       transform(line, encoding, callback) {
//          const body = line.split("#")[0];
//          if (body.trim().length === 0) {
//             callback();
//             return;
//          }
//          const [rawRange, type] = body.split(";").map((x) => x.trim());
//          const range = rawRange.split("..").map((x) => parseInt(x, 16));
//          if (range.length > 1) {
//             this.push({ start: range[0], end: range[1], type });
//          } else {
//             this.push({ start: range[0], end: range[0], type });
//          }
//          callback();
//       },
//    });
// }
//
// https.get(
//  "https://www.unicode.org/Public/15.0.0/ucd/auxiliary/GraphemeBreakProperty.txt",
//  (res) => {
//     const { statusCode } = res;
//     if (statusCode !== 200) {
//        console.error(`failed to request: ${statusCode}`);
//        res.resume();
//        return;
//     }
//
//     const trie = new UnicodeTrieBuilder(ClusterBreak.Other);
//     res
//     .setEncoding("utf8")
//     .pipe(linesStream())
//     .pipe(parseLine())
//     .on("data", ({ start, end, type }) => {
//        trie.setRange(start, end, types[type]);
//     })
//     .on("end", () => {
//        fs.writeFileSync(
//         "./typeTrie.json",
//         JSON.stringify({
//            data: trie.toBuffer().toString("base64"),
//         })
//        );
//     });
//  }
// );
//
// https.get(
//  "https://www.unicode.org/Public/15.0.0/ucd/emoji/emoji-data.txt",
//  (res) => {
//     const { statusCode } = res;
//     if (statusCode !== 200) {
//        console.error(`failed to request: ${statusCode}`);
//        res.resume();
//        return;
//     }
//
//     const trie = new UnicodeTrieBuilder();
//     res
//     .setEncoding("utf8")
//     .pipe(linesStream())
//     .pipe(parseLine())
//     .on("data", ({ start, end, type }) => {
//        if (type === "Extended_Pictographic")
//           trie.setRange(start, end, types.Extended_Pictographic);
//     })
//     .on("end", () => {
//        fs.writeFileSync(
//         "./extPict.json",
//         JSON.stringify({
//            data: trie.toBuffer().toString("base64"),
//         })
//        );
//     });
//  }
// );
