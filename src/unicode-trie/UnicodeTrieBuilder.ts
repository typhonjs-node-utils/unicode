import { deflateSync }     from '#runtime/data/compress';

import { Const, ConstB }   from './Constants';
import { Swap32LE }        from './Swap32LE';
import { UnicodeTrie }     from './UnicodeTrie';

/**
 * Builds the UnicodeTrie data structure with options to output to a Buffer or return an instance of UnicodeTrie.
 */
export class UnicodeTrieBuilder
{
   #data: Uint32Array;

   #dataCapacity: number;

   #dataLength: number;

   #dataNullOffset: number;

   readonly #errorValue: number;

   #firstFreeBlock: number;

   #highStart: number;

   readonly #index1: Int32Array;

   readonly #index2: Int32Array;

   #index2Length: number;

   #index2NullOffset: number;

   readonly #initialValue: number;

   #isCompacted: boolean;

   readonly #map: Int32Array;

   /**
    * @param {number}   [initialValue] -
    *
    * @param {number}   [errorValue] -
    */
   constructor(initialValue?: number, errorValue?: number)
   {
      let i, j;

      if (initialValue == null) { initialValue = 0; }

      this.#initialValue = initialValue;

      if (errorValue == null) { errorValue = 0; }

      this.#errorValue = errorValue;
      this.#index1 = new Int32Array(ConstB.INDEX_1_LENGTH);
      this.#index2 = new Int32Array(ConstB.MAX_INDEX_2_LENGTH);
      this.#highStart = 0x110000;

      this.#data = new Uint32Array(ConstB.INITIAL_DATA_LENGTH);
      this.#dataCapacity = ConstB.INITIAL_DATA_LENGTH;

      this.#firstFreeBlock = 0;
      this.#isCompacted = false;

      // Multipurpose per-data-block table.
      //
      // Before compacting:
      //
      // Per-data-block reference counters/free-block list.
      //  0: unused
      // >0: reference counter (number of index-2 entries pointing here)
      // <0: next free data block in free-block list
      //
      // While compacting:
      //
      // Map of adjusted indexes, used in compactData() and compactIndex2().
      // Maps from original indexes to new ones.
      this.#map = new Int32Array(ConstB.MAX_DATA_LENGTH_BUILDTIME >> Const.SHIFT_2);

      for (i = 0; i < 0x80; i++) { this.#data[i] = this.#initialValue; }

      for (i = i; i < 0xc0; i++) { this.#data[i] = this.#errorValue; }

      for (i = ConstB.DATA_NULL_OFFSET; i < ConstB.NEW_DATA_START_OFFSET; i++) { this.#data[i] = this.#initialValue; }

      this.#dataNullOffset = ConstB.DATA_NULL_OFFSET;
      this.#dataLength = ConstB.NEW_DATA_START_OFFSET;

      // set the index-2 indexes for the 2=0x80>>SHIFT_2 ASCII data blocks
      i = 0;
      for (j = 0; j < 0x80; j += Const.DATA_BLOCK_LENGTH)
      {
         this.#index2[i] = j;
         this.#map[i++] = 1;
      }

      // reference counts for the bad-UTF-8-data block
      for (j = j; j < 0xc0; j += Const.DATA_BLOCK_LENGTH) { this.#map[i++] = 0; }

      // Reference counts for the null data block: all blocks except for the ASCII blocks.
      // Plus 1 so that we don't drop this block during compaction.
      // Plus as many as needed for lead surrogate code points.
      // i==newTrie->dataNullOffset
      this.#map[i++] = ((0x110000 >> Const.SHIFT_2) - (0x80 >> Const.SHIFT_2)) + 1 + Const.LSCP_INDEX_2_LENGTH;

      j += Const.DATA_BLOCK_LENGTH;
      for (j = j; j < ConstB.NEW_DATA_START_OFFSET; j += Const.DATA_BLOCK_LENGTH) { this.#map[i++] = 0; }

      // set the remaining indexes in the BMP index-2 block
      // to the null data block
      for (i = 0x80 >> Const.SHIFT_2; i < Const.INDEX_2_BMP_LENGTH; i++) { this.#index2[i] = ConstB.DATA_NULL_OFFSET; }

      // Fill the index gap with impossible values so that compaction
      // does not overlap other index-2 blocks with the gap.
      for (i = 0; i < ConstB.INDEX_GAP_LENGTH; i++) { this.#index2[ConstB.INDEX_GAP_OFFSET + i] = -1; }

      // set the indexes in the null index-2 block
      for (i = 0; i < Const.INDEX_2_BLOCK_LENGTH; i++)
      {
         this.#index2[ConstB.INDEX_2_NULL_OFFSET + i] = ConstB.DATA_NULL_OFFSET;
      }

      this.#index2NullOffset = ConstB.INDEX_2_NULL_OFFSET;
      this.#index2Length = ConstB.INDEX_2_START_OFFSET;

      // set the index-1 indexes for the linear index-2 block
      j = 0;
      for (i = 0; i < Const.OMITTED_BMP_INDEX_1_LENGTH; i++)
      {
         this.#index1[i] = j;
         j += Const.INDEX_2_BLOCK_LENGTH;
      }

      // set the remaining index-1 indexes to the null index-2 block
      for (i = i; i < ConstB.INDEX_1_LENGTH; i++) { this.#index1[i] = ConstB.INDEX_2_NULL_OFFSET; }

      // Preallocate and reset data for U+0080..U+07ff,
      // for 2-byte UTF-8 which will be compacted in 64-blocks
      // even if DATA_BLOCK_LENGTH is smaller.
      for (i = 0x80; i < 0x800; i += Const.DATA_BLOCK_LENGTH) { this.set(i, this.#initialValue); }
   }

   /**
    * @returns {UnicodeTrie} The compacted and frozen data as a new UnicodeTrie instance.
    */
   freeze(): UnicodeTrie
   {
      let allIndexesLength, i;
      if (!this.#isCompacted) { this.#compact(); }

      if (this.#highStart <= 0x10000)
      {
         allIndexesLength = Const.INDEX_1_OFFSET;
      }
      else
      {
         allIndexesLength = this.#index2Length;
      }

      const dataMove = allIndexesLength;

      // are indexLength and dataLength within limits?
      if ((allIndexesLength > ConstB.MAX_INDEX_LENGTH) || // for unshifted indexLength
       ((dataMove + this.#dataNullOffset) > 0xffff) || // for unshifted dataNullOffset
       ((dataMove + ConstB.DATA_0800_OFFSET) > 0xffff) || // for unshifted 2-byte UTF-8 index-2 values
       ((dataMove + this.#dataLength) > ConstB.MAX_DATA_LENGTH_RUNTIME))
      { // for shiftedDataLength
         throw new Error("Trie data is too large.");
      }

      // calculate the sizes of, and allocate, the index and data arrays
      const indexLength = allIndexesLength + this.#dataLength;
      const data = new Uint32Array(indexLength);

      // write the index-2 array values shifted right by INDEX_SHIFT, after adding dataMove
      let destIdx = 0;
      for (i = 0; i < Const.INDEX_2_BMP_LENGTH; i++)
      {
         data[destIdx++] = ((this.#index2[i] + dataMove) >> Const.INDEX_SHIFT);
      }

      // write UTF-8 2-byte index-2 values, not right-shifted
      for (i = 0; i < 0xc2 - 0xc0; i++)
      { // C0..C1
         data[destIdx++] = (dataMove + ConstB.BAD_UTF8_DATA_OFFSET);
      }

      for (i = i; i < 0xe0 - 0xc0; i++)
      { // C2..DF
         data[destIdx++] = (dataMove + this.#index2[i << (6 - Const.SHIFT_2)]);
      }

      if (this.#highStart > 0x10000)
      {
         const index1Length = (this.#highStart - 0x10000) >> Const.SHIFT_1;
         const index2Offset = Const.INDEX_2_BMP_LENGTH + Const.UTF8_2B_INDEX_2_LENGTH + index1Length;

         // write 16-bit index-1 values for supplementary code points
         for (i = 0; i < index1Length; i++)
         {
            data[destIdx++] = (ConstB.INDEX_2_OFFSET + this.#index1[i + Const.OMITTED_BMP_INDEX_1_LENGTH]);
         }

         // write the index-2 array values for supplementary code points,
         // shifted right by INDEX_SHIFT, after adding dataMove
         for (i = 0; i < this.#index2Length - index2Offset; i++)
         {
            data[destIdx++] = ((dataMove + this.#index2[index2Offset + i]) >> Const.INDEX_SHIFT);
         }
      }

      // write 16-bit data values
      for (i = 0; i < this.#dataLength; i++) { data[destIdx++] = this.#data[i]; }

      return new UnicodeTrie({
         data,
         highStart: this.#highStart,
         errorValue: this.#errorValue
      });
   }

   /**
    * @param {number}   codePoint - Code point to lookup.
    *
    * @param {boolean}  [fromLSCP=true] - Is this a lead surrogate code point.
    */
   get(codePoint: number, fromLSCP?: boolean)
   {
      let i2;
      if (fromLSCP == null)
      {
         fromLSCP = true;
      }
      if ((codePoint < 0) || (codePoint > 0x10ffff))
      {
         return this.#errorValue;
      }

      if ((codePoint >= this.#highStart) && (!((codePoint >= 0xd800) && (codePoint < 0xdc00)) || fromLSCP))
      {
         return this.#data[this.#dataLength - Const.DATA_GRANULARITY];
      }

      if (((codePoint >= 0xd800) && (codePoint < 0xdc00)) && fromLSCP)
      {
         i2 = (Const.LSCP_INDEX_2_OFFSET - (0xd800 >> Const.SHIFT_2)) + (codePoint >> Const.SHIFT_2);
      }
      else
      {
         i2 = this.#index1[codePoint >> Const.SHIFT_1] + ((codePoint >> Const.SHIFT_2) & Const.INDEX_2_MASK);
      }

      const block = this.#index2[i2];
      return this.#data[block + (codePoint & Const.DATA_MASK)];
   }

   /**
    * @param {number}   codePoint - Code point to set.
    *
    * @param {value}    value - New value at code point.
    */
   set(codePoint: number, value: number)
   {
      if ((codePoint < 0) || (codePoint > 0x10ffff)) { throw new Error('Invalid code point'); }

      if (this.#isCompacted) { throw new Error('Already compacted'); }

      const block = this.#getDataBlock(codePoint, true);
      this.#data[block + (codePoint & Const.DATA_MASK)] = value;
      return this;
   }

   /**
    * @param {number}   start - Start code point.
    *
    * @param {number}   end - End code point.
    *
    * @param {number}   value - Value to set.
    *
    * @param {boolean}  [overwrite] - Overwrite existing values.
    */
   setRange(start: number, end: number, value: number, overwrite?: boolean)
   {
      let block, repeatBlock;

      if (overwrite == null) { overwrite = true; }

      if ((start > 0x10ffff) || (end > 0x10ffff) || (start > end)) { throw new Error('Invalid code point'); }

      if (this.#isCompacted) { throw new Error('Already compacted'); }

      if (!overwrite && (value === this.#initialValue)) { return this; } // nothing to do

      let limit = end + 1;
      if ((start & Const.DATA_MASK) !== 0)
      {
         // set partial block at [start..following block boundary
         block = this.#getDataBlock(start, true);

         const nextStart = (start + Const.DATA_BLOCK_LENGTH) & ~Const.DATA_MASK;
         if (nextStart <= limit)
         {
            this.#fillBlock(block, start & Const.DATA_MASK, Const.DATA_BLOCK_LENGTH, value, this.#initialValue,
             overwrite);

            start = nextStart;
         }
         else
         {
            this.#fillBlock(block, start & Const.DATA_MASK, limit & Const.DATA_MASK, value, this.#initialValue,
             overwrite);

            return this;
         }
      }

      // number of positions in the last, partial block
      const rest = limit & Const.DATA_MASK;

      // round down limit to a block boundary
      limit &= ~Const.DATA_MASK;

      // iterate over all-value blocks
      repeatBlock = value === this.#initialValue ? this.#dataNullOffset : -1;

      while (start < limit)
      {
         let setRepeatBlock = false;

         if ((value === this.#initialValue) && this.#isInNullBlock(start, true))
         {
            start += Const.DATA_BLOCK_LENGTH; // nothing to do
            continue;
         }

         // get index value
         let i2 = this.#getIndex2Block(start, true);
         i2 += (start >> Const.SHIFT_2) & Const.INDEX_2_MASK;

         block = this.#index2[i2];
         if (this.#isWritableBlock(block))
         {
            // already allocated
            if (overwrite && (block >= ConstB.DATA_0800_OFFSET))
            {
               // We overwrite all values, and it's not a
               // protected (ASCII-linear or 2-byte UTF-8) block:
               // replace with the repeatBlock.
               setRepeatBlock = true;
            }
            else
            {
               // protected block: just write the values into this block
               this.#fillBlock(block, 0, Const.DATA_BLOCK_LENGTH, value, this.#initialValue, overwrite);
            }

         }
         else if ((this.#data[block] !== value) && (overwrite || (block === this.#dataNullOffset)))
         {
            // Set the repeatBlock instead of the null block or previous repeat block:
            //
            // If !isWritableBlock() then all entries in the block have the same value
            // because it's the null block or a range block (the repeatBlock from a previous
            // call to utrie2_setRange32()).
            // No other blocks are used multiple times before compacting.
            //
            // The null block is the only non-writable block with the initialValue because
            // of the repeatBlock initialization above. (If value==initialValue, then
            // the repeatBlock will be the null data block.)
            //
            // We set our repeatBlock if the desired value differs from the block's value,
            // and if we overwrite any data or if the data is all initial values
            // (which is the same as the block being the null block, see above).
            setRepeatBlock = true;
         }

         if (setRepeatBlock)
         {
            if (repeatBlock >= 0)
            {
               this.#setIndex2Entry(i2, repeatBlock);
            }
            else
            {
               // create and set and fill the repeatBlock
               repeatBlock = this.#getDataBlock(start, true);
               this.#writeBlock(repeatBlock, value);
            }
         }

         start += Const.DATA_BLOCK_LENGTH;
      }

      if (rest > 0)
      {
         // set partial block at [last block boundary..limit
         block = this.#getDataBlock(start, true);
         this.#fillBlock(block, 0, rest, value, this.#initialValue, overwrite);
      }

      return this;
   }

   /**
    * Generates a Buffer containing the serialized and compressed trie.
    * Trie data is compressed twice using the deflate algorithm to minimize file size.
    *
    * uint32_t highStart;
    * uint32_t errorValue;
    * uint32_t uncompressedDataLength;
    * uint8_t trieData[dataLength];
    *
    * @returns {Buffer} A Node Buffer.
    */
   toBuffer(): Buffer
   {
      const trie = this.freeze();

      const data = new Uint8Array(trie.data.buffer);

      // Swap bytes to little-endian
      Swap32LE.swap(data);

      let compressed = deflateSync(data);

      const buf = Buffer.alloc(compressed.length + 12);
      buf.writeUInt32LE(trie.highStart, 0);
      buf.writeUInt32LE(trie.errorValue, 4);
      buf.writeUInt32LE(data.length, 8);

      // Copy compressed data after header.
      for (let i = 0; i < compressed.length; i++) { buf[i + 12] = compressed[i]; }

      return buf;
   }

   // Internal -------------------------------------------------------------------------------------------------------

   #allocDataBlock(copyBlock: number)
   {
      let newBlock;
      if (this.#firstFreeBlock !== 0)
      {
         // get the first free block
         newBlock = this.#firstFreeBlock;
         this.#firstFreeBlock = -this.#map[newBlock >> Const.SHIFT_2];
      }
      else
      {
         // get a new block from the high end
         newBlock = this.#dataLength;
         const newTop = newBlock + Const.DATA_BLOCK_LENGTH;
         if (newTop > this.#dataCapacity)
         {
            // out of memory in the data array
            let capacity;
            if (this.#dataCapacity < ConstB.MEDIUM_DATA_LENGTH)
            {
               capacity = ConstB.MEDIUM_DATA_LENGTH;
            }
            else if (this.#dataCapacity < ConstB.MAX_DATA_LENGTH_BUILDTIME)
            {
               capacity = ConstB.MAX_DATA_LENGTH_BUILDTIME;
            }
            else
            {
               // Should never occur.
               // Either MAX_DATA_LENGTH_BUILDTIME is incorrect,
               // or the code writes more values than should be possible.
               throw new Error("Internal error in Trie2 creation.");
            }

            const newData = new Uint32Array(capacity);
            newData.set(this.#data.subarray(0, this.#dataLength));
            this.#data = newData;
            this.#dataCapacity = capacity;
         }

         this.#dataLength = newTop;
      }

      this.#data.set(this.#data.subarray(copyBlock, copyBlock + Const.DATA_BLOCK_LENGTH), newBlock);
      this.#map[newBlock >> Const.SHIFT_2] = 0;
      return newBlock;
   }

   #allocIndex2Block()
   {
      const newBlock = this.#index2Length;
      const newTop = newBlock + Const.INDEX_2_BLOCK_LENGTH;
      if (newTop > this.#index2.length)
      {
         // Should never occur.
         // Either MAX_BUILD_TIME_INDEX_LENGTH is incorrect,
         // or the code writes more values than should be possible.
         throw new Error("Internal error in Trie2 creation.");
      }

      this.#index2Length = newTop;

      this.#index2.set(this.#index2.subarray(this.#index2NullOffset,
       this.#index2NullOffset + Const.INDEX_2_BLOCK_LENGTH), newBlock);

      return newBlock;
   }

   #compact()
   {
      // find highStart and round it up
      let highValue = this.get(0x10ffff);
      let highStart = this.#findHighStart(highValue);
      highStart = (highStart + (ConstB.CP_PER_INDEX_1_ENTRY - 1)) & ~(ConstB.CP_PER_INDEX_1_ENTRY - 1);

      if (highStart === 0x110000) { highValue = this.#errorValue; }

      // Set trie->highStart only after utrie2_get32(trie, highStart).
      // Otherwise utrie2_get32(trie, highStart) would try to read the highValue.
      this.#highStart = highStart;
      if (this.#highStart < 0x110000)
      {
         // Blank out [highStart..10ffff] to release associated data blocks.
         const suppHighStart = this.#highStart <= 0x10000 ? 0x10000 : this.#highStart;
         this.setRange(suppHighStart, 0x10ffff, this.#initialValue, true);
      }

      this.#compactData();
      if (this.#highStart > 0x10000) { this.#compactIndex2(); }

      // Store the highValue in the data array and round up the dataLength.
      // Must be done after compactData() because that assumes that dataLength
      // is a multiple of DATA_BLOCK_LENGTH.
      this.#data[this.#dataLength++] = highValue;
      while ((this.#dataLength & (Const.DATA_GRANULARITY - 1)) !== 0)
      {
         this.#data[this.#dataLength++] = this.#initialValue;
      }

      this.#isCompacted = true;
   }

   #compactData()
   {
      // do not compact linear-ASCII data
      let newStart = ConstB.DATA_START_OFFSET;
      let start = 0;
      let i = 0;

      while (start < newStart)
      {
         this.#map[i++] = start;
         start += Const.DATA_BLOCK_LENGTH;
      }

      // Start with a block length of 64 for 2-byte UTF-8,
      // then switch to DATA_BLOCK_LENGTH.
      let blockLength = 64;
      let blockCount = blockLength >> Const.SHIFT_2;
      start = newStart;
      while (start < this.#dataLength)
      {
         // start: index of first entry of current block
         // newStart: index where the current block is to be moved
         //           (right after current end of already-compacted data)
         let mapIndex, movedStart;
         if (start === ConstB.DATA_0800_OFFSET)
         {
            blockLength = Const.DATA_BLOCK_LENGTH;
            blockCount = 1;
         }

         // skip blocks that are not used
         if (this.#map[start >> Const.SHIFT_2] <= 0)
         {
            // advance start to the next block
            start += blockLength;

            // leave newStart with the previous block!
            continue;
         }

         // search for an identical block
         if ((movedStart = this.#findSameDataBlock(newStart, start, blockLength)) >= 0)
         {
            // found an identical block, set the other block's index value for the current block
            mapIndex = start >> Const.SHIFT_2;
            for (i = blockCount; i > 0; i--)
            {
               this.#map[mapIndex++] = movedStart;
               movedStart += Const.DATA_BLOCK_LENGTH;
            }

            // advance start to the next block
            start += blockLength;

            // leave newStart with the previous block!
            continue;
         }

         // see if the beginning of this block can be overlapped with the end of the previous block
         // look for maximum overlap (modulo granularity) with the previous, adjacent block
         let overlap = blockLength - Const.DATA_GRANULARITY;
         while ((overlap > 0) && !this.#equalInt(this.#data, (newStart - overlap), start, overlap))
         {
            overlap -= Const.DATA_GRANULARITY;
         }

         if ((overlap > 0) || (newStart < start))
         {
            // some overlap, or just move the whole block
            movedStart = newStart - overlap;
            mapIndex = start >> Const.SHIFT_2;

            for (i = blockCount; i > 0; i--)
            {
               this.#map[mapIndex++] = movedStart;
               movedStart += Const.DATA_BLOCK_LENGTH;
            }

            // move the non-overlapping indexes to their new positions
            start += overlap;
            for (i = blockLength - overlap; i > 0; i--) { this.#data[newStart++] = this.#data[start++]; }
         }
         else
         { // no overlap && newStart==start
            mapIndex = start >> Const.SHIFT_2;
            for (i = blockCount; i > 0; i--)
            {
               this.#map[mapIndex++] = start;
               start += Const.DATA_BLOCK_LENGTH;
            }

            newStart = start;
         }
      }

      // now adjust the index-2 table
      i = 0;
      while (i < this.#index2Length)
      {
         // Gap indexes are invalid (-1). Skip over the gap.
         if (i === ConstB.INDEX_GAP_OFFSET) { i += ConstB.INDEX_GAP_LENGTH; }

         this.#index2[i] = this.#map[this.#index2[i] >> Const.SHIFT_2];

         ++i;
      }

      this.#dataNullOffset = this.#map[this.#dataNullOffset >> Const.SHIFT_2];

      // ensure dataLength alignment
      while ((newStart & (Const.DATA_GRANULARITY - 1)) !== 0) { this.#data[newStart++] = this.#initialValue; }

      this.#dataLength = newStart;
   }

   #compactIndex2()
   {
      // do not compact linear-BMP index-2 blocks
      let newStart = Const.INDEX_2_BMP_LENGTH;
      let start = 0;
      let i = 0;

      while (start < newStart)
      {
         this.#map[i++] = start;
         start += Const.INDEX_2_BLOCK_LENGTH;
      }

      // Reduce the index table gap to what will be needed at runtime.
      newStart += Const.UTF8_2B_INDEX_2_LENGTH + ((this.#highStart - 0x10000) >> Const.SHIFT_1);
      start = ConstB.INDEX_2_NULL_OFFSET;
      while (start < this.#index2Length)
      {
         // start: index of first entry of current block
         // newStart: index where the current block is to be moved
         //           (right after current end of already-compacted data)

         // search for an identical block
         let movedStart;
         if ((movedStart = this.#findSameIndex2Block(newStart, start)) >= 0)
         {
            // found an identical block, set the other block's index value for the current block
            this.#map[start >> Const.SHIFT_1_2] = movedStart;

            // advance start to the next block
            start += Const.INDEX_2_BLOCK_LENGTH;

            // leave newStart with the previous block!
            continue;
         }

         // see if the beginning of this block can be overlapped with the end of the previous block
         // look for maximum overlap with the previous, adjacent block
         let overlap = Const.INDEX_2_BLOCK_LENGTH - 1;
         while ((overlap > 0) && !this.#equalInt(this.#index2, (newStart - overlap), start, overlap)) { --overlap; }

         if ((overlap > 0) || (newStart < start))
         {
            // some overlap, or just move the whole block
            this.#map[start >> Const.SHIFT_1_2] = newStart - overlap;

            // move the non-overlapping indexes to their new positions
            start += overlap;
            for (i = Const.INDEX_2_BLOCK_LENGTH - overlap; i > 0; i--)
            {
               this.#index2[newStart++] = this.#index2[start++];
            }
         }
         else
         { // no overlap && newStart==start
            this.#map[start >> Const.SHIFT_1_2] = start;
            start += Const.INDEX_2_BLOCK_LENGTH;
            newStart = start;
         }
      }

      // now adjust the index-1 table
      for (i = 0; i < ConstB.INDEX_1_LENGTH; i++) { this.#index1[i] = this.#map[this.#index1[i] >> Const.SHIFT_1_2]; }

      this.#index2NullOffset = this.#map[this.#index2NullOffset >> Const.SHIFT_1_2];

      // Ensure data table alignment:
      // Needs to be granularity-aligned for 16-bit trie
      // (so that dataMove will be down-shiftable),
      // and 2-aligned for uint32_t data.

      // Arbitrary value: 0x3fffc not possible for real data.
      while ((newStart & ((Const.DATA_GRANULARITY - 1) | 1)) !== 0)
      {
         this.#index2[newStart++] = 0x0000ffff << Const.INDEX_SHIFT;
      }

      this.#index2Length = newStart;
   }

   #equalInt(a: Int32Array | Uint32Array, s: number, t: number, length: number)
   {
      for (let i = 0; i < length; i++)
      {
         if (a[s + i] !== a[t + i]) { return false; }
      }

      return true;
   }

   #fillBlock(block: number, start: number, limit: number, value: number, initialValue: number, overwrite: boolean)
   {
      let i;
      if (overwrite)
      {
         for (i = block + start; i < block + limit; i++) { this.#data[i] = value; }
      }
      else
      {
         for (i = block + start; i < block + limit; i++)
         {
            if (this.#data[i] === initialValue) { this.#data[i] = value; }
         }
      }
   }

   #findHighStart(highValue: number)
   {
      let prevBlock, prevI2Block;
      const data32 = this.#data;
      const initialValue = this.#initialValue;
      const index2NullOffset = this.#index2NullOffset;
      const nullBlock = this.#dataNullOffset;

      // set variables for previous range
      if (highValue === initialValue)
      {
         prevI2Block = index2NullOffset;
         prevBlock = nullBlock;
      }
      else
      {
         prevI2Block = -1;
         prevBlock = -1;
      }

      const prev = 0x110000;

      // enumerate index-2 blocks
      let i1 = ConstB.INDEX_1_LENGTH;
      let c = prev;
      while (c > 0)
      {
         const i2Block = this.#index1[--i1];
         if (i2Block === prevI2Block)
         {
            // the index-2 block is the same as the previous one, and filled with highValue
            c -= ConstB.CP_PER_INDEX_1_ENTRY;
            continue;
         }

         prevI2Block = i2Block;
         if (i2Block === index2NullOffset)
         {
            // this is the null index-2 block
            if (highValue !== initialValue) { return c; }

            c -= ConstB.CP_PER_INDEX_1_ENTRY;
         }
         else
         {
            // enumerate data blocks for one index-2 block
            let i2 = Const.INDEX_2_BLOCK_LENGTH;
            while (i2 > 0)
            {
               const block = this.#index2[i2Block + --i2];
               if (block === prevBlock)
               {
                  // the block is the same as the previous one, and filled with highValue
                  c -= Const.DATA_BLOCK_LENGTH;
                  continue;
               }

               prevBlock = block;
               if (block === nullBlock)
               {
                  // this is the null data block
                  if (highValue !== initialValue) { return c; }

                  c -= Const.DATA_BLOCK_LENGTH;
               }
               else
               {
                  let j = Const.DATA_BLOCK_LENGTH;
                  while (j > 0)
                  {
                     const value = data32[block + --j];

                     if (value !== highValue) { return c; }

                     --c;
                  }
               }
            }
         }
      }

      // deliver last range
      return 0;
   }

   #findSameDataBlock(dataLength: number, otherBlock: number, blockLength: number)
   {
      // ensure that we do not even partially get past dataLength
      dataLength -= blockLength;
      let block = 0;
      while (block <= dataLength)
      {
         if (this.#equalInt(this.#data, block, otherBlock, blockLength)) { return block; }

         block += Const.DATA_GRANULARITY;
      }

      return -1;
   }

   #findSameIndex2Block(index2Length: number, otherBlock: number)
   {
      // ensure that we do not even partially get past index2Length
      index2Length -= Const.INDEX_2_BLOCK_LENGTH;
      for (let block = 0; block <= index2Length; block++)
      {
         if (this.#equalInt(this.#index2, block, otherBlock, Const.INDEX_2_BLOCK_LENGTH)) { return block; }
      }

      return -1;
   }

   #getDataBlock(c: number, forLSCP: boolean)
   {
      let i2 = this.#getIndex2Block(c, forLSCP);
      i2 += (c >> Const.SHIFT_2) & Const.INDEX_2_MASK;

      const oldBlock = this.#index2[i2];
      if (this.#isWritableBlock(oldBlock))
      {
         return oldBlock;
      }

      // allocate a new data block
      const newBlock = this.#allocDataBlock(oldBlock);
      this.#setIndex2Entry(i2, newBlock);
      return newBlock;
   }

   #getIndex2Block(c: number, forLSCP: boolean)
   {
      if ((c >= 0xd800) && (c < 0xdc00) && forLSCP) { return Const.LSCP_INDEX_2_OFFSET; }

      const i1 = c >> Const.SHIFT_1;
      let i2 = this.#index1[i1];
      if (i2 === this.#index2NullOffset)
      {
         i2 = this.#allocIndex2Block();
         this.#index1[i1] = i2;
      }

      return i2;
   }

   #isInNullBlock(c: number, forLSCP: boolean)
   {
      let i2;
      if (((c & 0xfffffc00) === 0xd800) && forLSCP)
      {
         i2 = (Const.LSCP_INDEX_2_OFFSET - (0xd800 >> Const.SHIFT_2)) + (c >> Const.SHIFT_2);
      }
      else
      {
         i2 = this.#index1[c >> Const.SHIFT_1] + ((c >> Const.SHIFT_2) & Const.INDEX_2_MASK);
      }

      const block = this.#index2[i2];
      return block === this.#dataNullOffset;
   }

   #isWritableBlock(block: number)
   {
      return (block !== this.#dataNullOffset) && (this.#map[block >> Const.SHIFT_2] === 1);
   }

   #releaseDataBlock(block: number)
   {
      // put this block at the front of the free-block chain
      this.#map[block >> Const.SHIFT_2] = -this.#firstFreeBlock;
      this.#firstFreeBlock = block;
   }

   #setIndex2Entry(i2: number, block: number)
   {
      ++this.#map[block >> Const.SHIFT_2];  // increment first, in case block == oldBlock!
      const oldBlock = this.#index2[i2];
      if (--this.#map[oldBlock >> Const.SHIFT_2] === 0)
      {
         this.#releaseDataBlock(oldBlock);
      }

      this.#index2[i2] = block;
   }

   #writeBlock(block: number, value: number)
   {
      const limit = block + Const.DATA_BLOCK_LENGTH;
      while (block < limit)
      {
         this.#data[block++] = value;
      }
   }
}
