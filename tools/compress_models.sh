#!/usr/bin/env bash
# 把 Hi3D 导出的原始 GLB 压缩成游戏可用的大小。
# 用法：bash tools/compress_models.sh <原始GLB所在文件夹>
#   文件名必须是模型 id，例如 police_car.glb、monster.glb（见 src/config.js 里的 MODELS）
# 结果写入 assets/models/，并自动更新 assets/models/manifest.json
set -euo pipefail
SRC="${1:?用法: bash tools/compress_models.sh <原始GLB文件夹>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/models"
cd "$ROOT/tools"
[ -d node_modules ] || npm install --silent

# 目标三角面数 / 贴图尺寸（人物最多，压得最狠；怪兽是主角，保留细节）
target_tris() { case "$1" in civ_*|police) echo 2000;; car|police_car|riot_truck|bus|ambulance|wreck) echo 5000;; helicopter) echo 5000;; monster) echo 9000;; *) echo 3000;; esac; }
tex_size()    { case "$1" in civ_*|police) echo 256;; monster) echo 1024;; *) echo 512;; esac; }

for f in "$SRC"/*.glb; do
  id="$(basename "$f" .glb)"
  tris=$(npx gltf-transform inspect "$f" --format csv 2>/dev/null | awk -F, '/TRIANGLES/{print $5}' | tr -d '", ' | head -1)
  ratio=$(python3 -c "print(min(1, $(target_tris "$id")/max(1,int('${tris:-140000}'))))")
  npx gltf-transform optimize "$f" "$OUT/$id.glb" \
    --compress meshopt --texture-compress webp --texture-size "$(tex_size "$id")" \
    --simplify-ratio "$ratio" --simplify-error 0.02 >/dev/null
  out=$(npx gltf-transform inspect "$OUT/$id.glb" --format csv 2>/dev/null | awk -F, '/TRIANGLES/{print $5}' | tr -d '", ' | head -1)
  echo "$id: ${tris} -> ${out} 面, $(du -h "$OUT/$id.glb" | cut -f1)"
done

# manifest = assets/models 下所有 glb 的 id
python3 - "$OUT" <<'PY'
import json, os, sys
d = sys.argv[1]
ids = sorted(f[:-4] for f in os.listdir(d) if f.endswith('.glb'))
json.dump(ids, open(os.path.join(d, 'manifest.json'), 'w'))
print('manifest:', ids)
PY
