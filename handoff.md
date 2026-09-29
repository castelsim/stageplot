# STATO AL 27/09/2026 — da leggere prima di tutto

Tutto in produzione, nessuna PR aperta. Test: 1255 editor · 124 Orchestre · 137 Deno.
Regole di lavoro aggiornate in `AGENTS.md` (§3, §4, §8). Le sessioni fra fine luglio e settembre non
sono state scritte qui: la loro storia sta nei messaggi di commit e nelle PR (#98-#210).

## Settembre in una pagina (PR su `main`)

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
