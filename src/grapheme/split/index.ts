import { toUint8Array }    from '#runtime/data/format/base64';

import { UnicodeTrie }     from '../../unicode-trie'

import { UAX29 }           from '../types';

import { UNICODE_GRAPHEME_B64_TYPE_TRIE }       from './UNICODE_GRAPHEME_B64_TYPE_TRIE';
import { UNICODE_GRAPHEME_B64_EXT_PICT_TRIE }   from './UNICODE_GRAPHEME_B64_EXT_PICT_TRIE';

/**
 * Provides internal support for lazy loading of Unicode trie data and essential lookups.
 */
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
    * Returns the `OR` result of lookups from `typeTrie` and `extPict`.
    *
    * @param {number}   codePoint - A Unicode code point to lookup.
    *
    * @returns {number} Code point meta-data.
    */
   static get(codePoint: number): number
   {
      return this.#typeTrie.get(codePoint) | this.#extPict.get(codePoint);
   }

   /**
    * Helper function to test stored code point types.
    *
    * @param {number}   type - Code point type.
    *
    * @param {number}   bit - ClusterBreak to test against.
    */
   static is(type: number, bit: number)
   {
      return (type & bit) !== 0;
   }

   /**
    * Analyzes the next grapheme cluster size from a pre-parsed string of code point types.
    *
    * @param {number[]}   ts - Code point types.
    *
    * @param {number}   start -
    */
   static nextGraphemeClusterSize(ts: number[], start: number)
   {
      const CB = UAX29.ClusterBreak;

      const L = ts.length;

      let ri = 0;
      let gb11State = this.GB11State.Initial;

      // GB1: sot ÷ Any
      for (let i = start; i + 1 < L; i++)
      {
         const curr = ts[i];
         const next = ts[i + 1];

         // for GB12, GB13
         if (!this.is(curr, CB.Regional_Indicator)) { ri = 0; }

         // for GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
         switch (gb11State)
         {
            case this.GB11State.NotBoundary:
            case this.GB11State.Initial:
               if (this.is(curr, CB.Extended_Pictographic))
               {
                  gb11State = this.GB11State.ExtendOrZWJ;
               }
               else
               {
                  gb11State = this.GB11State.Initial;
               }
               break;

            case this.GB11State.ExtendOrZWJ:
               if (this.is(curr, CB.Extend))
               {
                  gb11State = this.GB11State.ExtendOrZWJ;
               }
               else if (this.is(curr, CB.ZWJ) && this.is(next, CB.Extended_Pictographic))
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
         if (this.is(curr, CB.CR) && this.is(next, CB.LF)) { continue; }

         // GB4: (Control | CR | LF) ÷
         if (this.is(curr, CB.Control | CB.CR | CB.LF)) { return i + 1 - start; }

         // GB5: ÷ (Control | CR | LF)
         if (this.is(next, CB.Control | CB.CR | CB.LF)) { return i + 1 - start; }

         // GB6: L x (L | V | LV | LVT)
         if (this.is(curr, CB.L) && this.is(next, CB.L | CB.V | CB.LV | CB.LVT)) { continue; }

         // GB7: (LV | V) x (V | T)
         if (this.is(curr, CB.LV | CB.V) && this.is(next, CB.V | CB.T)) { continue; }

         // GB8: (LVT | T) x T
         if (this.is(curr, CB.LVT | CB.T) && this.is(next, CB.T)) { continue; }

         // GB9: x (Extend | ZWJ)
         if (this.is(next, CB.Extend | CB.ZWJ)) { continue; }

         // GB9a: x SpacingMark
         if (this.is(next, CB.SpacingMark)) { continue; }

         // GB9b: Prepend x
         if (this.is(curr, CB.Prepend)) { continue; }

         // GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
         if (gb11State === this.GB11State.NotBoundary) { continue; }

         // GB12: sot (RI RI)* RI x RI
         // GB13: [^RI] (RI RI)* RI x RI
         if (this.is(curr, CB.Regional_Indicator) && this.is(next, CB.Regional_Indicator) && ri % 2 === 0)
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
 * Splits the given string into an array of Unicode grapheme clusters.
 *
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
 * Provides an iterator for tokenizing a string by grapheme clusters.
 *
 * Note: This is a naive implementation that fully parses the string then returns the iterator over parsed clusters.
 * A future implementation will implement an immediate mode parser returning cluster by cluster as the string is
 * parsed.
 *
 * @param {string}   str - String to split.
 *
 * @returns {IterableIterator<string>} An iterator returning grapheme clusters.
 * @yields {string}
 */
export function* graphemeIterator(str: string): IterableIterator<string>
{
   for (const grapheme of graphemeSplit(str)) { yield grapheme; }
}
