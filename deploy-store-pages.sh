#!/usr/bin/env bash
set -euo pipefail

# Deploy app1..app5 store HTML (support + privacy) to GitHub Pages.
#
# How to run (from the repo root, on an up-to-date main):
#   git checkout main && git pull origin main
#   ./deploy-store-pages.sh
#
# The script copies from the *current working tree*, so do not run it from a
# feature branch unless you mean to publish that branch's store HTML.
#
# Targets:
#   1. PRIMARY (URL-preserving): repo tinytoolshedhq/tinytoolshedhq.github.io,
#      branch main, folder app/. This serves the URLs that App Store Connect
#      already uses:
#        https://tinytoolshedhq.github.io/app/<appN>/store/support.html
#        https://tinytoolshedhq.github.io/app/<appN>/store/privacy.html
#      History: these URLs used to come from the gh-pages branch of
#      tinytoolshedhq/app. When the repo moved to tinytoolshedhqOrg/app, GitHub
#      Pages does not redirect and the gh-pages branch was gone, so every URL
#      returned 404 (2026-11-10). Do NOT create a repo named `app` under the
#      tinytoolshedhq account: it would break the transfer redirect.
#   2. BACKUP: branch gh-pages of tinytoolshedhqOrg/app (origin), served at
#        https://tinytoolshedhqorg.github.io/app/<appN>/store/...
#
# Needs push access to both repos (gh auth / GH_TOKEN as tinytoolshedhq).

APPS=(app1 app2 app3 app4 app5)
PRIMARY_REPO="${PRIMARY_REPO:-tinytoolshedhq/tinytoolshedhq.github.io}"
PRIMARY_BRANCH="${PRIMARY_BRANCH:-main}"
PRIMARY_SUBDIR="app"

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT"

STAGE=$(mktemp -d)
WORK=$(mktemp -d)
trap 'rm -rf "$STAGE" "$WORK"' EXIT

missing=0
for app in "${APPS[@]}"; do
  mkdir -p "$STAGE/$app/store"
  for f in support.html privacy.html; do
    if [ -f "$REPO_ROOT/$app/store/$f" ]; then
      cp "$REPO_ROOT/$app/store/$f" "$STAGE/$app/store/$f"
      echo "staged $app/store/$f"
    else
      echo "missing $app/store/$f" >&2
      missing=1
    fi
  done
done
if [ "$missing" -ne 0 ]; then
  echo "Refusing to deploy with missing store pages." >&2
  exit 1
fi

# Tiny index so /app/ is not a 404
cat > "$STAGE/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>App store pages</title>
</head>
<body>
  <p>Store pages:</p>
  <ul>
    <li><a href="./app5/store/support.html">壺鈴伸展 Kettle Stretch support</a> · <a href="./app5/store/privacy.html">privacy</a></li>
    <li><a href="./app4/store/support.html">分貝計 support</a> · <a href="./app4/store/privacy.html">privacy</a></li>
    <li><a href="./app3/store/support.html">Been Ages support</a> · <a href="./app3/store/privacy.html">privacy</a></li>
    <li><a href="./app2/store/support.html">急廁 Go support</a> · <a href="./app2/store/privacy.html">privacy</a></li>
    <li><a href="./app1/store/support.html">諧音猜猜 support</a> · <a href="./app1/store/privacy.html">privacy</a></li>
  </ul>
</body>
</html>
HTML

commit_and_push() { # $1 = dir, $2 = push refspec target
  cd "$1"
  git add -A
  if git diff --cached --quiet; then
    echo "No changes in $1."
  else
    git -c user.name="tinytoolshedhq" -c user.email="tinytoolshedhq@users.noreply.github.com" \
      commit -q -m "deploy store support/privacy pages $(date +%Y-%m-%d)"
    git push -q origin "HEAD:$2"
    echo "pushed $2"
  fi
  cd "$REPO_ROOT"
}

if command -v gh >/dev/null 2>&1; then gh auth setup-git >/dev/null 2>&1 || true; fi

# 1. Primary: tinytoolshedhq.github.io/app/
primary_ok=0
if git clone -q --depth 1 --branch "$PRIMARY_BRANCH" "https://github.com/$PRIMARY_REPO.git" "$WORK/primary" 2>/dev/null; then
  touch "$WORK/primary/.nojekyll"
  for app in "${APPS[@]}"; do
    mkdir -p "$WORK/primary/$PRIMARY_SUBDIR/$app/store"
    cp "$STAGE/$app/store/"*.html "$WORK/primary/$PRIMARY_SUBDIR/$app/store/"
  done
  cp "$STAGE/index.html" "$WORK/primary/$PRIMARY_SUBDIR/index.html"
  commit_and_push "$WORK/primary" "$PRIMARY_BRANCH"
  primary_ok=1
else
  echo "WARNING: cannot clone $PRIMARY_REPO ($PRIMARY_BRANCH). The original" >&2
  echo "  https://tinytoolshedhq.github.io/app/... URLs will stay 404 until that repo" >&2
  echo "  exists (public, Pages from $PRIMARY_BRANCH /), then rerun this script." >&2
fi

# 2. Backup: gh-pages branch of this repo (orphan branch if it does not exist)
if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git clone -q --depth 1 --branch gh-pages "$(git remote get-url origin)" "$WORK/backup"
else
  git init -q "$WORK/backup"
  (cd "$WORK/backup" && git checkout -q --orphan gh-pages && git remote add origin "$(cd "$REPO_ROOT" && git remote get-url origin)")
fi
touch "$WORK/backup/.nojekyll"
cp -R "$STAGE/." "$WORK/backup/"
commit_and_push "$WORK/backup" gh-pages

echo "Done. Verify (after the Pages build, ~1 min):"
[ "$primary_ok" -eq 1 ] || echo "  (primary target skipped; only the backup URLs below the list work)"
for app in "${APPS[@]}"; do
  for f in support privacy; do
    echo "  https://tinytoolshedhq.github.io/app/$app/store/$f.html"
  done
done
echo "Backup: https://tinytoolshedhqorg.github.io/app/<appN>/store/{support,privacy}.html"
