#!/usr/bin/env bash
#
# build.sh — stamp a cache-busting version into the front-end assets.
#
# The version is an 8-char hash of the *content* of the cacheable assets
# (with any existing version tokens normalized out first). That means:
#   - it changes automatically whenever app.js / app.css / index.html /
#     data/posts.json actually change, and
#   - it stays identical if nothing changed, so re-running is a no-op and
#     committing never loops.
#
# It is wired into .githooks/pre-commit, so a normal `git commit` keeps the
# version fresh with no manual bumping. You can also run it by hand:
#
#     ./build.sh
#
set -euo pipefail
cd "$(dirname "$0")"

# Files whose content should influence the version.
ASSETS=(index.html app.js app.css data/posts.json)

# Compute the version: concatenate the assets with version tokens neutralized
# (?v=… and VERSION="…") so the hash depends only on real content, then take
# the first 8 chars of the git blob hash.
VER=$(
  for f in "${ASSETS[@]}"; do
    [ -f "$f" ] && sed -E 's/\?v=[A-Za-z0-9]+/?v=_/g; s/(VERSION=")[A-Za-z0-9]+(")/\1_\2/g' "$f"
  done | git hash-object --stdin | cut -c1-8
)

# Stamp app.js (VERSION constant — used for the posts.json and per-post fetches).
sed -i.bak -E "s/(var VERSION=\")[A-Za-z0-9]+(\")/\1${VER}\2/" app.js && rm -f app.js.bak

# Stamp index.html (?v= on app.css and app.js).
sed -i.bak -E "s/\?v=[A-Za-z0-9]+/?v=${VER}/g" index.html && rm -f index.html.bak

echo "stamped version: ${VER}"
