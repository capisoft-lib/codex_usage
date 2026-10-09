# Temporary development dependency exception

`GHSA-vfj7-8cjw-p6xm` affects the recursive AST walkers in `braces` 3.0.3. On October 9, 2026 the [reviewed advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and npm registry report no patched release. It is used by development-time globbing through Micromatch/Fast Glob, the Sites framework build tools and the Next ESLint plugin. These inputs are repository-controlled file patterns. Do not run these tools on untrusted glob input. The dashboard's request handlers and dependency-free Docker runtime do not use this package.

Until **October 23, 2026 at 00:00 UTC**, the Sites CI audit permits only this advisory on exactly version 3.0.3, only when every affected installed package and its dependency chain is marked development-only in the lockfile. Any other advisory, a production dependency, missing metadata, a changed version or an expired exception fails CI. The audit prints the accepted exception instead of claiming zero vulnerabilities. The separate Mesh audit retains its strict policy.

`scripts/audit-dependencies.mjs` implements the narrow check; regression tests exercise expiry and rejected cases. Remove the exception when an upstream fix is available. Sharp and Source Map JS receive their available patches in this release.
