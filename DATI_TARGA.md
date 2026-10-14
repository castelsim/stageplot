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

### Ampliamento del 29/08 sera — da 11 a 18 modelli

| chiave | modello | W assorbiti | W di uscita | kg |
|---|---|---|---|---|
| `boss_katana100` | Boss Katana-100 MkII | **77** | 100 | 14,8 |
| `boss_katana50` | Boss Katana-50 MkII | **47** | 50 | 11,6 |
| `roland_kc400` | Roland KC-400 | **40** | 150 | 22 |
| `yamaha_cp88` | Yamaha CP88 | non dich. | — | 18,6 |
| `yamaha_cp73` | Yamaha CP73 | non dich. | — | 13,1 |
| `markbass_lm4` | Markbass Little Mark IV (testata) | non dich. | 500 | **2,45** |
| `markbass_ny122` | Markbass New York 122 (cassa) | **0** | — | 18,8 |

Boss e Roland pubblicano sempre entrambi i dati (`boss.info` e `roland.com`, pagine
*Specifications*), ed è il motivo per cui sono la parte più fitta del catalogo. Yamaha dà il peso
per ogni taglia ma non l'assorbimento. Markbass (`markbass.it`) dà peso e potenza d'uscita.

**Perché servono i due estremi e non la media.** Sul basso un rig SVT pesa **98,3 kg** (testata 36,3
+ cassa 62) e uno leggero moderno **21,25 kg** (Little Mark IV 2,45 + New York 122 18,8):
**quattro volte e mezza di differenza**. Nessuna stima di famiglia può rappresentarli entrambi, ed è
questo che rende un catalogo diverso da una stima più precisa. C'è un test che cade se il catalogo
si restringe alla sola fascia media.

### Pilota «catalogo da Thomann» (12/10/2026) — 20 modelli nuovi, e le misure in pianta

**Come sono stati scelti.** Dalle classifiche dei più venduti di thomann.it (stage piano, combo per
chitarra, combo per basso), lette poche volte e a mano: è quello che una band italiana ha davvero.
**Da Thomann non viene nessun numero.** Ogni dato viene dal PDF del costruttore, scaricato dal suo
sito o dal suo CDN; la pagina è anche nel campo `fonte` della riga di `AMP_DB`. I PDF stanno fuori
dal repo, in `STAGE PLOT/MANUALI_PDF/backline/` sul Mac di Simone. Ogni numero è stato riletto sul
PDF da due verifiche indipendenti e da un terzo controllo con `pdftotext` prima di scriverlo.

