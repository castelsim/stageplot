/* Inventario — area del proprietario (/inventario/). Elenco degli inventari, aggiunta di articoli numerati (TAS-001…),
   modifica, filtri, CSV e foglio di etichette con QR da stampare e plastificare. Dati: tabelle inv_* (migrazione 0085) con RLS;
   creare/aggiungere passa dalle funzioni inv_crea / inv_tipo_salva / inv_aggiungi (numeri progressivi senza doppioni).
   Si disegna SOLO con createElement/textContent (mai innerHTML). La parte pura sta in inv-lib.js. */
(function () {
  "use strict";
  var ACC = window.BGLAccesso, L = window.INVLib, IND = window.INVIndirizzo, PUB = window.INVPubblica;
  var app = document.getElementById("inv-area");
  var cfg = PUB.configura(location.hostname, location.search);
  var S = { c: null, utente: null, inventari: [], inv: null, tipi: [], articoli: [], membri: [], filtro: { tipo: "", stato: "", testo: "", ordine: "codice" }, sel: {}, vista: "elenco", errore: "" };

  /* ---------------------------------------------------------------- attrezzi DOM */
  function h(tag, attr, figli) {
    var e = document.createElement(tag);
    Object.keys(attr || {}).forEach(function (k) {
      var v = attr[k];
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, ""); else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (figli || []).forEach(function (f) { if (f != null) e.appendChild(typeof f === "string" ? document.createTextNode(f) : f); });
    return e;
  }
  function vuota(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function disegna(nodi) { vuota(app); nodi.forEach(function (n) { if (n) app.appendChild(n); }); window.scrollTo(0, 0); }
  var tt = null;
  function toast(m) { var t = document.getElementById("inv-toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3200); }
  function campo(etichetta, input, id) { input.id = id; return h("div", {}, [h("label", { for: id, text: etichetta }), input]); }
  function opzioni(sel, voci, valore) { voci.forEach(function (v) { var o = h("option", { value: v[0], text: v[1] }); if (v[0] === valore) o.selected = true; sel.appendChild(o); }); return sel; }
  var ERRORI = { troppi_inventari: "Hai già 5 inventari: è il massimo.", troppi_articoli: "Un inventario può avere al massimo 2000 articoli.", troppi_tipi: "Un inventario può avere al massimo 40 tipi.",
    numeri_esauriti: "Numeri finiti per questo tipo (99999).", tipo_mancante: "Scegli o crea prima il tipo.", dati_non_validi: "Controlla i campi: qualcosa non è valido.", non_trovato: "Non trovo l'inventario (o non sei il proprietario).", non_autenticato: "Accedi di nuovo.",
    slug_occupato: "Questo indirizzo è già preso: scegline un altro.", troppi_membri: "Al massimo 20 persone abilitate." };
  function errore(r, e) {
    if (e) return "Non riesco a collegarmi: riprova fra poco.";
    if (r && r.errore === "dati_non_validi" && r.campo === "slug") return "Indirizzo non valido: 3-30 caratteri tra lettere minuscole, numeri e trattini (non sono ammessi nomi riservati come «inv» o «admin»).";
    if (r && r.errore === "dati_non_validi" && r.campo === "email") return "Questa email non sembra valida.";
    return (r && ERRORI[r.errore]) || "Non è andata: riprova.";
  }
  function proprietario() { return !!(S.inv && S.utente && S.inv.user_id === S.utente.id); }

  /* ---------------------------------------------------------------- dati */
  function rpc(nome, args) { return S.c.rpc(nome, args).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function leggiInventari() { return S.c.from("inv_inventari").select("*").order("creato").then(function (r) { if (r.error) throw r.error; S.inventari = r.data || []; }); }
  function leggiDentro(id) {
    return Promise.all([
      S.c.from("inv_tipi").select("*").eq("inventario_id", id).order("prefisso"),
      S.c.from("inv_articoli").select("*").eq("inventario_id", id).order("codice").range(0, 1999)
    ]).then(function (r) {
      if (r[0].error) throw r[0].error; if (r[1].error) throw r[1].error; S.tipi = r[0].data || []; S.articoli = r[1].data || []; S.membri = [];
      if (!proprietario()) return;   // i membri non vedono l'elenco delle persone abilitate (RLS)
      return S.c.from("inv_membri").select("*").eq("inventario_id", id).order("aggiunto").then(function (m) { if (m.error) throw m.error; S.membri = m.data || []; });
    });
  }
  function nomeTipo(p) { for (var i = 0; i < S.tipi.length; i++) if (S.tipi[i].prefisso === p) return S.tipi[i]; return null; }

  /* ---------------------------------------------------------------- schermate */
  function barra(titolo, extra) {
    return h("div", { class: "barra" }, [h("div", {}, [h("h1", { text: titolo })]), h("div", { class: "riga" }, (extra || []).concat([
      S.utente ? h("button", { class: "btn piccolo", type: "button", text: "Esci", onclick: function () { ACC.esci(cfg).then(function () { location.reload(); }); } }) : null]))]);
  }
  function schermataAccesso(rete) {
    disegna([h("h1", { text: "Inventario" }), h("p", { class: "nota", text: "Numera gli strumenti e l'attrezzatura (TAS-001, PAD-001…), stampa le etichette con il QR e scansionandole vedi subito che numero è e quanti ce ne sono." }),
      h("p", { class: "nota", text: rete ? "Non riesco a collegarmi. Controlla la rete e riprova." : "Per gestire l'inventario devi accedere." }),
      h("button", { class: "btn primario", type: "button", text: rete ? "Riprova" : "Accedi con Google", onclick: function () { if (rete) return avvia(); ACC.accedi(cfg, location.pathname + location.search).catch(function () { toast("Accesso non riuscito: riprova."); }); } })]);
  }
  function vistaElenco() {
    S.vista = "elenco"; S.inv = null;
    var nome = h("input", { type: "text", maxlength: "80", placeholder: "es. Accademia Esempio" });
    var slug = h("input", { type: "text", maxlength: "30", placeholder: "es. scuola", style: "text-transform:lowercase" });
    nome.addEventListener("input", function () { if (!slug.dataset.mano) slug.value = nome.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30); });
    slug.addEventListener("input", function () { slug.dataset.mano = "1"; });
    var err = h("p", { class: "err", hidden: true });
    var lista = S.inventari.length ? S.inventari.map(function (i) {
      return h("div", { class: "card riga" }, [h("div", { style: "flex:1" }, [h("b", { text: i.nome }), h("div", { class: "nota", text: "stageplot.it/i/" + i.slug + (S.utente && i.user_id !== S.utente.id ? " · accesso come persona abilitata" : "") })]), h("button", { class: "btn", type: "button", text: "Apri", onclick: function () { apri(i.id); } })]);
    }) : [h("p", { class: "nota", text: "Non hai ancora nessun inventario. Creane uno: di solito uno per scuola, service o band." })];
    disegna([barra("I tuoi inventari")].concat(lista, [h("h2", { text: "Nuovo inventario" }),
      h("div", { class: "card" }, [campo("Nome (compare sulle etichette e sulla pagina pubblica)", nome, "nuovoNome"), campo("Indirizzo breve: stageplot.it/i/…  (non si cambia più: sta nei QR)", slug, "nuovoSlug"), err, h("div", { class: "riga", style: "margin-top:10px" }, [h("button", { class: "btn primario", type: "button", text: "Crea", onclick: function () {
        var n = nome.value.trim(); if (!n) { err.textContent = "Scrivi un nome."; err.hidden = false; return; }
        rpc("inv_crea", { p_nome: n, p_slug: slug.value.trim().toLowerCase() }).then(function (r) { if (!r || !r.ok) { err.textContent = errore(r); err.hidden = false; return; } return leggiInventari().then(function () { apri(r.id); }); },
          function () { err.textContent = errore(null, 1); err.hidden = false; });
      } })])]),
      h("p", { class: "nota", text: "Privacy: la pagina pubblica del QR mostra solo codice, tipo, modello, stato e quanti ce ne sono. Il nome di chi ha lo strumento (solo nome e corso/classe, mai indirizzi o telefoni) lo vedono soltanto le persone che abiliti e che accedono con Google." })]));
  }
  function apri(id, subito) {
    S.inv = S.inventari.filter(function (i) { return i.id === id; })[0]; if (!S.inv) return vistaElenco();
    S.filtro = { tipo: "", stato: "", testo: "", ordine: "codice" }; S.sel = {};
    /* subito = «elenco»: arrivo dal pulsante «Tutto l'inventario» della pagina del QR → direttamente l'elenco da stampare (nomi e note spenti) */
    leggiDentro(id).then(function () { if (subito === "elenco" && S.articoli.length) { vistaInventario(); return vistaStampaElenco(filtrati()); } vistaInventario(); }, function () { toast("Non riesco a leggere l'inventario."); });
  }
  function filtrati() { return L.ordina(L.filtra(S.articoli, S.filtro, true), S.filtro.ordine); }   // chi guarda è un membro (RLS): la ricerca può includere i nomi
  function salvaImpostazione(col, val) {
    var o = { aggiornato: new Date().toISOString() }; o[col] = val;
    S.c.from("inv_inventari").update(o).eq("id", S.inv.id).then(function (r) { if (r.error) { toast("Non salvato."); return; } S.inv[col] = val; toast("Salvato."); });
  }
  /* ---------------------------------------------------------------- modulo di comodato (solo proprietario, sezione chiusa di serie)
     Dati PUBBLICI dell'ente (intestazione, nome, luogo, piè, logo, versione): vanno in inv_inventari.modulo (migrazione 0090), letti solo dai membri.
     Il modulo compilato nasce nel browser alla consegna (pagina del QR): qui si imposta solo l'intestazione e si prova con dati finti. */
  var MOD = window.INVModulo;
  function ridimensionaLogo(file) {
    /* PNG (o JPEG, se più leggero) con lato massimo 400 px; si scende di misura finché la stringa sta sotto il limite del server (100 000 caratteri) */
    return new Promise(function (res, rej) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 12000000) return rej(new Error("tipo"));
      var u = URL.createObjectURL(file), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("immagine")); };
      im.onload = function () {
        URL.revokeObjectURL(u);
        var scelte = [400, 320, 240, 160];
        for (var i = 0; i < scelte.length; i++) {
          var k = Math.min(1, scelte[i] / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
          var g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height);
          var png = c.toDataURL("image/png"), jpg = c.toDataURL("image/jpeg", 0.88), mig = jpg.length < png.length ? jpg : png;
          if (/^data:image\/(png|jpeg);base64,/.test(mig) && mig.length <= 98000) return res(mig);
        }
        rej(new Error("troppo_grande"));
      };
      im.src = u;
    });
  }
  function pannelloModulo() {
    var m = (MOD && MOD.pulisciModulo(S.inv.modulo)) || MOD && MOD.pulisciModulo({}) || {}, bozza = JSON.parse(JSON.stringify(m));
    var esito = h("p", { class: "nota", role: "status", id: "mod-esito" });
    function inp(id, etichetta, chiave, max, nota) {
      var i = h("input", { type: "text", id: id, maxlength: String(max), autocomplete: "off", value: bozza[chiave] || "" });
      i.addEventListener("input", function () { bozza[chiave] = i.value; });
      return h("div", {}, [h("label", { for: id, text: etichetta }), i].concat(nota ? [h("p", { class: "nota", text: nota })] : []));
    }
    var colore = h("input", { type: "color", id: "mod-colore", value: bozza.colore || "#c09a5b" }); colore.addEventListener("input", function () { bozza.colore = colore.value; });
    var piedi = [0, 1, 2].map(function (n) { var i = h("input", { type: "text", id: "mod-piede" + n, maxlength: "140", autocomplete: "off", value: (bozza.piede || [])[n] || "" }); i.addEventListener("input", function () { bozza.piede = [0, 1, 2].map(function (k) { return (document.getElementById("mod-piede" + k) || {}).value || ""; }); }); return i; });
    var anteprima = h("img", { id: "mod-logo-anteprima", alt: "Logo del modulo", class: "mod-logo" }); anteprima.hidden = !bozza.logo; if (bozza.logo) anteprima.src = bozza.logo;
    var file = h("input", { type: "file", id: "mod-logo-file", accept: "image/png,image/jpeg,image/webp" });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return; esito.textContent = "Preparo il logo…";
      ridimensionaLogo(f).then(function (url) { bozza.logo = url; anteprima.src = url; anteprima.hidden = false; esito.textContent = "Logo pronto (" + Math.round(url.length / 1024) + " kB): ricordati di salvare."; },
        function () { esito.textContent = "Non riesco a usare questo file: prova un PNG o un JPEG."; });
    });
    var togli = h("button", { class: "btn piccolo", type: "button", id: "mod-logo-togli", text: "Togli il logo", onclick: function () { bozza.logo = ""; anteprima.hidden = true; file.value = ""; esito.textContent = "Logo tolto: ricordati di salvare."; } });
    function prova() {
      var d = MOD.datiModulo({ inventario: S.inv.nome, singolare: "Tastiera", modello: "Modello di prova", codice: "TAS-001" }, null, bozza,
        { nome: "Nome", cognome: "Cognome", corso: "Corso / classe", accessori: "alimentatore, custodia", data: PUB.oggiIso() });
      MOD.foglioStampa(d); window.print(); setTimeout(MOD.togliFoglio, 1500);
    }
    function salva() {
      var b = document.getElementById("mod-salva"); b.disabled = true; esito.textContent = "";
      var o = { ente: bozza.ente || "", ente_breve: bozza.ente_breve || "", registro: bozza.registro || "", intestazione: bozza.intestazione || "", colore: bozza.colore || "", luogo: bozza.luogo || "",
        firma_ente: bozza.firma_ente || "", piede: (bozza.piede || []).filter(Boolean), versione: bozza.versione || "", logo: bozza.logo || "" };
      rpc("inv_modulo_salva", { p_inv: S.inv.id, p_modulo: o }).then(function (r) {
        b.disabled = false; if (!r || !r.ok) { esito.textContent = r && r.errore === "non_autorizzato" ? "Solo chi ha creato l'inventario può salvare il modulo." : "Non salvato: controlla i campi" + (r && r.campo ? " (" + r.campo + ")" : "") + "."; return; }
        S.inv.modulo = o; esito.textContent = "Salvato."; toast("Modulo salvato.");
      }, function () { b.disabled = false; esito.textContent = "Non riesco a collegarmi: riprova."; });
    }
    var det = h("details", { class: "card", id: "mod-sezione" }, [h("summary", { text: "Modulo di comodato" }),
      h("p", { class: "nota", text: "Il modulo si compila da solo dopo «Consegna a…», dalla pagina del QR: si stampa o si condivide come PDF, tutto dal telefono. Qui imposti i dati dell'ente che compaiono sul foglio. Restano visibili solo alle persone abilitate." }),
      h("div", { class: "campi" }, [
        inp("mod-intestazione", "Intestazione (i punti · sono in colore)", "intestazione", 80, "es. ·NOME·DELL'ENTE·"),
        inp("mod-ente", "Nome per esteso, come nel testo", "ente", 120, "es. l'Associazione Nome ETS"), inp("mod-ente-breve", "Nome breve (restituzione «su richiesta di …»)", "ente_breve", 60),
        inp("mod-registro", "Inventario «…dell'associazione»", "registro", 40), inp("mod-luogo", "Luogo del foglio", "luogo", 60), inp("mod-firma", "Firma dell'ente", "firma_ente", 60), inp("mod-versione", "Versione del foglio", "versione", 40, "es. v3 · 17/11/2026"),
        h("div", {}, [h("label", { for: "mod-colore", text: "Colore dei puntini e del filetto" }), colore])]),
      h("label", { text: "Piè di pagina (fino a 3 righe)" }), h("div", { class: "campi" }, piedi),
      h("div", { class: "riga", style: "margin:8px 0" }, [h("div", {}, [h("label", { for: "mod-logo-file", text: "Logo (PNG o JPEG; si ridimensiona da solo)" }), file]), anteprima, togli]),
      h("div", { class: "riga" }, [h("button", { class: "btn primario", type: "button", id: "mod-salva", text: "Salva", onclick: salva }), h("button", { class: "btn", type: "button", id: "mod-prova", text: "Prova il modulo", onclick: prova })]),
      esito]);
    return det;
  }

  function vistaInventario() {
    S.vista = "inventario";
    var cont = L.conteggi(S.articoli);
    var prop = proprietario();
    var impo = !prop ? h("p", { class: "nota", text: "Accesso come persona abilitata: puoi consegnare, segnare i rientri e le note dalla scheda di ogni articolo." }) : h("div", { class: "card" }, [
      h("label", { class: "spunta" }, [h("input", { type: "checkbox", id: "chkPubblico", checked: !!S.inv.pubblico, onchange: function () { salvaImpostazione("pubblico", this.checked); } }), h("span", { text: "Pagina pubblica del QR attiva: chi scansiona l'etichetta vede codice, modello e quanti ce ne sono." })]),
      h("label", { class: "spunta" }, [h("input", { type: "checkbox", id: "chkStato", checked: !!S.inv.mostra_stato, onchange: function () { salvaImpostazione("mostra_stato", this.checked); } }), h("span", { text: "Mostra anche «in sede / a casa» sulla pagina del QR." })]),
      h("p", { class: "nota", text: "Indirizzo del QR: stageplot.it/i/" + S.inv.slug + "/CODICE · elenco pubblico: stageplot.it/i/" + S.inv.slug + ". Non mostrano mai note né chi ha lo strumento." })]);
    var tipi = h("div", { class: "tipi" }, S.tipi.map(function (t) {
      var c = cont[t.prefisso] || { totale: 0, attivi: 0, per_stato: {} };
      var parti = L.STATI.filter(function (s) { return c.per_stato[s.id]; }).map(function (s) { return s.nome.toLowerCase() + " " + c.per_stato[s.id]; }).join(" · ");
      return h("div", { class: "card" }, [h("b", { text: t.singolare + " · " + t.prefisso }), h("span", { text: L.frase(c.attivi, t.singolare, t.plurale) }), h("br"), h("span", { text: parti || "nessun articolo" })]);
    }));
    var elenco = filtrati();
    var nSel = elenco.filter(function (a) { return S.sel[a.id]; }).length;
    disegna([
      h("div", {}, [h("button", { class: "btn piccolo", type: "button", text: "← Inventari", onclick: function () { leggiInventari().then(vistaElenco); } })]),
      barra(S.inv.nome), impo, prop ? pannelloPersone() : null, prop && MOD ? pannelloModulo() : null,
      h("h2", { text: "Tipi" }), S.tipi.length ? tipi : h("p", { class: "nota", text: "Nessun tipo ancora: aggiungi i primi articoli qui sotto." }),
      prop ? formAggiungi() : null,
      h("h2", { text: "Articoli (" + S.articoli.length + ")" }), filtri(),
      h("div", { class: "riga", style: "margin:10px 0" }, [
        h("button", { class: "btn primario", type: "button", id: "bEtichette", text: nSel ? "Etichette dei " + nSel + " selezionati" : "Etichette di tutti i " + elenco.length + " mostrati", disabled: !elenco.length, onclick: function () { vistaEtichette(nSel ? elenco.filter(function (a) { return S.sel[a.id]; }) : elenco); } }),
        h("button", { class: "btn primario", type: "button", id: "bElenco", text: "Elenco da stampare (" + elenco.length + ")", disabled: !elenco.length, onclick: function () { vistaStampaElenco(filtrati()); } }),
        h("button", { class: "btn", type: "button", id: "bCsvElenco", text: "CSV dei " + elenco.length + " mostrati", disabled: !elenco.length, onclick: function () { scaricaCsvElenco(filtrati()); } }),
        h("label", { class: "spunta" }, [h("input", { type: "checkbox", id: "chkCsvNomi", checked: !!S.csvNomi, onchange: function () { S.csvNomi = this.checked; } }), h("span", { text: "includi nomi e note riservate" })]),
        h("button", { class: "btn", type: "button", id: "bCsv", text: "Scarica CSV", disabled: !S.articoli.length, onclick: function () { scaricaCsv(false); } }),
        h("button", { class: "btn", type: "button", id: "bCsvNomi", text: "CSV con assegnazioni", disabled: !S.articoli.length, onclick: function () { scaricaCsv(true); } })]),
      h("p", { class: "nota", text: "«Elenco da stampare» e «CSV dei mostrati» seguono i filtri e l'ordine qui sopra; la stampa e il CSV, di serie, non hanno i nomi di chi ha lo strumento né le note riservate: si aggiungono con la spunta." }),
      tabella(elenco)]);
  }
  function pannelloPersone() {
    var em = h("input", { type: "text", placeholder: "email Google della persona", autocomplete: "off", inputmode: "email" }), err = h("p", { class: "err", hidden: true });
    var lista = S.membri.length ? S.membri.map(function (m) {
      return h("div", { class: "riga", style: "padding:4px 0" }, [h("span", { text: m.email, style: "flex:1" }), h("button", { class: "btn piccolo pericolo", type: "button", "aria-label": "Togli " + m.email, text: "Togli", onclick: function () {
        S.c.from("inv_membri").delete().eq("inventario_id", S.inv.id).eq("email", m.email).then(function (r) { if (r.error) { toast("Non tolto."); return; } S.membri = S.membri.filter(function (x) { return x.email !== m.email; }); toast(m.email + " non ha più accesso."); vistaInventario(); });
      } })]);
    }) : [h("p", { class: "nota", text: "Nessuna persona abilitata oltre a te." })];
    return h("div", {}, [h("h2", { text: "Persone abilitate" }), h("div", { class: "card" }, [
      h("p", { class: "nota", text: "Chi accede con Google a stageplot.it con una di queste email vede le assegnazioni (nome e corso/classe), le date e lo storico, e può registrare consegne e rientri scansionando il QR. Tu sei sempre abilitato." })].concat(lista, [
      h("div", { class: "riga", style: "margin-top:8px" }, [h("div", { style: "flex:1;min-width:200px" }, [em]), h("button", { class: "btn primario", type: "button", id: "bAggiungiPersona", text: "Abilita", onclick: function () {
        err.hidden = true; var v = em.value.trim().toLowerCase(); if (!v) return;
        rpc("inv_membro_aggiungi", { p_inv: S.inv.id, p_email: v }).then(function (r) {
          if (!r || !r.ok) { err.textContent = errore(r); err.hidden = false; return; }
          toast(v + " abilitata."); return leggiDentro(S.inv.id).then(vistaInventario);
        }, function () { err.textContent = errore(null, 1); err.hidden = false; });
      } })]), err]))]);
  }
  function formAggiungi() {
    var selTipo = h("select", {}); opzioni(selTipo, S.tipi.map(function (t) { return [t.prefisso, t.singolare + " (" + t.prefisso + ")"]; }).concat([["__nuovo", "＋ Nuovo tipo…"]]), S.tipi.length ? S.tipi[0].prefisso : "__nuovo");
    var nSing = h("input", { type: "text", maxlength: "40", placeholder: "Tastiera" }), nPlur = h("input", { type: "text", maxlength: "40", placeholder: "tastiere" }), nPref = h("input", { type: "text", maxlength: "5", placeholder: "TAS", style: "text-transform:uppercase" });
    var qta = h("input", { type: "number", min: "1", max: "200", value: "1" }), mod = h("input", { type: "text", maxlength: "120", placeholder: "es. Yamaha PSR-F52" });
    var stato = opzioni(h("select", {}), L.STATI.map(function (s) { return [s.id, s.nome]; }), "in_sede"), note = h("input", { type: "text", maxlength: "500", placeholder: "solo persone abilitate, non pubblica" });
    var err = h("p", { class: "err", hidden: true }), blocco = h("div", { class: "campi" }, [campo("Tipo (singolare)", nSing, "nTipoS"), campo("Plurale", nPlur, "nTipoP"), campo("Prefisso del codice (2-5 lettere)", nPref, "nTipoPref")]);
    function aggiorna() { blocco.hidden = selTipo.value !== "__nuovo"; }
    nSing.addEventListener("input", function () { if (!nPref.dataset.mano) nPref.value = L.proponiPrefisso(nSing.value); });
    nPref.addEventListener("input", function () { nPref.dataset.mano = "1"; nPref.value = nPref.value.toUpperCase().replace(/[^A-Z]/g, ""); });
    selTipo.addEventListener("change", aggiorna); aggiorna();
    function vai() {
      err.hidden = true; var n = Math.floor(+qta.value);
      if (!(n >= 1 && n <= 200)) { err.textContent = "Quantità da 1 a 200."; err.hidden = false; return; }
      var nuovo = selTipo.value === "__nuovo", pref = nuovo ? nPref.value.trim().toUpperCase() : selTipo.value;
      if (nuovo && (!nSing.value.trim() || !nPlur.value.trim() || !L.prefissoOk(pref))) { err.textContent = "Per un tipo nuovo servono singolare, plurale e un prefisso di 2-5 lettere."; err.hidden = false; return; }
      var passo = nuovo ? rpc("inv_tipo_salva", { p_inv: S.inv.id, p_prefisso: pref, p_singolare: nSing.value.trim(), p_plurale: nPlur.value.trim() }) : Promise.resolve({ ok: true });
      passo.then(function (r) {
        if (!r || !r.ok) { err.textContent = errore(r); err.hidden = false; return null; }
        return rpc("inv_aggiungi", { p_inv: S.inv.id, p_prefisso: pref, p_qta: n, p_modello: mod.value.trim(), p_stato: stato.value, p_note: note.value.trim() }).then(function (a) {
          if (!a || !a.ok) { err.textContent = errore(a); err.hidden = false; return; }
          toast(n === 1 ? "Aggiunto " + a.primo + "." : "Aggiunti " + n + ": da " + a.primo + " a " + a.ultimo + "."); return leggiDentro(S.inv.id).then(vistaInventario);
        });
      }, function () { err.textContent = errore(null, 1); err.hidden = false; });
    }
    return h("div", {}, [h("h2", { text: "Aggiungi articoli" }), h("div", { class: "card" }, [
      h("div", { class: "campi" }, [campo("Tipo", selTipo, "aTipo")]), blocco,
      h("div", { class: "campi" }, [campo("Quantità", qta, "aQta"), campo("Marca / modello", mod, "aMod"), campo("Stato", stato, "aStato"), campo("Nota riservata", note, "aNote")]),
      err, h("div", { class: "riga", style: "margin-top:8px" }, [h("button", { class: "btn primario", type: "button", id: "bAggiungi", text: "Aggiungi", onclick: vai }),
        h("span", { class: "nota", text: "I numeri sono progressivi e non si riusano: un codice stampato non cambia mai significato." })])])]);
  }
  function filtri() {
    var t = h("input", { type: "text", placeholder: "Cerca codice, modello, nota o nome", value: S.filtro.testo, "aria-label": "Cerca" });
    var st = opzioni(h("select", { "aria-label": "Filtra per tipo" }), [["", "Tutti i tipi"]].concat(S.tipi.map(function (x) { return [x.prefisso, x.singolare]; })), S.filtro.tipo);
    var ss = opzioni(h("select", { "aria-label": "Filtra per stato" }), [["", "Tutti gli stati"]].concat(L.STATI.map(function (s) { return [s.id, s.nome]; })), S.filtro.stato);
    var so = opzioni(h("select", { "aria-label": "Ordina per" }), [["codice", "Ordina per codice"], ["stato", "Ordina per stato"], ["assegnato", "Ordina per chi ha lo strumento"]], S.filtro.ordine);
    function ridisegna() { S.filtro = { tipo: st.value, stato: ss.value, testo: t.value, ordine: so.value }; var pos = t.selectionStart; vistaInventario(); var n = document.querySelector('input[aria-label="Cerca"]'); if (n && document.activeElement !== n && t === document.activeElement) { n.focus(); n.setSelectionRange(pos, pos); } }
    st.addEventListener("change", ridisegna); ss.addEventListener("change", ridisegna); so.addEventListener("change", ridisegna);
    t.addEventListener("input", function () { S.filtro.testo = t.value; var elenco = filtrati(); var tb = document.getElementById("tbArticoli"); if (tb) { vuota(tb); righe(elenco).forEach(function (r) { tb.appendChild(r); }); } aggiornaBottoni(elenco); });
    return h("div", { class: "campi" }, [t, st, ss, so]);
  }
  function aggiornaBottoni(elenco) {
    var b = document.getElementById("bEtichette"); if (!b) return; var n = elenco.filter(function (a) { return S.sel[a.id]; }).length;
    b.textContent = n ? "Etichette dei " + n + " selezionati" : "Etichette di tutti i " + elenco.length + " mostrati"; b.disabled = !elenco.length;
    b.onclick = function () { vistaEtichette(n ? elenco.filter(function (a) { return S.sel[a.id]; }) : elenco); };
  }
  function righe(elenco) {
    return elenco.map(function (a) {
      var mod = h("input", { type: "text", maxlength: "120", value: a.modello, "aria-label": "Modello di " + a.codice }), nota = h("input", { type: "text", maxlength: "500", value: a.note, "aria-label": "Nota di " + a.codice });
      var st = opzioni(h("select", { "aria-label": "Stato di " + a.codice }), L.STATI.map(function (s) { return [s.id, s.nome]; }), a.stato);
      var chk = h("input", { type: "checkbox", "aria-label": "Seleziona " + a.codice, checked: !!S.sel[a.id], onchange: function () { S.sel[a.id] = this.checked; aggiornaBottoni(filtrati()); } });
      function salva(col, val) {
        var o = { aggiornato: new Date().toISOString() }; o[col] = val;
        S.c.from("inv_articoli").update(o).eq("id", a.id).then(function (r) { if (r.error) { toast("Non salvato."); return; } a[col] = val; toast(a.codice + ": salvato."); });
      }
      mod.addEventListener("change", function () { salva("modello", mod.value.trim()); }); nota.addEventListener("change", function () { salva("note", nota.value.trim()); });
      st.addEventListener("change", function () { salva("stato", st.value); });
      var aprirePag = h("a", { class: "btn piccolo", href: IND.link(S.inv.slug, a.codice, location.origin) + location.search, target: "_blank", rel: "noopener", text: "Scheda" });
      var del = h("button", { class: "btn piccolo pericolo", type: "button", text: "Elimina", onclick: function () {
        if (del.dataset.chiedi !== "1") { del.dataset.chiedi = "1"; del.textContent = "Sicuro? Elimina"; setTimeout(function () { del.dataset.chiedi = ""; del.textContent = "Elimina"; }, 4000); return; }
        S.c.from("inv_articoli").delete().eq("id", a.id).then(function (r) { if (r.error) { toast("Non eliminato."); return; } S.articoli = S.articoli.filter(function (x) { return x.id !== a.id; }); toast(a.codice + " eliminato. Il numero non verrà riusato."); vistaInventario(); });
      } });
      var t = nomeTipo(a.tipo), prop = proprietario();
      var ass = a.assegnato_a ? a.assegnato_a + (a.data_consegna ? " (dal " + L.dataIt(a.data_consegna) + ")" : "") : (a.data_rientro ? "rientrato il " + L.dataIt(a.data_rientro) : "");
      return h("tr", {}, [h("td", {}, [chk]), h("td", { class: "cod", text: a.codice }), h("td", { text: t ? t.singolare : a.tipo }), h("td", {}, [mod]), h("td", {}, [st]), h("td", { class: "ass", text: ass }), h("td", {}, [nota]), h("td", {}, [h("div", { class: "riga" }, [aprirePag, prop ? del : null])])]);
    });
  }
  function tabella(elenco) {
    if (!S.articoli.length) return h("p", { class: "nota", text: "Nessun articolo: usa «Aggiungi articoli» qui sopra." });
    var tutti = h("input", { type: "checkbox", "aria-label": "Seleziona tutti i mostrati", onchange: function () { var v = this.checked; filtrati().forEach(function (a) { S.sel[a.id] = v; }); vistaInventario(); } });
    return h("div", { class: "tabella" }, [h("table", {}, [h("thead", {}, [h("tr", {}, [h("th", {}, [tutti]), h("th", { text: "Codice" }), h("th", { text: "Tipo" }), h("th", { text: "Marca / modello" }), h("th", { text: "Stato" }), h("th", { text: "Assegnato a" }), h("th", { text: "Nota riservata" }), h("th", { text: "" })])]),
      h("tbody", { id: "tbArticoli" }, righe(elenco))])]);
  }
  function scaricaCsv(conNomi) {
    var blob = new Blob(["﻿" + L.csv(S.tipi, S.articoli, !!conNomi)], { type: "text/csv;charset=utf-8" }), u = URL.createObjectURL(blob);
    var a = h("a", { href: u, download: "INVENTARIO_" + S.inv.slug + (conNomi ? "_con_assegnazioni" : "") + ".csv" }); document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }

  /* ---------------------------------------------------------------- Elenco completo: foglio A4 e CSV dei mostrati */
  function scaricaCsvElenco(elenco) {
    var blob = new Blob(["\ufeff" + L.csvElenco(S.tipi, elenco, !!S.csvNomi)], { type: "text/csv;charset=utf-8" }), u = URL.createObjectURL(blob);
    var a = h("a", { href: u, download: "ELENCO_" + S.inv.slug + "_" + L.data().split("/").reverse().join("-") + ".csv" }); document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }
  /* Foglio A4 in verticale: colonne Codice · Tipo · Modello · Stato / dove · Nota; i nomi solo se chi stampa lo sceglie (i fogli restano in giro) */
  function vistaStampaElenco(elenco, conNomi) {
    S.vista = "stampa-elenco"; conNomi = !!conNomi;
    var pagine = L.impaginaElenco(elenco), oggi = L.data(), N = pagine.length, chiave = "inv-ver-elenco-" + S.inv.slug, ver = 1;
    try { ver = Math.max(1, parseInt(localStorage.getItem(chiave), 10) || 1); } catch (e) {}
    var f = S.filtro, tipo = nomeTipo(f.tipo), parti = [];
    if (tipo) parti.push(tipo.plurale); if (f.stato) parti.push(L.statoNome(f.stato).toLowerCase()); if (f.testo.trim()) parti.push("«" + f.testo.trim() + "»");
    var sinistri = [];
    var fogli = pagine.map(function (grp, i) {
      var righeT = grp.map(function (a) {
        var t = nomeTipo(a.tipo);
        return h("tr", {}, [h("td", { class: "cod", text: a.codice }), h("td", { text: t ? t.singolare : a.tipo }), h("td", { class: "tronca", text: a.modello }), h("td", { class: "tronca", text: L.descrizioneStato(a, conNomi) }), h("td", { class: "tronca", text: conNomi ? a.note : "" })]);
      });
      var tab = h("table", { class: "el-tab" }, [h("thead", {}, [h("tr", {}, [h("th", { text: "Codice" }), h("th", { text: "Tipo" }), h("th", { text: "Marca / modello" }), h("th", { text: "Dove si trova" }), h("th", { text: conNomi ? "Nota" : "" })])]), h("tbody", {}, righeT)]);
      var testa = h("div", { class: "el-testa" }, [h("b", { text: S.inv.nome + " — elenco dell'inventario" }),
        h("span", { text: (parti.length ? parti.join(" · ") + " · " : "") + L.sintesi(elenco) })]);
      var fo = h("div", { class: "foglio elenco" }, [testa, tab]);
      var sx = h("span", { text: L.piedeElenco(ver, S.inv.nome, elenco.length, oggi) }); sinistri.push(sx);
      fo.appendChild(h("div", { class: "piede-foglio" }, [sx, h("span", { text: (i + 1) + " di " + N })]));
      return fo;
    });
    var verIn = h("input", { type: "number", min: "1", max: "99", value: String(ver), id: "versione", "aria-label": "Versione del foglio", style: "width:72px", onchange: function () {
      var v = Math.max(1, Math.min(99, Math.floor(+this.value) || 1)); this.value = String(v); try { localStorage.setItem(chiave, String(v)); } catch (e) {}
      sinistri.forEach(function (c) { c.textContent = L.piedeElenco(v, S.inv.nome, elenco.length, oggi); });
    } });
    var nomi = h("input", { type: "checkbox", id: "chkNomiStampa", checked: conNomi, onchange: function () { vistaStampaElenco(elenco, this.checked); } });
    disegna([h("div", { class: "barra" }, [h("div", {}, [h("button", { class: "btn piccolo", type: "button", text: "← Torna all'inventario", onclick: vistaInventario })]),
        h("div", { class: "riga" }, [h("label", { for: "versione", text: "Versione", style: "margin:0" }), verIn, h("button", { class: "btn primario", type: "button", id: "bStampa", text: "Stampa (" + elenco.length + " oggetti, " + N + (N === 1 ? " foglio" : " fogli") + ")", onclick: function () { window.print(); } })])]),
      h("label", { class: "spunta" }, [nomi, h("span", { text: "Scrivi sul foglio anche i nomi di chi ha lo strumento e le note riservate (i fogli stampati restano in giro: di serie no)." })]),
      h("div", { class: "fogli" }, fogli)]);
    var w = Math.min(window.innerWidth - 32, 794), sc = w / 794;
    if (sc < 1) Array.prototype.forEach.call(document.querySelectorAll(".foglio"), function (fo) { fo.style.transform = "scale(" + sc + ")"; fo.style.marginBottom = (-(297 * 3.7795) * (1 - sc)) + "px"; fo.style.marginLeft = ((w - 794) / 2) + "px"; });
  }

  /* ---------------------------------------------------------------- QR e foglio di etichette */
  var NS = "http://www.w3.org/2000/svg";
  function qrSvg(testo) {
    var q = window.qrcode(0, "M"); q.addData(testo, "Byte"); q.make();
    var n = q.getModuleCount(), d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + c + " " + r + "h1v1h-1z";
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 " + n + " " + n); svg.setAttribute("shape-rendering", "crispEdges"); svg.setAttribute("role", "img");
    var p = document.createElementNS(NS, "path"); p.setAttribute("d", d); p.setAttribute("fill", "#000"); svg.appendChild(p);
    return svg;
  }
  function etichetta(a, pos) {
    var t = nomeTipo(a.tipo), url = IND.link(S.inv.slug, a.codice), F = L.FOGLIO;
    var cod = h("div", { class: "cod", text: a.codice, style: "font-size:" + L.corpoCodice(a.codice.length) + "pt" });
    var qr = h("div", { class: "qr" }, [qrSvg(url)]); qr.firstChild.setAttribute("aria-label", "QR di " + a.codice); qr.dataset.url = url;
    return h("div", { class: "etichetta", "data-codice": a.codice, style: "left:" + pos.x + "mm;top:" + pos.y + "mm;width:" + F.ew + "mm;height:" + F.eh + "mm" }, [
      h("div", { class: "sx" }, [h("div", { class: "ente", text: S.inv.nome }), cod,
        h("div", {}, [h("div", { class: "tipo", text: (t ? t.singolare : a.tipo) + " n. " + a.numero }), a.modello ? h("div", { class: "mod", text: a.modello }) : null])]), qr]);
  }
  function vistaEtichette(elenco) {
    S.vista = "etichette";
    var pagine = L.impagina(elenco), oggi = L.data(), N = pagine.length, chiave = "inv-ver-" + S.inv.slug, ver = 1;
    try { ver = Math.max(1, parseInt(localStorage.getItem(chiave), 10) || 1); } catch (e) {}
    var sinistri = [];
    var fogli = pagine.map(function (grp, i) {
      var f = h("div", { class: "foglio" }, grp.map(function (a, k) { return etichetta(a, L.posizione(k)); }));
      var sx = h("span", { text: L.piede(ver, S.inv.nome, grp.map(function (a) { return a.codice; }), oggi) }); sinistri.push([sx, grp]);
      f.appendChild(h("div", { class: "piede-foglio" }, [sx, h("span", { text: (i + 1) + " di " + N })]));
      return f;
    });
    var verIn = h("input", { type: "number", min: "1", max: "99", value: String(ver), id: "versione", "aria-label": "Versione del foglio", style: "width:72px", onchange: function () {
      var v = Math.max(1, Math.min(99, Math.floor(+this.value) || 1)); this.value = String(v); try { localStorage.setItem(chiave, String(v)); } catch (e) {}
      sinistri.forEach(function (c) { c[0].textContent = L.piede(v, S.inv.nome, c[1].map(function (a) { return a.codice; }), oggi); });
    } });
    disegna([h("div", { class: "barra" }, [h("div", {}, [h("button", { class: "btn piccolo", type: "button", text: "← Torna all'inventario", onclick: vistaInventario })]),
        h("div", { class: "riga" }, [h("label", { for: "versione", text: "Versione", style: "margin:0" }), verIn, h("button", { class: "btn primario", type: "button", id: "bStampa", text: "Stampa (" + elenco.length + " etichette, " + N + (N === 1 ? " foglio" : " fogli") + ")", onclick: function () { window.print(); } })])]),
      h("p", { class: "nota", text: "Stampa in A4 al 100% (non «adatta alla pagina»), poi ritaglia lungo le linee tratteggiate e plastifica. Il QR porta a un indirizzo fisso: se ristampi, le vecchie etichette restano valide. Il numero di versione sta nel piè del foglio: aumentalo se ristampi con modifiche." }),
      h("div", { class: "fogli" }, fogli)]);
    // sullo schermo stretto il foglio da 210 mm si rimpicciolisce per stare nella pagina; in stampa torna al 100%
    var w = Math.min(window.innerWidth - 32, 794), sc = w / 794;
    if (sc < 1) Array.prototype.forEach.call(document.querySelectorAll(".foglio"), function (f) { f.style.transform = "scale(" + sc + ")"; f.style.marginBottom = (-(297 * 3.7795) * (1 - sc)) + "px"; f.style.marginLeft = ((w - 794) / 2) + "px"; });
  }

  /* ---------------------------------------------------------------- avvio */
  function avvia() {
    disegna([h("p", { class: "carico", role: "status", text: "Un momento…" })]);
    ACC.sessione(cfg).then(function (s) {
      var st = ACC.statoAccesso(s);
      if (st === "fuori") return schermataAccesso(false);
      if (st === "senza_rete") return schermataAccesso(true);
      S.utente = s.sessione.user || {};
      return ACC.cliente(cfg).then(function (c) { S.c = c; return leggiInventari(); }).then(function () {
        var q = new URLSearchParams(location.search), qs = (q.get("apri") || "").toLowerCase(), pre = qs && IND.slugOk(qs) ? S.inventari.filter(function (i) { return i.slug === qs; })[0] : null;
        if (pre) return apri(pre.id, q.get("elenco") === "1" ? "elenco" : "");   // solo tra gli inventari che la RLS mostra a questo utente: uno non abilitato non compare
        if (S.inventari.length === 1) return apri(S.inventari[0].id);
        vistaElenco();
      }, function () { schermataAccesso(true); });
    });
  }
  window.INVArea = { avvia: avvia, stato: S };
  avvia();
})();
