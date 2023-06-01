# @typhonjs-svelte/unicode

Currently, this is a feeder package to [@typhonjs-svelte/runtime-base](https://github.com/typhonjs-svelte/runtime-base),
but could be independently available in the future. Please take note that the current build treats other modules from
`runtime-base` as external for base64 and compression support.

There are two resources available that work well in the browser via the `fflate` compression library:
- A modern fork of [unicode-trie](https://www.npmjs.com/package/unicode-trie); build optimized binary trie data
structure for quick Unicode lookup.

- A modern fork of [graphemesplit](https://www.npmjs.com/package/graphemesplit) supports [UAX#29](http://www.unicode.org/reports/tr29/#Grapheme_Cluster_Boundaries)

In the TyphonJS Runtime Library you may access these packages from:
- `#runtime/data/format/unicode`
- `#runtime/data/format/unicode/trie`

The main use case presently supported is parsing strings for Unicode grapheme clusters.

The following functions are exported from `#runtime/data/format/unicode`:
- `graphemeSplit(string): string[]`
- `graphemeIterator(string): IterableIterator<string>`

For instance, you can use `graphemeIterator` as a tokenizer for `TrieSearch` available at
`#runtime/data/struct/search/trie` allowing the trie to be made up of Unicode graphemes. There is more
work to be done on this package especially for making a complete implementation of `graphemeIterator`.
Right now there is a trivial implementation that uses `graphemeSplit`, so the goal is to move toward
creating a `graphemeIterator` implementation w/ full Unicode support, but more importantly the most compact
browser capable implementation possible.

