# DATI DI ATTREZZATURA — da dove viene ogni numero

Aperto il **29/08/2026** su richiesta di Simone: «i dati devono essere reali, tutto nel software
dev'essere verificato». Qui c'è, riga per riga, la **citazione** dietro ogni consumo e ogni peso che
il software dichiara. Regola: **si apre il documento del costruttore**, non ci si fida di un
riassunto di ricerca né di un rivenditore. Se il dato ufficiale non si trova, si scrive che non si
è trovato — non si inventa un numero plausibile.

I PDF originali dei costruttori NON stanno qui (copyright di terzi, e pesano): sono nella
raccolta locale `CONOSCENZA/pdf/datasheet/`. Qui c'e' la citazione, che e' la cosa che deve
viaggiare col codice. Chi rifà la verifica deve poter ripetere il `grep`.

---

## Perché è stato necessario

I consumi in `WATT{}` venivano da `docs/idee/RICERCA_ASSORBIMENTI_ZONE_2026-07-04.md`, una ricerca
fatta su **fonti secondarie** — Sound On Sound, un thread di TalkBass, blog di venditori di luci —
e per metà delle voci la colonna «fonte» era letteralmente «—». I pesi in `WEIGHT{}` non avevano
mai avuto una fonte.

Il numero non resta dentro il programma: il peso totale finisce nel **rider** e nel **PDF** che si
mandano al locale («peso allestimento stimato»), e l'assorbimento è quello su cui un fonico
dimensiona il quadro. Un errore qui esce di casa.

---

## 1. Console — verificate il 29/08/2026

Quattordici tipi che **non sono famiglie ma modelli precisi**: per un modello preciso esiste un
documento ufficiale, quindi la stima non ha scusanti. Risultato: **12 consumi su 14 sbagliati e 13
pesi su 14 sbagliati**, i pesi tutti in difetto e alcuni di più del doppio.

| tipo | modello | W prima | **W ora** | kg prima | **kg ora** | dove l'ho letto |
|---|---|---|---|---|---|---|
| `dm3` | Yamaha DM3 / DM3-D | 45 | **43** | 5 | **6,5** | specifiche ufficiali Yamaha, pagina prodotto |
| `dm7c` | Yamaha DM7 Compact | 110 | **240** | 10 | **16,5** | Owner's Manual, *General Specifications* |
| `dm7` | Yamaha DM7 | 150 | **240** | 13 | **23,5** | idem |
| `csr3` | Yamaha RIVAGE CS-R3 | 280 | **200** | 15 | **38** | CS-R3 Owner's Manual |
| `csr5` | Yamaha RIVAGE CS-R5 | 350 | **300** | 20 | **42** | CS-R5 Owner's Manual |
| `csr10` | Yamaha RIVAGE CS-R10 | 600 | **380** | 30 | **85** | CS-R10 Data Sheet |
| `sq5` | Allen & Heath SQ-5 | 90 | **75** | 8 | **10,5** | SQ Technical Datasheet |
| `sq6` | Allen & Heath SQ-6 | 100 | **90** | 9 | **14,5** | idem |
| `sq7` | Allen & Heath SQ-7 | 110 | **110** ✓ | 10 | **17,8** | idem |
| `avantis` | Allen & Heath Avantis | 180 | **150** | 14 | **26** | Avantis Technical Datasheet |
| `dlives5` | A&H dLive S5000 | 250 | **300** | 20 | **35** | S5000 Datasheet |
| `dlives7` | A&H dLive S7000 | 280 | **300** | 24 | **41** | S7000 Datasheet |
| `q338` | DiGiCo Quantum 338 | 340 | **295** | 25 | **70** | pagina prodotto DiGiCo |
| `hd96` | Midas HD96-24 | 300 | 300 ⚠ | 35 | **43,2** | manuale utente (vedi riserva sotto) |

### Le citazioni

**Yamaha DM7 / DM7 Compact** — `CONOSCENZA/pdf/datasheet/yamaha-dm7-om.pdf`, *General Specifications*:
> Power Consumption 240 W
> Weight DM7: 23.5 kg / DM7 COMPACT: 16.5 kg

Da notare: il costruttore dà **un solo consumo per entrambe** le taglie, mentre distingue peso e
dimensioni. Noi ne avevamo inventati due diversi (150 e 110), che è un dettaglio rivelatore: erano
numeri dedotti dalla dimensione della console, non letti da nessuna parte.

**Yamaha CS-R3** — `CONOSCENZA/pdf/datasheet/yamaha-csr3-om.pdf`:
> Power consumption 200 W · Weight 38 kg

**Yamaha CS-R5** — `CONOSCENZA/pdf/datasheet/yamaha-csr5-om.pdf`:
> Power consumption 300 W · Weight 42 kg

**Yamaha CS-R10** — `CONOSCENZA/pdf/datasheet/CS-R10_data_sheet.pdf`:
> Power Consumption 380 W · Weight 85kg (187lbs)

