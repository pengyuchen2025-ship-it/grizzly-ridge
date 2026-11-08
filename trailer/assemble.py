#!/usr/bin/env python3
"""把录好的镜头 + 文字层 + BGM + 游戏音效合成为宣传片。

用法（仓库根目录，需先启动 python3 -m http.server 8000 并录好镜头）：
    python3 trailer/assemble.py [--bgm 路径] [--no-overlays]
输出：trailer/build/grizzly_ridge_trailer.mp4

换 BGM：传 --bgm；脚本会重新分析节拍，所有切点都按"第几拍"定义，会自动对齐新音乐的节拍。
"""
import json, os, random, shutil, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
BUILD = os.path.join(ROOT, 'build')
SHOTS = os.path.join(BUILD, 'shots')
FPS = 30
SR = 44100
args = sys.argv[1:]
BGM = args[args.index('--bgm') + 1] if '--bgm' in args else os.path.join(REPO, 'assets/audio/bgm.mp3')
BGM_OFFSET = float(args[args.index('--bgm-offset') + 1]) if '--bgm-offset' in args else 0.0

# ------------------------------------------------------------------ beat grid
def beat_grid(path):
    sr = 22050
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(BGM_OFFSET), '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32)
    hop, win = 512, 2048
    n = (len(x) - win) // hop
    fr = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n] * np.hanning(win)
    S = np.log1p(np.abs(np.fft.rfft(fr, axis=1)) * 10)
    flux = np.concatenate([[0], np.maximum(0, np.diff(S, axis=0)).sum(1)])
    flux = np.maximum(flux - np.convolve(flux, np.ones(16) / 16, 'same'), 0)
    fps = sr / hop
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    lags = np.arange(len(ac)); bpm = 60 * fps / np.maximum(lags, 1)
    m = (bpm > 70) & (bpm < 180); L = lags[m][np.argmax(ac[m])]
    # refine period with parabolic interpolation
    y0, y1, y2 = ac[L - 1], ac[L], ac[L + 1]; Lf = L + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)
    best = max(range(int(Lf)), key=lambda ph: sum(flux[int(round(ph + k * Lf))] for k in range(int((len(flux) - ph) / Lf))))
    return best / fps, Lf / fps

B0, BEAT = beat_grid(BGM)
print(f'BGM beat: first {B0:.3f}s, period {BEAT:.4f}s ({60 / BEAT:.1f} bpm)')
def bt(k):  # time of beat k (beat 0 = start of video)
    return 0.0 if k == 0 else B0 + BEAT * k

# ------------------------------------------------------------------ edit decision list
# (类型, 名称, 起始拍, 结束拍, 选项)
#   shot: in=镜头内起点秒；align=(事件判断, 对齐到第几拍) 让某个音效事件（爆炸/落地/吞人）落在拍点上
#   ov=(文字层, 参数, 相对段落起点的开始秒, 时长秒)
first = lambda name, pred=lambda e: True: (lambda evs: next(e['t'] for e in evs if e['n'] == name and pred(e)))
EDL = [
    ('shot', 'aerial', 0, 5, {'in': 0.2, 'ov': [('open', None)], 'fadein': 0.6}),
    ('shot', 'ambush', 5, 11, {'align': (first('eat'), 10.0)}),
    ('card', 'card1', 11, 14, {'hit': True}),
    ('shot', 'frenzy', 14, 18, {'in': 0.2, 'ov': [('lower', 'eat')]}),
    ('shot', 'limbs', 18, 21, {'in': 0.1, 'ov': [('lower', 'limbs')]}),
    ('shot', 'climb', 21, 25, {'in': 0.3, 'ov': [('lower', 'climb')]}),
    ('shot', 'slam', 25, 30, {'align': (first('slam', lambda e: e['a'] and e['a'][0] > 0.35), 28.0), 'ov': [('lower', 'slam')]}),
    ('shot', 'police', 30, 35, {'in': 0.2, 'ov': [('lower', 'police')]}),
    ('card', 'card2', 35, 37, {'hit': True}),
    ('shot', 'crush', 37, 41, {'align': (first('boom'), 38.0), 'ov': [('lower', 'crush')]}),
    ('shot', 'gas', 41, 46, {'in': 0.0, 'ov': [('lower', 'gas')]}),
    ('shot', 'heli', 46, 53, {'align': (first('boom'), 49.0), 'ov': [('lower', 'heli')]}),
    ('card', 'card3', 53, 55, {'hit': True}),
    ('shot', 'climax', 55, 64, {'in': 0.0, 'ov': [(None, None), ('fallen', None, 'last', 3.2)]}),
    ('card', 'end', 64, 79, {'hit': True, 'fadeout': 1.2}),
]

