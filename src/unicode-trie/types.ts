/**
 * Already parsed and separated trie data.
 */
export type UnicodeTrieParsedData = { data: Uint32Array, highStart: number, errorValue: number };

/**
 * Defines a raw Uint8Array possibly w/ minimum signature indicating a Node Buffer.
 */
export type UnicodeTrieRawData = Uint8Array & { readUInt32LE?: Function };
