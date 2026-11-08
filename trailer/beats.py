# Beat / energy analysis of a music file (numpy only). Usage: python3 beats.py file.mp3
import subprocess, sys, numpy as np
SR = 22050
raw = subprocess.run(['ffmpeg','-v','error','-i',sys.argv[1],'-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
x = np.frombuffer(raw, np.float32)
hop, win = 512, 2048
n = (len(x)-win)//hop
frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n] * np.hanning(win)
S = np.abs(np.fft.rfft(frames, axis=1))
logS = np.log1p(S*10)
flux = np.maximum(0, np.diff(logS, axis=0)).sum(1)
flux = np.concatenate([[0], flux]); flux -= np.convolve(flux, np.ones(16)/16, 'same'); flux = np.maximum(flux, 0)
fps = SR/hop
# tempo via autocorrelation
ac = np.correlate(flux, flux, 'full')[len(flux)-1:]
lags = np.arange(len(ac)); bpm = 60*fps/np.maximum(lags,1)
m = (bpm>70)&(bpm<180); L = lags[m][np.argmax(ac[m])]; tempo = 60*fps/L
# beat phase
period = L; best=(0,0)
for ph in range(int(period)):
    s = flux[ph::int(round(period))].sum() if False else sum(flux[int(round(ph+k*period))] for k in range(int((len(flux)-ph)/period)))
    if s>best[0]: best=(s,ph)
ph = best[1]
beats = [(ph+k*period)/fps for k in range(int((len(flux)-ph)/period))]
rms = np.sqrt((frames**2).mean(1)); 
print(f"duration {len(x)/SR:.1f}s tempo {tempo:.1f} bpm, beat period {60/tempo:.3f}s, first beat {beats[0]:.3f}s")
# energy per 2s
sec = int(fps*2)
for i in range(0, len(rms), sec):
    e = rms[i:i+sec].mean(); print(f"{i/fps:6.1f}s {'#'*int(e*300)}")
np.save('beats.npy', np.array(beats))