def load_shot(name):
    with open(os.path.join(SHOTS, name + '.json')) as f: return json.load(f)

# resolve every segment to frames
segs = []
for kind, name, sb, eb, o in EDL:
    t0, t1 = bt(sb), bt(eb)
    f0, f1 = round(t0 * FPS), round(t1 * FPS)
    s = dict(kind=kind, name=name, t0=f0 / FPS, frames=f1 - f0, f0=f0, o=o)
    if kind == 'shot':
        meta = load_shot(name); s['meta'] = meta
        if 'align' in o:
            fn, beat = o['align']; ev_t = fn(meta['events'])
            s['in'] = ev_t - (bt(beat) - t0)
        else:
            s['in'] = o.get('in', 0.0)
        s['in'] = max(0.0, s['in'])
        avail = meta['frames'] / FPS - s['in']
        if avail < s['frames'] / FPS - 1e-6: print(f'  ! {name}: only {avail:.2f}s available for a {s["frames"] / FPS:.2f}s slot (holding last frame)')
    segs.append(s)
total_frames = segs[-1]['f0'] + segs[-1]['frames']
DUR = total_frames / FPS
print(f'timeline: {DUR:.2f}s, {len(segs)} segments')
for s in segs: print(f"  {s['t0']:6.2f}s  {s['frames'] / FPS:5.2f}s  {s['kind']:4} {s['name']}" + (f"  in={s['in']:.2f}" if s['kind'] == 'shot' else ''))

# ------------------------------------------------------------------ overlays
OV = os.path.join(BUILD, 'overlays')
jobs = []
for i, s in enumerate(segs):
    if s['kind'] == 'card':
        jobs.append(dict(layer=s['name'], dur=s['frames'] / FPS, out=os.path.join(OV, f'{i:02d}_{s["name"]}'), seg=i, start=0))
    for ov in s['o'].get('ov', []):
        if ov[0] is None: continue
        start = 0 if len(ov) < 3 else (s['frames'] / FPS - ov[3] if ov[2] == 'last' else ov[2])
        dur = s['frames'] / FPS - start if len(ov) < 4 else ov[3]
        jobs.append(dict(layer=ov[0], arg=ov[1], dur=dur, out=os.path.join(OV, f'{i:02d}_{ov[0]}_{ov[1] or ""}'), seg=i, start=start))
if '--no-overlays' not in args:
    jf = os.path.join(BUILD, 'overlay_jobs.json')
    with open(jf, 'w') as f: json.dump(jobs, f)
    subprocess.run(['node', os.path.join(ROOT, 'render_overlays.js'), jf], check=True)

# ------------------------------------------------------------------ video segments
SEGDIR = os.path.join(BUILD, 'segments'); shutil.rmtree(SEGDIR, ignore_errors=True); os.makedirs(SEGDIR)
def repair_shot(name):
    # the software renderer occasionally hands back a half-drawn frame (big pure-black area): replace it with a blend of its neighbours
    import glob
    fs = sorted(glob.glob(os.path.join(SHOTS, name, '*.jpg')))
    dk = [(np.asarray(Image.open(f).convert('L').resize((96, 54))) < 6).mean() for f in fs]
    bad = {i for i in range(len(fs)) if dk[i] > 0.9 or dk[i] - min(dk[max(0, i - 1)], dk[min(len(fs) - 1, i + 1)]) > 0.15}
    for i in sorted(bad):
        a = next((j for j in range(i - 1, -1, -1) if j not in bad), None); b = next((j for j in range(i + 1, len(fs)) if j not in bad), None)
        if a is None and b is None: continue
        im = Image.open(fs[a if b is None else b]) if a is None or b is None else Image.blend(Image.open(fs[a]), Image.open(fs[b]), 0.5)
        im.save(fs[i], quality=93)
    if bad: print(f'  repaired {len(bad)} glitched frames in {name}: {sorted(j + 1 for j in bad)}')
for s in segs:
    if s['kind'] == 'shot': repair_shot(s['name'])
