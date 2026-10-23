'use strict';

// Input length alone does not bound recursive AST walker stack use.
const MAX_DEPTH = 128;
const MAX_NODES = 131072;
const depthError = () => {
  const error = new SyntaxError('Brace pattern nesting exceeds the supported depth');
  error.code = 'ERR_BRACES_MAX_DEPTH';
  return error;
};

const assertAst = ast => {
  const pending = [{ node: ast, depth: 0 }];
  const seen = new WeakSet();
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > MAX_DEPTH || seen.has(node) || ++count > MAX_NODES) throw depthError();
    seen.add(node);
    if (!Array.isArray(node.nodes)) continue;
    if (node.nodes.length > MAX_NODES) throw depthError();
    for (const child of node.nodes) pending.push({ node: child, depth: depth + 1 });
  }
};

module.exports = { MAX_DEPTH, depthError, assertAst };
