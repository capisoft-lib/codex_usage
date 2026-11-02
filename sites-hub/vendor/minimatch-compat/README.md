# Minimatch CommonJS compatibility

ESLint 9 and its plugins expect `require('minimatch')` to return a callable function. Modern Minimatch exports a namespace containing that function. This private adapter exports the unmodified upstream `minimatch` function, including its attached `Minimatch`, `filter`, `match`, `makeRe` and `defaults` helpers.

The implementation is the exact npm release Minimatch 11.0.4, installed under the `minimatch-core` alias. No matching algorithm is vendored or patched here. Version 11.0.1 fixed [GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). Older major versions are still included in npm's affected range. Modern consumers retain named exports on the same function, with explicit exports for Node ESM interoperability.

Tests cover the callable and named interfaces, glob options used by lint rules, helper methods, defaults, and a bounded subprocess exercising the reported amplification pattern. The complete Sites lint/build/type checks verify the actual consumers.