**Cosa cambia nel software.** Le righe hanno un campo nuovo, `mm: [L, P, A]` in millimetri, già
riordinato: ogni costruttore scrive un ordine suo (W×D×H, W×H×D, H×W×D) e la frase originale è
qui sotto. Scegliendo il modello, l'elemento prende **larghezza e profondità del manuale** (mm/10,
arrotondati al centimetro). Non succede in tre casi: la Doppia tastiera (sono due strumenti), una
testata o un modulo sull'Ampli basso (l'elemento è il rig) e lo stage piano in aspetto «Postazione»
(l'ingombro è il disegno col musicista; la misura vera si vede con «Strumento solo»).

Sul foglio (dal 12/10, seconda parte): la lista **Backline** (PDF, anteprima dell'Esporta, link condiviso)
scrive il modello scelto accanto all'etichetta («Ampli basso 1 — Ampeg RB-115 Rocket Bass»; senza
etichetta solo «Marca Modello»), e la **Lista carichi** del PDF scrive accanto ai W da dove vengono:
«targa» (questo registro), «stima» (valore tipico del tipo) o «indicato» (scritto a mano).

| chiave | modello | L × P × A mm | kg | W assorbiti | W uscita | PDF · pagina |
|---|---|---|---|---|---|---|
| `nord_stage4_88` | Nord Stage 4 88 (misure aggiunte) | 1282 × 349 × 121 | 19,6 | non dichiarato | — | `Nord_Stage4_SpecificationsWeb.pdf` p.6-7 |
| `yamaha_p145` | Yamaha P-145 | 1326 × 268 × 129 | 11,1 | **6** | — | `Yamaha_P-145_OwnerManual.pdf` p.14 |
| `yamaha_p45` | Yamaha P-45 | 1326 × 295 × 154 | 11,5 | **6** | — | `Yamaha_P-45_OwnerManual.pdf` p.20 |
| `yamaha_p225` | Yamaha P-225 | 1326 × 272 × 129 | 11,5 | **9** | — | `Yamaha_P-225_OwnerManual.pdf` p.24 |
| `yamaha_p525` | Yamaha P-525 | 1336 × 376 × 145 | 22,0 | **18** | — | `Yamaha_P-525_OwnerManual.pdf` p.117-118 |
| `nord_electro7_73` | Nord Electro 7 73 | 1066 × 294 × 104 | 9,5 | non dichiarato | — | `Nord_Electro7_SpecificationsWeb.pdf` p.6 |
| `kawai_es120` | Kawai ES120 | 1305 × 280 × 150 | 12,0 | **9** | — | `Kawai_ES120_OwnerManual.pdf` p.33 |
| `roland_fp40` | Roland FP-40 | 1307 × 332 × 122 | 14,0 | **22** (max) | — | `Roland_FP-40_ReferenceManual.pdf` p.56 |
| `thomann_sp120` | Thomann SP-120 (73 tasti) | 1070 × 275 × 95 | 6,2 | non dichiarato | — | `Thomann_SP-120_UserManual.pdf` p.22 |
| `korg_minilogue_xd` | Korg minilogue xd (tastiera) | 500 × 300 × 85 | 2,8 | 8 | — | `Korg_minilogue_xd_OwnerManual.pdf` p.66 |
| `boss_katana50g3` | Boss Katana-50 Gen 3 | 470 × 238 × 398 | 11,6 | **47** | 50 | `Boss_Katana-Gen3_ReferenceManual.pdf` p.17 |
| `harleybenton_hb10g` | Harley Benton HB-10G | 289 × 176 × 314 | 4,2 | **20** (max) | 10 | `HarleyBenton_HB-10G_UserManual.pdf` p.16 |
| `harleybenton_hb20r` | Harley Benton HB-20R | 380 × 175 × 340 | 7 | **40** (max) | 20 | `HarleyBenton_HB-20R_UserManual.pdf` p.16 |
| `marshall_mg30gfx` | Marshall MG30GFX | 480 × 225 × 420 | 10,8 | non dichiarato | 30 | `Marshall_MG15GFX-MG30GFX_QuickStartGuide.pdf` p.1 |
| `harleybenton_tube15c` | Harley Benton TUBE15 Celestion | 427 × 235 × 435 | 11,5 | **50** (max; 30 tipici) | 15 | `HarleyBenton_TUBE5-TUBE15-Celestion_UserManual.pdf` p.21 |
| `boss_katana100g3` | Boss Katana-100 Gen 3 (combo 1×12″, da palco) | 530 × 248 × 445 | 14,8 | **77** | 100 | `Boss_Katana-Gen3_ReferenceManual.pdf` p.19 |
| `harleybenton_hb20b` | Harley Benton HB-20B (combo basso) | 380 × 175 × 340 | 7,5 | **40** (max) | 20 | `HarleyBenton_HB-20B_UserManual.pdf` p.16 |
| `markbass_micromark801` | Markbass Micromark 801 (combo) | 268 × 262 × 268 | 5,2 ⚠ | non dichiarato | 45 | `Markbass_Micromark801-Minimark802_UserManual.pdf` p.16 |
| `harleybenton_hb40b` | Harley Benton HB-40B (combo basso) | 425 × 300 × 445 | 12 | **80** (max) | 40 | `HarleyBenton_HB-40B_UserManual.pdf` p.16 |
| `pjb_bg450` | Phil Jones Bass BG-450 Compact Plus | 361 × 336 × 362 | 14,1 | non dichiarato | 300 | `PhilJonesBass_BG-450-CompactPlus_Manual.pdf` p.10 |
| `ampeg_rb115` | Ampeg RB-115 Rocket Bass | 513 × 354 × 570 | 15,45 ⚠ | **280** (max) | 100 | `Ampeg_RocketBass-RB108-RB210_OwnerManual.pdf` p.9 |
| `ampeg_rb210` | Ampeg RB-210 Rocket Bass (combo 2×10″, da palco) | 513 × 354 × 654 | 17,7 ⚠ | **600** (max) | 250 | `Ampeg_RocketBass-RB108-RB210_OwnerManual.pdf` p.10 |

Gli ultimi due (Katana-100 Gen 3 e RB-210) erano le riserve: il 12/10 Simone ha deciso di aggiungerli
come **ampli da palco**, accanto agli Harley Benton da studio, che restano.

**Regola: l'assorbimento in catalogo è il MASSIMO dichiarato, non il tipico** (decisione di Simone del
12/10). È il numero che deve reggere la presa e la linea: Roland FP-40 22 W e non 5, Harley Benton
TUBE15 50 W e non 30. Quando il costruttore dà un solo valore senza dire quale sia, si scrive quello;
quando ne dà due, si prende il più alto e l'altro va nella nota della riga.

