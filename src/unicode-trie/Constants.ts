/**
 * Shared constants between {@link UnicodeTrie} and {@link UnicodeTrieBuilder}.
 */
export class Const
{
   static readonly SHIFT_1: number = 6 + 5;

   /**
    * Shift size for getting the index-2 table offset.
    */
   static readonly SHIFT_2: number = 5;

   /**
    * Difference between the two shift sizes, for getting an index-1 offset from an index-2 offset. `6=11-5`.
    */
   static readonly SHIFT_1_2: number = this.SHIFT_1 - this.SHIFT_2;

   /**
    * Number of index-1 entries for the BMP. `32=0x20`.
    * This part of the index-1 table is omitted from the serialized form.
    */
   static readonly OMITTED_BMP_INDEX_1_LENGTH: number = 0x10000 >> this.SHIFT_1;

   /**
    * Number of entries in an index-2 block. `64=0x40`.
    */
   static readonly INDEX_2_BLOCK_LENGTH: number = 1 << this.SHIFT_1_2;

   /**
    * Mask for getting the lower bits for the in-index-2-block offset.
    */
   static readonly INDEX_2_MASK: number = this.INDEX_2_BLOCK_LENGTH - 1;

   /**
    * Shift size for shifting left the index array values.
    * Increases possible data size with 16-bit index values at the cost of compactability.
    * This requires data blocks to be aligned by #DATA_GRANULARITY.
    */
   static readonly INDEX_SHIFT: number = 2;

   /**
    * Number of entries in a data block. `32=0x20`.
    */
   static readonly DATA_BLOCK_LENGTH: number = 1 << this.SHIFT_2;

   /**
    * Mask for getting the lower bits for the in-data-block offset.
    */
   static readonly DATA_MASK: number = this.DATA_BLOCK_LENGTH - 1;

   /**
    * The part of the index-2 table for U+D800..U+DBFF stores values for lead surrogate code _units_ not code _points_.
    * Values for lead surrogate code _points_ are indexed with this portion of the table.
    * Length=32=0x20=0x400>>SHIFT_2. (There are 1024=0x400 lead surrogates.)
    */
   static readonly LSCP_INDEX_2_OFFSET: number = 0x10000 >> this.SHIFT_2;
   static readonly LSCP_INDEX_2_LENGTH: number = 0x400 >> this.SHIFT_2;

   /**
    * Count the lengths of both BMP pieces. `2080=0x820`.
    */
   static readonly INDEX_2_BMP_LENGTH: number = this.LSCP_INDEX_2_OFFSET + this.LSCP_INDEX_2_LENGTH;

   /**
    * The 2-byte UTF-8 version of the index-2 table follows at offset `2080=0x820`.
    * Length `32=0x20` for lead bytes `C0..DF`, regardless of SHIFT_2.
    */
   static readonly UTF8_2B_INDEX_2_OFFSET: number = this.INDEX_2_BMP_LENGTH;
   static readonly UTF8_2B_INDEX_2_LENGTH: number = 0x800 >> 6;  // U+0800 is the first code point after 2-byte UTF-8

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
   static readonly INDEX_1_OFFSET: number = this.UTF8_2B_INDEX_2_OFFSET + this.UTF8_2B_INDEX_2_LENGTH;
   static readonly MAX_INDEX_1_LENGTH = 0x100000 >> this.SHIFT_1;

   /**
    * The alignment size of a data block. Also, the granularity for compaction.
    */
   static readonly DATA_GRANULARITY: number = 1 << this.INDEX_SHIFT;
}

/**
 * Constants specific to {@link UnicodeTrieBuilder}.
 */
export class ConstB
{
   /**
    * Number of code points per index-1 table entry. `2048=0x800`.
    */
   static readonly CP_PER_INDEX_1_ENTRY = 1 << Const.SHIFT_1;

   /**
    * The BMP part of the index-2 table is fixed and linear and starts at offset 0.
    * Length=2048=0x800=0x10000>>SHIFT_2.
    */
   static readonly INDEX_2_OFFSET = 0;

