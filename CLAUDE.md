# 灰岭之夜（Grizzly Ridge）— 项目交接文档

黑客松作品（Ship It Sunday with Hi3D，2026-11-08，游戏赛道）。19:00 现场 3 分钟展示 + 1 个提问 + 参赛者互投。
和用户沟通一律用**中文**；用户喜欢先讨论再动手，**改动前先说方案，等用户确认**。

- 线上地址（GitHub Pages，推送 main 后约 1 分钟自动更新）：https://pengyuchen2025-ship-it.github.io/grizzly-ridge/
- 二维码：`qrcode.png`

## 游戏设定（已和用户确认）
- 玩家是一只**原创**的肉块怪物（不要照搬《生化危机》电影里的怪物造型或"浣熊市"等名字——版权原因）。城市叫"灰岭市"，破旧美式小城，夜晚下雨。
- 移动方式是**滚动**。开局就能：吞路人、爬墙（贴墙继续推）、跳跃（空格）。
- 吞人：变大 + 回血。**唯一有体积门槛的是压爆车辆**（`PLAYER.crushRadius`），压爆会爆炸起火。
- **没有等级系统**（用户明确不要）。警力随时间升级：警察 → 警车 → 直升机 → 更多（`WAVES`）。
- 警察会开枪，血量归零结束，结算显示存活时间/吞噬/压爆/击落和得分（本地最高分）。
- 爬上楼顶跳起来撞直升机可以击落它。
- 画风：low-poly 卡通模型 + 可调像素化（`GAME.pixelScale`，游戏中按 P 切换）。

## 代码结构
纯静态网页，无构建步骤。Three.js r170 通过 importmap 从 jsDelivr 加载。
- `index.html` — 页面、HUD、开始/结算界面、CSS
- `src/config.js` — **所有可调数值**（成长速度、伤害、警力波次、模型尺寸）。调手感先改这里。
- `src/main.js` — 全部游戏逻辑，按区块组织：
  - `loadModels` / `normalizeModel`：读 `assets/models/manifest.json`，加载 GLB，自动缩放到 `MODELS` 配置的尺寸（汽车会自动把长边转到 X 轴）
  - `makePerson` / `makeCar` / `makeHeli`：有 Hi3D 模型就用模型，没有就用代码画的占位模型
  - `buildCity` → `src/city.js`：分区城市（市中心玻璃高楼带退台 / 商业街底商+雨棚+霓虹招牌 / 红砖住宅+消防梯+水塔 / 东北角着火废墟），湿路面+水洼、人行道、斑马线、路灯光斑、红绿灯、远景天际线、天空渐变、烟柱。每栋楼（含退台层）是一个 AABB，用于爬墙碰撞。
  - 画面后期：`EffectComposer` + `UnrealBloomPass`（辉光）+ `OutputPass`。出生点 `SPAWN` 在住宅区路口。
  - `pushOutOfBuildings` / `groundAt`：碰撞与爬墙/站上楼顶的核心
  - `buildMonsterBody` / `buildTentacles` / `attachVictim`：怪兽外观、代码触手、被吃的人粘在身上
  - `updatePlayer` / `updatePeople` / `updateCars` / `updateHelis` / `updateWaves`：每帧逻辑
  - `explosion` / `fire` / `tracer`：特效；`Sfx`：WebAudio 合成音效（无音频文件）
  - `updateCamera`：俯视跟随 + 挡住怪兽的楼自动变透明 + 雨
  - 调试：`window.__game` 暴露 state/player/civilians/cops/cars/helis/stick

推送前先运行 `bash tools/bump_version.sh`（给 JS 加版本号，避免手机浏览器缓存旧代码）。
本地运行：`python3 -m http.server 8000` 然后打开 http://localhost:8000

