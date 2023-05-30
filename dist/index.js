import { toUint8Array } from '#runtime/data/format/base64';
import { decompressSync } from '#runtime/data/compress';

const isBigEndian = (new Uint8Array(new Uint32Array([0x12345678]).buffer)[0] === 0x12);
const swap = (b, n, m) => {
    let i = b[n];
    b[n] = b[m];
    b[m] = i;
};
const swap32 = array => {
    const len = array.length;
    for (let i = 0; i < len; i += 4) {
        swap(array, i, i + 3);
        swap(array, i + 1, i + 2);
    }
};
const swap32LE = array => {
    if (isBigEndian) {
        swap32(array);
    }
};

// Shift size for getting the index-1 table offset.
const SHIFT_1 = 6 + 5;
// Shift size for getting the index-2 table offset.
const SHIFT_2 = 5;
// Difference between the two shift sizes,
// for getting an index-1 offset from an index-2 offset. 6=11-5
const SHIFT_1_2 = SHIFT_1 - SHIFT_2;
// Number of index-1 entries for the BMP. 32=0x20
// This part of the index-1 table is omitted from the serialized form.
const OMITTED_BMP_INDEX_1_LENGTH = 0x10000 >> SHIFT_1;
// Number of entries in an index-2 block. 64=0x40
const INDEX_2_BLOCK_LENGTH = 1 << SHIFT_1_2;
// Mask for getting the lower bits for the in-index-2-block offset. */
const INDEX_2_MASK = INDEX_2_BLOCK_LENGTH - 1;
// Shift size for shifting left the index array values.
// Increases possible data size with 16-bit index values at the cost
// of compactability.
// This requires data blocks to be aligned by DATA_GRANULARITY.
const INDEX_SHIFT = 2;
// Number of entries in a data block. 32=0x20
const DATA_BLOCK_LENGTH = 1 << SHIFT_2;
// Mask for getting the lower bits for the in-data-block offset.
const DATA_MASK = DATA_BLOCK_LENGTH - 1;
// The part of the index-2 table for U+D800..U+DBFF stores values for
// lead surrogate code _units_ not code _points_.
// Values for lead surrogate code _points_ are indexed with this portion of the table.
// Length=32=0x20=0x400>>SHIFT_2. (There are 1024=0x400 lead surrogates.)
const LSCP_INDEX_2_OFFSET = 0x10000 >> SHIFT_2;
const LSCP_INDEX_2_LENGTH = 0x400 >> SHIFT_2;
// Count the lengths of both BMP pieces. 2080=0x820
const INDEX_2_BMP_LENGTH = LSCP_INDEX_2_OFFSET + LSCP_INDEX_2_LENGTH;
// The 2-byte UTF-8 version of the index-2 table follows at offset 2080=0x820.
// Length 32=0x20 for lead bytes C0..DF, regardless of SHIFT_2.
const UTF8_2B_INDEX_2_OFFSET = INDEX_2_BMP_LENGTH;
const UTF8_2B_INDEX_2_LENGTH = 0x800 >> 6; // U+0800 is the first code point after 2-byte UTF-8
// The index-1 table, only used for supplementary code points, at offset 2112=0x840.
// Variable length, for code points up to highStart, where the last single-value range starts.
// Maximum length 512=0x200=0x100000>>SHIFT_1.
// (For 0x100000 supplementary code points U+10000..U+10ffff.)
//
// The part of the index-2 table for supplementary code points starts
// after this index-1 table.
//
// Both the index-1 table and the following part of the index-2 table
// are omitted completely if there is only BMP data.
const INDEX_1_OFFSET = UTF8_2B_INDEX_2_OFFSET + UTF8_2B_INDEX_2_LENGTH;
// The alignment size of a data block. Also the granularity for compaction.
const DATA_GRANULARITY = 1 << INDEX_SHIFT;
class UnicodeTrie {
    data;
    errorValue;
    highStart;
    constructor(data) {
        const isBuffer = (typeof data.readUInt32BE === 'function') && (typeof data.slice === 'function');
        if (isBuffer || data instanceof Uint8Array) {
            if (isBuffer) {
                this.highStart = data.readUInt32LE(0);
                this.errorValue = data.readUInt32LE(4);
                data.readUInt32LE(8);
                data = data.slice(12);
            }
            else {
                const view = new DataView(data.buffer);
                this.highStart = view.getUint32(0, true);
                this.errorValue = view.getUint32(4, true);
                view.getUint32(8, true);
                data = data.subarray(12);
            }
            // double inflate the actual trie data
            data = decompressSync(data);
            data = decompressSync(data);
            // swap bytes from little-endian
            swap32LE(data);
            this.data = new Uint32Array(data.buffer);
        }
        else {
            // pre-parsed data
            ({ data: this.data, highStart: this.highStart, errorValue: this.errorValue } = data);
        }
    }
    get(codePoint) {
        let index;
        if ((codePoint < 0) || (codePoint > 0x10ffff)) {
            return this.errorValue;
        }
        if ((codePoint < 0xd800) || ((codePoint > 0xdbff) && (codePoint <= 0xffff))) {
            // Ordinary BMP code point, excluding leading surrogates.
            // BMP uses a single level lookup.  BMP index starts at offset 0 in the index.
            // data is stored in the index array itself.
            index = (this.data[codePoint >> SHIFT_2] << INDEX_SHIFT) + (codePoint & DATA_MASK);
            return this.data[index];
        }
        if (codePoint <= 0xffff) {
            // Lead Surrogate Code Point.  A Separate index section is stored for
            // lead surrogate code units and code points.
            //   The main index has the code unit data.
            //   For this function, we need the code point data.
            index = (this.data[LSCP_INDEX_2_OFFSET + ((codePoint - 0xd800) >> SHIFT_2)] << INDEX_SHIFT) + (codePoint & DATA_MASK);
            return this.data[index];
        }
        if (codePoint < this.highStart) {
            // Supplemental code point, use two-level lookup.
            index = this.data[(INDEX_1_OFFSET - OMITTED_BMP_INDEX_1_LENGTH) + (codePoint >> SHIFT_1)];
            index = this.data[index + ((codePoint >> SHIFT_2) & INDEX_2_MASK)];
            index = (index << INDEX_SHIFT) + (codePoint & DATA_MASK);
            return this.data[index];
        }
        return this.data[this.data.length - DATA_GRANULARITY];
    }
}

