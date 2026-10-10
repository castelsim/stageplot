# 10/10/2026 — Snippet X32/M32: non azzera più il gain (ramo `x32-gain`, NON unito)

- Difetto: lo snippet scriveva `/headamp/NNN +0.0 ON|OFF`; nei file reali quel comando porta GAIN e phantom insieme (`/headamp/000 +0.0 OFF`), quindi caricarlo riportava a 0 dB il gain di ogni canale. Tolte TUTTE le righe `/headamp`: il 48V non si imposta più dallo snippet (resta nella Channel list).
- Anche `/ch/NN/config "nome" icona colore SORGENTE` sovrascriveva la sorgente (routing) e l'icona. Ora due righe separate per canale: `/ch/NN/config/name "..."` e `/ch/NN/config/color XX`. ⚠️ Questa forma separata NON è provata su un banco vero (i file reali la usano per altri nodi annidati, es. `/config/talk/A`): da provare su X32-Edit/console prima di fidarsi; se non fosse accettata, il danno è «non cambia niente». Alternativa verificata ma meno prudente: riga `config` completa (tocca sorgente e icona).
- Testi del selettore Esporta riscritti: «NON tocca guadagni, 48V, sorgenti, icone». Test `lo snippet X32/M32 scrive solo nome e colore…` + 2 mutazioni rosse (riga headamp rimessa; riga config completa rimessa).

# 10/10/2026 — Pagine «alternativa a…»: /alternative/ + Ridermaker, TecRider, Stage Plot Pro (ramo `alternative`, PR da unire)

- 4 pagine statiche nuove nello stile delle guide (`guida/style.css`, un H1, breadcrumb, byline, `callout in-breve`, FAQ visibili =
  `FAQPage`, `BreadcrumbList` + `Article`/`CollectionPage`): hub `/alternative/` e `/alternative/{ridermaker,tecrider,stage-plot-pro}/`.
  Fatti SOLO dai profili verificati in `MARKETING/competitor-profiles/` (prove in Chrome del 10/10 per Ridermaker e TecRider,
  pagine pubbliche per Stage Plot Pro), con la data in ogni tabella. Ricontrollati con curl il 10/10: prezzi Ridermaker (19/29 € anno
  + IVA, prova 7 giorni) e pagina prezzi/home di stageplotpro.app. ⚠️ Il PDF di stageplot.it ha la riga «Creato con stageplot.it»:
  le pagine dicono «senza filigrana», MAI «senza marchio». TecRider: «PDF gratis con account gratuito» NON verificato (scritto così).
- Pubblicità comparativa: niente aggettivi sul concorrente, niente loghi, nota sui marchi in fondo, «non indicato ≠ assente».
- ⚠️ `alternative` aggiunta all'allowlist rsync di `pages.yml` (senza: 404). Agganci: hub delle guide (sezione «Confronti con altri
  editor» + footer), footer della home, `guida/stage-plot-in-scala`, `guida/channel-list-input-list`; le 3 pagine si linkano fra loro.
  `sitemap.xml` (+4, lastmod di home e /guida/ al 10/10), `llms.txt` (sezione «Confronti»). Date in UTC (`date -u +%F` = 2026-10-10).