## 模型流程（Hi3D → 游戏）
1. 用户在 Hi3D 网页端用图片生成 3D，导出 GLB，文件名 = 模型 id（见 `src/config.js` 的 `MODELS`：monster、civ_man、civ_woman、police、police_car、car、helicopter；可扩展）。
2. 原始 GLB 约 14 万面、4MB，**必须压缩**：`bash tools/compress_models.sh <原始GLB文件夹>`（需要 node；首次会 npm install gltf-transform）。会写入 `assets/models/` 并更新 `manifest.json`。
3. 新增模型类型时：在 `MODELS` 里加一行尺寸配置，并在相应的 `make*` 函数里使用 `fromTemplate(id)`。
- 已知问题：`car.glb` 网格是零散碎片，减面只能到 6.4 万面（其他模型都在 2k–9k）。已把街边停车减到 14 辆。建议用户重新生成一辆车。
- Hi3D API：MCP 服务 `https://mcp.hitem3d.ai/mcp`（工具 `submit_3d_task_direct` 需要图片 URL、`query_3d_task`），密钥由云环境代理注入（Basic auth），不要在代码里写密钥。

## 已完成（16:40–17:00，均已推送）
- 场景纯代码重做（`src/city.js`）+ Bloom 辉光；出生点移到住宅区。
- 新怪兽模型（核心人+四周伸出的手脚）；有 GLB 怪兽时不再生成代码触手。
- 吞噬：人被拽进怪兽中心消失 + 血液喷溅 + 地面血迹（`absorbVictim`/`bloodBurst`/`bloodPool`），不再粘在身上。
- 起跳/落地砸地（裂纹+冲击波+碎石，落地震倒行人、震起车辆）`smash`；爬楼碎玻璃+墙上破洞 `glassBurst`。
- 新闻直升机（25s，不开枪，飞到屋顶低空救人）、警用直升机俯冲扫射、跳跃自动吸附、坠毁大爆炸；连环爆炸 `blast`；行驶车辆（看到怪兽逃跑）；后期路障；路人 80。
- 小体积可爬上车顶（车晃+警报+碎玻璃）；屋顶求救幸存者（部分举信号烟火）。
- 加油站（商业街）三连爆；消防栓喷水。
- 自动画质（帧率<28 时提高像素化、再关辉光和雨）；爆炸灯/直升机探照灯用固定灯光池（避免着色器重编译卡顿）。

## 已完成（17:00–18:20，均已推送）
- 被吃的人在怪兽身上长出一只手或腿（`growLimb`/`updateLimbs`，平滑小幅摆动，比真人略长，最多 45 只）。
- 开始页重做为"紧急广播"风格（故障标题、4 张操作卡、滚动快讯、镜头环绕怪兽）+ 加载进度条（载完才能点开始）；结算页为"突发新闻"风格（标题随表现变化、威胁评级、数字滚动、新纪录）。
- 音效：`assets/sfx/` 40 个 CC0/免版税录音（OpenGameArt + BigSoundBank，来源见 README），`Sfx.play()` 优先播录音，未加载时回退到合成音。警笛/直升机音量按距离变化。BGM：`assets/audio/bgm.mp3`（用户提供）。
- 缓存：推送前运行 `bash tools/bump_version.sh`；开始页底部显示版本号（北京时间）。测试新版本请用 `?t=随机数` 打开。

## 路演要点（19:00，3 分钟展示 + 1 个提问 + 互投）
- Hi3D 用法：8 个 Hi3D 模型（怪兽、男/女路人、警察、警车、汽车、直升机；怪兽重做过一次），流程：统一风格提示词 → 生成图片 → Hi3D 图生 3D → gltf-transform 压缩（单个约 14 万面/4MB → 2千–1.1万面/36–230KB，总量约 28MB → 1.2MB）→ 游戏里按尺寸自动归一化。城市、特效、手脚、界面全部是 Three.js 代码生成。
- 技术：纯 HTML + JavaScript + Three.js r170，无构建，GitHub Pages 部署，手机扫码即玩；Bloom 辉光、可调像素化、帧率低自动降画质。

## 未做
- 路灯/红绿灯撞倒（合并网格，需重构）。

## 已砍掉、时间够再加
变异卡三选一、解锁角色、防暴车/公交车、Boss、小地图。

## 协作注意
- 可能有两个会话同时改这个仓库：**推送前先 `git pull --rebase origin main`**。
- 测试：可以用 Playwright（`require('playwright')`，chromium 已预装）无头打开页面截图；启动参数 `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`。
