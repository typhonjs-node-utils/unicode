/**
 * Already parsed and separated trie data.
 */
type UnicodeTrieParsedData = {
    data: Uint32Array;
    highStart: number;
    errorValue: number;
};
/**
 * Defines a raw Uint8Array possibly w/ minimum signature indicating a Node Buffer.
 */
type UnicodeTrieRawData = Uint8Array & {
    readUInt32LE?: Function;
};

/**
 * Provides lookup in a pre-built UnicodeTrie data structure. Use {@link UnicodeTrieBuilder} for building /
 * serialization of a pre-built data structure.
 */
declare class UnicodeTrie {
    #private;
    /**
     * @param {UnicodeTrieParsedData | UnicodeTrieRawData} data -
     */
    constructor(data: UnicodeTrieParsedData | UnicodeTrieRawData);
    /**
     * @returns {Uint32Array} The data array.
     */
    get data(): Uint32Array;
    /**
     * @returns {number} The error value.
     */
    get errorValue(): number;
    /**
     * @returns {number} The high start.
     */
    get highStart(): number;
    /**
     * @param {number}   codePoint -
     */
    get(codePoint: number): number;
}

/**
 * Builds the UnicodeTrie data structure with options to output to a Buffer or return an instance of UnicodeTrie.
 */
declare class UnicodeTrieBuilder {
    #private;
    /**
     * @param {number}   [initialValue] -
     *
     * @param {number}   [errorValue] -
     */
    constructor(initialValue?: number, errorValue?: number);
    /**
     * @returns {UnicodeTrie} The compacted and frozen data as a new UnicodeTrie instance.
     */
    freeze(): UnicodeTrie;
    /**
     * @param {number}   codePoint - Code point to lookup.
     *
     * @param {boolean}  [fromLSCP=true] - Is this a lead surrogate code point.
     */
    get(codePoint: number, fromLSCP?: boolean): number;
    /**
     * @param {number}   codePoint - Code point to set.
     *
     * @param {value}    value - New value at code point.
     */
    set(codePoint: number, value: number): this;
    /**
     * @param {number}   start - Start code point.
     *
     * @param {number}   end - End code point.
     *
     * @param {number}   value - Value to set.
     *
     * @param {boolean}  [overwrite] - Overwrite existing values.
     */
    setRange(start: number, end: number, value: number, overwrite?: boolean): this;
    /**
     * Generates a Node Buffer containing the serialized and compressed trie.
     *
     * Note: This only works on Node. Use toUint8Array otherwise.
     *
     * uint32_t highStart;
     * uint32_t errorValue;
     * uint32_t uncompressedDataLength;
     * uint8_t trieData[dataLength];
     *
     * @returns {Buffer} A Node Buffer.
     */
    toBuffer(): Buffer;
    /**
     * Generates a packed Uint8Array containing the serialized and compressed trie.
     *
     * Note: This only works on Node. Use toUint8Array otherwise.
     *
     * uint32_t highStart;
     * uint32_t errorValue;
     * uint32_t uncompressedDataLength;
     * uint8_t trieData[dataLength];
     *
     * @returns {Uint8Array} A packed Uint8Array.
     */
    toUint8Array(): Uint8Array;
}

export { UnicodeTrie, UnicodeTrieBuilder, UnicodeTrieParsedData, UnicodeTrieRawData };
