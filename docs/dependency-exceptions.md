# Dependency security

The dependency audit rejects every reported vulnerability, including development dependencies. There are no temporary exceptions or expiry dates.

Mesh ingress, Sites and the optional desktop helper pin Undici 7.30.1 through npm overrides. This includes the upstream [October security fixes](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c) while keeping the existing major version. Their lockfiles also carry the patched Fast URI and Zod releases for Sites and Electron 44.9.3 for the desktop helper. CI audits all three dependency trees, including the desktop development dependencies.

The unpatched upstream braces 3.0.3 parser is replaced with the private, vendored @codex-usage/braces-safe package through an npm override. This preserves the globbing API while bounding parser nesting and checking external ASTs before recursive traversal. See sites-hub/vendor/braces/README.md for provenance, the exact mitigation and compatibility constraints; the upstream MIT license is retained.

Regression tests exercise deeply nested braces and parentheses, unclosed input, externally constructed and cyclic ASTs, normal expansion and the actual Micromatch/Fast Glob dependency chain. Vite uses the patched 8.2.4 release. npm run audit:deps --prefix sites-hub must report zero vulnerabilities without an allowlist.

Sites pins `@vercel/og` 1.0.3, which includes the fixed Satori 0.33.5, for [GHSA-wx4j-mvgx-mqwp](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp). Updating only the transitive Satori package would leave the older renderer bundled inside `@vercel/og`; the override updates that bundle too. This app does not generate Open Graph images. The existing build, route tests, lint and type checking cover its actual use of Vinext. The new renderer has a standalone Node WASM-loader issue; standalone OG rendering is not a supported or verified app feature.

The renderer adds an exact old `fflate` dependency; it is overridden to the compatible 0.7.5 patch for [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98). The bundled OG renderer uses the inflate helpers and does not bundle the vulnerable `unzipSync` ZIP parser.

The Docker base is pinned to Node 22.23.4 / Alpine 3.24.3 and its multi-platform digest. System packages are upgraded, with musl and musl-utils at least 1.2.6-r3. Alpine records CVE-2026-107891 as fixed in 1.2.6-r3 on 3.24, while edge uses 1.2.6-r6; comparing those release numbers across branches produces a false positive. See the [Alpine tracker](https://security.alpinelinux.org/vuln/CVE-2026-107891). `node scripts/audit-container.mjs IMAGE PLATFORM` checks every installed APK against its own branch's official security database. This supplements the full image scan and is not a claim about undiscovered vulnerabilities.