seg_files = []
for i, s in enumerate(segs):
    out = os.path.join(SEGDIR, f'{i:02d}.mp4'); seg_files.append(out)
    n = s['frames']
    inputs, filt = [], ''
    if s['kind'] == 'shot':
        stage = os.path.join(SEGDIR, f'{i:02d}_src'); os.makedirs(stage)
        src = os.path.join(SHOTS, s['name']); total = s['meta']['frames']
        first_f = int(round(s['in'] * FPS)) + 1
        for k in range(n):
            fidx = min(total, first_f + k); p = os.path.join(src, f'{fidx:04d}.jpg')
            os.symlink(p, os.path.join(stage, f'{k + 1:04d}.jpg'))
        inputs += ['-framerate', str(FPS), '-i', os.path.join(stage, '%04d.jpg')]
    else:
        inputs += ['-f', 'lavfi', '-i', f'color=c=black:s=1920x1080:r={FPS}']
    chain = '[0:v]format=rgba[b0]'; last = 'b0'
    for j, job in enumerate([j for j in jobs if j['seg'] == i]):
        inputs += ['-framerate', str(FPS), '-itsoffset', f"{job['start']:.4f}", '-i', os.path.join(job['out'], '%04d.png')]
        chain += f';[{last}][{j + 1}:v]overlay=eof_action=pass[b{j + 1}]'; last = f'b{j + 1}'
    if s['o'].get('fadein'): chain += f';[{last}]fade=t=in:st=0:d={s["o"]["fadein"]}[fi]'; last = 'fi'
    if s['o'].get('fadeout'): chain += f';[{last}]fade=t=out:st={n / FPS - s["o"]["fadeout"]:.3f}:d={s["o"]["fadeout"]}[fo]'; last = 'fo'
    chain += f';[{last}]format=yuv420p[out]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', chain, '-map', '[out]', '-frames:v', str(n), '-r', str(FPS),
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', out], check=True)
    print('segment', i, s['name'], n, 'frames')
with open(os.path.join(SEGDIR, 'list.txt'), 'w') as f: f.writelines(f"file '{p}'\n" for p in seg_files)
video = os.path.join(BUILD, 'video_only.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', os.path.join(SEGDIR, 'list.txt'), '-c', 'copy', video], check=True)

# ------------------------------------------------------------------ audio
def decode(path, start=0.0, dur=None, ch=2):
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(start), '-i', path] + (['-t', str(dur)] if dur else []) + ['-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-']
    a = np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.float32)
    return a.reshape(-1, ch).copy()
