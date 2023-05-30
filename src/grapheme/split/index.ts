import { toUint8Array }    from '#runtime/data/format/base64';
// import UnicodeTrie         from 'unicode-trie';
import { UnicodeTrie }     from '../../unicode-trie'

import { typeTrieB64 }     from './typeTrieB64';
import { extPictB64 }      from './extPictB64';

import { ClusterBreak } from '../types';

const typeTrie = new UnicodeTrie(toUint8Array(typeTrieB64));
const extPict = new UnicodeTrie(toUint8Array(extPictB64));

// const typeTrie = { get: () => void 0 };
// const extPict = { get: (str) => void 0 };

function is(type, bit) {
   return (type & bit) !== 0;
}

const GB11State = {
   Initial: 0,
   ExtendOrZWJ: 1,
   NotBoundary: 2,
};

function nextGraphemeClusterSize(ts, start)
{
   const L = ts.length;

   let ri = 0;
   let gb11State = GB11State.Initial;

   // GB1: sot ÷ Any
   for (let i = start; i + 1 < L; i++)
   {
      const curr = ts[i + 0];
      const next = ts[i + 1];

      // for GB12, GB13
      if (!is(curr, ClusterBreak.Regional_Indicator)) { ri = 0; }

      // for GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
      switch (gb11State)
      {
         case GB11State.NotBoundary:
         case GB11State.Initial:
            if (is(curr, ClusterBreak.Extended_Pictographic))
            {
               gb11State = GB11State.ExtendOrZWJ;
            }
            else
            {
               gb11State = GB11State.Initial;
            }
            break;

         case GB11State.ExtendOrZWJ:
            if (is(curr, ClusterBreak.Extend))
            {
               gb11State = GB11State.ExtendOrZWJ;
            }
            else if (is(curr, ClusterBreak.ZWJ) && is(next, ClusterBreak.Extended_Pictographic))
            {
               gb11State = GB11State.NotBoundary;
            }
            else
            {
               gb11State = GB11State.Initial;
            }
            break;
      }

      // GB3: CR x LF
      if (is(curr, ClusterBreak.CR) && is(next, ClusterBreak.LF)) { continue; }

      // GB4: (Control | CR | LF) ÷
      if (is(curr, ClusterBreak.Control | ClusterBreak.CR | ClusterBreak.LF)) { return i + 1 - start; }

      // GB5: ÷ (Control | CR | LF)
      if (is(next, ClusterBreak.Control | ClusterBreak.CR | ClusterBreak.LF)) { return i + 1 - start; }

      // GB6: L x (L | V | LV | LVT)
      if (is(curr, ClusterBreak.L) &&
       is(next, ClusterBreak.L | ClusterBreak.V | ClusterBreak.LV | ClusterBreak.LVT))
      {
         continue;
      }

      // GB7: (LV | V) x (V | T)
      if (is(curr, ClusterBreak.LV | ClusterBreak.V) && is(next, ClusterBreak.V | ClusterBreak.T))
      {
         continue;
      }

      // GB8: (LVT | T) x T
      if (is(curr, ClusterBreak.LVT | ClusterBreak.T) && is(next, ClusterBreak.T)) { continue; }

      // GB9: x (Extend | ZWJ)
      if (is(next, ClusterBreak.Extend | ClusterBreak.ZWJ)) { continue; }

      // GB9a: x SpacingMark
      if (is(next, ClusterBreak.SpacingMark)) { continue; }

      // GB9b: Prepend x
      if (is(curr, ClusterBreak.Prepend)) { continue; }

      // GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
      if (gb11State === GB11State.NotBoundary) { continue; }

      // GB12: sot (RI RI)* RI x RI
      // GB13: [^RI] (RI RI)* RI x RI
      if (is(curr, ClusterBreak.Regional_Indicator) && is(next, ClusterBreak.Regional_Indicator) && ri % 2 === 0)
      {
         ri++;
         continue;
      }

      // GB999: Any ÷ Any
      return i + 1 - start;
   }

   // GB2: Any ÷ eot
   return L - start;
}

/**
 * @param {string}   str - String to split.
 *
 * @returns {string[]} The string split by Unicode grapheme clusters.
 */
export function graphemeSplit(str: string): string[]
{
   const graphemeClusters = [];

   const map = [0];
   const ts = [];

   for (let i = 0; i < str.length;)
   {
      const code = str.codePointAt(i);
      ts.push(typeTrie.get(code) | extPict.get(code));
      i += code > 65535 ? 2 : 1;
      map.push(i);
   }

   for (let offset = 0; offset < ts.length;)
   {
      const size = nextGraphemeClusterSize(ts, offset);
      const start = map[offset];
      const end = map[offset + size];
      graphemeClusters.push(str.slice(start, end));
      offset += size;
   }

   return graphemeClusters;
}

/**
 * @param {string}   str - String to split.
 *
 * @returns {Generator<string>} An iterator returning grapheme clusters.
 */
export function* graphemeIterator(str: string): Generator<string>
{
   for (const grapheme of graphemeSplit(str))
   {
      yield grapheme;
   }
}

// // An experimental attempt to create a generator / iterator.
// export function* graphemeIteratorExp(str: string): Generator<string>
// {
//    let i = 0;
//    let start = 0;
//    const ts = [];
//    let buffer = "";
//    let lastUnicodeProperty = 0;
//
//    while (i < str.length)
//    {
//       const code = str.codePointAt(i);
//       const unicodeProperty = typeTrie.get(code) | extPict.get(code);
//       ts.push(unicodeProperty);
//       i += code > 65535 ? 2 : 1;
//
//       const size = nextGraphemeClusterSize(ts, 0);
//       if (size === ts.length)
//       {
//          const cluster = str.slice(start, i);
//          if (buffer && !(unicodeProperty & ClusterBreak.ZWJ) && !(lastUnicodeProperty & ClusterBreak.ZWJ) &&
//           !(unicodeProperty & ClusterBreak.Extend) && !(lastUnicodeProperty & ClusterBreak.Extend)) {
//             yield buffer;
//             buffer = "";
//          }
//          buffer += cluster;
//          start = i;
//          ts.length = 0;
//          lastUnicodeProperty = unicodeProperty;
//       }
//    }
//
//    if (buffer) { yield buffer; }
// }

// // A trivial iterator that splits on every cluster / doesn't handle compound cases.
// export function* graphemeIteratorTrivial(str: string): Generator<string>
// {
//    let i = 0;
//    let start = 0;
//    const ts = [];
//
//    while (i < str.length)
//    {
//       const code = str.codePointAt(i);
//       ts.push(typeTrie.get(code) | extPict.get(code));
//       i += code > 65535 ? 2 : 1;
//
//       const size = nextGraphemeClusterSize(ts, 0);
//       if (size === ts.length)
//       {
//          yield str.slice(start, i);
//          start = i;
//          ts.length = 0;
//       }
//    }
//
//    if (ts.length > 0) { yield str.slice(start, i); }
// }
