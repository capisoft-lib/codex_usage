// ESLint 9 and its plugins still require minimatch's callable v3 interface.
// Upstream v11's function retains that interface and its attached helpers.
const core = require('minimatch-core');
module.exports = Object.assign(core.minimatch, core);
module.exports.minimatch = core.minimatch;
module.exports.Minimatch = core.Minimatch;
module.exports.AST = core.AST;
module.exports.GLOBSTAR = core.GLOBSTAR;
module.exports.sep = core.sep;
module.exports.filter = core.filter;
module.exports.defaults = core.defaults;
module.exports.braceExpand = core.braceExpand;
module.exports.makeRe = core.makeRe;
module.exports.match = core.match;
module.exports.escape = core.escape;
module.exports.unescape = core.unescape;
