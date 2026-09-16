#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.13 or newer is required." >&2
  exit 1
fi

node -e "const [major,minor]=process.versions.node.split('.').map(Number); if (major<22 || (major===22 && minor<13)) { console.error('Node.js 22.13 or newer is required.'); process.exit(1); }"
exec node server.mjs
