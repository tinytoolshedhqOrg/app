#!/usr/bin/env bash
set -euo pipefail

# Deploy data/dist/ to GitHub Pages (gh-pages branch) under /${PLACES_DIR}/
# PLACES_DIR is a single path segment (default: places). Example:
#   PLACES_DIR=places-staging bash deploy-places.sh
# After running, assets are available at:
#   https://tinytoolshedhqorg.github.io/app/{dir}/cells/{i}_{j}.json
#   https://tinytoolshedhqorg.github.io/app/{dir}/cities/{縣市}.json
#   https://tinytoolshedhqorg.github.io/app/{dir}/pack/full.json
#   https://tinytoolshedhqorg.github.io/app/{dir}/pack/manifest.json

PLACES_DIR="${PLACES_DIR:-places}"
if [[ ! "$PLACES_DIR" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Error: PLACES_DIR must be a single path segment (letters, numbers, dot, underscore, hyphen)."
  exit 1
fi

DIST_DIR="$(cd "$(dirname "$0")/data/dist" && pwd)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$DIST_DIR/cells" ]; then
  echo "Error: $DIST_DIR/cells not found. Run 'python3 fetchData/buildDataSet.py' first."
  exit 1
fi

cd "$REPO_ROOT"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Try checking out gh-pages; if it doesn't exist, create an orphan branch manually
if git rev-parse --verify gh-pages >/dev/null 2>&1; then
  git worktree add "$TEMP_DIR" gh-pages
else
  git worktree add --detach "$TEMP_DIR"
  cd "$TEMP_DIR"
  git checkout --orphan gh-pages
  git rm -rf . >/dev/null 2>&1 || true
  cd "$REPO_ROOT"
fi

rm -rf "$TEMP_DIR/$PLACES_DIR"
mkdir -p "$TEMP_DIR/$PLACES_DIR"
cp -r "$DIST_DIR/cells" "$TEMP_DIR/$PLACES_DIR/cells"
if [ -d "$DIST_DIR/cities" ]; then
  cp -r "$DIST_DIR/cities" "$TEMP_DIR/$PLACES_DIR/cities"
fi
cp "$DIST_DIR/manifest.json" "$TEMP_DIR/$PLACES_DIR/manifest.json" 2>/dev/null || true
cp "$DIST_DIR/index.slim.json" "$TEMP_DIR/$PLACES_DIR/index.slim.json" 2>/dev/null || true
if [ -d "$DIST_DIR/pack" ]; then
  cp -r "$DIST_DIR/pack" "$TEMP_DIR/$PLACES_DIR/pack"
fi

cd "$TEMP_DIR"
git add -A
git commit -m "update ${PLACES_DIR} data $(date +%Y-%m-%d)" --allow-empty
git push origin gh-pages

cd "$REPO_ROOT"
git worktree remove "$TEMP_DIR" --force 2>/dev/null || true

echo "Done! Places CDN: https://tinytoolshedhqorg.github.io/app/${PLACES_DIR}"
