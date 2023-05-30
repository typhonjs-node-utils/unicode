/**
 * @param {string}   str - String to split.
 *
 * @returns {string[]} The string split by Unicode grapheme clusters.
 */
declare function graphemeSplit(str: string): string[];
/**
 * @param {string}   str - String to split.
 *
 * @returns {Generator<string>} An iterator returning grapheme clusters.
 */
declare function graphemeIterator(str: string): Generator<string>;

declare class UnicodeTrie {
    data: any;
    errorValue: any;
    highStart: any;
    constructor(data: any);
    get(codePoint: any): any;
}

export { UnicodeTrie, graphemeIterator, graphemeSplit };
