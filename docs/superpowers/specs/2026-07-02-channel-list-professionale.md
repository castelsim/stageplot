# Channel list professionale — ricerca e roadmap miglioramenti

Data: 2026-07-02. Segue l'MVP di 1B (pannello channel list ripristinato + pagina PDF).
Obiettivo utente: portare la channel/input list a **livello professionale**, iterando nel tempo.

## Cosa dice lo standard (ricerca settore live sound)

**Input list** — colonne standard:
- **CH#**: numero canale. Convenzione *kick-on-input-one*; organizzare a **banchi** (1-8 batteria, 9-16 basso/chitarre, 17-24 fiati, 25-32 voci) pensando ai fader del mixer digitale; **stereo su canali dispari**.
- **Source/Instrument**: con nome del performer quando utile ("Electric Guitar 1 – John").
- **Mic/DI**: modello.
- **Stand**: tipo e dimensione.
- **48V**: phantom.
- **Insert/routing**: outboard, FX, patch.
- **Provided By**: chi fornisce il gear (band vs service/venue) — fondamentale nel rider.

**Monitor/output list** — diversa dall'input:
- **Mix#**: ordine di patch.
- **Type**: wedge / IEM / side-fill / XLR.
- **Who**: performer/posizione che usa quel mix (deve corrispondere allo stage plot).
- Requisiti speciali.

**Technical rider** = input list + monitor list + stage plot insieme; tabella con griglia.

## Gap del pannello attuale (recuperato)

Input: sorgente, mic/DI, stand, 48V, note (+ indice). Output: **riusa lo stesso schema dell'input**
(src/mic/stand/48V/note), non adatto ai monitor. Mancano: **Provided By**, banchi/numerazione
esplicita, schema output dedicato (Type/Who), suggerimenti mic/stand, auto intelligente, rider completo.

## Roadmap miglioramenti (prioritizzata — da iterare)

| # | Miglioramento | Valore | Complessità |
|---|---------------|--------|-------------|
| M1 | **Colonna "Provided By"** (band/service) su input+output, nel pannello e nel PDF | Alto (rider reale) | Media |
| M2 | **Output/monitor list dedicata**: Mix# · Type (wedge/IEM/side-fill) · Who · note (invece di riusare lo schema input) | Alto | Media |
| M3 | **Auto intelligente**: mappa strumento→mic suggerito, kick-on-1, ordinamento a banchi | Alto | Alta |
| M4 | **Suggerimenti mic/stand** (datalist di modelli comuni) per compilare in fretta | Medio | Bassa |
| M5 | **PDF rider professionale**: intestazione (artista/evento/data/FOH+contatti), Provided By, raggruppamenti, "Technical Rider" | Alto | Media |
| M6 | **Riordino righe drag-and-drop** (il CSS `.grip/.dragging` esiste; `attachReorder` era dead code) | Medio | Media |
| M7 | **Numerazione CH esplicita** come colonna + stereo pairing | Medio | Bassa |

## Approccio

Iterativo (richiesta utente: "lavorandoci capirò cosa funziona"). Ogni miglioramento è un intervento
frontend piccolo dietro il gate `__consultMode`, con verifica runtime nel browser. Le scelte grafiche
si validano visivamente (preferenza utente [[feedback_scelte_grafiche_visive]]).

Primo giro consigliato: **M1 (Provided By)** + **M2 (output dedicata)** — sono ciò che distingue una
channel list "da tool" da un rider professionale, e sono a complessità media.

## Fonti

- [NLFX Professional — Stage Plot & Input List](https://www.nlfxpro.com/blog2/understanding-stage-plot-input-list-a-guide-for-bands-venues/)
- [Disc Makers — Detailed Input List](https://blog.discmakers.com/2017/09/how-to-make-a-detailed-input-list/)
- [ProSoundWeb — Best Practices Input Lists & Stage Plots](https://www.prosoundweb.com/simple-yet-vital-best-practices-in-developing-input-lists-and-stage-plots/2/)
- [Total Pro Audio — Band Technical Specification](https://totalproaudio.stevebunting.com/12/paperwork/how-to-write-a-band-technical-specification/)
- [MusicNSW — Tech Rider & Stage Plot Template](https://www.musicnsw.com/resources/tech-rider-stage-plot-template)
