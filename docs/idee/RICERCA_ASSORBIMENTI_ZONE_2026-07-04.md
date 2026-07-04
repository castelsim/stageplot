# Ricerca — Assorbimenti reali per oggetto + zone automatiche
## 04/07/2026 (correzione di rotta richiesta da Simone)

> Mandato: i consumi devono venire da **ricerca reale per oggetto** (previsione indicativa realistica del
> consumo del palco), non da valori stimati a caso; le **zone di cablaggio devono essere automatiche**
> (suggerite in base agli oggetti, poi modificabili). Tutto basato su ricerca.

## 1. Principio: assorbimento REALE ≠ targa

Il numero utile per una previsione è l'**assorbimento AC tipico al muro durante lo show**, che è molto
sotto la potenza nominale/di uscita:
- Regola pratica ampli: ~2× la potenza di uscita audio, ma **ampli valvolari e tastiere raramente stanno
  alla targa** tutta la sera. [fonte SOS]
- Ampli PA in classe D: assorbono **molto meno** della potenza di uscita; lo spec di riferimento è a
  **1/8 di potenza (pink noise)** = livello "massimo pulito". Powersoft K10 = **1250 W a 1/8**. [Powersoft]
- LED wall: la **media** in uso reale è molto sotto il **picco** (tutti i pixel al massimo).

Quindi i valori sotto sono **assorbimenti tipici di programma**, la base onesta per la previsione.

## 2. Tabella assorbimenti (valori adottati → `WATT` nel tool)

| Oggetto (tipo) | W adottati | Base / fonte |
|---|---|---|
| Combo chitarra | 150 | reale ~100-200 W (regola 2× output, valvolari sotto targa) |
| Stack testata+4×12 | 250 | assorbimento testata |
| Ampli basso | 400 | reale ~300-500 W |
| Ampli tastiere | 150 | — |
| Leslie | 250 | motore + ampli |
| Stage piano 88 | 50 | strumenti digitali 30-100 W |
| Doppia tastiera | 100 | 2 tastiere |
| E-drums | 60 | modulo + monitor |
| DJ set | 350 | mixer + 2 player + laptop |
| Console DM3 / DM7c / DM7 | 45 / 110 / 150 | classe consumer, schermi piccoli |
| Rivage CS-R3/R5/R10 | 280 / 350 / 600 | superficie + 1-3 schermi grandi |
| A&H SQ-5/6/7 | 90 / 100 / 110 | — |
| A&H Avantis / dLive S5000/S7000 | 180 / 250 / 280 | — |
| DiGiCo Q338 | 340 | **datasheet** (line drawing/specs) |
| Midas HD96 | 300 | — |
| Laptop / interfaccia / mixer monitor / FOH | 90 / 15 / 150 / 200 | — |
| **Amp rack PA** | 2500 | rack drive tipico (≈2-3 ampli classe D a 1/8; K10=1250 W cad.) |
| Console luci | 100 | — |
| Dimmer rack (caricato) | 3600 | carico tipico di un rack conv. medio |
| Testa mobile | 350 | LED wash/spot 60-400 W (media ~250-350; scarica 800-1200) |
| PAR / Wash LED | 150 | LED PAR 50-200 W |
| Sagomatore | 400 | profilo LED (tungsteno 750) |
| Follow spot | 1200 | LED 500-800 / scarica HMI 1200-2500 |
| Stroboscopio | 800 | strobo LED 500-1000 |
| Macchina fumo | 1500 | fogger 1000-3000 W |
| Hazer | 1000 | 800-1500 W |
| Torre faro | 1000 | fari da lavoro/alogenuri |
| Proiettore | 500 | laser 400 W-2 kW |
| Camera | 30 | — |
| **LED wall / schermo** | **500 W/m²** | outdoor **media 350-500** (picco 1200-1500); 500 = media di dimensionamento |

