#!/usr/bin/env bash
# This file is declarative input for app-agent's launcher parser.
# It is not a standalone local canvas connection or an agent shell tool.
set -euo pipefail
PRODUCT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec pi --approve --no-context-files --no-extensions \
  -e "$PRODUCT_DIR/.pi/extensions/mint-runtime.mjs" \
  -e "$PRODUCT_DIR/.pi/vendor/node_modules/@narumitw/pi-goal/dist/index.ts" \
  --no-skills --skill "$PRODUCT_DIR/.pi/skills" \
  --no-prompt-templates --no-themes \
  --system-prompt "$PRODUCT_DIR/.pi/SYSTEM.md" \
  --tools read,write,edit,find,grep,ls,mint_skill,workflow,workflow_control,goal_complete,goal_blocked,goal_wait \
  "$@"