N = int(DUR * SR) + 1
mix_bgm = np.zeros((N, 2), np.float32); mix_sfx = np.zeros((N, 2), np.float32)
bgm = decode(BGM, BGM_OFFSET, DUR)[:N]; mix_bgm[:len(bgm)] = bgm
fo = int(2.6 * SR); mix_bgm[N - fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5

SFXDIR = os.path.join(REPO, 'assets/sfx'); _cache = {}
GROUPS = {'eat': ['eat_1', 'eat_2', 'eat_3', 'eat_4'], 'crunch': ['crunch_1', 'crunch_2', 'crunch_3'], 'squish': ['squish_1', 'squish_2', 'squish_3', 'squish_4'],
          'roarBig': ['roar_big'], 'roar': ['roar_1', 'roar_2', 'roar_3', 'roar_4'], 'grunt': ['grunt_1', 'grunt_2', 'grunt_3'],
          'screamF': ['scream_f1', 'scream_f2', 'scream_f3', 'scream_f4', 'scream_f5'], 'screamM': ['scream_m1', 'scream_m2', 'scream_m3'],
          'shot': ['shot_1', 'shot_2'], 'boom': ['boom_1', 'boom_2'], 'boomTail': ['boom_tail'], 'glass': ['glass_1', 'glass_2', 'glass_3', 'glass_4', 'glass_5'],
          'slam': ['slam_1', 'slam_2', 'slam_3'], 'slamBig': ['slam_big'], 'rubble': ['rubble_1', 'rubble_2', 'rubble_3'], 'metal': ['metal_1', 'metal_2'],
          'siren': ['siren_loop'], 'heli': ['heli_loop'], 'rain': ['rain_loop']}
rng = random.Random(3)
def sample(f):
    if f not in _cache: _cache[f] = decode(os.path.join(SFXDIR, f + '.mp3'))
    return _cache[f]
def place(group, t, vol=0.5, rate=1.0, max_dur=0.0, end=None):
    a = sample(rng.choice(GROUPS[group]))
    if rate != 1.0:
        idx = np.arange(0, len(a) - 1, rate); a = np.stack([np.interp(idx, np.arange(len(a)), a[:, c]) for c in range(2)], 1)
    if max_dur: n = int(max_dur * SR); a = a[:n].copy(); k = min(len(a), int(n * 0.3)); a[-k:] *= np.linspace(1, 0, k)[:, None]
    i0 = int(t * SR); i1 = min(N, i0 + len(a)) if end is None else min(N, int(end * SR), i0 + len(a))
    if i0 >= N or i1 <= i0: return
    seg = a[:i1 - i0] * vol
    if end is not None and i1 - i0 > 400: seg[-400:] *= np.linspace(1, 0, 400)[:, None]  # no hard cut at a scene change
    mix_sfx[i0:i1] += seg
U = rng.uniform
GAP = {'eat': 0.06, 'scream': 0.28, 'boom': 0.12, 'slam': 0.1, 'glass': 0.22, 'shot': 0.07, 'roar': 1.2, 'jump': 0.1, 'bump': 0.15, 'squelch': 0.08}
def play_event(e, t, end):
    n, a = e['n'], e.get('a') or []
    kw = dict(end=end)
    if n == 'eat':
        place('crunch', t, 0.75, U(0.85, 1.1), **kw); place('squish', t + 0.04, 0.7, U(0.8, 1.05), **kw); place('eat', t + 0.12, 0.6, U(0.7, 0.9), **kw)
        if rng.random() < 0.5: place('roar', t + 0.25, 0.55, U(0.6, 0.8), 1.6, **kw)
    elif n == 'squelch': place('squish', t, 0.5, U(0.8, 1.1), **kw)
    elif n == 'scream':
        female, vol, short = (a + [False, 0.22, False])[:3]
        place('screamF' if female else 'screamM', t, min(0.6, (vol or 0.22) * 1.8), U(0.92, 1.1), 0.4 if short else 0, **kw)
    elif n == 'boom': place('boom', t, 1.0, U(0.55, 0.7), **kw); place('boomTail', t, 0.9, U(0.85, 1.0), **kw)
    elif n == 'slam':
        p = a[0] if a else 1
        place('slam', t, 0.7 + p * 0.25, U(0.45, 0.6), **kw); place('rubble', t + 0.04, 0.35 + p * 0.15, U(0.8, 1.0), **kw)
        if p > 1.1: place('slamBig', t + 0.02, min(1, 0.45 * p), U(0.8, 0.95), **kw)
    elif n == 'glass': place('glass', t, 0.5, U(0.9, 1.15), **kw)
    elif n == 'shot': place('shot', t, min(0.7, max(0.08, (a[0] if a else 0.3) * 2.2)) * 0.9, U(0.92, 1.08), **kw)
    elif n == 'jump': place('grunt', t, 0.45, U(0.6, 0.75), **kw)
    elif n == 'roar': place('roarBig' if rng.random() < 0.5 else 'roar', t, min(1.0, (a[0] if a else 0.45) * 1.6), U(0.75, 0.95), 2.4, **kw)
    elif n == 'bump': place('metal', t, 0.4, U(0.7, 0.9), **kw)
def loop_bed(group, t0, n_frames, levels, gain):
    a = sample(GROUPS[group][0]); need = int(n_frames / FPS * SR); start = rng.randrange(len(a))
    seg = np.concatenate([a] * (need // len(a) + 3))[start:start + need]
    env = np.interp(np.arange(need) / SR * FPS, np.arange(len(levels)), levels) * gain
    k = min(need, 600); env[:k] *= np.linspace(0, 1, k); env[-k:] *= np.linspace(1, 0, k)
    i0 = int(t0 * SR); i1 = min(N, i0 + need); mix_sfx[i0:i1] += seg[:i1 - i0] * env[:i1 - i0, None]

for s in segs:
    t0, dur = s['t0'], s['frames'] / FPS
    if s['kind'] == 'card':
        if s['o'].get('hit'): place('slamBig', t0, 0.8, 0.8, end=t0 + dur); place('boomTail', t0, 0.5, 0.7, end=t0 + dur)
        continue
    meta, tin = s['meta'], s['in']
    last = {}
    for e in meta['events']:
        if not (tin - 0.05 <= e['t'] < tin + dur): continue
        if e['t'] - last.get(e['n'], -9) < GAP.get(e['n'], 0): continue
        last[e['n']] = e['t']
        play_event(e, t0 + max(0, e['t'] - tin), t0 + dur + 0.25)
    f0 = int(round(tin * FPS)); lv = np.array(meta['loops'][f0:f0 + s['frames']] or [[0, 0]], np.float32)
    if len(lv) < s['frames']: lv = np.concatenate([lv, np.repeat(lv[-1:], s['frames'] - len(lv), 0)])
    if lv[:, 0].max() > 0.01: loop_bed('siren', t0, s['frames'], lv[:, 0], 0.5)
    if lv[:, 1].max() > 0.01: loop_bed('heli', t0, s['frames'], lv[:, 1], 0.45)
    loop_bed('rain', t0, s['frames'], np.full(s['frames'], 1.0), 0.12)

mix = mix_bgm * 0.85 + mix_sfx * 0.42
mix = np.tanh(mix * 1.1) / np.tanh(1.1)  # soft limiter
wav = os.path.join(BUILD, 'audio.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', wav], input=mix.astype(np.float32).tobytes(), check=True)
final = os.path.join(BUILD, 'grizzly_ridge_trailer.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final], check=True)
print('done ->', final, f'{os.path.getsize(final) / 1e6:.1f} MB')