   /**
    * The illegal-UTF-8 data block follows the ASCII block, at offset `128=0x80`.
    * Used with linear access for single bytes 0..0xbf for simple error handling.
    * Length `64=0x40`, not DATA_BLOCK_LENGTH.
    */
   static readonly BAD_UTF8_DATA_OFFSET = 0x80;

   /**
    * The start of non-linear-ASCII data blocks, at offset `192=0xc0`.
    */
   static readonly DATA_START_OFFSET = 0xc0;

   /**
    * The null data block.
    * Length `64=0x40` even if DATA_BLOCK_LENGTH is smaller, to work with 6-bit trail bytes from 2-byte UTF-8.
    */
   static readonly DATA_NULL_OFFSET = this.DATA_START_OFFSET;

   /**
    * The start of allocated data blocks.
    */
   static readonly NEW_DATA_START_OFFSET = this.DATA_NULL_OFFSET + 0x40;

   /**
    * The start of data blocks for U+0800 and above.
    * Below, compaction uses a block length of 64 for 2-byte UTF-8.
    * From here on, compaction uses DATA_BLOCK_LENGTH.
    * Data values for 0x780 code points beyond ASCII.
    */
   static readonly DATA_0800_OFFSET = this.NEW_DATA_START_OFFSET + 0x780;

   /**
    * Start with allocation of 16k data entries.
    */
   static readonly INITIAL_DATA_LENGTH = 1 << 14;

   /**
    * Grow about 8x each time.
    */
   static readonly MEDIUM_DATA_LENGTH = 1 << 17;

   /**
    * Maximum length of the runtime data array.
    * Limited by 16-bit index values that are left-shifted by INDEX_SHIFT, and by uint16_t
    * UTrie2Header.shiftedDataLength.
    */
   static readonly MAX_DATA_LENGTH_RUNTIME = 0xffff << Const.INDEX_SHIFT;

   /**
    *
    */
   static readonly INDEX_1_LENGTH = 0x110000 >> Const.SHIFT_1;

   /**
    * Maximum length of the build-time data array.
    * One entry per `0x110000` code points, plus the illegal-UTF-8 block and the null block, plus values for the `0x400`
    * surrogate code units.
    */
   static readonly MAX_DATA_LENGTH_BUILDTIME = 0x110000 + 0x40 + 0x40 + 0x400;

   /**
    * At build time, leave a gap in the index-2 table, at least as long as the maximum lengths of the 2-byte UTF-8
    * index-2 table and the supplementary index-1 table.
    * Round up to INDEX_2_BLOCK_LENGTH for proper compacting.
    */
   static readonly INDEX_GAP_OFFSET = Const.INDEX_2_BMP_LENGTH;
   static readonly INDEX_GAP_LENGTH = ((Const.UTF8_2B_INDEX_2_LENGTH + Const.MAX_INDEX_1_LENGTH) +
    Const.INDEX_2_MASK) & ~Const.INDEX_2_MASK;

   /**
    * Maximum length of the build-time index-2 array.
    * Maximum number of Unicode code points (0x110000) shifted right by SHIFT_2,
    * plus the part of the index-2 table for lead surrogate code points,
    * plus the build-time index gap,
    * plus the null index-2 block.
    */
   static readonly MAX_INDEX_2_LENGTH = (0x110000 >> Const.SHIFT_2) + Const.LSCP_INDEX_2_LENGTH +
    this.INDEX_GAP_LENGTH + Const.INDEX_2_BLOCK_LENGTH;

   /**
    * The null index-2 block, following the gap in the index-2 table.
    */
   static readonly INDEX_2_NULL_OFFSET = this.INDEX_GAP_OFFSET + this.INDEX_GAP_LENGTH;

   /**
    * The start of allocated index-2 blocks.
    */
   static readonly INDEX_2_START_OFFSET = this.INDEX_2_NULL_OFFSET + Const.INDEX_2_BLOCK_LENGTH;

   /**
    * Maximum length of the runtime index array.
    * Limited by its own 16-bit index values, and by uint16_t UTrie2Header.indexLength.
    * The actual maximum length is lower, (0x110000>>SHIFT_2)+UTF8_2B_INDEX_2_LENGTH+MAX_INDEX_1_LENGTH.
    */
   static readonly MAX_INDEX_LENGTH = 0xffff;
}
