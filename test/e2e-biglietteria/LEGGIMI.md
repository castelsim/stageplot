# Prove nel browser della biglietteria (Playwright, stack Supabase LOCALE)

Mai produzione, mai mail vere, mai account veri: stack locale, Google finto (sessione iniettata), rete esterna bloccata,
dati inventati (`@example.invalid`), porte 8800–8899. Telefono 390x844 e computer 1280x800, Chromium e WebKit.

- `tutte.sh` — suite, RLS, migrazioni, tutte le prove qui sotto. Non fa `supabase db reset` (lo stack può essere condiviso).
- `e2e-viaggio.mjs` — la storia intera: spettacolo della prima versione (`bgl_apri`) → area → pubblico → Sposta → sala che cambia
  → Le mie prenotazioni → elimina. `INVERTI=1` scambia motori e dispositivi, `TEMA=scuro` prova il tema scuro.
- `prova-fuso.mjs` — ora legale e fuso del dispositivo; `prova-gara.mjs` — due persone, stesso posto, stesso istante.
- `prova-<area>.mjs` — una per schermata (404, pubblico, area-ingresso, modulo, scheda, sala, sposta, editor, google, mie, ritorno).
- `prova-miei.mjs` — «I tuoi posti» sulla pianta (ricordo, Google, niente) e «Entra con Google» dalla pianta.
- `prova-zoom-pc.mjs` — la pianta col mouse (clic = scegli, «+ − Vista intera», doppio clic, trascinamento, rotellina) e col
  dito come prima (tocco che ingrandisce, due dita).
- `prova-segnala.mjs` — la casella delle segnalazioni su tutte le pagine; submit-feedback intercettata (non parte niente).
- `comune.mjs` (attrezzi), `server.mjs` (finto GitHub Pages con `404.html`), `prepara.sh` (copia di sola prova del sito con
  indirizzo e chiave locali al posto di quelli di produzione: il repo non cambia), `env` (per `supabase functions serve`).

Variabili: `WT` (cartella del repo, predefinita questa), `BGL_E2E_DIR` (copia del sito e screenshot, predefinita
`$TMPDIR/bgl-e2e`), `REVIEW_DIR` (dove sta `playwright`, predefinita `~/COWORK/STAGEPLOT/review`), `SITO`, `OUT`,
`SOLO="chromium telefono"` (un giro solo).