Casse passive (line array, sub, wedge, front/side fill) = **0**: la potenza vive sugli **amp rack**
(no doppio conteggio). Generatori = **sorgenti** (kVA×0.8), non carichi.

**Sanity check** (dalla ricerca): backline + PA voce di una band piccola ≈ **1,5 kW** → con questi valori
2 chitarre (150+250) + basso (400) + mixer (150) + un ampio PA voce ≈ 1,4-1,6 kW. ✓ coerente.

## 3. Zone automatiche (suggerimento dagli oggetti)

Pratica reale: il palco si divide in zone e **ogni cluster di oggetti** (batteria, rig tastiere, backline
SX/DX) prende un **sub-stagebox / sub-snake** che entra nello stagebox principale, più un **power drop**.
I sub-snake si mettono "davanti al palco o accanto agli ampli" per creare zone di rapido dispiegamento.
[Whirlwind, Radial Catapult]

Quindi le zone **seguono la disposizione degli oggetti**, non una griglia rigida. Euristica adottata:

1. **Clustering di prossimità** (single-linkage): si uniscono nello stesso cluster gli oggetti i cui centri
   distano ≤ **T = 220 cm** (tipico "raggio" di un sub-snake). Così i pezzi di una batteria finiscono
   insieme, il backline SX insieme, ecc.
2. Ogni cluster con ≥1 oggetto → **rettangolo zona** = bounding box degli oggetti + **padding 60 cm**,
   clampato al palco.
3. **Etichetta**: per lato palco dal centroide x (SX / CS / DX su terzi della larghezza); se la zona è
   dominata dalla batteria → "Batteria". Fallback A/B/C.
4. **Cap** a 5 zone: se di più, si fondono i cluster più vicini.
5. **Esclusi** dal clustering: metro, testo libero, planimetria, blocchi palco (annotazioni, non carichi/patch).

**Comportamento UX**: aprendo "Zona di cablaggio" senza zone e con ≥2 oggetti → **auto-suggerite**.
Bottone **"Suggerisci zone"** per (ri)generare. Restano **modificabili** (trascina/ridimensiona/
etichetta/colore/elimina/aggiungi) come già implementato. La rigenerazione avvisa se ci sono zone
esistenti (le sostituisce).

## 4. Fonti

- Backline/ampli: [Sound On Sound — stage power](https://www.soundonsound.com/sound-advice/q-how-much-power-does-my-stage-system-need), [TalkBass draw thread](https://www.talkbass.com/threads/how-much-power-does-my-amp-actually-use.1633406/), [Endesa strumenti](https://www.endesa.com/en/blogs/endesa-s-blog/light/how-much-electricity-does-each-electric-instrument-use)
- PA amp: [Powersoft K10 datasheet](https://www.powersoft.com/wp-content/uploads/2019/01/powersoft_k10_data_en_v2.5.pdf), [Primal Sounds power distribution](https://www.primal-sounds.com/blog/power-distribution-events)
- Luci: [Uplus LED moving head efficiency](https://www.upluslighting.com/guides/led-wash-light-moving-heads-energy-efficiency-maintenance-tour/), [Vorlane watts for stage lights](https://vorlane.com/how-many-watts-for-stage-lights/), [SHEHDS power use](https://shehds.com/blogs/news/how-much-power-does-stage-lighting-use)
- Fog/haze: [TopProSound fog power](https://topprosound.com/why-do-fog-or-haze-machines-use-so-much-power/)
- LED wall: [SightLED calc](https://sightled.com/how-to-calculate-led-displays-power-consumption/), [SoStron guide](https://sostron.com/led-video-wall-power-consumption-calculator-guide/)
- Zone/cablaggio: [Whirlwind snakes & splitters](https://www.whirlwindusa.com/catalog/snakes-splitters-and-multiwiring-systems), [Radial Catapult](https://www.radialeng.com/product/catapult), [Stage power distro](https://sxpowercase.com/what-is-a-stage-power-distribution-box/)
