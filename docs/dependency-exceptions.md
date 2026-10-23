# Dependency security

The dependency audit rejects every reported vulnerability, including development dependencies. There are no temporary exceptions or expiry dates.

The unpatched upstream braces 3.0.3 parser is replaced with the private, vendored @codex-usage/braces-safe package through an npm override. This preserves the globbing API while bounding parser nesting and checking external ASTs before recursive traversal. See sites-hub/vendor/braces/README.md for provenance, the exact mitigation and compatibility constraints; the upstream MIT license is retained.

Regression tests exercise deeply nested braces and parentheses, unclosed input, externally constructed and cyclic ASTs, normal expansion and the actual Micromatch/Fast Glob dependency chain. Vite uses the patched 8.2.4 release. npm run audit:deps --prefix sites-hub must report zero vulnerabilities without an allowlist.
