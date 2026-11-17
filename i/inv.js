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
  var MOD = root.INVModulo || (typeof require === "function" ? require("./inv-modulo.js") : null);
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
    if (riprova) { var b = el("button", "inv-btn", "Riprova"); b.type = "button"; b.addEventListener("click", riprova); c.appendChild(b); }
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

  function scheda(d, ind) {
    var c = el("section", "inv-carta");
    if (d.inventario) c.appendChild(el("p", "inv-sopra", d.inventario));
    c.appendChild(el("h1", "inv-titolo", d.singolare + " n. " + d.numero));
    c.appendChild(el("p", "inv-codice", d.codice));
    if (d.modello) c.appendChild(el("p", "inv-modello", d.modello));
    c.appendChild(el("p", "inv-quanti", frase(d.totale, d.singolare, d.plurale)));
    if (d.stato) c.appendChild(el("span", "inv-stato " + d.stato, STATI[d.stato]));
    document.title = d.singolare + " n. " + d.numero + " · " + (d.inventario || "Inventario");
    return c;
  }
  function elenco(d, ind) {
    var nodi = [el("header", "inv-testa")];
    nodi[0].appendChild(el("p", "inv-sopra", "Inventario"));
    nodi[0].appendChild(el("h1", "inv-titolo", d.inventario || "Inventario"));
    document.title = (d.inventario || "Inventario") + " · elenco";
    if (!d.tipi.length) nodi.push(el("p", "inv-quanti", "Ancora niente in elenco."));
    d.tipi.forEach(function (t) {
      var s = el("section", "inv-carta inv-tipo");
      s.appendChild(el("h2", "inv-tipo-titolo", t.singolare + " · " + t.prefisso));
      s.appendChild(el("p", "inv-quanti", frase(t.totale, t.singolare, t.plurale)));
      var ul = el("ul", "inv-lista");
      t.articoli.forEach(function (a) {
        var li = el("li", "inv-voce");
        li.appendChild(link("/i/" + encodeURIComponent(ind.slug) + "/" + encodeURIComponent(a.codice), a.codice, "inv-voce-codice"));
        li.appendChild(el("span", "inv-voce-modello", a.modello));
        if (a.stato) li.appendChild(el("span", "inv-voce-stato " + a.stato, STATI[a.stato]));
        ul.appendChild(li);
      });
      s.appendChild(ul); nodi.push(s);
    });
    return nodi;
  }

  /* ---- pannello riservato (membri) ---- */
  function campo(etichetta, input) { var w = el("div", "inv-campo"), l = el("label", "", etichetta); input.id = "inv-" + etichetta.replace(/\W+/g, "").toLowerCase(); l.setAttribute("for", input.id); w.appendChild(l); w.appendChild(input); return w; }
  function pannello(app, cfg, ind, m, client, rigenera, scheda) {
    var c = el("section", "inv-carta inv-riservato");
    c.appendChild(el("p", "inv-sopra", "Riservato alla segreteria"));
    var vaElenco = linkAreaElenco(ind.slug);
    if (vaElenco) { var tutto = link(vaElenco, "Tutto l’inventario", "inv-btn primario inv-tutto"); tutto.id = "inv-tutto"; c.appendChild(tutto); }
    var riga = function (k, v) { var r = el("p", "inv-riga"); r.appendChild(el("span", "inv-chiave", k)); r.appendChild(el("span", "inv-valore", v)); return r; };
    c.appendChild(riga("Assegnato a", m.assegnato_a || "— nessuno —"));
    if (m.data_consegna) c.appendChild(riga("Consegna", gmA(m.data_consegna)));
    if (m.data_rientro) c.appendChild(riga("Rientro", gmA(m.data_rientro)));
    if (m.note) c.appendChild(riga("Note", m.note));
    var esito = el("p", "inv-esito"); esito.setAttribute("role", "status");
    var area = el("div", "inv-azione");
    function vai(tipo, aChi, d, nota, btn) {
      btn.disabled = true; esito.textContent = "";
      client.rpc("inv_movimento", { p_slug: ind.slug, p_codice: ind.codice, p_tipo: tipo, p_a_chi: aChi, p_data: d || null, p_nota: nota }).then(function (r) {
        if (r.error) throw r.error; var o = r.data;
        if (!o || !o.ok) { esito.textContent = erroreMov(o); btn.disabled = false; return; }
        rigenera();
      }, function () { esito.textContent = "Non riesco a collegarmi: riprova."; btn.disabled = false; });
    }
    function modulo(tipo, titolo, conNome, conferma) {
      while (area.firstChild) area.removeChild(area.firstChild);
      var nome = el("input"); nome.type = "text"; nome.maxLength = 120; nome.placeholder = "es. Mario Rossi, 2B pianoforte"; nome.autocomplete = "off";
      var d = el("input"); d.type = "date"; d.value = oggiIso();
      var nota = el("input"); nota.type = "text"; nota.maxLength = 500; nota.placeholder = "facoltativa";
      var ok = el("button", "inv-btn primario", conferma); ok.type = "button";
      var no = el("button", "inv-btn", "Annulla"); no.type = "button"; no.addEventListener("click", function () { while (area.firstChild) area.removeChild(area.firstChild); esito.textContent = ""; });
      area.appendChild(el("p", "inv-azione-titolo", titolo));
      if (conNome) { area.appendChild(campo("Nome e classe/corso", nome)); area.appendChild(el("p", "inv-nota", "Solo nome e corso/classe: mai indirizzi o telefoni.")); }
      area.appendChild(campo("Data", d)); area.appendChild(campo("Nota", nota));
      var r = el("div", "inv-riga-bott"); r.appendChild(ok); r.appendChild(no); area.appendChild(r);
      ok.addEventListener("click", function () {
        if (conNome && !nome.value.trim()) { esito.textContent = "Scrivi a chi lo consegni."; return; }
        vai(tipo, conNome ? nome.value.trim() : "", d.value, nota.value.trim(), ok);
      });
      if (conNome) nome.focus();
    }
    /* consegna: 6 campi → inv_movimento come prima (assegnato_a = «Nome Cognome, Corso», nota = «Accessori: …») → carta «Modulo di comodato» */
    function apriModulo(form, fineEtichetta) {
      if (!MOD) return rigenera();
      while (area.firstChild) area.removeChild(area.firstChild); esito.textContent = ""; bott.hidden = true;
      area.appendChild(MOD.cartaModulo({ scheda: scheda, membro: m, modulo: m.modulo, form: form, fineEtichetta: fineEtichetta === "Chiudi" ? "Chiudi" : "Fine", fine: function () {
        if (fineEtichetta === "Chiudi") { while (area.firstChild) area.removeChild(area.firstChild); bott.hidden = false; } else rigenera();
      } }));
      var cm = document.getElementById("inv-modulo"); if (cm && cm.scrollIntoView) cm.scrollIntoView({ block: "start" });
    }
    /* la ristampa: i dati si ricostruiscono da ciò che c'è già (assegnato_a, data di consegna, nota dell'ultima consegna) */
    function riStampa() {
      var x = MOD.daAssegnato(m.assegnato_a), ult = m.movimenti.filter(function (v) { return v.tipo === "consegna"; })[0];
      return { nome: x.nome, cognome: x.cognome, corso: x.corso, accessori: ult ? MOD.leggiAccessori(ult.nota) : "", data: m.data_consegna || oggiIso() };
    }
    function consegna() {
      while (area.firstChild) area.removeChild(area.firstChild);
      var f = { nome: el("input"), cognome: el("input"), corso: el("input"), acc: el("input"), data: el("input"), nota: el("input") };
      [["nome", 60, ""], ["cognome", 60, ""], ["corso", 100, "es. pianoforte, 2B"], ["acc", 200, "alimentatore, custodia, bacchette, cavalletto…"], ["nota", 300, "facoltativa"]].forEach(function (k) { var i = f[k[0]]; i.type = "text"; i.maxLength = k[1]; i.placeholder = k[2]; i.autocomplete = "off"; });
      f.data.type = "date"; f.data.value = oggiIso();
      var ok = el("button", "inv-btn primario", "Conferma consegna"); ok.type = "button"; ok.id = "inv-conferma";
      var no = el("button", "inv-btn", "Annulla"); no.type = "button"; no.addEventListener("click", function () { while (area.firstChild) area.removeChild(area.firstChild); esito.textContent = ""; });
      area.appendChild(el("p", "inv-azione-titolo", "Consegna"));
      area.appendChild(campo("Nome *", f.nome)); area.appendChild(campo("Cognome *", f.cognome)); area.appendChild(campo("Corso / classe", f.corso));
      area.appendChild(el("p", "inv-nota", "Solo nome e corso/classe: mai indirizzi o telefoni."));
      area.appendChild(campo("Accessori consegnati", f.acc)); area.appendChild(campo("Data", f.data)); area.appendChild(campo("Nota", f.nota));
      var r = el("div", "inv-riga-bott"); r.appendChild(ok); r.appendChild(no); area.appendChild(r);
      ok.addEventListener("click", function () {
        if (!f.nome.value.trim() || !f.cognome.value.trim()) { esito.textContent = "Scrivi nome e cognome di chi prende lo strumento."; return; }
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
    var bott = el("div", "inv-riga-bott");
    function b(txt, f, cls) { var x = el("button", "inv-btn " + (cls || ""), txt); x.type = "button"; x.addEventListener("click", f); bott.appendChild(x); return x; }
    if (m.assegnato_a) {
      b("Rientrato", function () { modulo("rientro", "Rientro di " + m.assegnato_a, false, "Conferma rientro"); }, "primario");
      if (MOD) b("Modulo di comodato", function () { apriModulo(riStampa(), "Chiudi"); }).id = "inv-btn-modulo";
    } else if (m.stato !== "dismesso" && m.stato !== "smarrito" && m.stato !== "in_riparazione") b("Consegna a…", function () { consegna(); }, "primario");
    if (m.stato !== "in_riparazione" && m.stato !== "dismesso" && m.stato !== "smarrito") b("Rotto", function () { modulo("rottura", "Segna come rotto", false, "Conferma"); });
    if (m.stato !== "smarrito" && m.stato !== "dismesso") b("Smarrito", function () { modulo("smarrimento", "Segna come smarrito", false, "Conferma"); });
    c.appendChild(bott);
    if (m.stato === "in_riparazione") c.appendChild(el("p", "inv-nota", "In riparazione: quando è sistemato, rimettilo «In sede» dall'area Inventario di stageplot.it."));
    c.appendChild(area); c.appendChild(esito);
    if (m.movimenti.length) {
      c.appendChild(el("p", "inv-sopra inv-storico-t", "Storico"));
      var ul = el("ul", "inv-storico");
      m.movimenti.forEach(function (x) {
        var li = el("li", "inv-mov"); li.appendChild(el("b", "", MOV[x.tipo] + (x.data ? " · " + gmA(x.data) : "")));
        var parti = [x.a_chi, x.nota].filter(Boolean).join(" — "); if (parti) li.appendChild(el("span", "", parti));
        ul.appendChild(li);
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
      var b = el("button", "inv-btn piccolo", "Accesso segreteria"); b.type = "button";
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
        var seg = el("div", "inv-segreteria"), nodi = [scheda(d, ind)];
        var altro = el("p", "inv-piede"); altro.appendChild(link("/i/" + encodeURIComponent(ind.slug), "Tutto l’elenco")); nodi.push(altro);
        nodi.push(seg); nodi.push(piede()); mostra(app, nodi);
        areaSegreteria(cfg, { slug: ind.slug, codice: ind.codice, scheda: d }, seg, riprova);
      }, function () { messaggio(app, "Non riesco a collegarmi", "Controlla la connessione e riprova.", riprova); });
    }
    giro();
  }
  function piede() { return el("p", "inv-piede", "Inventario su stageplot.it"); }
  var P = { configura: configura, pulisci: pulisci, pulisciElenco: pulisciElenco, pulisciMembro: pulisciMembro, frase: frase, erroreMov: erroreMov, linkAreaElenco: linkAreaElenco, oggiIso: oggiIso, gmA: gmA, STATI: STATI, MOV: MOV };
  root.INVPubblica = P;
  if (typeof module === "object" && module && module.exports) module.exports = P;
  else if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia); else avvia(); }
})(typeof globalThis !== "undefined" ? globalThis : this);
