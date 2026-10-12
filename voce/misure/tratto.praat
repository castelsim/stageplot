# web/misure/tratto.praat — misure di un tratto. Variabili: file$, canale, da, a, tetto, f0max
# Fonte unica: lo stesso testo gira in praat-wasm (browser) e in Praat 6.4.62 nativo (test).
s0 = Read from file: file$
nc = Get number of channels
if canale > 0 and nc >= canale
  s = Extract one channel: canale
elsif nc > 1
  s = Convert to mono
else
  s = s0
endif
selectObject: s
t = Extract part: da, a, "rectangular", 1, "no"
durata = a - da

selectObject: t
p = To Pitch (ac): 0.01, 75, 15, "yes", 0.03, 0.45, 0.01, 0.35, 0.14, f0max
f0_mediana = Get quantile: 0, 0, 0.5, "Hertz"
f0_min = Get minimum: 0, 0, "Hertz", "Parabolic"
f0_max = Get maximum: 0, 0, "Hertz", "Parabolic"
f0_sd_cents = Get standard deviation: 0, 0, "semitones"
f0_sd_cents = f0_sd_cents * 100
if f0_mediana <> undefined
  midi = 69 + 12 * log2 (f0_mediana / 440)
  scarto_cents = (midi - round (midi)) * 100
else
  scarto_cents = undefined
endif

selectObject: t
pc = To PowerCepstrogram: 60, 0.002, 5000, 50
# «Robust»: deterministico; «Robust slow» cambia a ogni esecuzione (1-2 %), verificato il 09/10.
cpps = Get CPPS: "yes", 0.01, 0.001, 60, f0max, 0.05, "Parabolic", 0.001, 0.05, "Exponential decay", "Robust"

minp = 75
if f0_mediana <> undefined
  minp = max (75, f0_mediana / 2)
endif
selectObject: t
h = To Harmonicity (cc): 0.01, minp, 0.1, 1.0
hnr = Get mean: 0, 0

selectObject: t
pp = To PointProcess (periodic, cc): 75, f0max
jitter = Get jitter (local): 0, 0, 0.0001, 0.02, 1.3
selectObject: t, pp
shimmer = Get shimmer (local): 0, 0, 0.0001, 0.02, 1.3, 1.6

h1h2 = undefined
if f0_mediana <> undefined
  selectObject: t
  sp = To Spectrum: "yes"
  l1 = To Ltas (1-to-1)
  h1 = Get maximum: f0_mediana * 0.8, f0_mediana * 1.2, "Parabolic"
  h2 = Get maximum: f0_mediana * 1.8, f0_mediana * 2.2, "Parabolic"
  h1h2 = h1 - h2
endif

selectObject: t
lt = To Ltas: 100
alto = Get mean: 1000, 5000, "energy"
basso = Get mean: 50, 1000, "energy"
alpha = alto - basso
pendenza = Get slope: 0, 1000, 1000, 10000, "energy"
picco_basso = Get maximum: 0, 2000, "None"
picco_alto = Get maximum: 2000, 4000, "None"
spr = picco_basso - picco_alto

selectObject: t
fo = To Formant (burg): 0.01, 5, tetto, 0.025, 50
f1 = Get mean: 1, 0, 0, "hertz"
f2 = Get mean: 2, 0, 0, "hertz"
f3 = Get mean: 3, 0, 0, "hertz"
f4 = Get mean: 4, 0, 0, "hertz"

selectObject: t
it = To Intensity: 100, 0.01, "yes"
livello = Get mean: 0, 0, "energy"
livello_sd = Get standard deviation: 0, 0

writeInfoLine: "durata", tab$, fixed$ (durata, 6)
appendInfoLine: "f0_mediana", tab$, f0_mediana
appendInfoLine: "f0_min", tab$, f0_min
appendInfoLine: "f0_max", tab$, f0_max
appendInfoLine: "f0_sd_cents", tab$, f0_sd_cents
appendInfoLine: "scarto_cents", tab$, scarto_cents
appendInfoLine: "cpps", tab$, cpps
appendInfoLine: "hnr", tab$, hnr
appendInfoLine: "jitter", tab$, jitter
appendInfoLine: "shimmer", tab$, shimmer
appendInfoLine: "h1h2", tab$, h1h2
appendInfoLine: "alpha", tab$, alpha
appendInfoLine: "pendenza", tab$, pendenza
appendInfoLine: "spr", tab$, spr
appendInfoLine: "f1", tab$, f1
appendInfoLine: "f2", tab$, f2
appendInfoLine: "f3", tab$, f3
appendInfoLine: "f4", tab$, f4
appendInfoLine: "livello", tab$, livello
appendInfoLine: "livello_sd", tab$, livello_sd
select all
Remove