const typeTrieB64 = "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";

const extPictB64 = "AAACAAAAAACAOAAAAbYBSf7t2S1IBEEYBuDVDZ7FYrQMNsFiu3hgEYOI0SCXRIUrB8JhEZtgs5gEg1GMFk02m82oGI02m+9xezCOczv/uwv3fvAwc/PzfXOzcdqzWdaBDdiGPdiHdjE+DS3RNDuCfsn8idQ/g3OH3BdwKf0e96/gumTfYcncLdzBPTzAo+RZ+f0Cr/AG7/AJX4738x1wtz9FO5PX/50n6UXMNdfg/0lERERERERERERERETpdedHBvDRql4nq0cXtW9af98qdRby0Vvp8K4W0V+C5Xw0t4J2bfjeBp3cnEu1brnnCTYNa7eKdz91XP7WO9Lb4GqRb7cY6xbtAdqeVOsY/QGcevw/tb6OT85YhvfKYEx9CMuxKsKnrs+eJtVInVvHJ0eVYVvTZk2siFVLOCjb61PTZX3MdVWEyP7fjzpmMxdzTyq2Ebue6x61nXRGnzndWpf1an7dXmGYE4Y1ptqqKsK1nu26Ju0ty+maV2Rpvk+qnDZjKUIobUiesdAQE/jmCTmHmsskpFZsVYbtmXRcaoSGUPomunW2derQhDPFjtT1Q/eb8vnm990fq35oHVt11bU9m89c7DNI8Qs=";

