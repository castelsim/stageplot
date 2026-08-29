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

## 2. PA e diffusione — verificate il 29/08/2026

### Il difetto che stava sotto: il modello scelto non pesava

Il pannello lascia scegliere il **modello reale** del diffusore, e il DB dei prodotti conosce il peso
ufficiale di ognuno. Ma `weightOf()` non lo guardava: chi sceglieva «L-Acoustics K2» vedeva il nome
del modello nel pannello e nel rider, e intanto il totale continuava a contare i **34 kg della stima
di famiglia** invece dei **56 kg** che il DB aveva già dentro. Per la corrente l'equivalente
(`equipWatt`) c'era dal 18/07; per il peso non era mai stato scritto.

Ora c'è `equipWeight()`, con la stessa scala di priorità: valore scritto a mano dall'utente →
modello reale → stima di famiglia.

### Le stime di famiglia erano tarate su un modulo più piccolo

Un elemento PA è **un modulo**, non l'array intero — lo dice la larghezza in pianta: 134 cm è la
misura di un K2 (1340 mm), di un GSL8 (1300) e di un KS28 (1340).

| tipo | kg prima | **kg ora** | i moduli veri di quella misura |
|---|---|---|---|
| `arraylarge` | 34 | **60** | K2 56 · JBL VTX A12 60,8 · d&b GSL8 80 |
| `arraymid` | 22 | **26** | L-Acoustics Kara II 26 · Meyer LEOPARD 34 |
| `sub218` | 85 | **90** | L-Acoustics KS28 79 · d&b B22-SUB 106 |

I 34 kg erano il peso di un modulo **medio** applicato a quello grande. Un impianto da 12 moduli e
8 sub passa da **1088 kg dichiarati a 1440 kg**: un terzo in più sul camion.

Restano **stime**, e continuano a dichiararsi tali — ma ora sono ancorate a modelli veri e citati
invece che a niente. Chi vuole il numero esatto sceglie il modello nel pannello.

### Le citazioni

Verificate aprendo io le pagine ufficiali dei costruttori, non i riassunti:

- **L-Acoustics KS28**, pagina prodotto, *Physical specs*: «79 kg / 174 lb» · «1340 mm / 550 mm / 719 mm»
- **L-Acoustics Kara II**, *Physical specs*: «26 kg / 57 lb» · «733 mm / 252 mm / 500 mm»
- **d&b GSL8**, pagina prodotto: «80 kg / 176 lb» · «391 x 1300 x 627 mm»
- **L-Acoustics K2**: 56 kg (User Manual p. 161, già nel DB prodotti)
- **JBL VTX A12**: 60,8 kg (JBL_VTX-A12_Spec.pdf p. 2, già nel DB prodotti)

### ⚠ Un problema di metodo nel DB prodotti

Controllando i pesi ho trovato che alcune `quote` in `equip_product` **non sono citazioni ma
parafrasi**: «weighs 26 kg (57 lb)», «weigh no more than 106 kg (234 lb)», «79 kg (or approximately
174 lbs)». Nessun datasheet scrive «or approximately»: quelle righe sono state **riscritte**, non
copiate.

I tre valori che ho ricontrollato alla fonte (KS28, Kara II, GSL8) sono **giusti**, quindi non è un
problema di dati sbagliati. Ma una citazione riscritta perde la sua unica funzione: permettere a
chiunque di ritrovare la riga. Da sistemare in una passata sul DB — e da tenere presente come regola
per chi lo alimenta: **la quote si copia, non si riassume.**

---

## 3. Backline — il catalogo dei modelli veri (29/08/2026)

Era **l'ultima lacuna dichiarata** in `CONOSCENZA/FONTI.md`: «un catalogo professionale di noleggio
backline (dimensioni/pesi/assorbimenti dei modelli reali) per il nostro DB di attrezzatura».

Fino a oggi combo, testate, ampli basso, tastiere e organi avevano **solo la stima di famiglia**:
l'utente poteva scrivere «Ampeg SVT» nell'etichetta, e il piano elettrico non ne sapeva niente. Ora
c'è `AMP_DB` e il campo **«Modello del backline»** nel pannello, sullo stesso schema già usato per
le luci e per il personal monitor.

