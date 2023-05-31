import { decompressSync }  from '#runtime/data/compress';

import { swap32LE }        from './swap';

export class UnicodeTrie
{
   readonly #data: Uint32Array;

   readonly #errorValue: number;

   readonly #highStart: number;

   constructor(data)
   {
      const isBuffer = (typeof data.readUInt32BE === 'function') && (typeof data.slice === 'function');

      if (isBuffer || data instanceof Uint8Array)
      {
         // read binary format
         if (isBuffer)
         {
            this.#highStart = data.readUInt32LE(0);
            this.#errorValue = data.readUInt32LE(4);
            data = data.slice(12);
         }
         else
         {
            const view = new DataView(data.buffer);
            this.#highStart = view.getUint32(0, true);
            this.#errorValue = view.getUint32(4, true);
            data = data.subarray(12);
         }

         // Double inflate the actual trie data.
         data = decompressSync(data);
         data = decompressSync(data);

         // Swap bytes from little-endian.
         swap32LE(data);

         this.#data = new Uint32Array(data.buffer);
      }
      else
      {
         // pre-parsed data
         ({ data: this.#data, highStart: this.#highStart, errorValue: this.#errorValue } = data);
      }
   }

   get(codePoint)
   {
      if ((codePoint < 0) || (codePoint > 0x10ffff)) { return this.#errorValue; }

      let index;

      if ((codePoint < 0xd800) || ((codePoint > 0xdbff) && (codePoint <= 0xffff)))
      {
         // Ordinary BMP code point, excluding leading surrogates.
         // BMP uses a single level lookup.  BMP index starts at offset 0 in the index.
         // data is stored in the index array itself.
         index = (this.#data[codePoint >> UnicodeTrie.#SHIFT_2] << UnicodeTrie.#INDEX_SHIFT) +
          (codePoint & UnicodeTrie.#DATA_MASK);

         return this.#data[index];
      }

      if (codePoint <= 0xffff)
      {
         // Lead Surrogate Code Point.  A Separate index section is stored for
         // lead surrogate code units and code points.
         //   The main index has the code unit data.
         //   For this function, we need the code point data.
         index = (this.#data[UnicodeTrie.#LSCP_INDEX_2_OFFSET +
          ((codePoint - 0xd800) >> UnicodeTrie.#SHIFT_2)] << UnicodeTrie.#INDEX_SHIFT) +
           (codePoint & UnicodeTrie.#DATA_MASK);

         return this.#data[index];
      }

      if (codePoint < this.#highStart) {
         // Supplemental code point, use two-level lookup.
         index = this.#data[(UnicodeTrie.#INDEX_1_OFFSET - UnicodeTrie.#OMITTED_BMP_INDEX_1_LENGTH) +
         (codePoint >> UnicodeTrie.#SHIFT_1)];

         index = this.#data[index + ((codePoint >> UnicodeTrie.#SHIFT_2) & UnicodeTrie.#INDEX_2_MASK)];

         index = (index << UnicodeTrie.#INDEX_SHIFT) + (codePoint & UnicodeTrie.#DATA_MASK);

         return this.#data[index];
      }

      return this.#data[this.#data.length - UnicodeTrie.#DATA_GRANULARITY];
   }

   /**
    * Shift size for getting the index-1 table offset.
    */
   static readonly #SHIFT_1: number = 6 + 5;

   /**
    * Shift size for getting the index-2 table offset.
    */
   static readonly #SHIFT_2: number = 5;

   /**
    * Difference between the two shift sizes, for getting an index-1 offset from an index-2 offset. `6=11-5`.
    */
   static readonly #SHIFT_1_2: number = this.#SHIFT_1 - this.#SHIFT_2;

   /**
    * Number of index-1 entries for the BMP. `32=0x20`.
    * This part of the index-1 table is omitted from the serialized form.
    */
   static readonly #OMITTED_BMP_INDEX_1_LENGTH: number = 0x10000 >> this.#SHIFT_1;

   /**
    * Number of entries in an index-2 block. `64=0x40`.
    */
   static readonly #INDEX_2_BLOCK_LENGTH: number = 1 << this.#SHIFT_1_2;

   /**
    * Mask for getting the lower bits for the in-index-2-block offset.
    */
   static readonly #INDEX_2_MASK: number = this.#INDEX_2_BLOCK_LENGTH - 1;

   /**
    * Shift size for shifting left the index array values.
    * Increases possible data size with 16-bit index values at the cost of "compactability".
    * This requires data blocks to be aligned by #DATA_GRANULARITY.
    */
   static readonly #INDEX_SHIFT: number = 2;

   /**
    * Number of entries in a data block. `32=0x20`.
    */
   static readonly #DATA_BLOCK_LENGTH: number = 1 << this.#SHIFT_2;

   /**
    * Mask for getting the lower bits for the in-data-block offset.
    */
   static readonly #DATA_MASK: number = this.#DATA_BLOCK_LENGTH - 1;

   /**
    * The part of the index-2 table for U+D800..U+DBFF stores values for lead surrogate code _units_ not code _points_.
    * Values for lead surrogate code _points_ are indexed with this portion of the table.
    * Length=32=0x20=0x400>>SHIFT_2. (There are 1024=0x400 lead surrogates.)
    */
   static readonly #LSCP_INDEX_2_OFFSET: number = 0x10000 >> this.#SHIFT_2;
   static readonly #LSCP_INDEX_2_LENGTH: number = 0x400 >> this.#SHIFT_2;

   /**
    * Count the lengths of both BMP pieces. `2080=0x820`.
    */
   static readonly #INDEX_2_BMP_LENGTH: number = this.#LSCP_INDEX_2_OFFSET + this.#LSCP_INDEX_2_LENGTH;

   /**
    * The 2-byte UTF-8 version of the index-2 table follows at offset `2080=0x820`.
    * Length `32=0x20` for lead bytes `C0..DF`, regardless of SHIFT_2.
    */
   static readonly #UTF8_2B_INDEX_2_OFFSET: number = this.#INDEX_2_BMP_LENGTH;
   static readonly #UTF8_2B_INDEX_2_LENGTH: number = 0x800 >> 6;  // U+0800 is the first code point after 2-byte UTF-8

   /**
    * The index-1 table, only used for supplementary code points, at offset `2112=0x840`.
    * Variable length, for code points up to highStart, where the last single-value range starts.
    * Maximum length 512=0x200=0x100000>>SHIFT_1.
    * (For 0x100000 supplementary code points U+10000..U+10ffff.)
    *
    * The part of the index-2 table for supplementary code points starts after this index-1 table.
    *
    * Both the index-1 table and the following part of the index-2 table are omitted completely if there is only BMP
    * data.
    */
   static readonly #INDEX_1_OFFSET: number = this.#UTF8_2B_INDEX_2_OFFSET + this.#UTF8_2B_INDEX_2_LENGTH;

   /**
    * The alignment size of a data block. Also, the granularity for compaction.
    */
   static readonly #DATA_GRANULARITY: number = 1 << this.#INDEX_SHIFT;
}