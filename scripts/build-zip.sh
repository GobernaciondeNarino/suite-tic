#!/usr/bin/env bash
# Builds dist/<folder>.zip with a FIXED top-level folder name so that
# WordPress "Subir plugin" offers "Reemplazar la versión actual" instead of
# installing a second copy. Usage: scripts/build-zip.sh [folder-name]
set -euo pipefail
FOLDER="${1:-suite-tic}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$FOLDER" "$ROOT/dist"
cd "$ROOT"
cp -r assets data includes templates tic-suite-graficos.php uninstall.php readme.txt "$STAGE/$FOLDER/"
rm -f "$ROOT/dist/$FOLDER.zip"
(cd "$STAGE" && zip -qr "$ROOT/dist/$FOLDER.zip" "$FOLDER")
echo "dist/$FOLDER.zip"
