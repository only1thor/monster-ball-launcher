#!/bin/bash
# build-version.sh — Generate js/version.js with build info
# Called by CI pipeline before deploy; also run locally after commits.
set -euo pipefail

HASH=$(git rev-parse HEAD 2>/dev/null || echo "00000000")
SHORT="${HASH:0:4}"
DATE=$(date +"%Y.%m.%d-%H.%M")
VERSION="${DATE}+${SHORT}"
COMMIT_URL="https://github.com/only1thor/monster-ball-launcher/commit/${HASH}"

cat > js/version.js <<VERSIONEOF
(function(){'use strict';window.MBL_VERSION={string:'${VERSION}',url:'${COMMIT_URL}'};})();
VERSIONEOF

echo "version.js: ${VERSION}"