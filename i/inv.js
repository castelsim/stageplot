/* Inventario — pagina dietro il QR (/i/<slug>/<codice>) ed elenco pubblico per tipo (/i/<slug>). Migrazione 0085.
   PUBBLICO (nessun login): codice, tipo, modello, nome dell'inventario, «in sede / a casa», totale per tipo. MAI il nome di una persona.
   MEMBRI (login Google già presente su stageplot.it, email autorizzata dal proprietario): sotto la scheda compare il pannello riservato —
   assegnato a (nome + corso/classe), date, note, storico — con «Consegna a…», «Rientrato», «Rotto», «Smarrito» pensati per il telefono della segreteria.
   Il pubblico legge con due funzioni pubbliche; i membri con inv_scheda_membro / inv_movimento (il server decide chi è membro dall'email del token).
   Si disegna SOLO con createElement/textContent (mai innerHTML). Funzioni pure in testa: le prova Node (test/engines.test.mjs). */
(function (root) {
  "use strict";
  var API_PROD = "https://vsodplqkuvnsdiikvmjb.supabase.co";
  /* La stessa anon key del resto del sito: pubblica per costruzione (decidono la RLS e i grant). */
  var ANON_PROD = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
  var TIMEOUT_MS = 15000;
  /* il modulo di comodato (i/inv-modulo.js): nel browser è già caricato da index.html; in Node (test) si prende col require */
  var MOD = root.INVModulo || (typeof require === "function" ? require("../inventario/inv-modulo.js") : null);
  var STATI = { in_sede: "In sede", a_casa: "A casa", in_riparazione: "In riparazione", smarrito: "Smarrito", dismesso: "Dismesso" };
  var MOV = { consegna: "Consegna", rientro: "Rientro", rottura: "Rottura", smarrimento: "Smarrimento" };

  function configura(hostname, search) {
    var cfg = { api: API_PROD, anon: ANON_PROD, locale: false };
    if (hostname !== "localhost" && hostname !== "127.0.0.1") return cfg;
    cfg.locale = true;
    var q = new URLSearchParams(search || "");
    var api = (q.get("api") || "").replace(/\/+$/, "");
    if (/^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(api)) cfg.api = api;
    var anon = q.get("anon") || "";
    if (/^[A-Za-z0-9._\-]{1,2000}$/.test(anon)) cfg.anon = anon;
    return cfg;
  }
  function testo(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : ""; }
  function statoOk(s) { return typeof s === "string" && STATI[s] ? s : null; }
  function conta(v) { var n = Math.floor(+v); return n >= 0 && n < 100000 ? n : 0; }
  function data(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; }
  function gmA(d) { return d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : ""; }

  /* la scheda pubblica: solo i campi previsti; null se non è una scheda valida */
  function pulisci(r) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) return null;
    return {
      inventario: testo(r.inventario, 80), codice: testo(r.codice, 12), numero: Math.floor(+r.numero) || 0,
      singolare: testo(r.singolare, 40) || "Articolo", plurale: testo(r.plurale, 40) || "articoli",
      modello: testo(r.modello, 120), stato: statoOk(r.stato), totale: conta(r.totale)
    };
  }
  /* l'elenco pubblico per tipo */
  function pulisciElenco(r) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) return null;
    var tipi = (Array.isArray(r.tipi) ? r.tipi : []).slice(0, 40).map(function (t) {
      t = t && typeof t === "object" ? t : {};
      return { prefisso: testo(t.prefisso, 5), singolare: testo(t.singolare, 40) || "Articolo", plurale: testo(t.plurale, 40) || "articoli", totale: conta(t.totale),
        articoli: (Array.isArray(t.articoli) ? t.articoli : []).slice(0, 2000).map(function (a) {
          a = a && typeof a === "object" ? a : {};
          return { codice: testo(a.codice, 12), numero: Math.floor(+a.numero) || 0, modello: testo(a.modello, 120), stato: statoOk(a.stato) };
        }).filter(function (a) { return a.codice; }) };
    });
    return { inventario: testo(r.inventario, 80), tipi: tipi };
  }
  /* la parte riservata (solo membri) */
  function pulisciMembro(r) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) return null;
    return {
      stato: statoOk(r.stato), assegnato_a: testo(r.assegnato_a, 120), data_consegna: data(r.data_consegna), data_rientro: data(r.data_rientro), note: testo(r.note, 500),
      proprietario: r.proprietario === true,
      modulo: MOD ? MOD.pulisciModulo(r.modulo) : null,
      movimenti: (Array.isArray(r.movimenti) ? r.movimenti : []).slice(0, 30).map(function (m) {
        m = m && typeof m === "object" ? m : {};
        return { tipo: MOV[m.tipo] ? m.tipo : "", a_chi: testo(m.a_chi, 120), data: data(m.data), nota: testo(m.nota, 500), autore: testo(m.autore, 120) };
      }).filter(function (m) { return m.tipo; })
    };
  }
  function frase(totale, singolare, plurale) { return totale + " " + String(totale === 1 ? singolare : plurale).toLowerCase() + " in inventario"; }
  var ERR_MOV = { gia_assegnato: "È già assegnato: segna prima il rientro.", non_assegnato: "Non risulta assegnato a nessuno.", non_disponibile: "Non è disponibile (in riparazione, smarrito o dismesso).",
    non_autorizzato: "Il tuo accesso non è abilitato per questo inventario.", non_autenticato: "Accedi di nuovo.", non_trovato: "Non trovo questo codice.",
    dati_non_validi: "Controlla i campi: serve il nome, e la data deve essere ragionevole." };
  function erroreMov(r) { return (r && ERR_MOV[r.errore]) || "Non è andata: riprova."; }
  /* il pulsante «Tutto l'inventario» (solo membri): porta all'area, su quell'inventario, già sull'elenco da stampare. Solo lo slug (validato), mai altro. */
  function linkAreaElenco(slug) { return typeof slug === "string" && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(String(slug)) ? "/inventario/?apri=" + encodeURIComponent(slug) + "&elenco=1" : ""; }
  function oggiIso(d) { d = d || new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  /* ================================================================== BROWSER */
  var ACC = root.BGLAccesso;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function mostra(app, nodi) { while (app.firstChild) app.removeChild(app.firstChild); nodi.forEach(function (n) { app.appendChild(n); }); app.removeAttribute("aria-busy"); }
  function messaggio(app, titolo, corpo, riprova) {
    var c = el("section", "inv-carta"); c.appendChild(el("p", "inv-msg", titolo)); c.appendChild(el("p", "inv-msg-testo", corpo));
    if (riprova) { var b = el("button", "btn", "Riprova"); b.type = "button"; b.addEventListener("click", riprova); c.appendChild(b); }
    mostra(app, [c]);
  }
  function rpcPubblica(cfg, nome, args) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    return fetch(cfg.api + "/rest/v1/rpc/" + nome, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.anon, Authorization: "Bearer " + cfg.anon },
      body: JSON.stringify(args), signal: ctl ? ctl.signal : undefined, cache: "no-store", referrerPolicy: "no-referrer"
    }).then(function (r) { if (t) clearTimeout(t); if (!r.ok) throw new Error("http " + r.status); return r.json(); }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  function link(href, txt, cls) { var a = el("a", cls || "", txt); a.href = href; return a; }

  function maiuscola(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  /* testa + cartellino: ente, nome dell'oggetto, modello; il cartellino richiama l'etichetta (codice grande, stato, quanti ce ne sono, link all'elenco) */
  function scheda(d, ind) {
    var testa = el("header", "inv-testa");
    if (d.inventario) testa.appendChild(el("p", "inv-ente", d.inventario));
    testa.appendChild(el("h1", "inv-titolo", d.singolare + " n. " + d.numero));
    if (d.modello) testa.appendChild(el("p", "inv-modello", d.modello));
    var c = el("section", "inv-cartellino"); c.setAttribute("aria-label", "Etichetta");
    var r1 = el("div", "inv-riga1"); r1.appendChild(el("span", "inv-codice", d.codice));
    if (d.stato) r1.appendChild(el("span", "stato " + d.stato, STATI[d.stato]));
    c.appendChild(r1);
    var q = el("p", "inv-quanti"); q.appendChild(el("span", "num", frase(d.totale, d.singolare, d.plurale)));
    q.appendChild(link("/i/" + encodeURIComponent(ind.slug), "Elenco completo")); c.appendChild(q);
    document.title = d.singolare + " n. " + d.numero + " · " + (d.inventario || "Inventario");
    return [testa, c];
  }
  function elenco(d, ind) {
    var testa = el("header", "inv-testa");
    testa.appendChild(el("p", "inv-ente", "Inventario"));
    testa.appendChild(el("h1", "inv-titolo", d.inventario || "Inventario"));
    var nodi = [testa];
    document.title = (d.inventario || "Inventario") + " · elenco";
    if (!d.tipi.length) nodi.push(el("p", "inv-modello", "Ancora niente in elenco."));
    d.tipi.forEach(function (t) {
      var s = el("section", "inv-carta inv-tipo"), th = el("div", "inv-tipo-testa");
      th.appendChild(el("h2", "inv-tipo-titolo", maiuscola(t.plurale))); th.appendChild(el("span", "inv-tipo-conto", t.totale + " · " + t.prefisso)); s.appendChild(th);
      var ul = el("ul", "inv-lista");
      t.articoli.forEach(function (a) {
        var li = el("li", "inv-voce");
        li.appendChild(link("/i/" + encodeURIComponent(ind.slug) + "/" + encodeURIComponent(a.codice), a.codice, "inv-voce-codice"));
        li.appendChild(el("span", "inv-voce-modello", a.modello));
        if (a.stato) li.appendChild(el("span", "stato piccolo " + a.stato, STATI[a.stato]));
        ul.appendChild(li);
      });
      s.appendChild(ul); nodi.push(s);
    });
    return nodi;
  }

  /* ---- pannello riservato (membri) ---- */
  function campo(etichetta, input, cls) {
    var w = el("div", "inv-campo" + (cls ? " " + cls : "")), l = el("label"); input.id = "inv-" + etichetta.replace(/\W+/g, "").toLowerCase(); l.setAttribute("for", input.id);
    if (/ \*$/.test(etichetta)) { l.appendChild(document.createTextNode(etichetta.slice(0, -2) + " ")); l.appendChild(el("i", "", "*")); } else l.textContent = etichetta;
    w.appendChild(l); w.appendChild(input); return w;
  }
  /* l'errore sta sul campo (bordo + messaggio sotto, legato con aria-describedby), non in fondo alla pagina */
  function togliErrore(w, input) {
    w.classList.remove("errore"); input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby");
    var p = w.querySelector(".inv-aiuto.msg"); if (p) w.removeChild(p);
  }
  function segnalaErrore(w, input, msg) {
    togliErrore(w, input); w.classList.add("errore"); input.setAttribute("aria-invalid", "true");
    var p = el("p", "inv-aiuto msg", msg); p.id = input.id + "-err"; w.appendChild(p); input.setAttribute("aria-describedby", p.id);
    input.addEventListener("input", function pulisci() { togliErrore(w, input); input.removeEventListener("input", pulisci); });
  }
  function pannello(app, cfg, ind, m, client, rigenera, scheda) {
    var c = el("section", "inv-segr inv-riservato"); c.setAttribute("aria-label", "Riservato alla segreteria");
    var titolo = el("h2", "inv-sez", "Segreteria"); titolo.appendChild(el("small", "", "visibile solo a chi è abilitato")); c.appendChild(titolo);
    var vaElenco = linkAreaElenco(ind.slug);
    if (vaElenco) { var tutto = link(vaElenco, "Tutto l’inventario", "btn pieno grande inv-tutto"); tutto.id = "inv-tutto"; c.appendChild(tutto); }
    var blocco = el("div", "inv-blocco"), chi = el("div", "inv-chi");
    /* chi ce l'ha: il nome grande, sotto corso e data, poi note/accessori */
    var x = m.assegnato_a ? (MOD ? MOD.daAssegnato(m.assegnato_a) : { nome: m.assegnato_a, cognome: "", corso: "" }) : null;
    if (x) {
      chi.appendChild(el("p", "inv-chiave", "Ce l’ha"));
      chi.appendChild(el("p", "inv-nome", [x.nome, x.cognome].filter(Boolean).join(" ")));
      var det = [x.corso, m.data_consegna ? "dal " + gmA(m.data_consegna) : ""].filter(Boolean).join(" · ");
      if (det) chi.appendChild(el("p", "inv-dett num", det));
    } else {
      chi.appendChild(el("p", "inv-vuoto", m.stato === "in_sede" ? "In sede, non assegnato" : "Non assegnato"));
      if (m.data_rientro) chi.appendChild(el("p", "inv-dett num", "Rientrato il " + gmA(m.data_rientro)));
    }
    if (m.note) chi.appendChild(el("p", "inv-dett", m.note));
    if (m.stato === "in_riparazione") chi.appendChild(el("p", "inv-nota", "In riparazione: quando è sistemato, rimettilo «In sede» dall'area Inventario di stageplot.it."));
    var esito = el("p", "inv-esito"); esito.setAttribute("role", "status");
    var area = el("div", "inv-azione");
    var bott = el("div", "inv-azioni");
    /* il form prende il posto del blocco «chi + azioni» (non si aggiunge sotto) */
    function formAperto(on) { chi.hidden = on; bott.hidden = on; }
    function chiudiForm() { while (area.firstChild) area.removeChild(area.firstChild); esito.textContent = ""; formAperto(false); }
    function vai(tipo, aChi, d, nota, btn) {
      btn.disabled = true; esito.textContent = "";
      client.rpc("inv_movimento", { p_slug: ind.slug, p_codice: ind.codice, p_tipo: tipo, p_a_chi: aChi, p_data: d || null, p_nota: nota }).then(function (r) {
        if (r.error) throw r.error; var o = r.data;
        if (!o || !o.ok) { esito.textContent = erroreMov(o); btn.disabled = false; return; }
        rigenera();
      }, function () { esito.textContent = "Non riesco a collegarmi: riprova."; btn.disabled = false; });
    }
    function azioniForm(ok) {
      var no = el("button", "btn testo", "Annulla"); no.type = "button"; no.addEventListener("click", chiudiForm);
      var r = el("div", "inv-azioni"); r.appendChild(ok); r.appendChild(no); return r;
    }
    function testaForm(testo, codice) { var t = el("div", "inv-form-testa"); t.appendChild(el("b", "", testo)); if (codice) t.appendChild(el("span", "", codice)); return t; }
    function modulo(tipo, titolo, conNome, conferma) {
      while (area.firstChild) area.removeChild(area.firstChild); esito.textContent = ""; formAperto(true);
      var nome = el("input"); nome.type = "text"; nome.maxLength = 120; nome.placeholder = "es. Mario Rossi, 2B pianoforte"; nome.autocomplete = "off";
      var d = el("input"); d.type = "date"; d.value = oggiIso();
      var nota = el("input"); nota.type = "text"; nota.maxLength = 500; nota.placeholder = "facoltativa";
      var ok = el("button", "btn primario grande pieno", conferma); ok.type = "button";
      area.appendChild(testaForm(titolo, ind.codice));
      var g = el("div", "inv-griglia"), wn = null;
      if (conNome) { wn = campo("Nome e classe/corso", nome, "tutta"); g.appendChild(wn); }
      g.appendChild(campo("Data", d)); g.appendChild(campo("Nota", nota)); area.appendChild(g);
      if (conNome) area.appendChild(el("p", "inv-nota", "Solo nome e corso/classe: mai indirizzi o telefoni."));
      area.appendChild(azioniForm(ok));
      ok.addEventListener("click", function () {
        if (conNome && !nome.value.trim()) { segnalaErrore(wn, nome, "Scrivi a chi lo consegni."); nome.focus(); return; }
        vai(tipo, conNome ? nome.value.trim() : "", d.value, nota.value.trim(), ok);
      });
      if (conNome) nome.focus();
    }
    /* consegna: 6 campi → inv_movimento come prima (assegnato_a = «Nome Cognome, Corso», nota = «Accessori: …») → carta «Modulo di comodato» */
    function apriModulo(form, fineEtichetta) {
      if (!MOD) return rigenera();
      while (area.firstChild) area.removeChild(area.firstChild); esito.textContent = ""; formAperto(true);
      area.appendChild(MOD.cartaModulo({ scheda: scheda, membro: m, modulo: m.modulo, form: form, fineEtichetta: fineEtichetta === "Chiudi" ? "Chiudi" : "Fine", fine: function () {
        if (fineEtichetta === "Chiudi") chiudiForm(); else rigenera();
      } }));
      var cm = document.getElementById("inv-modulo"); if (cm && cm.scrollIntoView) cm.scrollIntoView({ block: "start" });
    }
    /* la ristampa: i dati si ricostruiscono da ciò che c'è già (assegnato_a, data di consegna, nota dell'ultima consegna) */
    function riStampa() {
      var x = MOD.daAssegnato(m.assegnato_a), ult = m.movimenti.filter(function (v) { return v.tipo === "consegna"; })[0];
      return { nome: x.nome, cognome: x.cognome, corso: x.corso, accessori: ult ? MOD.leggiAccessori(ult.nota) : "", data: m.data_consegna || oggiIso() };
    }
    function consegna() {
      while (area.firstChild) area.removeChild(area.firstChild); esito.textContent = ""; formAperto(true);
      var f = { nome: el("input"), cognome: el("input"), corso: el("input"), acc: el("input"), data: el("input"), nota: el("input") };
      [["nome", 60, ""], ["cognome", 60, ""], ["corso", 100, "es. pianoforte, 2B"], ["acc", 200, "alimentatore, custodia, bacchette, cavalletto…"], ["nota", 300, "facoltativa"]].forEach(function (k) { var i = f[k[0]]; i.type = "text"; i.maxLength = k[1]; i.placeholder = k[2]; i.autocomplete = "off"; });
      f.data.type = "date"; f.data.value = oggiIso();
      var ok = el("button", "btn primario grande pieno", "Conferma consegna"); ok.type = "button"; ok.id = "inv-conferma";
      area.appendChild(testaForm("Consegna", ind.codice));
      var wNome = campo("Nome *", f.nome), wCogn = campo("Cognome *", f.cognome), g = el("div", "inv-griglia");
      g.appendChild(wNome); g.appendChild(wCogn); g.appendChild(campo("Corso / classe", f.corso)); g.appendChild(campo("Data", f.data)); g.appendChild(campo("Accessori consegnati", f.acc, "tutta"));
      area.appendChild(g);
      var det = el("details", "inv-nota-in-piu"); det.appendChild(el("summary", "", "Aggiungi una nota")); det.appendChild(campo("Nota", f.nota)); area.appendChild(det);
      area.appendChild(el("p", "inv-nota", "Solo nome e corso/classe: mai indirizzi o telefoni."));
      area.appendChild(azioniForm(ok));
      ok.addEventListener("click", function () {
        var manca = null;
        if (!f.nome.value.trim()) { segnalaErrore(wNome, f.nome, "Scrivi il nome."); manca = manca || f.nome; }
        if (!f.cognome.value.trim()) { segnalaErrore(wCogn, f.cognome, "Scrivi il cognome."); manca = manca || f.cognome; }
        if (manca) { manca.focus(); return; }
        var aChi = MOD.componiAssegnato(f.nome.value, f.cognome.value, f.corso.value), nota = MOD.notaConsegna(f.acc.value, f.nota.value);
        ok.disabled = true; esito.textContent = "";
        client.rpc("inv_movimento", { p_slug: ind.slug, p_codice: ind.codice, p_tipo: "consegna", p_a_chi: aChi, p_data: f.data.value || null, p_nota: nota }).then(function (res) {
          if (res.error) throw res.error; var o = res.data;
          if (!o || !o.ok) { esito.textContent = erroreMov(o); ok.disabled = false; return; }
          apriModulo({ nome: f.nome.value, cognome: f.cognome.value, corso: f.corso.value, accessori: f.acc.value, data: f.data.value || oggiIso() }, "Fine");
        }, function () { esito.textContent = "Non riesco a collegarmi: riprova."; ok.disabled = false; });
      });
      f.nome.focus();
    }
    /* azioni: un primario pieno, poi (se assegnato) il modulo a contorno, poi Rotto | Smarrito affiancati */
    function b(txt, f, cls, dove) { var y = el("button", "btn " + (cls || ""), txt); y.type = "button"; y.addEventListener("click", f); (dove || bott).appendChild(y); return y; }
    var coppia = el("div", "coppia");
    if (m.assegnato_a) {
      b("Rientrato", function () { modulo("rientro", "Rientro di " + m.assegnato_a, false, "Conferma rientro"); }, "primario grande pieno");
      if (MOD) b("Modulo di comodato", function () { apriModulo(riStampa(), "Chiudi"); }, "pieno").id = "inv-btn-modulo";
    } else if (m.stato !== "dismesso" && m.stato !== "smarrito" && m.stato !== "in_riparazione") b("Consegna a…", function () { consegna(); }, "primario grande pieno");
    if (m.stato !== "in_riparazione" && m.stato !== "dismesso" && m.stato !== "smarrito") b("Rotto", function () { modulo("rottura", "Segna come rotto", false, "Conferma"); }, "", coppia);
    if (m.stato !== "smarrito" && m.stato !== "dismesso") b("Smarrito", function () { modulo("smarrimento", "Segna come smarrito", false, "Conferma"); }, "", coppia);
    if (coppia.childNodes.length === 1) coppia.firstChild.classList.add("pieno");
    if (coppia.childNodes.length) { if (coppia.childNodes.length === 1) bott.appendChild(coppia.firstChild); else bott.appendChild(coppia); }
    blocco.appendChild(chi); blocco.appendChild(bott); blocco.appendChild(area); blocco.appendChild(esito); c.appendChild(blocco);
    if (m.movimenti.length) {
      c.appendChild(el("h2", "inv-sez inv-storico-t", "Storico"));
      var ul = el("ol", "inv-storico");
      m.movimenti.forEach(function (v) {
        var li = el("li", "inv-mov"); li.appendChild(el("span", "inv-mov-quando", v.data ? gmA(v.data) : ""));
        li.appendChild(el("span", "inv-mov-punto" + (v.tipo === "consegna" ? " pieno" : "")));
        var cosa = el("p", "inv-mov-cosa", MOV[v.tipo]), parti = [v.a_chi, v.nota].filter(Boolean).join(" · "); if (parti) cosa.appendChild(el("span", "", parti));
        li.appendChild(cosa); ul.appendChild(li);
      });
      c.appendChild(ul);
    }
    return c;
  }
  /* accesso segreteria: carica il client solo se c'è una sessione salvata (chi scansiona dal pubblico non scarica nulla in più) */
  function areaSegreteria(cfg, ind, contenitore, rigenera) {  /* ind.scheda = la scheda pubblica (serve al modulo: strumento e modello) */
    var inserisci = function (n) { while (contenitore.firstChild) contenitore.removeChild(contenitore.firstChild); if (n) contenitore.appendChild(n); };
    if (!ACC) return;
    var salvata = false; try { salvata = ACC.sessioneSalvata(root.localStorage, cfg.api); } catch (e) {}
    if (!salvata) {
      var b = el("button", "inv-accesso", "Accesso segreteria"); b.type = "button";
      b.addEventListener("click", function () { ACC.accedi(cfg, location.pathname + location.search).catch(function () { b.textContent = "Accesso non riuscito: riprova"; }); });
      inserisci(b); return;
    }
    ACC.sessione(cfg).then(function (s) {
      if (!s.sessione) return inserisci(null);
      return ACC.cliente(cfg).then(function (client) {
        return client.rpc("inv_scheda_membro", { p_slug: ind.slug, p_codice: ind.codice }).then(function (r) {
          if (r.error) throw r.error;
          var m = pulisciMembro(r.data);
          if (!m) { var p = el("p", "inv-nota", "Accesso come " + testo((s.sessione.user || {}).email, 120) + ": non abilitato per questo inventario."); return inserisci(p); }
          inserisci(pannello(null, cfg, ind, m, client, rigenera, ind.scheda));
        });
      });
    }).then(null, function () { inserisci(el("p", "inv-nota", "Accesso segreteria non disponibile ora.")); });
  }

  function avvia() {
    var app = document.getElementById("inv-app"); if (!app) return;
    var ind = root.INVIndirizzo.daIndirizzo(location.pathname, location.search);
    if (!ind) return messaggio(app, "Indirizzo non valido", "Questo QR non è completo. Prova a scansionarlo di nuovo, da vicino e con buona luce.");
    var cfg = configura(location.hostname, location.search);
    var riprova = function () { mostra(app, [el("p", "inv-carico", "Un momento…")]); giro(); };
    function giro() {
      if (ind.codice === null) {
        return rpcPubblica(cfg, "inv_elenco_pubblico", { p_slug: ind.slug }).then(function (r) {
          var d = pulisciElenco(r); if (!d) return messaggio(app, "Non lo trovo", "Questo inventario non esiste oppure non è consultabile.");
          mostra(app, elenco(d, ind).concat([piede()]));
        }, function () { messaggio(app, "Non riesco a collegarmi", "Controlla la connessione e riprova.", riprova); });
      }
      return rpcPubblica(cfg, "inv_articolo_pubblico", { p_slug: ind.slug, p_codice: ind.codice }).then(function (r) {
        var d = pulisci(r); if (!d) return messaggio(app, "Non lo trovo", "Questo codice non risulta in inventario, oppure l’inventario non è consultabile.");
        var seg = el("div", "inv-segreteria"), nodi = scheda(d, ind);
        nodi.push(seg); nodi.push(piede()); mostra(app, nodi);
        areaSegreteria(cfg, { slug: ind.slug, codice: ind.codice, scheda: d }, seg, riprova);
      }, function () { messaggio(app, "Non riesco a collegarmi", "Controlla la connessione e riprova.", riprova); });
    }
    giro();
  }
  function piede() { var p = el("p", "inv-piede", "Inventario gestito con "); p.appendChild(link("/", "stageplot.it")); return p; }
  var P = { configura: configura, pulisci: pulisci, pulisciElenco: pulisciElenco, pulisciMembro: pulisciMembro, frase: frase, erroreMov: erroreMov, linkAreaElenco: linkAreaElenco, oggiIso: oggiIso, gmA: gmA, STATI: STATI, MOV: MOV };
  root.INVPubblica = P;
  if (typeof module === "object" && module && module.exports) module.exports = P;
  else if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia); else avvia(); }
})(typeof globalThis !== "undefined" ? globalThis : this);