var UnicodeProperty;
(function (UnicodeProperty) {
    UnicodeProperty[UnicodeProperty["Other"] = 0] = "Other";
    UnicodeProperty[UnicodeProperty["CR"] = 1] = "CR";
    UnicodeProperty[UnicodeProperty["LF"] = 2] = "LF";
    UnicodeProperty[UnicodeProperty["Control"] = 4] = "Control";
    UnicodeProperty[UnicodeProperty["Extend"] = 8] = "Extend";
    UnicodeProperty[UnicodeProperty["ZWJ"] = 16] = "ZWJ";
    UnicodeProperty[UnicodeProperty["Regional_Indicator"] = 32] = "Regional_Indicator";
    UnicodeProperty[UnicodeProperty["Prepend"] = 64] = "Prepend";
    UnicodeProperty[UnicodeProperty["SpacingMark"] = 128] = "SpacingMark";
    UnicodeProperty[UnicodeProperty["L"] = 256] = "L";
    UnicodeProperty[UnicodeProperty["V"] = 512] = "V";
    UnicodeProperty[UnicodeProperty["T"] = 1024] = "T";
    UnicodeProperty[UnicodeProperty["LV"] = 2048] = "LV";
    UnicodeProperty[UnicodeProperty["LVT"] = 4096] = "LVT";
    UnicodeProperty[UnicodeProperty["Extended_Pictographic"] = 8192] = "Extended_Pictographic";
})(UnicodeProperty || (UnicodeProperty = {}));

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
function nextGraphemeClusterSize(ts, start) {
    const L = ts.length;
    let ri = 0;
    let gb11State = GB11State.Initial;
    // GB1: sot ÷ Any
    for (let i = start; i + 1 < L; i++) {
        const curr = ts[i + 0];
        const next = ts[i + 1];
        // for GB12, GB13
        if (!is(curr, UnicodeProperty.Regional_Indicator)) {
            ri = 0;
        }
        // for GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
        switch (gb11State) {
            case GB11State.NotBoundary:
            case GB11State.Initial:
                if (is(curr, UnicodeProperty.Extended_Pictographic)) {
                    gb11State = GB11State.ExtendOrZWJ;
                }
                else {
                    gb11State = GB11State.Initial;
                }
                break;
            case GB11State.ExtendOrZWJ:
                if (is(curr, UnicodeProperty.Extend)) {
                    gb11State = GB11State.ExtendOrZWJ;
                }
                else if (is(curr, UnicodeProperty.ZWJ) && is(next, UnicodeProperty.Extended_Pictographic)) {
                    gb11State = GB11State.NotBoundary;
                }
                else {
                    gb11State = GB11State.Initial;
                }
                break;
        }
        // GB3: CR x LF
        if (is(curr, UnicodeProperty.CR) && is(next, UnicodeProperty.LF)) {
            continue;
        }
        // GB4: (Control | CR | LF) ÷
        if (is(curr, UnicodeProperty.Control | UnicodeProperty.CR | UnicodeProperty.LF)) {
            return i + 1 - start;
        }
        // GB5: ÷ (Control | CR | LF)
        if (is(next, UnicodeProperty.Control | UnicodeProperty.CR | UnicodeProperty.LF)) {
            return i + 1 - start;
        }
        // GB6: L x (L | V | LV | LVT)
        if (is(curr, UnicodeProperty.L) &&
            is(next, UnicodeProperty.L | UnicodeProperty.V | UnicodeProperty.LV | UnicodeProperty.LVT)) {
            continue;
        }
        // GB7: (LV | V) x (V | T)
        if (is(curr, UnicodeProperty.LV | UnicodeProperty.V) && is(next, UnicodeProperty.V | UnicodeProperty.T)) {
            continue;
        }
        // GB8: (LVT | T) x T
        if (is(curr, UnicodeProperty.LVT | UnicodeProperty.T) && is(next, UnicodeProperty.T)) {
            continue;
        }
        // GB9: x (Extend | ZWJ)
        if (is(next, UnicodeProperty.Extend | UnicodeProperty.ZWJ)) {
            continue;
        }
        // GB9a: x SpacingMark
        if (is(next, UnicodeProperty.SpacingMark)) {
            continue;
        }
        // GB9b: Prepend x
        if (is(curr, UnicodeProperty.Prepend)) {
            continue;
        }
        // GB11: \p{Extended_Pictographic} Extend* ZWJ x \p{Extended_Pictographic}
        if (gb11State === GB11State.NotBoundary) {
            continue;
        }
        // GB12: sot (RI RI)* RI x RI
        // GB13: [^RI] (RI RI)* RI x RI
        if (is(curr, UnicodeProperty.Regional_Indicator) && is(next, UnicodeProperty.Regional_Indicator) && ri % 2 === 0) {
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
function graphemeSplit(str) {
    const graphemeClusters = [];
    const map = [0];
    const ts = [];
    for (let i = 0; i < str.length;) {
        const code = str.codePointAt(i);
        ts.push(typeTrie.get(code) | extPict.get(code));
        i += code > 65535 ? 2 : 1;
        map.push(i);
    }
    for (let offset = 0; offset < ts.length;) {
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
function* graphemeIterator(str) {
    for (const grapheme of graphemeSplit(str)) {
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
//          if (buffer && !(unicodeProperty & UnicodeProperty.ZWJ) && !(lastUnicodeProperty & UnicodeProperty.ZWJ) &&
//           !(unicodeProperty & UnicodeProperty.Extend) && !(lastUnicodeProperty & UnicodeProperty.Extend)) {
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

export { UnicodeTrie, graphemeIterator, graphemeSplit };
//# sourceMappingURL=index.js.map