| chiave | modello | W assorbiti | W di uscita | kg | fonte |
|---|---|---|---|---|---|
| `roland_jc120` | Roland JC-120 Jazz Chorus | **130** | 120 | 28,7 | roland.com, *Specifications* |
| `roland_jc40` | Roland JC-40 | **43** | 40 | 15,8 | idem |
| `roland_kc600` | Roland KC-600 | **50** | 200 | 29 | idem |
| `roland_rd2000` | Roland RD-2000 | **23** | — | 21,7 | idem |
| `roland_td27` | Roland TD-27 (modulo) | non dich. | — | 1,1 | idem |
| `ampeg_svtcl` | Ampeg SVT-CL (testata) | **460** | 300 | 36,3 | Owner's Manual + ampeg.com |
| `ampeg_svt810e` | Ampeg SVT-810E (cassa) | **0** | — | 62 | ampeg.com |
| `nord_stage4_88` | Nord Stage 4 88 | non dich. | — | 19,6 | nordkeyboards.com |
| `nord_stage4_73` | Nord Stage 4 73 | non dich. | — | 16,7 | idem |
| `nord_stage4_c` | Nord Stage 4 Compact | non dich. | — | 10,4 | idem |
| `hammond_skxpro` | Hammond SkxPro | **22** | — | 16,9 | hammondorganco.com/skxpro-specs |

### La regola che questo catalogo smonta

La ricerca del 04/07 diceva: «regola pratica ampli: **~2× la potenza di uscita audio**». Vale per i
valvolari e **non** per la classe D di oggi, e i numeri lo dimostrano da soli:

- **Roland KC-600**: 200 W di uscita, **50 W assorbiti**. La regola avrebbe detto 400: otto volte tanto.
- **Ampeg SVT-CL**: 300 W di uscita, **460 W assorbiti**. Qui è il contrario, ed è un valvolare.

Per questo `ampModelWatt` **non ripiega mai** sulla potenza di uscita quando l'assorbimento non è
pubblicato: torna alla stima di categoria, che almeno si dichiara stima. È una differenza voluta
rispetto alle luci, dove `lightModelWatt` ripiega sulla potenza nominale della sorgente — lì è una
derivazione ragionevole, qui sarebbe un errore di un fattore quattro.

Nel catalogo non c'è oggi nessuna riga con «assorbimento assente + uscita dichiarata», quindi il
divieto è provato nei test su un caso **costruito apposta**. Senza quello, la mutazione passava
inosservata — provata, e infatti non la vedeva nessuno.

### Le citazioni

- **Roland** (tutte da `roland.com/global/products/<modello>/specifications/`, che pubblica sempre
  sia l'assorbimento sia il peso): JC-120 «Power Consumption: 130 W» · «Weight: 28.7 kg»; JC-40
  «43 W» · «15.8 kg»; KC-600 «50 W» · «29 kg» · «Rated Power Output: 200 W»; RD-2000 «23 W» ·
  «21.7 kg»; TD-27 «770 mA» a «DC 9 V» — corrente in continua **dopo** l'alimentatore, non
  l'assorbimento a rete, quindi resta `null`.
- **Ampeg SVT-CL** — `CONOSCENZA/pdf/datasheet/ampeg-svtcl-om.pdf`, *Power Requirements*:
  «EU/UK: 4A(Slo Blo), 220-240VAC, 50-60Hz, **460W**». Peso da ampeg.com: «80 lb / 36.3 kg».
- **Ampeg SVT-810E** — ampeg.com: «137 lb / 62 kg». Cassa passiva: `watt:0` è **un fatto**, non un
  dato mancante, e va distinto — se lo trattassimo come assente l'8×10 tornerebbe a portare i 400 W
  della stima, che però li assorbe la testata: contati due volte.
- **Nord Stage 4** — nordkeyboards.com: «19.6 kg (43.2 lb)» / «16.7 kg» / «10.4 kg». L'assorbimento
  non è pubblicato per nessuna delle tre taglie.
- **Hammond SkxPro** — hammondorganco.com/skxpro-specs: «Rated Power Consumption: 22W» ·
  «SkxPRO: 16.9kg [37.25 lbs]». È l'Hammond **portatile**: un B3 vintage pesa più di dieci volte
  tanto, e chi lo mette in un rider lo sa.

### Cosa manca ancora

Nessun modello per `stack` (testata + 4×12) e per `leslie`: **Marshall** e **Vox** non pubblicano
l'assorbimento, e le loro pagine prodotto rispondono 403 o 404 alle richieste automatiche. Fender
pubblica il peso ma non il consumo. Chi ha un manuale cartaceo di quelle marche può chiudere il
buco in due minuti: serve solo la riga «Power Requirements» del retro.

---

## 4. Cosa NON è verificato (e perché resta una stima)

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
