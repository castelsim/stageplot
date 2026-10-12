# web/misure/tracce.praat — tracce di un file intero. Variabili: file$, out$, canale, tetto, f0max
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
durata = Get total duration
spg = To Spectrogram: 0.025, 6000, 0.01, 40, "Gaussian"
ms = To Matrix
Save as headerless spreadsheet file: out$ + "spettro.txt"
sp_nx = Get number of columns
sp_ny = Get number of rows
sp_x1 = Get x of column: 1
sp_dx = Get column distance
sp_y1 = Get y of row: 1
sp_dy = Get row distance
selectObject: s
p = To Pitch (ac): 0.01, 75, 15, "yes", 0.03, 0.45, 0.01, 0.35, 0.14, f0max
mp = To Matrix
Save as headerless spreadsheet file: out$ + "f0.txt"
f0_x1 = Get x of column: 1
f0_dx = Get column distance
selectObject: s
fo = To Formant (burg): 0.01, 5, tetto, 0.025, 50
for i to 4
  selectObject: fo
  mf = To Matrix: i
  Save as headerless spreadsheet file: out$ + "f" + string$ (i) + ".txt"
endfor
fo_x1 = Get x of column: 1
fo_dx = Get column distance
selectObject: s
it = To Intensity: 100, 0.01, "yes"
mi = Down to Matrix
Save as headerless spreadsheet file: out$ + "intensita.txt"
in_x1 = Get x of column: 1
in_dx = Get column distance
writeInfoLine: "durata", tab$, durata
appendInfoLine: "sp_nx", tab$, sp_nx
appendInfoLine: "sp_ny", tab$, sp_ny
appendInfoLine: "sp_x1", tab$, sp_x1
appendInfoLine: "sp_dx", tab$, sp_dx
appendInfoLine: "sp_y1", tab$, sp_y1
appendInfoLine: "sp_dy", tab$, sp_dy
appendInfoLine: "f0_x1", tab$, f0_x1
appendInfoLine: "f0_dx", tab$, f0_dx
appendInfoLine: "fo_x1", tab$, fo_x1
appendInfoLine: "fo_dx", tab$, fo_dx
appendInfoLine: "in_x1", tab$, in_x1
appendInfoLine: "in_dx", tab$, in_dx
select all
Remove
