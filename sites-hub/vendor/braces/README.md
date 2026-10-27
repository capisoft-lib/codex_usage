# Bounded Braces parser

Private, vendored copy of [micromatch/braces 3.0.3](https://github.com/micromatch/braces/tree/3.0.3), from the npm braces-3.0.3 tarball. The upstream MIT license and copyright are retained in LICENSE. This is a local security patch, not an upstream release.

Original npm tarball integrity: `sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==`.

The original library recursively visits the AST without a nesting bound (GHSA-vfj7-8cjw-p6xm). This copy adds:

- A fixed parser stack bound of 128, covering curly braces and parentheses, including unclosed input. Caller options cannot disable it.
- An iterative depth, cycle and node-count check before compile, expand and stringify recurse, including caller-supplied ASTs. Parent and previous-node references are not traversed.
- A controlled SyntaxError with code ERR_BRACES_MAX_DEPTH instead of a native stack overflow.

index.js, constants.js and utils.js retain upstream behavior. Normal alternatives, numeric ranges, escaping and glob patterns retain the upstream API. The project-level npm override makes the development tools use this local package through their existing braces dependency.

Regression and consumer integration tests: sites-hub/tests/braces-depth.test.mjs. The project audit has no date-based or development-only exceptions. Replace this local patch with an upstream fixed release when one becomes available, retaining the regression tests.