**Le citazioni** (frase copiata dal PDF, pagina del file):

- **Nord Stage 4 88** — pagina ufficiale *Specifications* di nordkeyboards.com salvata in PDF (Nord
  non pubblica una scheda in PDF e il manuale utente non riporta né misure né peso). p.6: «Nord Stage
  4 88: 1282 mm (50.5"), 121 mm (4.7"), 349 mm (13.7")» — senza etichette: 121 è l'altezza, 349 la
  profondità. p.7: «Nord Stage 4 88: 19.6 kg (43.2 lb)». Assorbimento non dichiarato.
- **Yamaha P-145** — p.14: «Dimensions (W × D × H) 1,326 × 268 × 129 (mm)» · «Weight 11.1kg (24 lb,
  8 oz)» · «Power Consumption 6 W (When using the PA-150 adaptor)». Lo stesso manuale vale per il P-143.
- **Yamaha P-45** — p.20: «1,326 x 295 x 154 mm» (W × D × H) · «11.5 kg (25 lbs. 6 oz.)» ·
  «Power Consumption: 6 W (When using PA-150 adaptor)». Spia P-45/P-145 controllata: due PDF distinti
  con numeri diversi, due modelli veri.
- **Yamaha P-225** — p.24: «Dimensions (W × D × H) 1,326 mm × 272 mm × 129 mm» · «Weight 11.5 kg
  (25 lb, 6 oz)» · «Power Consumption 9 W (When using PA-150 AC adaptor)». Vale anche per il P-223.
- **Yamaha P-525** — p.117: «Dimensions (W × H × D) 1,336 mm × 145 mm × 376 mm» (qui Yamaha mette
  l'altezza in mezzo) · «Weight 22.0 kg (48 lb, 8 oz)». p.118: «Power Consumption 18 W (When using
  PA-300C AC adaptor)».
- **Nord Electro 7 73** — pagina ufficiale *Specifications* salvata in PDF, p.6: «Nord Electro 7 73:
  1066 mm (42") x 104 mm (4.1") x 294 mm (11.6")» · «Nord Electro 7 73: 9.5 kg (20.9 lbs)». p.2:
  «73-key (6 octaves, E-E) Semi Weighted Waterfall keyboard». Assorbimento non dichiarato. ⚠ Non è
  l'Electro 7 **HP** (73 tasti pesati, 1070 × 341 × 130 mm, 13 kg): Nord li distingue, sono due righe.
- **Kawai ES120** — p.33: «Power Consumption 9 W (PS-129 AC adaptor)» · «1305 (W) x 280 (D) x 150
  (H) mm» · «Weight 12.0 kg / 26 1/2 lbs.»
- **Roland FP-40** — p.56: «Power Consumption 22 W (When using the included AC adaptor)», e «5 W»
  suonando a metà volume: in catalogo il massimo. «With music rest detached: 1,307 (W) x 332 (D) x
  122 (H) mm» · «Weight With music rest attached: 14.0 kg»: misure **senza** leggio, peso **con**.
- **Thomann SP-120** — manuale di Thomann, che del suo marchio è il costruttore. p.22: «Dimensions
  (W × H × D) 1,070 mm × 95 mm × 275 mm» · «Weight 6.2 kg» · «Keyboard 73 light weighted keys».
  Alimentatore esterno «9…12 V / min. 1,000 mA»: l'assorbimento a rete non è dichiarato, e 12 W
  ricavati dalla corrente continua non sono un dato del costruttore.
- **Boss Katana-50 Gen 3** — `KTN3_reference_eng02_W.pdf` (static.roland.com), p.17: «Rated Power
  Output 50 W» · «Power Consumption 47 W» · «Dimensions 470 (W) x 238 (D) x 398 (H) mm (Include
  handle and rubber feet)» · «Weight 11.6 kg 25 lbs 10 oz». Stessi numeri del MkII, prodotto diverso.
- **Harley Benton HB-10G** — manuale Thomann GmbH (marchio proprio), p.16: «Output power 10 W (RMS)» ·
  «Power consumption max. 20 W» · «Dimensions (W × H × D) 289 mm × 314 mm × 176 mm» · «Weight 4.2 kg».
- **Harley Benton HB-20R** — p.16: «Output power 20 W (RMS)» · «Power consumption max. 40 W» ·
  «Dimensions (W × H × D) 380 mm × 340 mm × 175 mm» · «Weight 7 kg».
- **Marshall MG30GFX** — Quick Start Guide linkata dalla pagina di supporto di marshall.com, p.1:
  «Product dimensions (height x width x depth): MG30FX 420mm × 480mm × 225mm Unit weight 10.8kg».
  Uscita da `Marshall_MG30GFX_DichiarazioneConformita.pdf` p.1: «30-Watt solid state guitar amplifier
  combo». Assorbimento non dichiarato. ⚠ Nello stesso PDF il testo giapponese (p.11) dà 228 mm di
  profondità invece di 225: in pianta sono comunque 23 cm.
- **Harley Benton TUBE15 Celestion** — p.21: «Output power 15 W (RMS) @ 8 Ω (external speaker)» ·
  «Power consumption 30 W (max. 50 W)» · «Dimensions (W × H × D) 427 mm × 435 mm × 235 mm» ·
  «Weight 11.5 kg». In catalogo il massimo, 50 W, come per gli altri «max.».
- **Harley Benton HB-20B** — p.16: «Output power 20 W (RMS) @ 4 Ω» · «Power consumption max. 40 W» ·
  «Dimensions (W × H × D) 380 mm × 340 mm × 175 mm» · «Weight 7.5 kg». (La pagina web di
  harleybenton.com scrive «W x D x H» con profondità e altezza scambiate: vale il manuale.)
- **Markbass Micromark 801** — manuale linkato da markbass.it/manuals, p.16: «POWER 45W @ 8 ohms /
  60W @ 4 ohms (AES standard)» · «DIMENSIONS … 26,8 x 26,8 x 26,2 cm (MICROMARK 801)» · «WEIGHT 11.46
  lbs / 5,2 kg (MICROMARK 801)». p.14: è un **combo**. Assorbimento non dichiarato (c'è solo il
  fusibile da 1 A, che è una protezione). ⚠ **Spia**: la pagina web di Markbass dice 6,6 kg e 50 W su
  8 Ω. Due numeri dello stesso costruttore: la riga ha `v:false` finché Simone non decide.
- **Harley Benton HB-40B** — p.16: «Output power 40 W (RMS) @ 4 Ω» · «Power consumption max. 80 W» ·
  «Dimensions (W × H × D) 425 mm × 445 mm × 300 mm» · «Weight 12 kg».
- **Phil Jones Bass BG-450 Compact Plus** — pjbworld.com, p.10: «Power output: 300 W at 8 Ohms / 500W
  at 4 Ohms» · «Dimensions: (WxHxD): 14.2x14.3x13.2 inch（361x362x336 mm）» · «Weight: 14.1kg (31
  lbs.)». Assorbimento non dichiarato. ⚠ A p.7 lo stesso manuale dice 250 W su 8 Ω.
- **Ampeg RB-115 Rocket Bass** — ampeg.com, p.9: «Output Power Rating 200 Watts RMS @ 4 Ω … (with
  external speaker) / 100 Watts RMS @ 8 Ω» · «Power Requirements 100–240V ~ 50-60 Hz, 280W Max» ·
  «Size (H x W x D) … 570 x 513 x 354 mm» · «Weight (Approximate) 33.4 lbs 15.45 kg». ⚠ 33,4 libbre
  fanno 15,15 kg: in catalogo i kg scritti dal costruttore, con la nota.
- **Boss Katana-100 Gen 3** — stesso `KTN3_reference_eng02_W.pdf`, p.19, scheda «KATANA-100»: «Rated
  Power Output 100 W» · «Speaker 30 cm (12 inches) x 1» · «Power Consumption 77 W» · «Dimensions 530
  (W) x 248 (D) x 445 (H) mm (Include handle and rubber feet)» · «Weight 14.8 kg 32 lbs 11 oz».
  Stessi numeri del Katana-100 MkII (`boss_katana100`), prodotto diverso: due righe.
- **Ampeg RB-210 Rocket Bass** — stesso manuale Ampeg, p.10, «RB-210 Technical Specifications»:
  «Output Power Rating 500 Watts RMS @ 4 Ω 5% THD+N (with external speaker) / 250 Watts RMS @ 8 Ω 2%
  THD+N» · «Speaker Specs 2 x 10" custom Lavoce speakers» · «Power Requirements 100–240V ~ 50-60 Hz,
  600W Max» · «Size (H x W x D) … 654 x 513 x 354 mm» · «Weight (Approximate) 38 lbs 17.7 kg».
  ⚠ 38 libbre fanno 17,24 kg: in catalogo i kg scritti dal costruttore, con la nota (come per il
  RB-115). In uscita 250 W col suo altoparlante: i 500 W valgono solo con una cassa esterna.

**Assorbimento non dichiarato** (si torna alla stima del tipo, e il software dice «stima»): Nord
Stage 4 ed Electro 7, Thomann SP-120, Marshall MG30GFX, Markbass Micromark 801, Phil Jones BG-450.

**Rimasto fuori: Casio CDP-S110** (4° fra gli stage piano). casio.com risponde 403 a ogni accesso
automatico, e i numeri che girano nei negozi non tornano fra loro (8 W o 10 W): senza il PDF di Casio
non si scrive niente. Entra appena qualcuno scarica la *User's Guide* dal browser.

### Korg minilogue xd (14/10/2026) — modello con icona propria in scala

Chiave `korg_minilogue_xd`, tipo «Tastiera». Owner's Manual inglese ufficiale Korg
(`Korg_minilogue_xd_OwnerManual.pdf`, scaricato da korg.com; la pagina PDF coincide con quella stampata).
p.66 (Specifications): «Keyboard (minilogue xd) 37 keys (slim keyboard, velocity sensitive)» ·
«Power consumption 8 W (no-load power consumption: 0.1 W at 230 V)» · «Dimensions (W x D x H) minilogue xd:
500 × 300 × 85 mm» · «Weight minilogue xd: 2.8 kg» · «OUTPUT L/MONO and R jacks (6.3mm monaural phone jack,
unbalanced)» · «Power AC adapter (DC 9V)». p.8: «To output monaural sound, use the OUTPUT L/MONO jack.»
⚠ Non è il **xd module** (500 × 179 × 85 mm, 2,6 kg, senza tastiera): stesso manuale, altra riga.
L'icona (`icons.js`, `korg_minilogue_xd`) è un disegno vettoriale nostro in scala 1 unità = 1 cm, con la
disposizione dallo schema di p.5 e i colori dalle foto ufficiali Korg; niente immagini Korg nel repo.

### Ultimate Support Apex AX-48 Pro, supporto a colonna a due piani (15/10/2026) — elemento `tastierecolonna`

Documenti del costruttore (ultimatesupport.com, copie in `STAGE PLOT/MANUALI_PDF/backline/`): One Sheet
`Ultimate-Support_AX-48-Pro_OneSheet.pdf` («Standing Height: 46"» · «Weight: 19 lbs.» · «Folded Length: 52"» ·
«Load Capacity: Up to 125 lbs. per tier or 250 lbs. total» · «The top tier has 13" long arms and the bottom tier
arms are 18" long. The tiers are clamped onto the column … and can be adjusted up or down»); pagina prodotto SKU 17351
(«Height: 46" (1168 mm) · Weight: 19 lbs. (8.6 kg) · Load Capacity … 125 lbs. per tier (56.8 kg)» · «includes two CMP-485
super clamps, and 13" and 18" tribars»); pagina TBR-180 («Length: 18" (457mm)»); manuale `Ultimate-Support_AX-48-Pro_Manual_17351.pdf`
p.2 («pull out support legs … Turn the knob on the fourth leg and extend to floor for greater stability»).
Nel disegno: bracci 18" = 45,7 cm (piano basso) e 13" = 33,0 cm (piano alto; la pagina TBR-130 scrive «457mm», errore
evidente, 13" = 330 mm). ⚠ **Stime, perché il costruttore non le pubblica**: i piedi in pianta (60 × 60 cm, ingombro
indicato da un rivenditore), l'interasse dei bracci e la distanza fra i piani. Peso stimato di postazione 31 kg
(stand 8,6 + piano digitale circa 20 + minilogue xd 2,8) e 35 W (piano digitale circa 25 stima + minilogue xd 8 W
dal manuale Korg): sono `stima`, non di targa. Il disegno ha il piano digitale generico da 88 tasti (132 × 36 cm,
lo stage piano di serie senza i montanti a X) sotto e il Korg minilogue xd (50 × 30 cm) sopra.

### Il pezzo che il dato di targa non dice: le superfici di controllo

`csr3/csr5/csr10` e `dlives5/dlives7` **non sono console intere**: il DSP sta in un rack a parte, che
si alimenta e si trasporta. I nostri numeri di targa sono giusti e dicono **metà del sistema**.

- Yamaha **DSP-R10**: «Power consumption: 190 W · Net weight: 20 kg» (`CONOSCENZA/pdf/datasheet/DSP-R10_data_sheet.pdf`)
- Yamaha **DSP-RX**: 190 W · 19 kg
- Yamaha **RPio622** (I/O rack): 300 W · 30 kg

Invece di inventare un tipo nuovo, l'audit lo **ricorda**: se sul palco c'è una superficie e nessun
rack, compare un rilievo che nomina il motore giusto (RIVAGE PM o dLive MixRack) e si spegne appena
un rack viene posato.

⚠️ **Difetto trovato mentre lo scrivevo**: l'avevo messo a livello `info`, e **il pannello dell'audit
mostra solo `err`, `warn` e `todef`** — il PDF solo `err` e `warn`. Un rilievo `info` si calcola e
non lo vede nessuno, con la suite verde, perché i test guardano i findings del motore e non la lista
che finisce sullo schermo. Ora è `todef`, che è anche la semantica giusta: un pezzo da definire, che
non pesa sul punteggio e non finisce nel PDF che va al locale.

**Restano otto rilievi `info` invisibili** già in casa da prima, fra cui «Nessun contatto per il
Service locale», «Il progetto è ancora una Bozza», «Alcune luci non dicono la temperatura o il
colore», «Una luce su struttura non dice a che altezza». Non li ho toccati — cambiare il livello di
un rilievo altrui è una decisione di prodotto, non una correzione — ma vanno guardati: gli ultimi
tre sembrano proprio «da definire».

### Cosa manca ancora

Nessun modello per `stack` (testata + 4×12) e per `leslie`: **Marshall**, **Vox** e **Orange** non
pubblicano l'assorbimento, e le loro pagine rispondono 403 o 404 alle richieste automatiche. Fender
pubblica il peso solo tramite rivenditori, e la regola qui è **fonte ufficiale o niente**. Chi ha un
manuale cartaceo di quelle marche chiude il buco in due minuti: serve solo la riga «Power
Requirements» stampata sul retro.

Aggiornamento del 12/10: Marshall ora ha un modello (MG30GFX, dal pilota Thomann), ma **senza
assorbimento**, che la sua guida non dichiara. Resta da verificare una pista sul Fender: in
`MANUALI_PDF/backline/` c'è un Owner Manual del '65 Twin Reverb che a p.7 scrive «POWER REQUIREMENTS:
360 watts» e «WEIGHT: 64 lb (29 kg)». Se quel PDF viene da fender.com, la frase qui sopra su Fender
va corretta e il modello può entrare.

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
