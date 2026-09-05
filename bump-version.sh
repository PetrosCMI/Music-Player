#!/usr/bin/env bash
# Bump the patch version (1.0.0 -> 1.0.1) in app.js and index.html.
# Usage: ./bump-version.sh   # or ./bump-version.sh minor  # or ./bump-version.sh major
set -euo pipefail

cd "$(dirname "$0")"

LEVEL="${1:-patch}"

# Grab the current version from app.js APP_VERSION const.
current=$(grep -oP "APP_VERSION = '\K[^']+" app.js)
IFS='.' read -r major minor patch <<<"$current"

case "$LEVEL" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
  *) echo "Usage: $0 [major|minor|patch]"; exit 1 ;;
esac

new="${major}.${minor}.${patch}"

# Update app.js APP_VERSION (keep the string literal in single quotes).
sed -i "s/APP_VERSION = '[^']*'/APP_VERSION = '${new}'/" app.js

# Update index.html: title and .version span.
sed -i "s/${current}/${new}/g" index.html

echo "Bumped version: ${current} -> ${new}"
