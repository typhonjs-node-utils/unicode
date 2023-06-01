import { toUint8Array }    from '#runtime/data/format/base64';

import { UnicodeTrie }     from '../../unicode-trie'

import { ClusterBreak }    from '../types';

import { UNICODE_GRAPHEME_B64_TYPE_TRIE }       from './UNICODE_GRAPHEME_B64_TYPE_TRIE';
import { UNICODE_GRAPHEME_B64_EXT_PICT_TRIE }   from './UNICODE_GRAPHEME_B64_EXT_PICT_TRIE';


class GraphemeSplitHelper
{
   static #typeTrie: UnicodeTrie;
   static #extPict: UnicodeTrie;

   static #isLoaded: boolean = false;

   static readonly GB11State = {
      Initial: 0,
      ExtendOrZWJ: 1,
      NotBoundary: 2,
   };

   static checkLoadData()
   {
      if (!this.#isLoaded)
      {
         this.#typeTrie = new UnicodeTrie(toUint8Array(UNICODE_GRAPHEME_B64_TYPE_TRIE));
         this.#extPict = new UnicodeTrie(toUint8Array(UNICODE_GRAPHEME_B64_EXT_PICT_TRIE));

         this.#isLoaded = true;
      }
   }

   /**
    * Returns the `OR` result of lookups from `typeTrie` and `extPict`
    * @param codePoint
    */
   static get(codePoint: number)
   {
      return this.#typeTrie.get(codePoint) | this.#extPict.get(codePoint);
   }

   static is(type, bit)
   {
      return (type & bit) !== 0;
   }

   static nextGraphemeClusterSize(ts, start)
   {
      const L = ts.length;

      let ri = 0;
      let gb11State = this.GB11State.Initial;

      // GB1: sot ÷ Any
      for (let i = start; i + 1 < L; i++)
      {
         const curr = ts[i + 0];
         const next = ts[i + 1];

         // for GB12, GB13
         if (!this.is(curr, ClusterBreak.Regional_Indicator)) { ri = 0; }

         // for GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
         switch (gb11State)
         {
            case this.GB11State.NotBoundary:
            case this.GB11State.Initial:
               if (this.is(curr, ClusterBreak.Extended_Pictographic))
               {
                  gb11State = this.GB11State.ExtendOrZWJ;
               }
               else
               {
                  gb11State = this.GB11State.Initial;
               }
               break;

            case this.GB11State.ExtendOrZWJ:
               if (this.is(curr, ClusterBreak.Extend))
               {
                  gb11State = this.GB11State.ExtendOrZWJ;
               }
               else if (this.is(curr, ClusterBreak.ZWJ) && this.is(next, ClusterBreak.Extended_Pictographic))
               {
                  gb11State = this.GB11State.NotBoundary;
               }
               else
               {
                  gb11State = this.GB11State.Initial;
               }
               break;
         }

         // GB3: CR x LF
         if (this.is(curr, ClusterBreak.CR) && this.is(next, ClusterBreak.LF)) { continue; }

         // GB4: (Control | CR | LF) ÷
         if (this.is(curr, ClusterBreak.Control | ClusterBreak.CR | ClusterBreak.LF)) { return i + 1 - start; }

         // GB5: ÷ (Control | CR | LF)
         if (this.is(next, ClusterBreak.Control | ClusterBreak.CR | ClusterBreak.LF)) { return i + 1 - start; }

         // GB6: L x (L | V | LV | LVT)
         if (this.is(curr, ClusterBreak.L) &&
          this.is(next, ClusterBreak.L | ClusterBreak.V | ClusterBreak.LV | ClusterBreak.LVT))
         {
            continue;
         }

         // GB7: (LV | V) x (V | T)
         if (this.is(curr, ClusterBreak.LV | ClusterBreak.V) && this.is(next, ClusterBreak.V | ClusterBreak.T))
         {
            continue;
         }

         // GB8: (LVT | T) x T
         if (this.is(curr, ClusterBreak.LVT | ClusterBreak.T) && this.is(next, ClusterBreak.T)) { continue; }

         // GB9: x (Extend | ZWJ)
         if (this.is(next, ClusterBreak.Extend | ClusterBreak.ZWJ)) { continue; }

         // GB9a: x SpacingMark
         if (this.is(next, ClusterBreak.SpacingMark)) { continue; }

         // GB9b: Prepend x
         if (this.is(curr, ClusterBreak.Prepend)) { continue; }

         // GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
         if (gb11State === this.GB11State.NotBoundary) { continue; }

         // GB12: sot (RI RI)* RI x RI
         // GB13: [^RI] (RI RI)* RI x RI
         if (this.is(curr, ClusterBreak.Regional_Indicator) && this.is(next, ClusterBreak.Regional_Indicator) &&
          ri % 2 === 0)
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
}

/**
 * @param {string}   str - String to split.
 *
 * @returns {string[]} The string split by Unicode grapheme clusters.
 */
export function graphemeSplit(str: string): string[]
{
   GraphemeSplitHelper.checkLoadData();

   const graphemeClusters = [];

   const map = [0];
   const ts = [];

   for (let i = 0; i < str.length;)
   {
      const code = str.codePointAt(i);
      ts.push(GraphemeSplitHelper.get(code));
      i += code > 65535 ? 2 : 1;
      map.push(i);
   }

   for (let offset = 0; offset < ts.length;)
   {
      const size = GraphemeSplitHelper.nextGraphemeClusterSize(ts, offset);
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
 * @returns {IterableIterator<string>} An iterator returning grapheme clusters.
 * @yields {string}
 */
export function* graphemeIterator(str: string): IterableIterator<string>
{
   for (const grapheme of graphemeSplit(str)) { yield grapheme; }
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
