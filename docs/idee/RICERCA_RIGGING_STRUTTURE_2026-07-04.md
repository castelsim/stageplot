# Rigging, appendimenti e strutture di palco — ricerca approfondita
## 04/07/2026 — complemento a RICERCA_PRO_PALCHI_2026-07-04.md

> Mandato Simone: "tutto quello che serve per fare fisicamente il palco: comparto appendimenti,
> tutte quelle robe là — ricerca molto approfondita". Qui: cosa esiste, misure reali per le icone
> (lotto 5 proposto), cosa significa per il software, normativa italiana.

---

## 1. Il quadro: chi appende cosa

Sopra ogni palco professionale c'è una struttura che regge luci, PA, video e scenografia.
Tre mondi:

1. **Indoor con grid** (teatri, palasport): si appende al soffitto/grid con **punti rigging**
   (steel + shackle), **motori a catena** e **bridle**. Il deliverable è il **rigging plot**.
2. **Outdoor con ground support**: torri + sleeve block che sollevano una griglia di truss,
   oppure **coperture** complete (arch/duo pitch/saddle) con gambe proprie e zavorre.
3. **Palco modulare sotto** (stagedex/Layher): pedane 2×1, sottostrutture, scale, parapetti —
   già in parte nel tool (blocchi palco + pedane).

## 2. Truss (le "americane") — misure reali per le icone

| Serie | Sezione (cm) | Lunghezze modulo | Note |
|---|---|---|---|
| F34 / H30V (quadra 29) | 29×29 (esterno ~28.7) | 0.25–5 m (tipiche 1/2/3 m) | lo standard club/medio; corde Ø48×3 |
| F44P / H40V (quadra 40) | 40×40 | 0.5–5 m | main truss palchi medi/grandi |
| Triangolare F33/H30T | 29 (base) | 1–4 m | luci leggere, décor |
| Bi-tubo (ladder) F32 | 29×? piatta | 1–3 m | banner, tende, LED leggeri |
| Circolare H30V-R | raggio 1–5 m a spicchi | 4–8 pezzi | cerchi luce |
| Corner/box corner | 29 o 40 cubo | — | angoli T/X/L |
| Sleeve block (per torre 40) | ~60×76 | — | scorre sulla torre, porta il roof |

**Per il tool**: la truss in pianta = elemento **resizable in lunghezza** (come il parapetto),
larghezza fissa 29 o 40 cm, pattern reticolare visibile. Corner = elementi snodo. Già esiste un
TYPES `truss` generico: upgrade realistico + varianti 29/40/triangolare.

## 3. Motori, punti, accessori di appendimento

| Elemento | Misure indicative | Note |
|---|---|---|
| Paranco a catena 250 kg (classe Lodestar/GIS/ChainMaster) | corpo ~38×25 cm, 25–35 kg | [DA VERIFICARE] sul datasheet del modello |
| Paranco 500 kg | ~40×28 cm | il tuttofare |
| Paranco 1 t | ~45×32 cm | PA e roof |
| Paranco 2 t | ~50×36 cm | main rig arene |
| Punto rigging (dead-hang) | simbolo Ø, non fisico | steel+shackle sotto trave |
| Bridle (a V su 2 travi) | gambe ~1.2 m di interasse | crea il punto dove serve |
| Span-set / stinger | fascia 1–2 m | choke sulla truss |
| Base plate torre | 80×80 – 100×100 | sotto le torri |
| Zavorra/ballast cemento | 100×100 (500–1000 kg cad.) | outdoor senza picchetti |
| Controller motori (8/16 ch) | rack 60×50 | a terra, lato palco |

**Per il tool — la feature che nessun competitor "semplice" ha: il RIGGING PLOT.**
In pianta si disegnano i **punti di appendimento numerati** (P1…Pn / M1…Mn) con:
- carico previsto in kg (etichetta),
- tipo (dead-hang / bridle / ground),
- quota della trave/grid,
- a cosa serve (truss luci SX, array PA DX…).
Tabella automatica dei punti nel PDF (numero, posizione X/Y in metri dal proscenio, carico, note)
= il documento che il rigger e il venue si scambiano OGGI a mano su AutoCAD/Excel.
Tecnicamente: stessa meccanica della channel list (già esistente) applicata a un layer "rigging".

## 4. Ground support e coperture

| Sistema | Footprint tipico | Note |
|---|---|---|
| Torre GS 40 (singola) | base 80×80–100×100, h 6–12 m | 4-6 torri + griglia |
| Copertura arch (piccola) | 6×4, 8×6 m | club/piazza piccola |
| Copertura duo pitch media | 10×8, 12×10 m | il "festival medio" |
| Copertura grande (PR-10 class) | 14×12+ m | PA frame fino a 3 t per torre frontale |
| Gronda/ali PA | sbalzo 2–3 m per lato | l'array appeso FUORI dalla pianta palco |
| Torre followspot/delay | 2×2 – 3×3 m | già lotto 4 ✓ |