- Le pagine sono generate una volta da uno script fuori dal repo: da qui in poi si modificano a mano come le guide.
- Prove: engines 1398/1398 (2 test nuovi «alternative: …», 9 mutazioni rosse: allowlist, FAQ ld≠visibile, doppio H1, data tolta,
  riquadro tolto, link dall'hub guide, «fonico», llms); `build.mjs --check` ok; JSON-LD parse ok; server locale 8931: 4 pagine 200,
  un H1, riquadro presente, tutti i link interni 200. Da rifare ogni 3 mesi: prezzi e lingue dei tre concorrenti.

# 10/10/2026 — Editor: SCALETTA con durate e QR nel PDF verso la versione online (ramo `scaletta-qr`, NON unito)

- Idee dal confronto con TecRider Pro. **Scaletta**: `state.scaletta` = [{tipo brano|intro|pausa|bis|cambio, titolo, durata
  "m:ss", note}], campo del DOCUMENTO (`CAMPI_DOCUMENTO`), presente SOLO con almeno una voce (un `[]` su tutti i progetti
  avrebbe cambiato `firmaPdf` → falso «Modificato dopo l'ultimo PDF»). Sanificata in `normalizeState` (`scalettaNorm`, max 200
  voci, titolo 80, note 120, durata solo cifre e separatori). Totale = somma delle durate valide (`scalettaList`), voci vuote
  fuori, numeri d'ordine solo ai brani. Tipi e limiti in funzioni, non `var` (normalizeState gira al boot).
- Pannello `#scalettaSec` (hub come Evento, `scalettaEdit`, `body.scaletta-edit`): riga «Scaletta» nelle Liste (col mouse,
  con Liste accese), Menu del telefono → Evento → Scaletta, ricerca «scaletta/setlist». Testo = saveSoon, aggiungi/sposta/
  togli = `primaDiAgire()` + save(); render() ridisegna le righe solo se la scaletta è cambiata da fuori (Annulla, scena).
- PDF: casella `#pdfScaletta` (fuori da «Altre opzioni»; visibile e spuntata solo con ≥1 voce, non si ricorda) →
  `window.__pdfScaletta` → `scalettaPdf(doc)` dopo le pagine-vista, prima delle tecniche; A4 verticale come le liste,
  titoli e note a capo, totale in fondo. Anteprima e scheda del link condiviso da `pdfListConfig().scaletta` (+ `rowCls`/`foot`).
- QR: casella `#pdfQr`, spenta a ogni apertura, visibile solo se `__cloud.shareTokenAttivo` (sola lettura, NON crea token)
  trova un link attivo. `pdfQrDati` (libreria di Condividi, `window.__loadQrLib`; >1000 caratteri o >41 moduli = niente QR +
  avviso), disegnato a rettangoli nel cartiglio della SOLA prima pagina, in una colonna sua da 30 mm (`pdfCartTitleW`: titolo,
  cartH e scala automatica usano la stessa larghezza). `linkVistaCondivisa(tok)` = stesso link di Condividi.
- Prove: engines 1396 (10 nuove), 7 mutazioni rosse; collaudo 30/30; Orchestre verde. Browser (127.0.0.1:8931, origine
  separata per non toccare il progetto dell'account su localhost): scaletta creata, Annulla/Ripeti, ricarica, PDF vero
  (2 pagine, QR nel cartiglio senza sovrapposizioni — token finto: QR provato senza account), telefono a 402 px.

# 10/10/2026 — Riquadro «In breve» sulle pagine di guida e di formazione (ramo `in-breve`, PR da unire)

- Idea dalla «risposta rapida» dei concorrenti (è il testo che AI Overview e ChatGPT riprendono): in 23 pagine (12 in `guida/*`, 11 in `stage-plot/*`) c'è ora, subito dopo H1, apertura e riga «A cura di…», un `<div class="callout in-breve">` con `<strong>In breve:</strong>` e 2-3 frasi (≤ ~60 parole) che rispondono alla domanda del title/H1 usando SOLO fatti già scritti nella pagina. Nessun CSS nuovo: riusa `.callout` di `guida/style.css` (la classe `in-breve` è solo un aggancio). ⚠️ La consegna parlava di un riquadro «già presente» in `guida/rider-tecnico`: non c'era (solo un paragrafo «In breve:» sotto la tabella), quindi è stato aggiunto anche lì.
- Aggiornati `dateModified` (JSON-LD), «aggiornato il 10/10/2026» e `<lastmod>` in `sitemap.xml` delle 23 pagine. Title/description/H1 e FAQ (visibili e JSON-LD) NON toccati.
- Hub `stage-plot/index.html`: le schede erano solo link alle pagine; aggiunta sezione «Apri il modello nell'editor» con 11 link `/app/?model=<chiave>` (band, orchestra, coro, chiesa, festival, matrimonio, dj, tributo, acustica, jazz, bigband: le stesse chiavi delle pagine singole). Lastmod dell'hub al 10/10.
- Prove: `node test/engines.test.mjs` 1386 passati, 0 falliti; `node build.mjs --check` ok; JSON-LD parse ok su tutte; riquadro presente una volta sola (fetch su server locale 8931).

# 09/10/2026 — Analisi vocale su stageplot.it/voce/ (ramo `voce-tappa1`, PR bozza, NON unito)

- `voce/` è un **programma separato GPL-3** (sorgente: github.com/castelsim/voce, commit in `voce/SORGENTE.txt`): Praat
  6.4.62 in WebAssembly nel browser, confronto PRE/POST della voce cantata. **Non si modifica qui**: si aggiorna dal
  repository della voce con `node strumenti/pubblica-su-stageplot.mjs <checkout di StagePlot>` (fa tutti i suoi test,
  rifiuta audio, json, file nascosti, percorsi locali, sorgente non pubblicato, radice senza CNAME stageplot.it).
- `pages.yml`: `voce` aggiunta all'elenco delle cartelle pubblicate (senza, 404). `sw.js`: `/voce/*` escluso come
  `/orchestre/` e `/biglietteria/` (rete pura: niente versioni mescolate). `LICENSE`: eccezione GPL per `voce/`.
- `privacy/`: sezione 9 «Analisi vocale» (accesso Google obbligatorio, l'audio non lascia il computer, nessun evento
  d'uso in questa versione), «Modifiche» diventa 10, data 9/10; test in `engines.test.mjs` aggiornato. Titolare in
  privacy e termini: **Cassola (VI)**, non Milano (correzione di Simone).
- Login: il redirect è già coperto da `https://stageplot.it/**` in Supabase (nessuna modifica).
- Prove: `node build.mjs --check` ok, `node test/engines.test.mjs` 1383/1383; nel repository della voce 108/108 (anche
  coincidenza con Praat nativo e prova in Chrome). Dopo il merge: verificare `curl -sI https://stageplot.it/voce/vendor/praat-wasm/dist/praat.wasm`
  (content-type `application/wasm`) e il giro completo con accesso Google.

# 07/10/2026 (notte, 2) — Biglietteria: la pianta sul computer, niente lente (ramo `bgl-zoom-pc`, NON unito)

- Simone: sul computer la lente (`cursor:zoom-in`) prometteva uno zoom che il clic non faceva in modo prevedibile. Design
  approvato: col mouse (`MEDIA_MOUSE` = `(hover: hover) and (pointer: fine)`, stessa stringa in bgl.css; è la parte
  «strumento» di `MEDIA_COMPUTER` di segnala.js, un test lo controlla) il clic sceglie/toglie SEMPRE (`azioneClic`), mai zoom;
  manina sui posti che si scelgono, freccia sugli altri (il clic dà l'avviso), «afferra» sulla pianta ingrandita.
- Comandi «+», «−», «Vista intera» (36 px, `aria-disabled` ai limiti, il fuoco resta) in `.mappa-box`, FUORI dalla parte che
  scorre (restano in vista; si scostano dalla barra verticale con `--barra-v`). «+»/«−» attorno al centro visibile, doppio clic
  lì dove si clicca (`passoZoom` ×1,6; i due clic singoli scelgono e tolgono: il posto resta com'era), trascinamento oltre
  6 px (`eTrascinamento`; con cattura del puntatore + guardia `trascinato`: il rilascio non sceglie). Ingranditi ma ancora più
  stretti del riquadro: SVG al centro (`marginLeft`), solo col mouse. Rotellina senza Ctrl: invariata (scorre pianta e pagina).
- Telefono/tablet col dito: NIENTE cambiato (stessa prova passa identica su main). Gestione non toccata (`.gst-mappa` aveva già
  `cursor:default`). bgl.js v=10, bgl.css v=9.
- Prove: `test/bgl-zoom-pc.test.mjs` (8, 20 mutazioni rosse insieme a biglietteria/bgl-mie), `prova-zoom-pc.mjs` (110, Chromium e
  WebKit, computer e telefono; 7 mutazioni nel browser rosse; in `tutte.sh`). miei 131, segnala 187, pubblico 213, scheda 92,
  modulo 101. gara/google/viaggio non provati: Edge runtime locale spento (503 anche su main).

# 07/10/2026 (notte) — Biglietteria: «I tuoi posti» sulla pianta + «Entra con Google» dalla pianta (ramo `bgl-miei-posti`, NON unito)

- Segnalazione cf7adc04 di Simone: chi ha già prenotato vedeva i suoi posti con la croce degli altri. Stato nuovo `mio`
  («I tuoi posti»): pieno indaco con la spunta bianca, senza numero (l'unico con la spunta: si distingue da «scelto» e
  «occupato» anche senza colori). La spunta è FUORI dalla rotazione della sedia (con rot 180 diventava un «^»). Non si
  sceglie (role img, etichetta «…, tuo»); toccandolo: «Il posto A 3 è tuo.» + «Vedi o disdici» (ricordo) o «Per disdire:
  Le mie prenotazioni». Voce in legenda solo se ce n'è uno.
- Fonti (unione, solo posti ancora occupati): ricordo `bgl:<slug>` + con sessione Google `bgl_mie_prenotazioni` (0078),
  confrontando `evento.percorso` con lo spettacolo della pagina (`rifSpettacolo` / `stessoSpettacolo`). La chiamata parte
  DOPO la pianta (fine di `carica`, anche al giro dei 20 s) e la colora senza ridisegnarla (`aggiornaMiei`); nessun
  `bgl_pubblico_registra` per chi guarda soltanto. Dopo una prenotazione riuscita si rilegge.
- Aggiunta di Simone: riga sopra la pianta. Non collegato: «Hai già prenotato? Entra con Google per vedere i tuoi posti» +
  «Entra con Google» (si torna sulla pianta, scelta conservata: `sessionStorage bgl-google = "pianta:<slug>"`). Collegato:
  «Sei entrato come <email> · Esci». Il modulo non cambia. Database ed Edge Function NON toccati. bgl.js v=9, bgl.css v=8.
- Prove: `test/bgl-miei.test.mjs` (11, mutazioni rosse), `test/e2e-biglietteria/prova-miei.mjs` (131/131, 4 giri, aggiunta
  a `tutte.sh`). Noto e già su main: `prova-404` (scorciatoia con `/?x=1`) fallisce anche su origin/main.

# 07/10/2026 (sera) — Biglietteria: casella delle segnalazioni su tutte le pagine (ramo `bgl-segnala`, NON unito)

- `biglietteria/segnala.js` + `segnala.css` (v=1), caricati da scheda/organizzatore/disdetta (`index.html`), `gestione/`, `mie/`.
  Manda a `submit-feedback` (stesso server dell'editor, NON toccato; CORS `https://stageplot.it` = stessa origine delle pagine).
- Computer/telefono: UNA regola, `MEDIA_COMPUTER` = `(min-width: 700px) and (hover: hover) and (pointer: fine)`, uguale in JS e
  CSS (test). Computer: riquadro in basso a destra (sopra la barra «Avanti» se c'è). Altrimenti («via di mezzo» di Simone): niente
  di fisso, voce «Un problema? Scrivici» (area: «Cosa manca? Bug? Idea?») nel piè di pagina dopo «Privacy»; nell'area, che non ha
  piè di pagina, un `footer.piede.sg-piede` suo dopo il `<main>`. Un MutationObserver la rimette quando la pagina si ridisegna.
- Privacy: `meta.page_url` = origine + percorso + solo `o`, `s`, `e` ben formati (mai `c=`, `id=`, `p=`, `api=`); `tech_context`
  = origine, pagina, org, spettacolo, slug, vista/schermata. Token della sessione solo se in localStorage c'è una sessione.
- Prove: `test/bgl-segnala.test.mjs` (14, mutazioni rosse); `test/e2e-biglietteria/prova-segnala.mjs` (187, submit-feedback
  intercettata; aggiunta a `tutte.sh`).

# 07/10/2026 (pomeriggio) — Biglietteria IN PRODUZIONE e primo spettacolo aperto

- **Online** con #275: migrazioni 0074–0079, Edge `bgl-prenota`, `bgl-avvisa`, `bgl-account`, `retention-purge`. Redirect di
  Supabase Auth già coperto da `https://stageplot.it/**`. 0079 = `bgl_pubblico_registra()` (account del pubblico segnato al primo
  accesso Google, scelta di Simone). Contatto pubblico: niente ripiego sull'email dell'account (scelta di Simone).
- **Primo tentativo di `db push` fallito** sulla 0074 (funzione `sql` che citava colonne create più sotto): transazione annullata,
  nulla applicato. Corretta in `plpgsql`, riprovata da zero e sopra uno stato come la produzione. Vedi AGENTS §8.
- **Primo organizzatore**: «AVA Sound», `stageplot.it/biglietteria/ava-sound` (indirizzo bloccato). Spettacolo del 09/10 aperto,
  100 posti A–J. Organizzatori abilitati a mano: `ops/bgl-abilita.mjs` (oggi solo l'account di Simone).
- Aperti: palco tagliato nelle piante dell'area (estetico); tetto «4 per account» aggirabile senza Google (resta 8 per connessione).

# 07/10/2026 — Biglietteria: area dell'organizzatore, pagine pubbliche, accesso Google — PRONTA (ramo `bgl-area`, poi unito con #275)

Specifica e piano fuori dal repo: `COWORK/STAGEPLOT/BIGLIETTERIA/2026-10-06-biglietteria-area-design.md` e `…-plan.md` (T1–T23
fatti; il T24, messa online, lo fa la sessione principale DOPO l'ok di Simone). Unito `bgl-d-e2e` (T22: prove fine a fine in
`test/e2e-biglietteria/`, vedi il suo `LEGGIMI.md`).
- Pianta UNA: `src/pianta-posti.js` → editor (marcatore PIANTA_POSTI) e `biglietteria/pianta-posti.js` (GENERATO, `build.mjs --check`).
  `piantaDaDocumento` = foto dal JSON salvato; `piantaConfronta` = «La sala del progetto è cambiata». Collaudo: controllo nuovo.
- Database 0074–0078 (solo aggiunte): organizzatore e spettacolo dell'area (`bgl_spettacolo_salva`), lettura pubblica
  (`bgl_organizzatore_pubblico`, `bgl_spettacolo_pubblico` = `bgl_evento_pubblico`), spazio `bgl-locandine`, `bgl_sposta`,
  Google (`p_user_id`, tetto per account, `bgl_pubblico`, «Le mie prenotazioni», pulizia a 12 mesi).
- Edge: `bgl-prenota` (Authorization), `bgl-avvisa` (nuova), `bgl-account` (nuova), `retention-purge` (locandine orfane, account).
- Pagine: `/biglietteria/?o=&s=` (+ scorciatoie da `404.html`), `/biglietteria/gestione/`, `/biglietteria/mie/`. Editor: solo
  «Vai alla biglietteria»; il pannello e le sue funzioni sono andati in `biglietteria/gestione/gst.js`.
- Messa online: piano, task 24 (ORDINE: migrazioni → bgl-prenota → altre funzioni → indirizzi di ritorno → merge). Passi
  esatti per la sessione principale: `~/.claude/jobs/c49f7062/tmp/bgl-area/PER_ANDARE_ONLINE.md` (fuori dal repo).
- Prove: `test/e2e-biglietteria/tutte.sh` (suite, RLS, migrazioni che si ripassano, 15 prove nel browser, viaggio normale,
  invertito e scuro; NON fa `db reset`). Al 07/10: 31/31 passi con uscita 0; engines 1383, node 114, RLS 362, Deno 190,
  collaudo 30/30; browser pubblico 213, area 63, modulo 101, scheda 92, sala 65, sposta 57, editor 25, google 78, mie 59,
  ritorno 49, fuso 37, gara 25, viaggio 47 ×3. Mutazioni del piano (T23 step 2) tutte rosse.

Revisione T23 (07/10), corretti con test e mutazioni:
- ⚠️ IMPORTANTE, decisione da far confermare a Simone: il contatto pubblico dell'organizzatore NON ripiega più
  sull'email dell'account (0075). Prima non c'era modo di non pubblicare un'email, e la mostrava anche il vecchio `?e=`.
  Ora la «prima volta» precompila il campo con l'email dell'account (decisione 3), ma in pagina va solo ciò che è salvato:
  vuoto = nessuna email. Formato più stretto (niente spazi, né `<` `>` `"` `'` backtick `,` `;`), uguale in pagina e nel server.
- `bgl_modifica` con le regole della nota dell'area (200, niente `\r` da solo); `testoIcs` toglie anche il `\r` da solo.
- `bgl_account_solo_biglietteria` guarda `feedback` e tutte le colonne che puntano ad `auth.users` (test sul catalogo).
- Policy di delete delle locandine: un file citato (spettacolo o logo) non si cancella (`bgl_locandina_citata`).
- Locandine con `cacheControl` di un giorno (non un anno): tolte, spariscono dal CDN entro un giorno.
- Aperti (da decidere con Simone, non bloccano): palco tagliato nelle piante dell'area (la pianta scorre sui posti);
  chi entra con Google e non prenota non ha la riga in `bgl_pubblico` (la pulizia non lo vede); tetto «4 per account»
  aggirabile prenotando senza Google con un'altra email (resta il tetto di 8 per connessione); lo Storage locale serve
  senza `nosniff` (rischio basso, `<img>` su altro dominio; produzione da guardare); `bgl_apri` (0073, ancora concessa)
  accetta ancora note di 500 caratteri con `\r` (il `.ics` ora è protetto comunque).

# 06/10/2026 — Biglietteria, area: ondata E/F unita in `bgl-area` (T15–T20; NON su main, NON in produzione)

Uniti senza conflitti `bgl-c-gestione` (T15 scheda di gestione, T16 «La sala del progetto è cambiata», T17 Sposta),
`bgl-c-editor` (T18: dall'editor solo «Vai alla biglietteria», via il pannello e ~50 funzioni) e `bgl-c-google` (T19
«Continua con Google» nella scheda, T20 `/biglietteria/mie/`). Nessuna migrazione nuova: lo stack locale resta 0000–0078.
Revisione dell'integratore: diff letti contro piano e specifica, mutazioni rifatte (Node: «nessun avviso» in Elimina,
disdette sui posti, D8, RF2, bloccanti solo attivi, posti d'altri in Sposta, tetto dei posti, «elimina» solo per gli
account solo biglietteria, messaggio «accesso scaduto»; editor: ponte che ammette `bgl_apri`, apertura senza salvare):
tutte rosse. Prove nel browser sul ramo unito: scheda 92/92, sala 65/65, sposta 57/57, editor 25/25, google 78/78,
mie 59/59, pubblico 213/213, area 55/55, modulo 101/101, scorciatoie 8/8, ritorno 49/49.

- Corretto nell'integrazione: `A.progettoDati` teneva il progetto in memoria per sempre. Con l'area aperta e la sala
  cambiata nell'editor, tornando non compariva l'avviso e «Aggiorna la pianta» pubblicava la sala VECCHIA. Ora si
  rilegge a ogni schermata e al ritorno sulla pagina (`visibilitychange` → punto `di-nuovo-visibile`). «Sposta» dalla
  vista sala riporta alla sala (`&da=sala`). Prova: `area-prove/prova-ritorno.mjs`.
- `area-prove/prova-pubblico.mjs` aggiornata al T19: dopo «Avanti» si sceglie «Prenota con nome ed email».
- ⚠️ Aperto (scelta lato server): chi entra con Google dalla scheda e NON prenota non ha la riga in `bgl_pubblico`:
  la pulizia dei 12 mesi non lo vede e «Elimina il mio account» gli dice di scrivere a info@.
- ⚠️ Per il T22: Google vero, ritorni ammessi `https://stageplot.it/biglietteria/**` in Supabase Auth e mail vere NON
  provati (solo produzione, T24). Dopo un «annulla» su Google, `/accedi/google/ritorno.js` mostra «Accesso non
  riuscito»: si torna alla scheda solo con «Torna senza accedere».

# 06/10/2026 — Biglietteria, area: ondata C/D unita in `bgl-area` (T6–T9, T11, T13, T14; NON su main, NON in produzione)

Uniti senza conflitti `bgl-b-server` (T6–T9), `bgl-b-pagine` (T11), `bgl-b-area` (T13, T14). Revisione
dell'integratore: diff letti contro piano e specifica, mutazioni rifatte (SQL sullo stack locale: proprietario in
`bgl_sposta` e in `bgl_avviso_spostamento`, bozze in `bgl_prenota`, tetto per account, organizzatore escluso da «solo
biglietteria»; TS: email/account con Google, 401 senza ripiego anonimo, 409 `account_in_uso`; JS: `.ics` in UTC e
virgole scappate, «senza rete» ≠ «uscito», chiavi della pianta salvata): tutte rosse. Prove nel browser sul ramo
unito: pubblico 213/213, area 55/55, modulo 101/101, scorciatoie 8/8.

- Server: 0077 (`bgl_sposta`, `bgl_avviso_spostamento`, Edge Function `bgl-avvisa`), 0078 (`bgl_prenota` a 8
  argomenti con `p_user_id`, `bgl_pubblico`, `bgl_mie_prenotazioni`, `bgl_disdici_mia`, `bgl_account_stato`,
  `bgl_account_prepara_eliminazione`, `bgl_account_da_pulire`), `bgl-prenota` con `Authorization`, Edge Function
  `bgl-account`, `retention-purge` con la pulizia degli account. Applicate allo stack locale (0000–0078).
- Pagine: `?o=` (pagina dell'organizzatore) e `?o=&s=` (scheda con locandina, descrizione, calendario); `?e=` invariato.
- Area: `/biglietteria/gestione/` con accesso, «non abilitato», prima volta (decisioni 1 e 3 di Simone), «I miei
  spettacoli», «Nuovo spettacolo»/«Modifica». Dopo il salvataggio si va a `?v=scheda`, che arriva col T15: fino ad
  allora la pagina ripiega sull'elenco.
- ⚠️ Messa online (T24): PRIMA la migrazione 0078, POI le funzioni `bgl-prenota`, `bgl-avvisa`, `bgl-account`,
  `retention-purge`. La firma di `bgl_prenota` cambia (drop della vecchia a 7 argomenti nella stessa transazione).
- ⚠️ Per il T19: `Authorization` a `bgl-prenota` SOLO con una sessione vera e con la chiave anon LEGACY (quella di
  `SUPABASE_ANON_KEY`), altrimenti 401; un 401 `accesso_scaduto` si rinnova e si riprova, mai in anonimo. Chi entra con
  Google dalla scheda ma non prenota NON ha la riga in `bgl_pubblico`: la pulizia dei 12 mesi non lo vede (vedi sotto).
- ⚠️ Per il T17: `bgl-avvisa` risponde 403/404/409 (`gia_disdetta`, `dati_cancellati`, `non_spostata` = oltre un'ora
  dallo «Sposta»)/429 (`troppi_avvisi`). Per il T20: `bgl-account` dà 409 `account_in_uso` anche per Orchestre,
  richieste e consulenze → «scrivi a info@stageplot.it».
- Banco di prova: `googleFinto` di `comune.mjs` usa un 302 che WebKit rifiuta: per WebKit una pagina 200 con
  `location.replace` (come in `prova-area-ingresso.mjs`).

# 06/10/2026 — Biglietteria, area dell'organizzatore: ondata A/B unita in `bgl-area` (NON su main, NON in produzione)

Ramo di integrazione `bgl-area` (worktree `.claude/worktrees/bgl-area`). Specifica e piano FUORI dal repo:
`COWORK/STAGEPLOT/BIGLIETTERIA/2026-10-06-biglietteria-area-design.md` e `…-area-plan.md` (24 task). Uniti T1, T2
(`bgl-a-pianta`), T3, T4, T5 (`bgl-a-db`), T10, T12, T21 (`bgl-a-base`), senza conflitti. Prossima ondata: T6–T9
(server), T11 (pagine pubbliche), T13–T14 (area).

- Pianta: UNA fonte, `src/pianta-posti.js`. `node build.mjs` la mette nell'editor (marcatore `/*__PIANTA_POSTI__*/`)
  e la copia in `biglietteria/pianta-posti.js` (generato: non si modifica; `--check` lo controlla). Confronto
  foto/progetto: `piantaConfronta` + `piantaRiassunto`.
- Database: 0074 (organizzatore, campi nuovi dello spettacolo, `bgl_spettacolo_salva`, `bgl_progetti_sala`), 0075
  (letture pubbliche `bgl_organizzatore_pubblico`, `bgl_spettacolo_pubblico`; le bozze non escono da nessuna porta
  pubblica), 0076 (spazio `bgl-locandine`, policy, `bgl_locandine_orfane` per `retention-purge`). Applicate allo stack
  locale; in produzione NO.
- Decisioni di Simone del 06/10: (1) l'indirizzo della pagina si blocca dal primo spettacolo pubblicato e resta
  bloccato (`indirizzo_bloccato_il`, trigger su `bgl_eventi`); (2) eliminando uno spettacolo non parte nessuna mail
  (scritto nell'informativa); (3) contatto pubblico predefinito = email dell'account, nella «prima volta» il campo è
  precompilato e modificabile (da fare nel T13).
- ⚠️ Per il T13: alla prima volta `bgl_organizzatore_salva` collega gli spettacoli nati nell'editor (pubblicati), e il
  trigger blocca SUBITO l'indirizzo: la schermata deve dirlo prima del salvataggio. Il contatto lasciato vuoto NON
  nasconde l'email: la lettura pubblica usa quella dell'account (regola della specifica); l'interfaccia deve dirlo.
- ⚠️ Per il T7: `bgl_prenota` (SQL) non controlla `pubblicato`; oggi le bozze le ferma solo `bgl_globale_hit`
  nell'Edge Function, che però lascia passare se quella chiamata fallisce. Nella riscrittura della 0078 aggiungere
  il controllo, con test.
- Informativa (§8) già aggiornata ma descrive anche T9/T20 («Elimina il mio account», «Le mie prenotazioni»): non va
  online prima di loro; alla messa online riscrivere la data (intestazione, §8 e i due test).
- Banco di prova nel browser fuori dal repo: `COWORK/STAGEPLOT/BIGLIETTERIA/area-prove/` (`prepara.sh`, `comune.mjs`).

# 06/10/2026 — Biglietteria gratuita (ramo `biglietteria`, NON unito, NON in produzione)

Prenotazione gratuita dei posti numerati per un concerto (prima uscita venerdì 09/10, 100 posti A–H). Specifica e piano
fuori dal repo (`docs/` è ignorata): `docs/superpowers/specs/2026-10-06-biglietteria-design.md`, `…/plans/2026-10-06-biglietteria.md`.
Tre pezzi uniti qui: `bgl-backend` (migrazione **0072**, Edge Function **`bgl-prenota`**, moduli `_shared/bgl-*.ts`),
`bgl-pagina` (**`biglietteria/`** pubblica, noindex, fuori sitemap; sezione 8 `#biglietteria` della privacy; `sw.js` la
lascia alla rete), `bgl-editor` («Prenotazioni del pubblico…» nelle card dei posti: apri, pannello, PDF/CSV; ponte
`window.__bglCloud` dentro l'IIFE Supabase, solo le sei RPC dell'organizzatore).

- Dati: tabelle `bgl_*` chiuse (RLS senza policy, grant tolti), tutto da funzioni `security definer`. Posto unico =
  chiave primaria `bgl_posti(evento_id, posto)`; tetto 4 posti per email con advisory lock; 20 richieste/ora per
  impronta IP (`FEEDBACK_IP_SALT`), 600/ora in tutto. Il pubblico legge solo libero/occupato (`bgl_evento_pubblico`).
  Purga: `stageplot_purge_expired()` estesa (nomi/email null 30 giorni dopo l'evento, impronte IP dopo 7).
- Integrazione: nella 0072 ogni funzione a cui si toglie l'execute lo ridà alla `service_role` (l'invariante di
  `engines.test.mjs` era rossa dopo il merge: i rami separati non la vedevano); `pages.yml` pubblica `biglietteria`,
  fa `deno check` di `bgl-prenota` e `node --test test/biglietteria.test.mjs`.
- Mail: mittente `Biglietteria StagePlot <feedback@stageplot.it>`, reply-to `info@`. Non parte MAI con `SUPABASE_URL`
  locale o senza `RESEND_API_KEY`. `email.ts`, `cors.ts`, `feedback-limits.ts` NON toccati: si ridistribuisce solo `bgl-prenota`.
- Prova fine a fine in locale (54/54, tutto vero tranne l'invio della mail): script e istruzioni fuori dal repo,
  nella cartella di lavoro della sessione (`COME_SI_PROVA.md`). Per puntare l'editor allo stack locale si serve una
  COPIA del sito con URL e chiave sostituiti (mai nel repo); la pagina pubblica accetta `?api=&anon=` solo su localhost.
- Revisione del 06/10 (commit «reperti della revisione»): limite globale contato solo dopo quello per IP e solo per
  un evento aperto (`bgl_globale_hit`); tetto 8 posti per connessione (`ip_hash` sulla prenotazione, tolto il giorno
  dopo l'evento) e «Stessa connessione N» nel pannello; email normalizzata per i tetti (+etichette, punti Gmail);
  nome/cognome solo lettere, spazi, apostrofi, trattini; mail senza nome, con la nota, max 3/giorno allo stesso
  indirizzo e niente mail nel giro prenota-disdici; token scelto dalla pagina per tentativo (richiesta ripetuta =
  stessa prenotazione); `bgl_prenota` legge l'evento FOR SHARE; pagina con cronologia (Indietro), sessionStorage,
  avvisi sui posti non sceglibili, testi per il mouse, email intera e «Forse intendevi…»; PDF a 12 pt.
  `bgl_prenota` ha due parametri in più (p_ip_hash, p_token): migrazione e funzione vanno su INSIEME.
- Per la produzione (la fa Simone): `supabase migration list` (ultima 0071) → `supabase db push` (0072) →
  `supabase functions deploy bgl-prenota --project-ref vsodplqkuvnsdiikvmjb --use-api` → merge su `main` → prova con un
  evento finto (una sedia, la propria email, disdire, eliminare) → aprire l'evento vero dall'editor e mandare il link.

# STATO AL 01/10/2026 — da leggere prima di tutto

**PR #262 aperta, da unire** (ramo `rider-pronto`): livello «Rider pronto» a 59 € in /consulenza/ e una riga verso la
consulenza nella finestra PDF dopo un export riuscito. Test: 1297 editor · 124 Orchestre · 138 Deno · collaudo 30/30.
Dopo il merge: **ridistribuire** `create-consultation`, `stripe-webhook`, `process-consultation-notifications`
(`supabase functions deploy <nome> --project-ref vsodplqkuvnsdiikvmjb --use-api`), poi `curl https://stageplot.it/app.js | grep consulenzaDopoExport`.
La card da 59 € resta **nascosta finché `PAY["rider-pronto"]` in `consulenza/index.html` è vuoto**: serve un Payment Link Stripe da 59 €.

## 01/10 — «Rider pronto» (PR #262)

- **Perché**: la consulenza (29/149 €) ha zero richieste da luglio. Fuori dal repo, in `STAGEPLOT/campioni/`, c'è un motore che
  da un rider in PDF ricava stage plot, channel list e — da oggi — il rider in prosa (`lib/prosa.mjs`), collaudato su 13 rider
  pubblici di band italiane (`campioni/COLLAUDO.md`, `node test.mjs` 36 ok). Un livello a 59 € con consegna in 48 ore è il
  prodotto che quel motore rende possibile: umano solo al controllo (10–15 min) e all'export del PDF (2 min, solo nel browser).
- **App**: `consulenzaDopoExport(foreign)` (pura; `foreign` esplicito perché nel sandbox `foreignDoc()` è sempre vero) e
  `pdfConsulenzaMostra()` accanto a `foreignDoc`; `#pdfConsulenza` nella `.pdf-exp-foot`, mostrato solo nel ramo `then` di
  `exportPdf`. Mai su documento altrui.
- **Server**: `rider-pronto` in `PRODUCTS`, `PRODUCT_PRICE_EUR_CENTS` (5900) e `PRODUCT_LABEL`; test Deno con importo giusto e sbagliato.
- ⚠️ `patchList()` ricava i microfoni dagli **oggetti**, non dalla channel list: in un sandbox senza oggetti coerenti dà un rider che
  contraddice l'input list. Il motore campioni conta dagli `inputs`.
- ⚠️ Il test «bottone torna vivo» legge una finestra di caratteri dopo `function run(){`: allargata a 800 perché la riga del `then` è cresciuta.

# STATO AL 30/09/2026 — da leggere prima di tutto

Tutto in produzione, nessuna PR aperta. Test: 1292 editor · 124 Orchestre · 137 Deno.
Regole di lavoro aggiornate in `AGENTS.md` (§3, §4, §8). Le sessioni fra fine luglio e settembre non
sono state scritte qui: la loro storia sta nei messaggi di commit e nelle PR (#98-#210).

## Settembre in una pagina (PR su `main`)

- **06/10 — Posti numerati del pubblico** (ramo `numerazione-posti`, NON unito; richiesta di Simone per un concerto
  del 09/10). Sedie `sediapubblico` selezionate (≥2) → card «Posti del pubblico» → «Numera i posti…»
  (finestra con Settore, file a lettere senza I/O o a numeri, posti consecutivi da sinistra o dispari/pari dal
  corridoio centrale); dalla sedia singola «Numera tutti i posti…». Campi `fila`/`posto`/`settore` sull'elemento
  (sanificati in `normalizeLoadedItems` e `sanitizeItems` da `postoSanifica`). La fila A è quella verso cui
  GUARDANO le sedie (`postiVerso`, media delle rotazioni; se guardano da parti diverse ≥80° non si numera),
  sinistra/destra = di chi siede. Disegno: `postoMarkup` dentro `itemMarkup` (numero dritto nella sedia, lettera ai
  capi, legenda «Platea · 100 posti · file A–H» e «+ N sedie senza numero»), memo in `postiDisegno()`; corpi
  divisi per `__sceneTextK` perché `scaleSvgFonts` li rimoltiplica. Duplica/Incolla: la copia perde il numero se
  quel posto c'è già (`postiCopie`). CSV «Settore;Fila;Posto» con `rowsToCsv(…, true)`. NON toccati
  `countAccessori`, `seatLight`, il draw della sedia (rami `poltrona`/`chitarra-sgabello`): i due punti in comune
  sono `itemMarkup` (una riga prima delle maniglie) e `guideDialog` (opzione nuova `o.corpo`).
- **05/10 — SEO: CTR delle due guide** (ramo `seo-ctr-guide`): GSC 27/09–03/10 dice che `/guida/rider-tecnico/` (110 impr, 2 clic, pos 7,2) e `/guida/cos-e-uno-stage-plot/` (104 impr, 0 clic, pos 8,0) si vedono ma non si cliccano. Nuovi title/description/og/twitter/headline con la promessa concreta (esempio, modello, come farlo gratis) e i sinonimi cercati «tech rider» e «stage plan»; `dateModified`, byline e `lastmod` al 05/10. ⚠️ Il title del rider deve tenere «cos'è»: il test «non cannibalizza il rider tecnico» separa definizione (rider) e procedura (scheda-tecnica-band). Misurare i clic delle due pagine verso fine ottobre.
- **05/10 — Giri degli utenti** (#263): `SEARCH_ALIAS_GIRI` (tabella a parte: una chiave ripetuta in
  SEARCH_ALIAS cancellava gli alias esistenti), confidence rinominato «Gobbo / confidence monitor», `sediapubblico`
  aggiunta al gruppo «Arredo e leggii» (non era in nessun gruppo), elementi del luogo = `ostacolo` con over
  {label,w,d} come voci solo-ricerca. Fonte: `STAGEPLOT/analisi/workaround/2026-10-05.md` (locale). Da fare:
  postazione cajon (oggi 3 pezzi nel modello Acustico), aree con nome, platea a blocchi. 1296 test editor.

- **05/10 — Collegamenti orfani** (ramo `orfani-collegamenti`, da una segnalazione su un progetto vero). Le mappe dei
  collegamenti sono indicizzate per id di elemento — `elec.manual` e `elec.uplinks`, `cab.manual` (chiavi `id#n`,
  `grp:id`, `mix:I:id`, `ret:mix:id`), `mond.manual` — e cancellare un elemento non le toccava: `uid()` riparte dal
  massimo, quindi il primo elemento nato con un id già usato ereditava la voce del defunto (wedge «Carico senza distro»,
  fulmine che risponde «già collegato» a un distro fantasma, multipresa trattata da carico). Nuova `dropOrphanLinks(s)`,
  sorella di `dropOrphanRows`: chiave che non è più un elemento → via la voce (tombstone `deleted` compreso); chiave
  valida ma bersaglio (distro/box/hub) sparito → cadono solo i campi del legame (distro/to/box, porta, waypoint, seg,
  auto, linea), restano le scelte sul carico/canale (connettore, microfono, nome, asta, phantom); `uplinks` con
  bersaglio sparito → via. Chiamata in `normalizeState` (ogni scena, anche l'Annulla) e in `save()`. Test:
  `Collegamenti orfani…` in `engines.test.mjs` (11, 18 mutazioni tutte rosse) + controllo nuovo nel collaudo.
  **Collaudo: 4 attesi su 30 cambiano di proposito (01, 19, 20, 21: stessa famiglia di progetto, 121 voci cavo e 99 voci
  corrente su elementi o box che non ci sono più)**: stessi canali, cambia l'ordine di patch e spariscono 74 «Sorgente senza
  destinazione (ingressi palco esauriti)» e 2 «Carico senza distro» falsi (le box non c'erano affatto: ora è «79 ingressi
  da collegare»). Gli attesi condivisi NON sono stati riscritti (li usano anche gli altri rami): al merge,
  `node test/collaudo.test.mjs --aggiorna` e controllare che cambino solo quei 4 file. Il 05 ha orfani ma nessun effetto.
  `uid()` NON è stato cambiato: un contatore che non torna mai indietro andrebbe salvato nel documento (campo nuovo in ogni
  scena, nel diff della cronologia, nei file condivisi) e il riuso dopo Annulla è voluto — l'Annulla di «aggiungi» deve
  restituire lo stesso id. Con la pulizia in apertura e al salvataggio un id riusato non trova più niente. Resta scoperto,
  stessa famiglia: `distOf`/`grp` degli elementi su una pedana cancellata (una pedana nuova con quell'id adotta i vecchi
  figli, e «Distribuisci» ne toglie le copie: `applyDistribute`). ⚠️ Visto di passaggio e NON toccato: il ricostruttore di `elec.manual` in `normalizeState`
  tiene solo `distro/pts/deleted/auto`, quindi `line` (numero di linea fissato), `conn` (connettore) e `seg` (cavo
  segmentato) si perdono a ogni riapertura e a ogni Annulla; la sanificazione di `line/conn` poche righe sopra è codice
  morto. Stessa cosa per `via` in `cab.manual`.

- **30/09 — Punto della situazione** (sola lettura, poi ordine): 13 worktree già uniti tolti; restano
  `consulenza-migliorie` e `slogan-in-scala` (bozze mai versionate di altre sessioni) e `orchestre-lotto-1` (l'unico
  `supabase/functions/.env`). Nuova regola: un worktree per lotto da `origin/main`, tolto dopo il merge.
  supabase-js: **2.110.0 nel browser** (`vendor/`), 2.108.2 nelle Edge Function — il «fissato ovunque» del 28/09 vale per
  il server. Backup: 7 avvii di Docker falliti a settembre, in aumento (misura in `_STATO.md`, fuori dal repo).

- **29/09 sera — correzioni dalla revisione** (mie, non degli agenti):
  #250 Annulla di «Adatta» in scena nuova toglie la scena, Ripeti la rimette (`adattaAnnullaScena`, `adattaRifaiScena`,
  `switchVariant(id, senzaSync)`, `ripetiDisponibile()` — il bottone restava spento, visto nel browser);
  #254 i nomi che si toccano cedono a schermo anche al computer (scelta di Simone), mai in PDF/PNG;
  #256 link condiviso: il cartiglio non propone mai l'account di chi guarda (`documentoAltrui`) e il titolo è quello
  della colonna (`titoloDelLink`); #257 unisce la #242 (landing: `sp_founder`, `pan-y`) e classifica `sp_founder`
  nella tabella dell'uscita pulita. ⚠️ Nel sandbox dei test il finto DOM restituisce funzioni: un controllo
  tipo `classList.contains(...)` è sempre «vero» → confrontare con `===true`. ⚠️ Dopo un export PDF il primo
  Annulla disfa l'export (`production` nello stato), non «Adatta»: aperto.

- **29/09 — Avvertenza «palco adattato»** (ramo `adatta-avvertenza`, Simone: «l'avvertenza è un'opzione e decide
  l'utente che crea lo stageplot se inserirla»). Nella finestra finale di Adatta, SOLO se «Ci stanno, ma stretti»
  (`R.ciSta && R.stretta>0`), un interruttore SPENTO «Aggiungi un'avvertenza nello stage plot, per chi lo riceve»
  (`adattaPalcoFinestra` → `guideDialog` con le opzioni nuove `scelta` / `chiusa(spuntata)`, chiamata con il congedo:
  «Tengo così», Esc, clic fuori; «Usa un palco…» la ignora). L'avvertenza è un «Testo libero» rosso con
  `avvertenza:"adatta"`: «Attenzione: palco adattato da 12 × 13 m a 10 × 10 m. I musicisti sono più vicini del
  normale (fino al 20% dell'ingombro): verificare gli spazi con la produzione.» (conferenza: «Le postazioni…»).
  Da console: `adattaAvvertenza(1200, 1300, 1000, 1000, 60)` (cm; stretta 0,6 o 60); una nuova sostituisce la
  vecchia. Posto (`adattaAvvertenzaPosto`): sotto «PUBBLICO» (D+32…D+79), poi metà sinistra/destra della fascia
  (al centro c'è il punto «stage rack» a D+72), poi un angolo libero del palco; mai sopra un elemento (ingombro +
  nome), sempre dentro l'area di stampa, misurato con i corpi del PDF a 1:100 (K 1,25: `adattaAvvertenzaImpagina`
  va a capo a larghezza/K). Scelta subito dopo Adatta, entra nel SUO passo (`adattaPasso`, `adattaNelPasso`): un
  Annulla toglie tutto, in scena nuova toglie la scena; da console o dopo altro lavoro è un passo suo. Non conta
  come «fuori dal palco» (`elementiFuoriDalPalco`, `palcoCheContieneTutto`) né come cartello luci. Il PNG si fa
  l'area col palco esatto (`ensurePrintFrame`): ora `frameConAvvertenza` ci mette dentro l'avvertenza.
  ⚠️ Oltre 1:100 (palchi > ~14 m di profondità su A4) i corpi crescono di più e la fascia sotto PUBBLICO non basta.
  ⚠️ Già prima: esportare il PDF scrive `production` nello stato con un passo di Annulla, quindi dopo un export il
  primo Annulla disfa quello e non Adatta.

- **29/09 — Nomi a filo del disegno, via lo slider «Distanza»** (ramo `etichette-vicine`, segnalazione 114cfd80:
  «il parametro distanza è parecchio inutile perché le etichette dovrebbero sempre essere molto vicine»). La
  distanza contava dal FOOTPRINT: a 0 la voce aveva il nome 10 cm dentro il leggio, a 22 (default) i violini a
  27 cm; 11 progetti su 30 del collaudo avevano `lblDist` a mano, 874 elementi a 0. Ora `itemMarkup` misura il
  disegno appena composto (`misuraArte`: getBBox su un SVG nascosto, cache per markup, `<use>` delle illustrazioni
  espansi) e `lblBaseY` mette il nome a `lblStacco` = max(3 cm, ⅓ di lettera); sopra lo schienale idem. Scavalca
  la DI dello strumento solo se gli sta davanti (`lblArteConDi`); doppie scostate dell'inclinazione; al telefono
  (vista girata) funzione di supporto del riquadro; il corpo minimo a schermo cresce attorno al bordo del disegno
  (`lblScalaAttorno(lb, _lblOrig)`), prima attorno alla baseline → al telefono 63 nomi su 73 finivano sul disegno.
  Migrazione: `lblDist` si butta in `normalizeLoadedItems` e `sanitizeItems` non la copia. Nel sandbox niente
  SVG → `arteStimata` (footprint + sgabello + asta + schienale 43,5). Non provato: Safari/Firefox (getBBox su SVG
  nascosto); con l'elemento selezionato la maniglia di rotazione sfiora il nome sopra lo schienale.
  **v2, telefono**: col corpo minimo (2,3× sul palco intero) i nomi a filo si accavallavano (collaudo 25, nomi
  accesi: 87 coppie). `nomiCedono` (da `aggiornaNomiZoom`: render, rotella, pizzico), SOLO se `isMobile()`:
  un nome che tocca un nome già mostrato — o, con `--lblK`>1, il disegno di un altro elemento (`_arteDi`) — prende
  `.lbl-cede` (visibility:hidden); selezionato sempre visibile e per primo. Quadrilateri veri (getBBox +
  getScreenCTM, girati) e separazione degli assi (`quadSiToccano`, `nomiDaNascondere` pura). Collaudo 25 al
  telefono: insieme 7 nomi visibili e 0 sovrapposti; 2× 50; 4× 81 su 92. ⚠️ Anche trovato: la cache di
  `misuraArte` non prendeva mai le postazioni illustrate (contatore `L772_` di libIcon nel markup): render
  204 ms → 83 (main 79). ⚠️ Desktop NON toccato, ma sul collaudo 25 i nomi vicini fanno 20 coppie sovrapposte
  contro 5 di main (a 2×: 13 contro 2): la stessa passata sul computer è un cambio di una riga (`attivo`).

- **29/09 — «Solo pedane» automatico, chi sta sopra si vede sopra** (ramo `solo-pedane-auto`, richiesta di Simone:
  «vorrei vedere in trasparenza anche quelli sopra la pedana mentre adesso sono sotto … che l'opzione si attivasse
  in automatico nel momento in cui seleziono una pedana»). La vista vale solo con una selezione di SOLE pedane
  (`soloPedaneDisponibile` = tutte pedane: una selezione mista la spegne in `pruneSolo` e nasconde l'occhio).
  Si accende da sola in `soloPedaneAuto()` (chiamata in testa a `render()`) quando la MANO ha scelto: la bandierina
  `soloPedGesto` la alzano solo clic/tocco sul disegno, shift+clic, clic ripetuto (`cicloSotto`), riquadro e nome
  dell'elenco del telefono (un test conta 5 punti). Duplica, Incolla, catalogo, Annulla, tastiera: niente. Mai in
  `viewmode`, `consult-viewer`, `__projLocked`, né sopra una vista dei layer aperta a mano. `soloPedFirma` = ids
  della selezione già decisa: spento l'occhio (o «Mostra tutto il palco») resta spento per quella selezione; una
  selezione non di sole pedane la azzera, riprendendo la pedana si riaccende. Disegno (`sceneMarkup`, solo l'ordine
  dei gruppi del solo): per le pedane il contesto resta nell'ordine di `sortedItems`, a sequenze in gruppi
  `solo-bg solo-prende` (.15) → chi sta sopra la pedana è sopra, sfumato; i layer come prima (tutto sotto). Il
  contesto delle pedane SI PRENDE (`.solo-bg:not(.solo-prende)` in CSS, niente `auto` che scavalcherebbe il
  lucchetto del Palco): un clic lo seleziona e spegne la vista; sulla pedana già presa vince lei (regola del 16/09)
  e il clic fermo passa a chi sta sopra (`itemPickable(it,{esce:true})`). Il riquadro prende solo le pedane.
  `soloMostra`: nella vista pedane l'occhio chiuso dei Musicisti li nasconde anche nel contesto. Export invariati.

- **29/09 — Distanza tra i 2 su più postazioni** (ramo `postazioni-distanza`, segnalazione di Simone c0bd4c7b:
  «se seleziono molteplici postazioni a 2 devo poter regolare la distanza… in simultanea»). Postazione a 2 = ha
  `sepCfg`: tipo di `POSTAZ` con `doppia` (archi, fiati, sax) o tipo ×2 di `DOUBLE_TYPES`; la proprietà è `it.sep`
  (cm fra i due), `it.w` segue con `sepToW`. Nel pannello di gruppo `#grpSepWrap` (`#grpSep` 65–300 passo 5,
  `#grpSepVal`, `#grpSepHint`): `sepStato` / `sepApplica` / `grpSepRender` / `grpSepScritta` / `grpSepApply`.
  Distanze diverse → «diversi» e cursore sbiadito (`.misto`); ognuna rispetta il suo minimo (contrabbasso 100).
  Trascinando si ridisegna senza salvare (`grpSepTrascina`), al rilascio un `save()` = un solo Annulla. Gli altri
  elementi della selezione non si toccano. Sul telefono il cursore è alto 44 px. ⚠️ Non è lo slider «Distanza»
  delle etichette (ramo `etichette-vicine`).

- **29/09 — Pedane sganciate** (ramo `pedane-sganciate`, richiesta di Simone: «se sposto la pedana, gli elementi
  devono rimanere dove sono … opzione snap elementi con pedane … di default spenta»). Di partenza trascinare
  (mouse, dito), Duplica e Copia muovono/copiano SOLO la pedana. Sotto «Solo pedane» (pannello elemento `#pAgg`,
  pannello selezione `#grpAgg`; sul telefono nel foglio aperto) l'interruttore «Aggancia gli elementi alla
  pedana» scrive `aggancia:true` SULLA PEDANA (salvato nel progetto, Annulla sì): solo allora vale il
  comportamento di prima (`caricoDellePedane`, `pedanaAgganciata`; Duplica/Copia con carico e blocco). Tolto
  «Sposta solo la pedana» (`pedanaSola`, globale mai salvato: nessuna migrazione, i progetti vecchi si aprono
  sganciati). ⚠️ Le pedane duplicate prima di oggi restano in un blocco `grp` coi loro elementi: si muovono
  insieme perché gruppo, finché lo si divide. «Adatta a un altro palco» non toccato.

- **29/09 — Uscita pulita** (#246, richiesta di Simone: «immagina che io faccia il login sul computer di un'altra
  persona»). `signOut()`: `preparaUscita` (salva online o chiede «Resta / Esci comunque») → `sb.auth.signOut()`
  (senza rete `scope:"local"`) → `pulisciDatiAccount` (tabella chiavi nel blocco «USCITA PULITA») → invito
  `#accessoInvito`. Al boot, progetto dell'account senza sessione → invito «Sessione scaduta» (il progetto resta
  nel browser). ⚠️ Senza rete no: `sessioneNonRaggiungibile` (AGENTS.md §8). Altre schede: segnale `sp_uscita`.
  Non provati: login/logout Google veri; le modifiche non salvate di un'altra scheda si perdono.

- **29/09 — Adatta a un altro palco** (#244, richiesta di Simone: «mantenere organico e posizioni con palco di
  dimensioni diverse… questo organico su un palco 10x10»). «Forma del palco» → «Adatta a un altro palco…»
  (`showAdattaPalco` → `adattaPalcoCalcola` / `adattaPalcoApplica`, un solo Annulla, nuova scena di partenza).
  Vincoli d'ordine sulla forma vera (`adattaAngoli`, `adattaMinkowski`), prima i corridoi, file rigide, pedane
  che seguono chi ci sta sopra; tolleranza a gradini (10 cm d'aria → contatto → sovrapposizioni 10/20/30%) e
  proposta della misura che basterebbe. Esempio di Simone su 10×10: ci sta, stretto fino al 20%.

- **29/09 — «Solo pedane»** (#245, segnalazione di Simone). Con una pedana nella selezione il
  pannello (`#pSoloPed`, `#grpSoloPed`; sul telefono `#mPeekSolo`, quinta azione della testa) ha l'occhio «Solo
  pedane»: è la voce `pedane` di `layerSoloUI` (`layerFgItem` → `isRiser`), non un meccanismo nuovo. Contesto al 15%
  (`_bgOp`; i layer restano a .42), non si prende; si spegne in `pruneSolo` quando la selezione non ha più pedane,
  con Esc e col clic sul vuoto. `stageSceneSvg`/`buildExportSvg` girano dentro `senzaSoloPedane`: il PDF/PNG non
  lo vede (col solo acceso il PDF perdeva i cavi, `layerShown` segue il solo). Non salvato, niente undo.

- **29/09 — Revisione a 8 aspetti, azioni 1-4** (#238). 48V: `cabSetMic` azzera `m.p48` al cambio microfono;
  regola audit `p48no`/`p48si` sulle righe forzate a mano (`auditFixP48Auto`). Monitor: `_personali` (hearback/IEM)
  nella regola `nomon`. PDF: `pdfCredit` scrive «pag N/M»; 8 `trow` ripetono l'intestazione (`_testaTab`);
  `pdfTitoloLuogo` va a capo; `pdfNomiPt`/`pdfConsiglioA3` → «Passa ad A3» nell'Esporta. Export: `#pdfPonte`
  «Manda anche il link al service», la finestra non si chiude più da sola; QR/email senza accesso (`MAILTO_MAX`);
  `adattaCondividi` mostra «Condividi» se la barra ha posto. ⚠️ «Annulla» rosso = scelta di Simone. Azioni 5-8
  e tabella completa: `COWORK/STAGEPLOT/analisi/revisione-2026-09-28.md`.

- **28/09 — Verifica di sicurezza** (#233, #234): track-landing con `clientIp()` e tetto globale; supabase-js
  fissato a 2.108.2 ovunque (test); `orchestre/test` e `orchestre/demo` fuori dal deploy; permessi di pubblicazione
  solo al job deploy; migrazione 0070: dal ruolo `authenticated` non si scrivono `user_id`/`profile_id` di
  `orc_musicians` (test `rls-collegamenti`, mutazione provata in CI). `main` ora vieta force-push e cancellazione.
  ⚠️ Nei commenti niente titoli di progetti degli utenti (li avevo messi il 25/09). Restano: tetti per account,
  jsPDF 3.x, cronologia di luglio (vedi `_STATO.md`).
  Poi #236 (0071): tetti per account su progetti ed eventi. ⚠️ Un trigger che CONTA righe di una tabella che
  l'utente non può leggere (analytics_events) deve essere SECURITY DEFINER e leggere il ruolo dal JWT: con i
  permessi dell'utente conta 0 e il tetto non scatta. ⚠️ `rest()` dei test accetta `prefer: "return=minimal"`.

- **27/09 — Collaudo sui progetti veri** (#231): `test/collaudo.test.mjs` + `test/sandbox.mjs`. Apre 30 progetti
  reali anonimizzati (cartella privata `collaudo/` accanto al repo, NON versionata) e confronta per scena canali,
  monitor, RF, avvisi (per regola, non per testo), totali con metri di cavo, più il giro salva-riapri. In CI
  «SALTATO»: va lanciato in locale prima di ogni merge (AGENTS.md §4). ⚠️ Nel sandbox `importProject` si
  blocca: usare `loadDoc` + `switchVariant`. Idea dal playbook Anthropic «AI-Native SDLC» (20-50 casi reali).

- **27/09 — Home e SEO** (#228, in produzione): title della home «Stage plot online gratis, in scala: scheda tecnica e
  rider» (dal 22/08 aveva perso «stage plot» e «scheda tecnica»); H1/H2/FAQ/llms.txt con le parole che si cercano,
  presidiati da test. Prossime leve: PDF d'esempio scaricabile sulla guida rider-tecnico, presenza fuori dal sito.

- **27/09 — Login contati giusti** (#229): `login_success` solo al ritorno da un accesso (`oauthReturn`), non a ogni
  ricarica (erano 88 su 113 aperture in 30 giorni). Il rapporto del lunedì (fuori repo) ha la sezione «0. Il percorso».

- **26/09 sera — Anteprima completata e revisione a tappeto** (#220-#227, in produzione, 1218 editor). «Richiedi
  musicisti» nascosto ovunque (`#bRichiedi,#mactRichiedi{display:none!important}`, `RICHIEDI_MUSICISTI=false`).
  Anteprima progetti: azioni della riga clonate nella finestra (Blocca ed Elimina restano, `__dopo` = successivo),
  misura fissa, Duplica apre la copia (salvando prima il progetto aperto). Revisione dei cambi 25-26/09, 13 punti
  corretti in #227: `aggiornaNomiZoom` (rotella/pizzico), nomi sopra anche in PDF/PNG (`fgLbls`/`bgLbls` in
  stageSceneSvg), scala dei nomi per gruppo attorno all'ancora (`lblScalaAttorno`, `.lblk`; tolto
  `lblRotazioniAlCentro`), nota PDF senza recordHistory e non ereditata (`senzaNotaPdf`), copia da link per account.
  Presidio (fuori repo): notifica rotta in zsh (`PROBLEMI[0]`) corretta, copia locale portata avanti in fast-forward.

- **26/09 — Anteprima dei progetti** (#219, in produzione, 1210 editor). In «I tuoi progetti» miniatura su ogni
  riga (`thumbnail` già salvata a ogni salvataggio) caricata dopo la lista, a gruppi di 6, solo a finestra aperta,
  cache per `updated_at` (`miniature`, `caricaMiniature`, `applicaMiniature`); formato controllato da
  `miniaturaValida` (solo data URL JPEG/PNG/WebP). Clic → `#cloudPrev` con varianti/elementi letti al volo,
  ‹ ›, Esc che chiude solo l'anteprima. Copie senza immagine: «anteprima al primo salvataggio». Finestra 520 px,
  `.cloudRiga` a due livelli sotto 560 px. Mockup scelti in `docs/mockup/anteprima/` (locale).

- **26/09 — Riquadro del passaggio del mouse stretto come quello della selezione**: `aderisciRiquadro(node)` (una misura sola) chiamata da `aderisciSelezione` e da un `mouseover` sul palco, una volta per nodo (`data-fit`).

- **26/09 — Maniglia di rotazione costante allo zoom** (segnalazione di Simone): i tratti della maniglia e del lucchetto avevano `stroke-width` in CSS in cm di palco (vince sull'attributo `hSize`); ora `vector-effect:non-scaling-stroke`.

- **26/09 — Due segnalazioni di Simone.** Divisione degli strumenti: i pezzi tengono il nome (canali) ma con `labelMode:"hidden"` (compositi; nella chitarra solo ampli e pedaliera). Selezione: `aderisciSelezione()` dopo ogni render e dopo zoom/pizzico misura il disegno (`getBBox` senza `.hit`) e ci stringe il `.selbox` a 4 px di schermo; `vector-effect:non-scaling-stroke`; la maniglia di rotazione sta sul bordo misurato (`_selFit`). ⚠️ Nel DOM finto dei test `nextElementSibling` e `firstChild` non finiscono mai: scorrere per indice con tetto, e non chiamare `setSvgInner` a vuoto da `render`.

- **25/09 — Revisione a 8 aspetti, tutte le 7 azioni** (#215, in produzione, 1205 editor + 124 Orchestre).
  Nomi: livello `#layLbl` sopra gli elementi (`_lblSink`, `syncItemLbl`), corpo minimo a schermo `--lblK`,
  soglia nomi 30 px/m, `nomeGiaSullaSpia`; a schermo le rotazioni dei nomi sono `rotate(a)` al centro
  (`lblRotazioniAlCentro`, solo con `_lblSchermo`: l'export tiene `rotate(a cx cy)`), se no nella vista girata
  del telefono i nomi finivano lontani. PDF: `dataDocumento()`, `pdfTextK` costante da 1:80, avviso
  «Channel list non inclusa — Aggiungi» (`pdfAvvisoIngressi`, sopra «Altre opzioni»), `state.pdfEsportato`
  {at, firma} con impronta sullo stato normalizzato a chiavi ordinate (`firmaPdf`). Una sola channel list
  fuori dalla consulenza (`autoInputs` da `patchList`). `CAMPI_DOCUMENTO` (titolo, luogo, data, contatti,
  tipoEvento, pdfHeader) propagati a tutte le varianti in `syncActiveVariant`. Autosave cloud:
  `hasMeaningfulDocument(true)` ignora le sole misure del palco. Ricerca: `qaPrimo`/`qaCede` anche per voce
  di catalogo, voci Channel list / Monitor list / Nuova variante (`apriListaDaRicerca`), Invio = primo
  risultato. Copia da link: `sessionStorage copiaDi:<token>`, «Apri la copia». Nomi liste: «Channel list»,
  «Monitor list» ovunque. «Annulla»/«Chiudi» rossi restano (scelta di Simone, c'è il test).

- **25/09 — Batteria componibile dal pannello** (segnalazione di un utente): tolto `COMP.batteria.reduced`, tom/piatti/doppia cassa/mancino in Accessori anche in Base; `drumChansFor(it)`: «Completa» = un mic per pezzo (kit di partenza 2 tom + floor → **9 canali**, prima 8 fissi); `MIKING[t].chans(m, it)` riceve l'elemento; «⇱ Dividi in pezzi singoli».

- **25/09 — Dai progetti scelti come esempio** (branch `esempi-utenti`, 4 commit, 1180 test). Simone ha scelto 12
  progetti dalla galleria; analisi in `../analisi/esempi-2026-09-24.md` (fuori dal repo). `dropOrphanRows()`: le righe
  di input/monitor con `linked_item_id` verso un elemento che non c'è più si tolgono all'apertura (`normalizeState`),
  a ogni `save()` e in `deleteSel` prima del render. Audit `coromuto`: coristi in panoramica fuori da zone e senza
  microfono d'insieme entro 4,5 m, fix `auditFixChoirMics` (un mic coro ogni 8 voci). Ricerca: voci-comando «Esporta»
  e «Frequenze radio (RF)» (`openRfFreq`), alias del direttore. Da decidere:
  campo «musicista». **Orchestra pop di nuovo in vetrina** (decisione di Simone), ripulita: scala a rot 0, pedane
  senza nome, tastiera e chitarra spostate, ottoni 25 cm indietro; test «nessun modello con etichetta capovolta».
- **24/09 — Timpanista ridotto del 10%** (`drawTimpani`, `scale(0.9)` su `timpanistaPersona`): era più grosso di batterista e percussionista.

- **#209-#210 (24/09) — Conferenze.** `state.tipoEvento` («Conferenza o convegno» da Data e ora):
  PDF «Scheda tecnica evento», niente «Richiedi musicisti», niente avviso monitor dei musicisti, testi
  di partenza da conferenza. Tipi `relatore` (lavalier) e `moderatore` (seduto, palmare) in `VOCE`;
  micMode `lavalier` (TL47); `mictavolo` (MX412) e `confidence`. Modello «Conferenza» (`buildConferenzaOut`).
  Lista RF: `rfChi` («Chi lo usa»), `rfRiserva`, lavalier delle voci inclusi (restano un canale),
  ricevitori/antenne fuori dal conteggio «senza frequenza». Avviso `voce-senza-mic`.
  Fuori per scelta: run of show, checklist, client view, vista signal flow.
- **#208 (18/09) — Schermi e browser.** Barra dell'editor a gradini (1680/1600/1480/1300/1210 px), tema
  nel menu «?» sotto 1300; rosso degli errori di Orchestre leggibile in scuro; benvenuto in orizzontale;
  tabella della privacy che scorre; il gestore delle finestre non sposta il fuoco già messo; link delle guide ≥ 24 px.
- **#207 (18/09) — Modelli.** Da otto a cinque, rifatti: Acustico, Band, Jazz, Coro (`coroCompleto`),
  Orchestra (`buildOrchestraOrdinata`). Fuori vetrina Tributo, Big band, Orchestra pop.
- **#206 (17/09) — Accesso Google da stageplot.it.** `/accedi/google/` (id_token + nonce/state →
  `signInWithIdToken`), login di prima come riserva. Client OAuth con origini `https://stageplot.it` e
  `http://localhost:8931` (le prove locali del login solo su quella porta).
- **#205 (17/09) — Resilienza.** «Nuovo» su un progetto che non si apre ne scarica prima l'originale;
  timeout 15 s verso Resend e `tentaInvio`; orc-notify indipendente dal worker delle consulenze; pagine
  di Orchestre con `avvia(main)` (errore + «Riprova»).
- **#195-#204 (16/09).** PDF: dati tecnici solo con Esporta avanzato, cartiglio staccato dal bordo;
  Musicisti nascosti davvero; sgabelli per tipo; Solo Palco = pedane; pedane coperte (clic ripetuto,
  «Sposta solo la pedana»); anteprime dei modelli; testo libero più grande; Alt+trascina in un annulla;
  limiti delle segnalazioni; griglia all'avvio.
- **#186-#194 (14-15/09).** Funzioni avanzate da File (`f-conn`, `f-liste`, `f-opzioni`, `f-esporta`,
  `f-controllo`) al posto di Base/Pro; varianti come schede; audit esterno 15/09; link a Orchestre dalla home.
- **#176-#185 (13-14/09).** Telefono ridisegnato: barra a una riga, menu a elenco, «Elementi», catalogo,
  palco girato col pizzico, primo avvio in una schermata.

---

# SESSIONE 27/07 — Catena d'uscita · Richieste setup ai musicisti (R1)

**1. Catena d'uscita** (`496b4cc`) — microfonazione, pedaliera e uscita bilanciata erano tre controlli scollegati: ora sono una **catena disegnata e cliccabile** nel pannello di chitarre, basso e acustica (variante C, scelta sui mockup in `docs/mockup/uscita.html`). Regole reali: strumento sempre jack sbilanciato; pedaliera jack o XLR (se jack la DI va DOPO di lei); dall'ampli si prende mic, DI out o entrambi. Modello: anelli (`pedaliera`/`ampli`) + prelievi (`tapLine`/`ampMic`/`ampDi`/`strMic`, `pedXlr`); un prelievo = un canale; la DI non si sceglie, e' una conseguenza. `chainMigrate` porta i progetti vecchi nella catena senza perdite.

**2. Richieste setup ai musicisti — R1** (`c92003e`, CI `c264738`) — **in produzione**: migrazione 0034 applicata (`sp_requests`/`sp_request_versions`/`sp_request_events`), Edge Function `setup-request` deployata, pagina `/richiesta/` pubblicata. Il tecnico crea la richiesta dalla postazione, manda il link; il musicista risponde senza account; la risposta torna nel progetto come **proposta** (gia' presente / da aggiungere / da verificare) che il tecnico applica voce per voce. Riapertura = nuova versione, la precedente resta. Spec: `docs/richieste/SPEC_R1.md`.

**Verificato in produzione** con richiesta di prova poi cancellata: link vero a 414px, bozza e ripresa dopo reload, invio, doppio clic → una sola versione, sola lettura dopo l'invio, riapertura → v2 con v1 intatta, revoca → link chiuso, chiave anon → 0 righe, PATCH su versione inviata → bloccato dal trigger. Test: 398 motori + 10 deno.

**Aperto**: percorso «tecnico loggato crea la richiesta dall'app» provato con service role, non con la JWT dell'utente — da confermare al primo uso vero. Fuori da R1 per scelta: foto, chiarimenti, badge sul palco, notifiche, questionari di basso/tastiere/percussioni/batteria/generico.

**Gotcha**: `pages.yml` pubblica per allowlist (una cartella nuova non va online finche' non la aggiungi) e il `deno check` elenca le function una per una.

---

# SESSIONE 26/07 — Cablaggio: DI, crash, finestre-guida · anteprime illustrate

Due segnalazioni di Simone, quattro difetti trovati. **Tutto LIVE su `main`** (`0a15a1c` + `7481b26`), working tree pulito, in sync con origin, **379 test verdi**, `node build.mjs --check` allineato.

**1. «Chitarra classica con DI: il cablaggio automatico occupa 2 ingressi invece di 1»** — `cabItemInputs` contava i canali della DI generata (`diFor`) **in aggiunta** a quelli dello strumento. La DI è una **tappa del cavo**, non una sorgente: ora restituisce 0 canali se ha uno strumento associato. Una DI presa dal catalogo (senza `diFor`) resta sorgente col suo canale.
- **Estensione del bug** (verificata tipo per tipo): tutti i 10 che nascono con la DI — `musBasso`, `gtacustica`, `keysamp`, `musChitAcustica`, `pedaliera`, `bassstand`, + `organohammond`/`stagepiano`/`djset`/`laptop` (2→4 canali) — e ogni strumento messo a mano su microfonazione «DI».
- Si propagava a: ingressi occupati in stage box, lista canali, CSV/PDF input list, aste dedotte.
- Nota architetturale: `isAudioSource` escludeva già le DI generate, ma il raccoglitore `sources` del motore usa `cabItemInputs`, non `isAudioSource`.

**2. Toast rosso «Si è verificato un problema imprevisto»** — `showToast` era **chiamata in 12 punti e mai definita** (cablaggio automatico, creazione zone mic, veti PM, export PNG): `ReferenceError` → handler globale R1. Ora definita, inoltra a `window.__toast`. **Scan statico su tutto `app.js`: era l'unico caso** (`openPdfExportModal`, `preloadRespData`, `fileSaveVersion` sono `window.X`, globali valide). Lo scan è riproducibile: strip di commenti/stringhe, raccolta dei chiamati vs definiti (function/var/param/catch/arrow).

**3. Crash cablando senza stage box** — le drop box **proposte** dal motore (`auto:true`) nascevano senza `taken/pins/res/resMap` → `takePort` moriva su `b.taken[want]`. Ora hanno la stessa forma delle box reali. Si vedeva solo in modalità auto (cioè sempre da `cabConnectAll`, che forza `mode="auto"`).

**4. Finestre-guida quando manca un elemento** (richiesta esplicita di Simone: «se il sistema ha bisogno di qualcosa, pop up che portano l'utente a farlo»). Nuovo pattern riusabile:
- `guideDialog({title,msg,steps,action})` — overlay + card, ESC/click-fuori chiudono, focus sull'azione. Stili in `src/styles.css` (`.guide-ov/.guide-card/.guide-title/.guide-msg/.guide-steps/.guide-actions`), bottoni `.btn`/`.btn.primary` del design system.
- `autoConnectNeeds(layerId)` — precondizioni per i 4 layer cablabili: **Ingressi/Uscite** → «Manca la stage box» *(aggiunge stage box 16/8 e ricabla)* o «Non c'è ancora niente da collegare»; **Power** → «Manca la presa di corrente» *(aggiunge ciabatta)* o «Non c'è niente da alimentare»; **P.M.** → «Manca l'hub» *(aggiunge hub)* o «Non ci sono personal monitor».
- Prima, senza stage box, il bottone rispondeva **«Tutto già collegato»**: falso e muto.

**5. «Chitarre e bassi nella ricerca non hanno l'illustrazione della persona»** (`7481b26`) — `miniSvg` (catalogo **e** quick-add) disegnava sempre `t.draw()`, lo schema dall'alto, mentre sul palco quei tipi nascono illustrati. Ora usa `look2Art` → `libIcon` con footprint da `look2Dims`. Riguardava tutti e 8 i `LOOK_ART`: chit. elettrica/acustica, basso, gran coda, mezzacoda, stage piano, arpa, percussioni. Accessori (ampli/pedaliera/leggio) fuori dalla miniatura — il sottotitolo della voce li elenca già. Poiché `icons.js` arriva **dopo** la costruzione del catalogo, i bottoni portano `data-mini-k`/`data-mini-over` e **`refreshCatalogArt()`** rigenera le anteprime da `__onIconsReady`; senza illustrazioni si resta sullo schema (mai riquadro vuoto).

**Verifica live** (localhost:8091, non loggato): 1 ingresso · 1 riga in lista canali · porta 1 in uso sulla box · cavo che passa dalla DI · finestra-guida e bottone «Aggiungi una stage box» funzionanti · nessun errore in console · miniature col musicista in catalogo e quick-add.

**Test aggiunti** (`test/engines.test.mjs`, 370→379): DI non raddoppia (singolo + i 4 tipi che nascono con la DI), DI da catalogo resta sorgente, drop box proposte ben formate, `showToast`/`guideDialog` esistono, guida stage box + azione che la crea, guida su tutti e 4 i layer a palco vuoto, anteprime illustrate per tutti i `LOOK_ART` + fallback schema.
- *Gotcha test*: nel sandbox node `LIB_ICONS` è lo stub universale → per testare l'anteprima illustrata si spia la delega sostituendo `A.libIcon`, non popolando `LIB_ICONS`.

**Gotcha operativo ribadito**: su localhost il SW serve `app.js` stantio — le funzioni nuove risultano `undefined` finché non si fa unregister SW + `caches.delete()` + reload con `?v=` nuovo. È successo due volte in questa sessione.

**Nota prove**: usato il tab locale col progetto **DOPO-IMPORT** (solo dispositivo, non cloud) svuotandone la scena; i 2 punti di ripristino locali (22/07) hanno entrambi 0 elementi → era già vuoto.

**Sessioni 25-26/07 precedenti (non documentate qui, solo nei commit `74e76de`…`ff0f77b`)**: quick-add variante B (ricerca + anteprima per riga), ricerca con vocabolario da fonico e sigle rider, pedane come parte del palco, aste «quante e quali servono davvero», DI come oggetto sul palco e tappa del cavo, stage box con geometria reale, fix pannello destro che sfondava.

# Next step
1. Nessuna azione utente in sospeso.
2. Il pattern `guideDialog` è pronto per altre precondizioni (audit, export, planimetria) se emergono casi analoghi.

---

# SESSIONE 24/07 — Backup DB automatizzato (LaunchAgent)

Backup automatico del DB Supabase, **verificato funzionante nel contesto launchd** (accesso Keychain OK).
- **Script:** `COWORK/STAGEPLOT/ops/stageplot-db-backup.sh` (fuori dal repo). Fa `supabase db dump` schema+data+roles → `COWORK/STAGEPLOT/backups/AAAAMMGG-HHMM/`, rotazione ultimi 14. Auth via **token nel Keychain** (nessuna password DB). `supabase db dump` usa **Docker** (pg_dump in container): lo script **avvia Docker se spento e lo richiude solo se l'ha avviato lui** (e se non ci sono container attivi).
- **Schedulazione:** LaunchAgent `~/Library/LaunchAgents/it.stageplot.dbbackup.plist`, **giornaliero 14:00** (Mac verosimilmente acceso/Docker su → niente avvio Docker). Log: `ops/backup.log` + `ops/launchd.{out,err}.log`.
- **Gestione:** ricaricare `launchctl bootstrap gui/$(id -u) <plist>`; forzare ora `launchctl kickstart gui/$(id -u)/it.stageplot.dbbackup`; disattivare `launchctl bootout gui/$(id -u)/it.stageplot.dbbackup`.
- **Gotcha:** `head -n -N` (conteggio negativo) NON esiste su macOS/BSD → rotazione con conteggio esplicito. Il dump `--data-only` avvisa su trigger/constraint al restore (normale: restore = schema.sql poi data.sql, vedi drill).
- Backup manuale one-shot resta in `_backup_prod_20260724-1206/`.

---

# SESSIONE 24/07 — Backlog audit: TUTTI i finding M residui ("facciamoli tutti")

Tutto LIVE (`a755174`). Migration 0032+0033 **applicate in produzione** (`db push` fatto: 0032/0033 remote OK). **pg_cron risultava ATTIVO** → il job retention `stageplot-purge-expired` è schedulato (03:17 UTC giornaliero). Nessuna azione in sospeso. Nota operativa: `supabase migration list`/`db push` in questa sessione hanno connesso al DB remoto **senza chiedere la password** (credenziali disponibili in sessione).

**Codice concreto (fatto, testato, gran parte live):**
- **M-14** (`0032`, validata 6/6 su pg effimero) — il lock del progetto ora congela TUTTO il contenuto (`data`/`title`/`venue_image`/`thumbnail`), non solo data/title: la planimetria di un progetto "read-only" non è più modificabile via Data API. Metadati amministrativi (`share_token`/`is_locked`) restano mutabili → revoca share e sblocco possibili anche da bloccato. **Attende `db push`.**
- **M-13** — (a) retention (`0033`): funzione `stageplot_purge_expired()` (analytics >30gg coerente con l'informativa, feedback_throttle >7gg) + schedulazione pg_cron **best-effort in blocco guardato** (se pg_cron off, la migration NON fallisce). **Attende `db push`.** (b) **redazione feedback LIVE**: `submit-feedback` strippa i contatti di terzi dallo `project_snapshot` prima di archiviarlo (`redactSnapshotForFeedback` in `_shared/project-sharing.ts`, +3 test deno = 56 verdi). Funzione **deployata** (`--use-api`). (c) export/delete account self-service = **piano documentato** (troppo sensibile per farlo di fretta).
- **M-17** — **misura-prima fatta** (numeri reali in browser): `render()` = collo confermato, **30 / 404 / 959 ms** a 100/500/1000 elementi; `serialize`/`save` <1ms sempre. Budget + direzione (render incrementale, accoppiato a M-15) in `docs/perf/BENCHMARK.md`.
- **M-15 quick-win** (LIVE `a755174`): `cabRoutePts` da `return pts` (codice A* morto) a **flag esplicito** `CAB_AVOID_OBSTACLES=false`; + **test di caratterizzazione** (275° test): i motori puri (audio/elec/mond/audit/net) NON chiamano `save()`/`render()` — pinna l'invariante la cui violazione ha causato l'incidente cloud.

**Piani/decisioni (XL — onestamente NON riscritti, come raccomanda il report):**
- **M-15 monolite** — `docs/architecture/REFACTOR_PLAN.md` (numeri reali: 105 catch vuoti, motori già isolati, il debito è il commit-point unico; 3 quick-win, 2 fatti).
- **M-16 modello dati collaborazione** — `docs/architecture/DATA_MODEL_EVOLUTION.md`: **deliberatamente differito** in attesa di validazione prodotto (no CRDT prematuro); modello-obiettivo registrato.
- **M-19 osservabilità/DR** — `docs/ops/`: RUNBOOK (5 scenari), RPO_RTO, BACKUP_RESTORE_DRILL.
- **M-13 governance** — `docs/privacy/`: DATA_MAP, RETENTION, DATA_RIGHTS.

**docs/ è gitignored** (repo pubblico → runbook/data-map con dettagli infra/PII restano interni, NON pubblicati). I 9 file vivono in `docs/` sul disco.

**Backlog audit dopo questa sessione:** restano solo H-10 conformità WCAG piena AT-testata (baseline già live) e le PARTI XL di M-13/M-15/M-16/M-19 che richiedono scelte prodotto/legali/infra (export-delete account, refactor monolite incrementale, modello collaborazione, staging/error-tracking). **Tutti i finding con un fix di codice azionabile sono chiusi.**

**PROSSIMA AZIONE UTENTE:** nessuna. 0032+0033 applicate, retention schedulata via pg_cron. Backlog residuo = solo parti XL (prodotto/legale/infra) e H-10 WCAG full.

---

# SESSIONE 24/07 — Backlog audit: Track D (finding Low)

Tutto LIVE (`c954b3b`), verificato in browser + produzione, 274 test verdi.

- **L-01** — nome file PNG canonico. `exportPng` usava il legacy `state.nome` (non slugificato); ora usa `fileName()` (= `state.titolo` slugificato, **come i PDF**). `state.nome` non è più usato da nessuna parte. Verificato: titolo "Concerto Estivo 2026!" → `concerto-estivo-2026.png`.
- **L-02** — service worker: cache sotto prefisso `stageplot-`; la pulizia in `activate` tocca **solo le proprie** cache (non cancella più *tutte* le cache dell'origine — evita conflitti con altre app/tool sullo stesso dominio). Bump `v1→v2` come lever manuale. La freschezza a ogni visita è già garantita dallo stale-while-revalidate, quindi niente versioning per-commit (evita re-precache a ogni deploy).
- **L-03** — build ID immutabile del commit, separato dalla versione prodotto (data). Placeholder `__BUILD_SHA_PLACEHOLDER__` **timbrato dal workflow di deploy** con `${GITHUB_SHA:0:7}` (solo `_site/`, non nel repo). Esposto in `window.__BUILD_ID__`, nei due payload analytics (`build_id`) e in un `console.info` di avvio. **Verificato in produzione**: `stageplot.it` serve `window.__BUILD_ID__="c954b3b"`. Due release nello stesso giorno ora distinguibili in telemetria/supporto.

**Gotcha L-03 (per il futuro):** la sentinella del VALORE (`__BUILD_SHA_PLACEHOLDER__`) è volutamente distinta dall'identificatore `window.__BUILD_ID__`, così il `sed` della CI non tocca il nome della variabile. In dev/localhost il placeholder resta (il `console.info` mostra "build dev"). `--check` resta verde perché build.mjs non tocca il placeholder (match placeholder↔placeholder) e `stripVer` normalizza `__APP_VERSION__`.

**Backlog audit rimasto (nessuna urgenza):** M-13 (GDPR/lifecycle), M-15/16/17 (architettura/perf — M-15 = macchina a stati gesture, prereq di un H-10 completo), M-19 (osservabilità/DR), H-10 conformità WCAG piena AT-testata. **Tutti i finding Critical/High/Medium/Low azionabili dell'audit sono stati chiusi o valutati** tranne questi (per lo più L/XL o dipendenti da scelte di hosting/prodotto).

---

# SESSIONE 24/07 — Backlog audit: Track C (accessibilità + mobile)

Tutto LIVE (`87cd700`), verificato in browser (localhost non loggato), 274 test verdi.

- **H-10** — canvas accessibile da tastiera/screen reader (baseline). `#svg` ora `role="application"` + `tabindex="0"` + `aria-label` con le scorciatoie. **Tab/Shift+Tab** scorrono gli elementi in ordine di documento con annunci `aria-live` (`#a11yLive`, es. "Selezionato Barriera antipanico, posizione 605, 400. 1 di 3"); oltre l'ultimo si **esce dal canvas** (`preventDefault:false` → niente focus-trap). Annunci anche su sposta (frecce)/ruota (r/R)/duplica (d)/elimina. Costruito **sopra** il modello tastiera già ricco (frecce muovono, r/d/Canc, Esc). NB onesto: conformità WCAG 2.2 piena, testata con AT reali + "albero/lista sincronizzata" completo = lavoro maggiore ancora aperto; questa è una baseline usabile.
- **M-22** — modali: da sola semantica a **contratto dialogo completo**. Focus-trap (Tab ciclico nella modale in cima, wrap verificato), **restore del focus al trigger** alla chiusura, sfondo **`inert`** mentre aperta (MutationObserver su visibilità; regione annunci esclusa dall'inert). Verificato il ciclo welcome→apri/chiudi (inert applicato 24 elem, poi rimosso `[]`). + **touch target** su coarse-pointer a 44px per i controlli icona layer (`.layer-ico`, erano ~20px) + `.adv-btn`/`.feed-seg`; colonne `.layer-icons` allargate.
- **M-21** — `pointercancel` (touch interrotto) ora **chiude la transazione di drag in modo atomico**: COMMIT (`save`) per le modalità che scrivono lo stato live (item/rotate/grouprot/venue/frame/segmenti audio-elec-mond/alimentazione), **rollback visivo** per port/reconnect (niente save, `render` ripristina); `drag` sempre azzerato. Verificati entrambi i rami in browser.

**Gotcha M-22 (per il futuro):** il manager rende `inert` tutti i figli di `<body>` tranne le modali e le regioni `aria-live`, guidato da un MutationObserver su `hidden/style/class`. `isVisible` NON usa `offsetParent` (nullo sui `position:fixed`): usa `getBoundingClientRect`. Il welcome è `.modal` → viene gestito come modale (corretto).

**Restano nel backlog audit (futuro):** Track D (L-01/02/03), M-13 (GDPR/lifecycle), M-15/16/17 (architettura/perf — M-15 = macchina a stati gesture, dipendenza di un H-10 completo), M-19 (osservabilità/DR), + H-10 conformità WCAG piena AT-testata.

---

# SESSIONE 23/07 (notte) — Backlog audit: Track A (onestà tecnica) + Track B (sicurezza)

Dopo il rollout backend, attaccato il backlog di `STAGEPLOT_AUDIT_REPORT.md`.

**Track A — onestà tecnica (LIVE, `eb99b6d`):**
- **M-04** — gate export: se `auditEngine()` riporta `errs>0`, `exportPdf` chiede conferma prima di generare (annulla di default). Testato live con `auditEngine` moccato (annulla→no build, override→build).
- **M-05** — commenti routing: chiarito che `cabRoutePts` fa **percorso ortogonale diretto** (l'aggiramento ostacoli A* è disattivato di proposito con `return pts` anticipato), non "aggira le pedane".
- **M-06** — disclaimer nei PDF: box "STIMA PRELIMINARE" nel report elettrico (assunzioni fisse: 230 V, cosφ=1, nessun derating/spunto/caduta) e nota "stime su percorso ortogonale, verificare in loco" nel report cavi.

**Track B — sicurezza/hardening (LIVE, `46f9d44`, CI verde):**
- **M-08** — `<meta name="referrer" content="strict-origin-when-cross-origin">` (protegge i token dei link condivisi da leak via Referer). CSP meta già solida; `unsafe-inline` (5 script + 2 handler inline) e header HTTP (HSTS/nosniff) restano **limiti noti di GitHub Pages** — non risolvibili senza refactor nonce o cambio hosting.
- **M-20** — GitHub Actions in `pages.yml` **pinnate a commit SHA** (checkout/setup-node/setup-deno/upload-pages-artifact/deploy-pages); worker workflow usa solo `curl`, niente da pinnare. SBOM `vendor/README` già completo (3 lib, versioni+fonti+SHA-256).
- **M-11** — CVE-2025-29907 (jsPDF 2.5.1 ReDoS): **verificata già neutralizzata in-app** → il `_dataUrl` venue nasce sempre da `canvas.toDataURL` + `safeVenueDataUrl` è un'allowlist regex **ReDoS-safe** applicata in serializzazione e al render. A jsPDF arrivano solo data-URL base64 ben formati: l'input malefico non è costruibile. Documentato in `vendor/README`; bump 3.x = igiene rimandabile (bundle custom, no golden test PDF), non urgente.

**Restano nel backlog (futuro):** Track C (H-10 accessibilità XL, M-22/M-21 mobile), Track D (L-01/02/03), M-13 (GDPR/lifecycle), M-15/16/17 (architettura/perf), M-19 (osservabilità/DR).

---

# SESSIONE 23/07 (sera) — Review del lavoro di Codex + ROLLOUT COMPLETO backend

**Contesto:** Codex (modello OpenAI) ha fatto in autonomia una remediation di sicurezza/persistenza/pagamenti (lasciata locale, non committata) + un audit indipendente in `STAGEPLOT_AUDIT_REPORT.md` (38 finding: 2 Critical, 11 High, 22 Medium, 3 Low, contro `f1b1a2f`). Regola dell'utente: **valutiamo NOI tutto, teniamo il buono**.

**Cosa ho fatto (tutto valutato, testato, e ora LIVE):**
1. **Preservato** il lavoro di Codex sul branch `codex-hardening` (`0badb6a`), poi **rivisto** io + sub-agenti.
2. **Fix del solo 🔴 client** trovato: `normalizeLoadedItems` bloccava l'intero documento su un id dup/non-safe → ora li **riassegna** (niente lockout, id sporco scartato dal DOM). Commit `02b9281`.
3. **Merge CLIENT su main** (`b5b9e13`, deploy live) — validato: 273 unit test, Tier 1 browser reale (multi-tab/reload/Nuovo+recovery/load-riparato/import), Tier 2 **Supabase reale su progetto usa-e-getta** (CAS stantia → nessuna sovrascrittura). **C-01 verificato**: i campi tecnici (hw/sbId/rackId/ascolto/modelId…) sopravvivono al load. Chiude C-01/C-02/H-02/H-03/H-06/H-09.
4. **ROLLOUT BACKEND** (`b2cb706`, live): catena migration **validata su DB effimero locale** (replay 0000-0031 pulito, finding H-08); **backup prod** (schema+dati in `_backup_prod/`); **riconciliato** il tracciamento (era in drift: 0014-0018 applicate ma non registrate → `migration repair --status applied 0000 0014-0018`); **applicate 0019-0031** in prod; **deployate 6 edge function** (`--project-ref … --use-api`); secret `CONSULTATION_WORKER_SECRET` impostato (Supabase + GitHub, valore in scratchpad); **CI nuova verde** (test frontend+backend+type-check+lint = gate M-18); **worker verificato** (secret sbagliato→401, giusto→200 outbox pulito). Chiude H-01/H-07/H-08/H-11 + RLS/analytics/pagamenti.

**Stato: main `b2cb706`, in sync origin, 32/32 migration tracciate in prod, working tree pulito.**

**RESTA (utente, dashboard):** Stripe **Payment Link → uso singolo** (residuo 🔴 doppio-incasso su link riusabile; il fix "definitivo" = Checkout Session server-side, backlog H-07). Cosmetico: cancellare progetto `TEST-CAS`, togliere l'URL tunnel dai Redirect Supabase.

**BACKLOG APERTO (Codex NON l'ha toccato — futuro):** H-10 accessibilità canvas, M-05 routing A* disattivato, M-06 precisione calcoli elettrici, M-08 header CSP/HTTP, M-11 jsPDF ReDoS, M-15/16/17 architettura/performance, M-19 osservabilità/DR, M-20 SBOM, M-21/22 mobile. Vedi `STAGEPLOT_AUDIT_REPORT.md` §33 (20 azioni prioritarie).

**Gotcha operativi appresi:** verifiche UI SOLO su localhost non loggato (regola `feedback-stageplot-prove-account`); operazioni DB remote (dump/push/repair) richiedono la **password DB** (l'utente la digita via `!`), il deploy funzioni e i secret usano solo il **token**; migration/funzioni del branch vanno copiate/eseguite dalla dir **linkata** (main) o con `--project-ref`.

---

# Goal
Sessione 21/07 (seguito): microfoni voci a scala reale, cablaggio input per-musicista, 2 stili cavo + diretto preciso, stage box del mixer (lato-FOH), ascolto per performer, e **rifinitura UI dei pannelli/liste al livello dei mockup**. Ultima fase: audit visivo Input/Output/Power + lista canali.

# ✅ INCIDENTE CHIUSO — progetto cloud ripristinato (23/07)
Il 21/07, facendo verifiche live sul **tab loggato** (127.0.0.1:8077) col progetto cloud **"sernaglia 26 okok"** aperto, il progetto era stato sovrascritto con una scena usa-e-getta (4 elementi throwaway).
- **Causa:** `elecConnectAll()`/`cabConnectAll()` (e l'auto-connect di `addItem`) chiamano `save()` INTERNAMENTE → l'autosave ha persistito la scena finta sul cloud. Il "clona-state + render senza save()" NON basta: il save parte dentro le funzioni-motore. Stesso errore del 10/07 (memoria `feedback-stageplot-prove-account`, aggiornata).
- **Risoluzione (23/07):** Simone ha ripristinato dall'app "Versione 21/7 22:29" (102 elementi, orchestra Sernaglia reale) dal pannello **"Punti di ripristino"** + salvataggio. Progetto cloud tornato integro.
- **Lezione operativa:** vedi REGOLA RIBADITA in "Bugs and risks".

# Current state (codice)
- App live su **stageplot.it** (GitHub Pages da `main`). Working tree **pulito**, `main` in sync con `origin/main`.
- Suite **243/243 verde** (`node test/engines.test.mjs`); `node build.mjs --check` allineato.
- Ultimo commit: **`c25cc5f`**.

# Changed this session (commit `6468b12`→`c25cc5f`)
Sequenza (dal più recente):
- `c25cc5f` — lista canali: colonna MIC/DI più larga + badge 48V/Ampere sempre visibile (pmic flex, .micname troncabile, badge pinnato).
- `e808598` — liste (canali/carichi) a livello mockup: codice patch = TOKEN con tinta di dominio (teal Input, ciano Output, teal Power); badge 48V (teal) e Ampere (`.pamp` ambra); tolti stili inline dalle righe (`.lbl-note`, `.patch-sum`).
- `1c165d3` — bottoni layer Input/Output rifiniti: `.adv-connect` (Cablaggio automatico) da verde slavato → contorno pulito con hover pieno; `.adv-btn` segmentato hover/transizioni/focus-ring; `.bus-chip` (MAIN L/R…) solido con prefisso "+"; `.feed-seg` hover.
- `859c910` — rifinitura controlli via design system: classi `.prop-card`/`.prop-card__head`/`.prop-hint`/`.lbl-note`; `#props select/input` hover+transizione+chevron custom. Applicate ai 3 controlli nuovi + card gemelle pannello gruppo.
- `be72e42` — **Ascolto per performer** (`it.ascolto`/`ascoltoId`: wedge/iem/pm/cuffie/none → crea/associa il monitor giusto vicino al performer) + **pallino musicista nel layer Input = maniglia del cavo** (`sectionDotMarkup` con `port-hit` per-seduta al posto del `.hit`, classe `secdot-wire`; non sposta più il musicista).
- `f02009b` — fix BUG doppio-cavo ortogonale in editing su stile diretto (overlay segue la linea dritta, solo maniglie dei capi); **stage box del mixer** (flag `it.foh`, esclusa dall'auto, target manuale overflow, badge "MIXER").
- `3c6ab0e` — 2 stili cavo (Angoli smussati/Cablaggio diretto, orto rimosso→curve); diretto converge sul pallino centro box; **batch multi-selezione stage box** (`#grpSbWrap`: modello/ingressi/uscite insieme); **ESC azzera i layer** (solo/fuoco → base).
- `3ce605c` — **un cavo per musicista** nelle postazioni (doppia + tipi ×2 sbundlano; `musicianSeats`/`isPerMusicianMulti`/`channelAnchor`/`seatChannels`; batteria/piano stereo restano UN cavo).
- `6844204` — microfoni voci a scala reale (tonda/giraffa/mano bakati dall'editor) + `cantanteDepth` footprint dinamico.
- `ccab69a`/`5731b3d`/`6468b12` — voci: alias ricerca, figura coro unica, 4 modalità mic.

File toccati: `index.template.html` (sorgente), `src/styles.css`, `app.js`+`index.html` (generati — `node build.mjs`), `test/engines.test.mjs` (+~7 test).

# Decisions made (chiave)
- **Stili cavo = 2**: Angoli smussati (curve, default) · Cablaggio diretto (dir). orto/loom migrano a smussati.
- **Diretto**: linea dritta dal pallino centro box; editing = solo maniglie dei capi (niente segmenti ortogonali).
- **Postazioni** = 1 pallino + 1 cavo per musicista; strumenti singoli multi-mic = 1 cavo (invariato).
- **Stage box del mixer** (`it.foh`): fuori dall'auto, target manuale per gli overflow.
- **Ascolto** performer: 4 tipi che CREANO l'elemento monitor (deciso via AskUserQuestion).
- **Layer Input**: il pallino del musicista cabla, non sposta (per spostare → layer Musicisti).
- **UI**: i controlli nuovi nascono con classi del design system + hover/focus, mai stili inline grezzi (feedback Simone; memoria `feedback-stageplot-ui-polish`).

# Bugs and risks
- **Gotcha SW-cache (dev)**: deregistrare SW + svuotare caches + hard reload su porta nuova.
- **Gotcha test-sandbox**: `window.__cabStatic` truthy nel sandbox node.
- **Gotcha classe CSS**: non chiamare una classe `secdot-cab` (contiene la sottostringa `secdot-c` → falsa i conteggi test); usato `secdot-wire`.
- **REGOLA RIBADITA (vedi incidente sopra)**: verifiche interattive UI/motori SOLO su **localhost non loggato, progetto vuoto**. Mai sul tab col progetto cloud aperto. Le funzioni `elecConnectAll`/`cabConnectAll`/`addItem`(auto-connect) salvano sul cloud.

# Next step
1. Eventuali altre viste da portare a livello mockup se l'utente le segnala.

# Relevant commands
```
cd /Users/simonecastellan/COWORK/STAGEPLOT/stageplot
node build.mjs            # rigenera index.html + app.js (dopo src/ o index.template.html)
node build.mjs --check    # verifica allineamento
node test/engines.test.mjs   # suite (243 test)
python3 -m http.server 8077 --bind 127.0.0.1   # server locale
git push origin main      # deploy (Pages)
```

# Git state
- Branch **main**, in sync con `origin/main`, working tree **pulito**.
- Ultimo commit di codice: **`c25cc5f`** (i successivi sono solo docs `handoff.md`).
- Nota 23/07: repo spostato in `COWORK/STAGEPLOT/stageplot` (prima `COWORK/GITHUB/stageplot`).
