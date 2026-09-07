#!/usr/bin/env bash
set -e

BUILD=$(date +%Y%m%d%H%M%S)
sed -i "s/__BUILDTIME__/$BUILD/" sw.js

git add -A
git commit -m "deploy: $BUILD"
git push

# Restaurar el placeholder para el próximo deploy
sed -i "s/nplayer-$BUILD/nplayer-__BUILDTIME__/" sw.js