**Per il tool**: la copertura in pianta = perimetro truss + 4-6 **gambe/torri** + zavorre +
proiezione della gronda. Da fare come **composito parametrico** (pattern batteria/timpani:
scegli 8×6/10×8/12×10 → gambe e zavorre si posizionano da sole). Le ali PA si agganciano
alle torri frontali.

## 5. Palco modulare (sotto i piedi)

- **Stagedex 2×1 m** (già = "Pedana" del tool ✓), gambe 20–100 cm, scale (✓), parapetti (✓),
  rampe (✓): il tool è già coperto sul palco modulare di base.
- Mancano: **passerella/catwalk** (1×2 moduli in fila verso il pubblico), **torre camera/riser
  video** (2×2), **sottopalco Layher** per pendenze (nota, non icona), **ring di sicurezza
  perimetrale** (già parapetto).

## 6. Normativa italiana (quello che il software deve "sapere")

- **Decreto Palchi — D.I. 22/07/2014** (+ Circolare 35 del 24/12/2014): montaggio/smontaggio
  di palchi per spettacolo = cantiere (Titolo IV D.Lgs. 81/08) con PSC/POS, salvo esenzioni:
  strutture < 6,5 m da piano stabile; biplanari ≤ 100 m²; indipendenti ≤ 8,5 m.
- Ogni struttura ha il suo **progetto firmato** e **relazione di calcolo** (vento!); zavorre e
  controventi da progetto; anemometro e piano vento (chi abbassa cosa, a quale soglia).
- La **commissione di vigilanza** vuole la pianta con strutture, capienze, vie di esodo (già §7
  della ricerca pro).
- **Per il tool**: NON facciamo calcolo strutturale (responsabilità dell'ingegnere), ma la pianta
  può portare i metadati giusti: carico per punto, taglia motori, zavorre per torre → la tabella
  che l'ingegnere e il service si aspettano di ricevere. Disclaimer chiaro nel PDF.

## 7. Lotto 5 proposto — "Strutture & rigging" (~18-22 icone)

1. Truss 29 dritta (resizable) + truss 40 + triangolare + ladder
2. Corner 29 (T/X/L, 3 icone o 1 con varianti) + corner 40
3. Motore 250/500/1000/2000 kg (1 icona parametrica per taglia — 4 file)
4. Simboli punto rigging: dead-hang, bridle, punto a terra (famiglia "simboli tecnici", come
   i simboli normativi: qui la pianta VUOLE il simbolo, non il realismo)
5. Sleeve block + torre GS (top) + base plate + zavorra 500/1000
6. Copertura parametrica: 3 taglie pronte (8×6, 10×8, 12×10) come composizioni
7. Controller motori (rack), catwalk modulo, riser camera 2×2
8. (bonus musicista) pinza/clamp e mezzo-coupler NON servono in pianta → esclusi, restano
   nel mondo verticale (sezione futura / 3D)

## 8. Fonti principali

- Truss: [Prolyte H30V data](https://www.prolyte.com/products/aluminium-truss/square-truss/h30v-l100-square-30-length-100-cm), [manuale X/H 30-40](https://www.cpl.tech/wp-content/uploads/2014/03/Prolyte-H30V-User-Guide.pdf)
- Roof/GS: [Eurotruss PR-10](https://www.procom-me.com/product/pr-10-pitch-roof/), [ProX GS 21×21×23](https://www.proxdirect.com/products/view/F34-Stage-Roofing-Truss-System-with-Ground-Support-Circular-Truss-and-Chain-Hoists-21x21x23-Ft-Circle-in-Center-XTP-GS212123-2MC), [sleeve block](https://www.itsctruss.com/40ft-arch-truss-stage-roof-beam-system-covering_p469.html)
- Motori: [CM Lodestar](https://www.cmhoist.com/electric-hoists/lodestar/), [specs PDF](https://www.cordellmfg.com/wp-content/uploads/2015/02/CM-Lodestar-Specifications-and-Dimensions.pdf)
- Rigging pratica: [IA470 primer](https://www.ia470.com/primer/rigging.htm), [entertainment rigging (wiki)](https://en.wikipedia.org/wiki/Entertainment_rigging), [Vectorworks intro](https://www.vectorworks.net/en-US/newsroom/entertainment-rigging)
- Normativa: [Decreto Palchi — Certifico](https://www.certifico.com/sicurezza-lavoro/legislazione-sicurezza/decreti-sicurezza-lavoro/decreto-interministeriale-22-luglio-2014-palchi), [linee guida Vega](https://www.vegaengineering.com/news/linee-guida-decreto-palchi-allestimento-opere-temporanee/), [circolare 35/2014](https://www.quotidianosicurezza.it/normativa/ministero-del-lavoro/circolare-istruzioni-sicurezza-spettacolo-decreto-luglio.htm)
