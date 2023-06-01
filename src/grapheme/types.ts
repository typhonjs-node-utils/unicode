/**
 * Defines useful constants from Unicode Annex #29 - Unicode Text Segmentation.
 *
 * @see https://www.unicode.org/reports/tr29
 */
export namespace UAX29 {
   /**
    * @see https://www.unicode.org/reports/tr29/#Default_Grapheme_Cluster_Table
    */
   export enum ClusterBreak {
      Other = 0,
      CR = 1 << 0,
      LF = 1 << 1,
      Control = 1 << 2,
      Extend = 1 << 3,
      ZWJ = 1 << 4,
      Regional_Indicator = 1 << 5,
      Prepend = 1 << 6,
      SpacingMark = 1 << 7,
      L = 1 << 8,
      V = 1 << 9,
      T = 1 << 10,
      LV = 1 << 11,
      LVT = 1 << 12,
      Extended_Pictographic = 1 << 13,
   }
}
