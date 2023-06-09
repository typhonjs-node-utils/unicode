# @typhonjs-svelte/unicode
Provides a fast and space efficient ESM based Unicode grapheme parser including an `IterableIterator` parser.

There are two resources available that work well in the browser via the `fflate` compression library:
- A modern fork of [unicode-trie](https://www.npmjs.com/package/unicode-trie); build optimized binary trie data
  structure for quick Unicode lookup.

- A modern fork of [graphemesplit](https://www.npmjs.com/package/graphemesplit) supports [UAX#29](http://www.unicode.org/reports/tr29/#Grapheme_Cluster_Boundaries)

The main use case presently supported is parsing strings for Unicode grapheme clusters.

The following functions are exported from `@typhonjs-svelte/unicode`:
- `graphemeSplit(string): string[]`
- `graphemeIterator(string): IterableIterator<string>`

For instance, you can use `graphemeIterator` as a tokenizer for [@typhonjs-svelte/trie-search]() allowing the trie to
be made up of Unicode graphemes. There is more work to be done on this package especially for making a complete
implementation of `graphemeIterator`. Right now there is a trivial / eager implementation that uses `graphemeSplit`, so
the goal is to move toward creating a `graphemeIterator` implementation w/ full Unicode support, but more importantly
the most compact browser capable implementation possible.

This package is available in two varieties. First is the main independent distribution via `@typhonjs-svelte/unicode`.
When you bundle this package for the browser presumably w/ Rollup or another bundler do remember to configure your
bundle for browser support. For instance when using Rollup and `@rollup/plugin-node-resolve` pass `{ browser: true }`
to the Node resolve plugin.

----

This package is also a feeder library to [@typhonjs-svelte/runtime-base](https://github.com/typhonjs-svelte/runtime-base).

Typically `package.json` `imports` are recommended to assign to the TyphonJS Runtime Library hence you'll see
`#runtime` references below.

In the TyphonJS Runtime Library you may access these packages from:
- `#runtime/data/format/unicode`
- `#runtime/data/format/unicode/trie`
