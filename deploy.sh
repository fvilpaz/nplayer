#!/usr/bin/env bash
set -e

# Sella sw.js con la hora del despliegue: es lo que hace que el móvil detecte la versión nueva.
# Funciona desde cualquier clon (no depende de ningún marcador que haya que restaurar).
BUILD=$(date +%Y%m%d%H%M%S)
sed -i "s/^const CACHE = .*/const CACHE = 'nplayer-$BUILD';/" sw.js

git add -A
git commit -m "deploy: $BUILD"
git push
