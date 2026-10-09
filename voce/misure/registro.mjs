// web/misure/registro.mjs — come si mostra ogni misura. Aiuti in italiano semplice (stessi testi del caso pilota).
export const REGISTRO = [
  { chiave: 'durata', etichetta: 'Durata del tratto', unita: 's', decimali: 2, aiuto: 'Lunghezza del tratto misurato.' },
  { chiave: 'f0_mediana', etichetta: 'Altezza mediana (F0)', unita: 'Hz', decimali: 1, aiuto: 'La frequenza fondamentale tipica del tratto (metà dei valori sta sopra, metà sotto).' },
  { chiave: 'f0_min', etichetta: 'Altezza minima', unita: 'Hz', decimali: 1, aiuto: 'Valore più basso dell\'altezza rilevata nel tratto (può includere errori d\'ottava).' },
  { chiave: 'f0_max', etichetta: 'Altezza massima', unita: 'Hz', decimali: 1, aiuto: 'Valore più alto dell\'altezza rilevata nel tratto (può includere errori d\'ottava).' },
  { chiave: 'scarto_cents', etichetta: 'Scarto dalla nota', unita: 'cents', decimali: 1, aiuto: 'Distanza dell\'altezza mediana dal semitono temperato più vicino (La = 440 Hz). 100 cents = un semitono. Positivo = sopra la nota, negativo = sotto.' },
  { chiave: 'f0_sd_cents', etichetta: 'Oscillazione dell\'altezza', unita: 'cents', decimali: 1, aiuto: 'Quanto varia l\'altezza nel tratto (comprende melodia, ornamenti e vibrato).' },
  { chiave: 'cpps', etichetta: 'CPPS', unita: 'dB', decimali: 2, aiuto: 'Quanto la voce è periodica e «piena». Più alto = meno aria e rumore.' },
  { chiave: 'hnr', etichetta: 'HNR', unita: 'dB', decimali: 1, aiuto: 'Rapporto fra suono armonico e rumore. Più alto = voce più pulita.' },
  { chiave: 'jitter', etichetta: 'Jitter', unita: '%', decimali: 2, scala: 100, aiuto: 'Irregolarità della frequenza da un ciclo all\'altro. Più basso = più regolare. Sul canto risente del vibrato.' },
  { chiave: 'shimmer', etichetta: 'Shimmer', unita: '%', decimali: 2, scala: 100, aiuto: 'Irregolarità dell\'ampiezza da un ciclo all\'altro. Più basso = più regolare. Sul canto risente del vibrato.' },
  { chiave: 'h1h2', etichetta: 'H1−H2', unita: 'dB', decimali: 1, aiuto: 'Differenza fra prima e seconda armonica. Più alto = voce più morbida e soffiata; più basso = chiusura più decisa, più spinta. Dipende dalla vocale. Misurata sullo spettro medio del tratto.' },
  { chiave: 'alpha', etichetta: 'Alpha ratio', unita: 'dB', decimali: 1, aiuto: 'Livello medio fra 1 e 5 kHz meno livello medio fra 50 Hz e 1 kHz. Più alto = più brillantezza (o più spinta).' },
  { chiave: 'pendenza', etichetta: 'Pendenza dello spettro', unita: 'dB', decimali: 1, aiuto: 'Livello medio fra 1 e 10 kHz meno livello medio fra 0 e 1 kHz (una differenza in dB, non dB per ottava). Meno negativa = spettro più ricco di acuti.' },
  { chiave: 'spr', etichetta: 'SPR', unita: 'dB', decimali: 1, aiuto: 'Picco 0-2 kHz meno picco 2-4 kHz. Più basso = più «squillo».' },
  { chiave: 'f1', etichetta: 'Formante F1', unita: 'Hz', decimali: 0, aiuto: 'Apertura della vocale. Poco affidabile sulle note acute, quando l\'altezza si avvicina alla prima formante.' },
  { chiave: 'f2', etichetta: 'Formante F2', unita: 'Hz', decimali: 0, aiuto: 'Posizione avanti/indietro della lingua. Poco affidabile sulle note acute.' },
  { chiave: 'f3', etichetta: 'Formante F3', unita: 'Hz', decimali: 0, aiuto: 'Contribuisce al colore della vocale; con F4 e F5 forma la zona dello squillo (circa 2,5-3,5 kHz). Poco affidabile sulle note acute.' },
  { chiave: 'f4', etichetta: 'Formante F4', unita: 'Hz', decimali: 0, aiuto: 'Con F3 e F5 forma la zona dello squillo (circa 2,5-3,5 kHz). Poco affidabile sulle note acute.' },
  { chiave: 'livello', etichetta: 'Livello medio', unita: 'dB', decimali: 1, aiuto: 'Intensità media del tratto (non calibrata: dipende dal guadagno della registrazione).' },
  { chiave: 'livello_sd', etichetta: 'Instabilità del volume', unita: 'dB', decimali: 2, aiuto: 'Quanto varia il volume nel tratto.' }
]
