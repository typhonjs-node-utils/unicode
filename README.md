![@typhonjs-utils/unicode](https://i.imgur.com/UL2ygmf.jpg)

[![NPM](https://img.shields.io/npm/v/@typhonjs-utils/unicode.svg?label=npm)](https://www.npmjs.com/package/@typhonjs-utils/unicode)
[![Code Style](https://img.shields.io/badge/code%20style-allman-yellowgreen.svg?style=flat)](https://en.wikipedia.org/wiki/Indent_style#Allman_style)
[![License](https://img.shields.io/badge/license-MPLv2-yellowgreen.svg?style=flat)](https://github.com/typhonjs-node-utils/unicode/blob/main/LICENSE)
[![Build Status](https://github.com/typhonjs-node-utils/unicode/workflows/CI/CD/badge.svg)](#)
[![Coverage](https://img.shields.io/codecov/c/github/typhonjs-node-utils/unicode.svg)](https://codecov.io/github/typhonjs-node-utils/unicode)
[![API Docs](https://img.shields.io/badge/API%20Documentation-476ff0)](https://typhonjs-node-utils.github.io/unicode/)
[![Discord](https://img.shields.io/discord/737953117999726592?label=TyphonJS%20Discord)](https://typhonjs.io/discord/)
[![Twitch](https://img.shields.io/twitch/status/typhonrt?style=social)](https://www.twitch.tv/typhonrt)

Provides a fast and space efficient ESM based Unicode grapheme parser including an iterable parser.

[API documentation](https://typhonjs-node-utils.github.io/unicode/)

## Overview:

There are two resources available that work well in the browser via the `fflate` compression library:
- A modern fork of [unicode-trie](https://www.npmjs.com/package/unicode-trie); build optimized binary trie data structure for quick Unicode lookup.

- A modern fork of [graphemesplit](https://www.npmjs.com/package/graphemesplit) supports [UAX#29](http://www.unicode.org/reports/tr29/#Grapheme_Cluster_Boundaries)

The main use case presently supported is parsing strings for Unicode grapheme clusters.

The following functions are exported from `@typhonjs-utils/unicode`:
- `graphemeSplit(string): string[]`
- `graphemeIterator(string): IterableIterator<string>`

For instance, you can use `graphemeIterator` as a tokenizer for [@typhonjs-svelte/trie-search](https://www.npmjs.com/package/@typhonjs-svelte/trie-search) allowing the trie to
be made up of Unicode graphemes. There is more work to be done on this package especially for making a complete
implementation of `graphemeIterator`. Right now there is a trivial / eager implementation that uses `graphemeSplit`, so
the goal is to move toward creating a `graphemeIterator` implementation w/ full Unicode support, but more importantly
the most compact browser capable implementation possible.

When you bundle this package for the browser presumably w/ Rollup or another bundler do remember to configure your
bundle for browser support. For instance when using Rollup and `@rollup/plugin-node-resolve` pass `{ browser: true }`
to the Node resolve plugin.

## Roadmap:
- Complete a non-eager implementation of `graphemeIterator`.
