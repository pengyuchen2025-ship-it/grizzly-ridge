#!/usr/bin/env bash
# 每次推送前运行：给 JS 文件加新的版本号，避免浏览器缓存旧代码（GitHub Pages 缓存 10 分钟）
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M%S)
sed -i -E "s#src/main\.js(\?v=[0-9]+)?\"#src/main.js?v=$V\"#" index.html
sed -i -E "s#'\./(config|city)\.js(\?v=[0-9]+)?'#'./\1.js?v=$V'#g" src/main.js
echo "version -> $V"
