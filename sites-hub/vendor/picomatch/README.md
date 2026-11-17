# Picomatch security backport

This private package contains the runtime files from the `picomatch@4.0.7` npm release with the `lib/parse.js` fix proposed upstream in [micromatch/picomatch#194](https://github.com/micromatch/picomatch/pull/194) at commit `7be3276fb8bd215a8c73fa066bcaf696c244ad88` for [CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The parser recognizes a leading question-mark wildcard in an extglob and routes risky repeated branches through Picomatch's existing safe handling. The upstream MIT license is included.

Sites uses this implementation for all Picomatch imports, including Micromatch's older dependency and Vite's `picomatch/posix` entry point. The CommonJS API remains callable and the Sites checks cover the build and ESLint consumers. Replace this package and its override when an upstream patched release supports both dependency chains.
