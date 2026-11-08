# 宣传片制作工具

用游戏本体逐帧录制镜头，再按 BGM 节拍剪辑、叠加文字卡和音效，生成约 1 分钟的 1080p 宣传片。

## 流程

```bash
python3 -m http.server 8000                      # 仓库根目录
node trailer/record.js --preview ambush gas      # 快速预览（每 15 帧截一张，生成缩略图拼图）
node trailer/record.js aerial ambush frenzy limbs climb slam police crush gas heli climax   # 正式录制 1080p
python3 trailer/assemble.py                      # 剪辑 + 文字层 + 混音 → trailer/build/grizzly_ridge_trailer.mp4
python3 trailer/assemble.py --bgm 新音乐.mp3 --bgm-offset 12   # 换 BGM（从第 12 秒开始用），切点自动对齐新节拍
```

## 文件

- `shots.js` — 每个镜头的脚本：摆场景（怪兽大小/位置、路人、警车、直升机）、每帧的怪兽输入、机位运动。
- `record.js` — 用 Playwright 打开 `?rec=1` 录像模式，固定 1/30 秒步长逐帧渲染截图；同时记录音效事件和警笛/直升机音量。
- `overlay.html` + `render_overlays.js` — 文字卡和字幕（透明 PNG 序列）。
- `assemble.py` — 剪辑表（EDL，按"第几拍"定义切点）、合成视频、用游戏里的 CC0 音效按事件时间混音。
- `beats.py` — 分析音乐的速度和能量曲线。

## 游戏里的录像模式

`index.html?rec=1`：不走 requestAnimationFrame，由 `window.__rec.step()` 推进；`Math.random` 使用固定种子（城市每次一样）；
`__rec.input` 控制怪兽、`__rec.cam` 控制镜头；游戏里的 `setTimeout` 按录像时钟计时。正常游玩不受影响。