**Allen & Heath SQ-5/6/7** — `CONOSCENZA/pdf/datasheet/ah-SQ-5-ds.pdf` (un solo datasheet copre i tre):
> Max Power Consumption SQ-5/SQ-6/SQ-7 — 75W / 90W / 110W
> Unpacked weight — SQ-5 10.5 kg · SQ-6 14.5 kg · SQ-7 17.8 kg

**Allen & Heath Avantis** — `CONOSCENZA/pdf/datasheet/ah-avantis-ds.pdf`:
> Mains Power 100-240V AC, 50-60Hz, 150W max · Weight (unboxed) 26kg

**Allen & Heath dLive S5000** — `CONOSCENZA/pdf/datasheet/ah-s5000-ds.pdf`:
> Mains Power (MPS16) 100-240V AC, 47-63Hz, 300W max · S5000 … x 35kg (77lbs)

**Allen & Heath dLive S7000** — `CONOSCENZA/pdf/datasheet/ah-s7000-ds.pdf`:
> Mains Power Consumption 300W max (MPS16 V1) / 250W max (MPS16 V2) · S7000 … x 41kg (90lbs)

Abbiamo tenuto **300 W**, il caso peggiore: chi dimensiona un quadro non sa quale alimentatore
monta la console che gli arriva.

**DiGiCo Quantum 338** — pagina prodotto ufficiale digico.biz:
> Power Requirements 100V-240V, 50-60Hz, 295VA · Weight 70Kg / 154lbs (198Kg con flightcase)

Sono **VA**, non W. Per un alimentatore switching moderno con rifasamento i due numeri quasi
coincidono, e comunque per dimensionare un quadro conta la potenza apparente: 295 è il numero
prudente. I 198 kg del flightcase **non** entrano nel peso: il nostro peso è quello dell'oggetto
sul palco, non del trasporto imballato.

### ⚠ Riserva aperta: Midas HD96-24

Il **peso 43,2 kg** viene dalla sezione *Specifications* del manuale utente Midas.
L'**assorbimento no**: quel che si trova è «Power consumption: 2 x 650 W», che è la **taglia dei due
alimentatori ridondanti**, non quanto la console assorbe davvero — con la ridondanza, di due PSU ne
lavora una, e nessuna delle due è al massimo. Usare 1300 W sarebbe stato falso in eccesso di più di
quattro volte.

Quindi: peso corretto, **consumo lasciato a 300 W come stima dichiarata**, allineata alla classe
(Quantum 338 = 295 VA misurati, CS-R10 = 380 W). Da chiudere quando si trova il dato ufficiale sul
sito Midas — che oggi non espone la pagina prodotto (404 su `midasconsoles.com/product?...`).

### Cosa resta fuori dal modello (non è un errore, è un limite da conoscere)

`csr3/csr5/csr10` e `dlives5/dlives7` sono **superfici di controllo**: il DSP sta in un motore
separato che va alimentato e trasportato a parte, e che oggi il software non rappresenta.

- Yamaha DSP-R10 — `CONOSCENZA/pdf/datasheet/DSP-R10_data_sheet.pdf`: «Power consumption: 190 W · Net weight: 20 kg»
- Yamaha RPio622 (I/O rack): «Power consumption: 300W · Net Weight: 30 kg»

Un sistema RIVAGE PM10 reale è quindi **almeno 380 + 190 W e 85 + 20 kg**, senza contare gli I/O
rack. Chi mette una CS-R10 in un progetto sta dichiarando meno della metà del sistema. È una
**decisione di prodotto** da prendere con Simone: aggiungere il motore DSP come elemento a sé
(coerente col fatto che sul palco è un rack vero) oppure sommarlo dentro la console.

---

## 2. Cosa NON è verificato (e perché resta una stima)

Va detto chiaro, perché il valore di questo documento sta anche in ciò che non promette.

I tipi che sono **famiglie** — `comboamp`, `stack`, `bassamp`, `wedge`, `arraylarge`, `amprack`,
`testamobile` — non hanno un costruttore né un manuale: nessuno pubblica «l'assorbimento di un
combo per chitarra». Lì il numero resta una stima e il software deve **dirlo**, come già fa
(`wattFonte` → «stima»). La strada per renderli reali non è indovinare meglio: è **far scegliere il
modello vero** all'utente, come già si fa per le luci (`LIGHT_MODEL_DB`) e per i microfoni.

`SPEC_TARGA` in `index.template.html` è l'elenco dei tipi il cui numero viene da un documento
ufficiale: è quello che permette al software di non chiamare «stima tipica» un dato citabile.

---

## Come rifare la verifica

```bash
cd ../CONOSCENZA   # la raccolta sta accanto al repo, non dentro
pdftotext -layout pdf/datasheet/yamaha-dm7-om.pdf - | grep -i -A6 "power consumption"
```

Ogni PDF in `CONOSCENZA/pdf/datasheet/` è stato scaricato dal sito del costruttore, non da un
rivenditore. La cartella `CONOSCENZA/` sta fuori dal repo: vive sul Mac di Simone.
