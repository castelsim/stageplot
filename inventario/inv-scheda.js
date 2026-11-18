/* Inventario — i due dialoghi della tabella dell'area (/inventario/), 18/11/2026.
   1) SCHEDA DEL CAMBIO DI STATO: scegliere un altro stato dal menu della riga NON lo cambia: apre la scheda dello strumento con i campi giusti
      (consegna, rientro, rotto, smarrito, rimesso in sede, dismesso). Lo stato cambia solo con «Conferma». Le regole e i testi sono quelli del telefono
      (/i/inv.js: pianoCambioStato, erroreMov) e il server è lo stesso: la funzione inv_movimento (security definer, storico). Nessuna migrazione.
   2) POPUP «ELIMINA»: dialogo di conferma (non window.confirm) con il codice, ciò che si perde e «Annulla» / «Elimina»; il focus parte su «Annulla».
   Si disegna SOLO con createElement/textContent (mai innerHTML). La parte pura (testi) la prova Node. */
(function (root) {
  "use strict";
  var GUARDIA_MS = 600;   // dopo l'apertura i clic su «Elimina» e sul velo non contano (doppio clic dalla riga)

  /* ---- parte pura: i testi del popup «Elimina», onesti su cosa succede davvero (DELETE sulla riga; lo storico cade a cascata; il numero non si riusa) ---- */
  function testoElimina(a, tipo) {
    var righe = [
      "Si cancella davvero, per sempre: la scheda, la nota riservata e tutto lo storico dei movimenti (consegne, rientri, rotture). Non c'è un cestino e non si può annullare.",
      "Il numero " + a.codice + " non verrà riusato. Se l'etichetta è già attaccata, il QR non porterà più a niente."
    ];
    var chi = typeof a.assegnato_a === "string" ? a.assegnato_a.trim() : "";
    return {
      titolo: "Eliminare " + a.codice + "?",
      oggetto: [tipo || "", a.modello || ""].filter(Boolean).join(" · "),
      righe: righe,
      avviso: chi ? "Risulta ancora consegnato a " + chi + "." : "",
      suggerimento: "Se non c'è più ma vuoi tenerne traccia, scegli lo stato «Dismesso»: resta nell'elenco."
    };
  }
  /* i campi (e solo quelli) che il server riceve da una scheda di movimento: il tipo decide se serve un nome */
  function argomentiMovimento(slug, codice, tipo, aChi, dataIso, nota) {
    return { p_slug: slug, p_codice: codice, p_tipo: tipo, p_a_chi: tipo === "consegna" ? aChi : "", p_data: dataIso || null, p_nota: nota || "" };
  }

  if (typeof document === "undefined") { root.INVScheda = { testoElimina: testoElimina, argomentiMovimento: argomentiMovimento }; if (typeof module !== "undefined" && module.exports) module.exports = root.INVScheda; return; }

  /* ---- DOM ---- */
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
  var aperto = null;   // un solo dialogo alla volta

  /* velo + finestra: Esc e «×» annullano, Tab resta dentro, il focus torna a chi ha aperto; il velo chiude solo se lo si chiede (e dopo la guardia) */
  function finestra(opz) {
    if (aperto) aperto.chiudi(true);
    var prima = document.activeElement, armato = false, chiuso = false;
    var titolo = h("h2", { class: "sch-titolo", id: "sch-titolo", text: opz.titolo });
    var testa = h("div", { class: "sch-testa" }, [titolo, opz.codice ? h("span", { class: "sch-codice", text: opz.codice }) : null]);
    var corpo = h("div", { class: "sch-corpo" });
    var box = h("div", { class: "scheda " + (opz.classe || ""), role: opz.allerta ? "alertdialog" : "dialog", "aria-modal": "true", "aria-labelledby": "sch-titolo", id: opz.id || "scheda" }, [testa, corpo]);
    var velo = h("div", { class: "sch-velo" }, [box]);
    var w = { box: box, corpo: corpo, velo: velo, titolo: titolo, codice: testa.lastChild, armato: function () { return armato; } };
    w.chiudi = function (senzaFocus) {
      if (chiuso) return; chiuso = true; document.removeEventListener("keydown", tasti, true); clearTimeout(t);
      if (velo.parentNode) velo.parentNode.removeChild(velo); document.documentElement.classList.remove("sch-aperta"); aperto = null;
      if (!senzaFocus && prima && prima.focus && document.body.contains(prima)) try { prima.focus(); } catch (e) {}
    };
    function annulla() { if (chiuso) return; w.chiudi(); if (opz.annulla) opz.annulla(); }
    w.annulla = annulla;
    function tasti(ev) {
      if (ev.key === "Escape") { ev.stopPropagation(); ev.preventDefault(); annulla(); return; }
      if (ev.key !== "Tab") return;
      var f = Array.prototype.filter.call(box.querySelectorAll("button,input,select,textarea,a[href],summary"), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return; var primo = f[0], ultimo = f[f.length - 1];
      if (!box.contains(document.activeElement)) { ev.preventDefault(); primo.focus(); }
      else if (ev.shiftKey && document.activeElement === primo) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primo.focus(); }
    }
    document.addEventListener("keydown", tasti, true);
    velo.addEventListener("mousedown", function (ev) { if (ev.target === velo && opz.veloChiude && armato) annulla(); });
    var t = setTimeout(function () { armato = true; if (opz.armato) opz.armato(); }, GUARDIA_MS);
    document.documentElement.classList.add("sch-aperta"); document.body.appendChild(velo);
    aperto = w; return w;
  }
  function azioni(nodi) { return h("div", { class: "sch-azioni" }, nodi); }

  /* ---- 2) popup «Elimina» ---- */
  function elimina(ctx, a) {
    var tipo = ctx.nomeTipo(a.tipo), T = testoElimina(a, tipo ? tipo.singolare : a.tipo), inCorso = false;
    var no = h("button", { class: "btn", type: "button", id: "sch-annulla", text: "Annulla" }), si = h("button", { class: "btn elimina-ok", type: "button", id: "sch-elimina", text: "Elimina", disabled: true });
    var esito = h("p", { class: "sch-esito", role: "status" });
    var w = finestra({ titolo: T.titolo, codice: "", allerta: true, veloChiude: true, id: "popup-elimina", classe: "sch-piccola", armato: function () { si.disabled = false; } });
    w.corpo.appendChild(h("p", { class: "sch-oggetto", text: T.oggetto || a.codice }));
    T.righe.forEach(function (r) { w.corpo.appendChild(h("p", { class: "sch-testo", text: r })); });
    if (T.avviso) w.corpo.appendChild(h("p", { class: "sch-testo sch-avviso", text: T.avviso }));
    w.corpo.appendChild(h("p", { class: "sch-nota", text: T.suggerimento })); w.corpo.appendChild(esito); w.corpo.appendChild(azioni([no, si]));
    no.addEventListener("click", function () { w.annulla(); });
    si.addEventListener("click", function () {
      if (!w.armato() || inCorso) return; inCorso = true; si.disabled = true; no.disabled = true; esito.textContent = "";
      ctx.c.from("inv_articoli").delete().eq("id", a.id).select("id").then(function (r) {
        if (r.error || !r.data || r.data.length !== 1) { esito.textContent = "Non eliminato: " + (r.error ? "riprova fra poco." : "non risulti il proprietario di questo inventario."); inCorso = false; si.disabled = false; no.disabled = false; return; }
        w.chiudi(true); ctx.eliminato(a);
      }, function () { esito.textContent = "Non riesco a collegarmi: riprova."; inCorso = false; si.disabled = false; no.disabled = false; });
    });
    no.focus();   // di serie su «Annulla»: Invio non elimina
    return w;
  }

  /* ---- 1) scheda del cambio di stato ---- */
  function cambioStato(ctx, a, nuovo, annullaCb) {
    var PUB = ctx.PUB, MOD = ctx.MOD, P = PUB.pianoCambioStato(a, nuovo);
    if (P.tipo === "nulla") return null;
    var tipo = ctx.nomeTipo(a.tipo), nomeTipo = tipo ? tipo.singolare : a.tipo, S = ctx.S;
    var w = finestra({ titolo: P.titolo, codice: a.codice, id: "scheda-stato", annulla: annullaCb });
    var strum = h("div", { class: "sch-strum" }, [h("span", { class: "sch-oggetto", text: [nomeTipo, a.modello].filter(Boolean).join(" · ") }),
      h("span", { class: "sch-passo" }, [h("span", { class: "stato piccolo " + a.stato, text: ctx.L.statoNome(a.stato) }), h("span", { class: "sch-freccia", text: "→" }), h("span", { class: "stato piccolo " + nuovo, text: ctx.L.statoNome(nuovo) })])]);
    w.corpo.appendChild(strum);
    var esito = h("p", { class: "sch-esito", role: "status" }), inCorso = false;
    var no = h("button", { class: "btn", type: "button", id: "sch-annulla", text: P.tipo === "blocco" ? "Chiudi" : "Annulla" });
    no.addEventListener("click", function () { w.annulla(); });
    if (P.tipo === "blocco") { w.corpo.appendChild(h("p", { class: "sch-testo", id: "sch-blocco", text: P.testo })); w.corpo.appendChild(azioni([no])); no.focus(); return w; }

    var ok = h("button", { class: "btn primario", type: "button", id: "sch-conferma", text: P.conferma });
    var F = {}, griglia = h("div", { class: "inv-griglia" }), wr = {};
    function inp(k, max, ph, tipoInput) { var i = h("input", { type: tipoInput || "text", maxlength: max || null, placeholder: ph || null, autocomplete: "off" }); F[k] = i; return i; }
    if (P.tipo === "consegna") {
      wr.nome = PUB.campo("Nome *", inp("nome", 60)); wr.cognome = PUB.campo("Cognome *", inp("cognome", 60));
      griglia.appendChild(wr.nome); griglia.appendChild(wr.cognome); griglia.appendChild(PUB.campo("Corso / classe", inp("corso", 100, "es. pianoforte 2B")));
      griglia.appendChild(PUB.campo("Data", inp("data", null, null, "date"))); griglia.appendChild(PUB.campo("Accessori consegnati", inp("acc", 200, "alimentatore, custodia…"), "tutta"));
      F.data.value = PUB.oggiIso(); w.corpo.appendChild(griglia);
      w.corpo.appendChild(h("details", { class: "inv-nota-in-piu" }, [h("summary", { text: "Aggiungi una nota" }), PUB.campo("Nota", inp("nota", 300, "facoltativa"))]));
      w.corpo.appendChild(h("p", { class: "sch-nota", text: "Solo nome e corso/classe: mai indirizzi o telefoni." }));
    } else if (P.tipo === "diretto") {
      w.corpo.appendChild(h("p", { class: "sch-testo", text: P.testo }));
    } else {
      griglia.appendChild(PUB.campo("Data", inp("data", null, null, "date"))); griglia.appendChild(PUB.campo("Nota", inp("nota", 500, "facoltativa")));
      F.data.value = PUB.oggiIso(); w.corpo.appendChild(griglia);
    }
    w.corpo.appendChild(esito); w.corpo.appendChild(azioni([ok, no]));

    function riabilita() { inCorso = false; ok.disabled = false; no.disabled = false; }
    function finito() { w.chiudi(true); ctx.fatto(a); }
    function errore(o) { esito.textContent = o && o.errore ? PUB.erroreMov(o) : "Non è andata: riprova."; riabilita(); }
    function offline() { esito.textContent = "Non riesco a collegarmi: riprova."; riabilita(); }
    function aggiornaStato(val) { return S.c.from("inv_articoli").update({ stato: val, aggiornato: new Date().toISOString() }).eq("id", a.id); }

    ok.addEventListener("click", function () {
      if (inCorso) return;
      if (P.tipo === "consegna") {   // gli stessi controlli del telefono
        var manca = null;
        if (!F.nome.value.trim()) { PUB.segnalaErrore(wr.nome, F.nome, "Scrivi il nome."); manca = manca || F.nome; }
        if (!F.cognome.value.trim()) { PUB.segnalaErrore(wr.cognome, F.cognome, "Scrivi il cognome."); manca = manca || F.cognome; }
        if (manca) { manca.focus(); return; }
      }
      inCorso = true; ok.disabled = true; no.disabled = true; esito.textContent = "";
      if (P.tipo === "diretto") { aggiornaStato(nuovo).then(function (r) { if (r.error) { esito.textContent = "Non salvato: riprova."; riabilita(); return; } finito(); }, offline); return; }
      var aChi = "", nota = F.nota ? F.nota.value.trim() : "";
      if (P.tipo === "consegna") { aChi = MOD.componiAssegnato(F.nome.value, F.cognome.value, F.corso.value); nota = MOD.notaConsegna(F.acc.value, F.nota.value); }
      var tipoMov = P.tipo, args = argomentiMovimento(S.inv.slug, a.codice, tipoMov, aChi, F.data.value, nota);
      S.c.rpc("inv_movimento", args).then(function (res) {
        if (res.error) throw res.error; var o = res.data;
        if (!o || !o.ok) { errore(o); return; }
        var dopo = P.poi ? aggiornaStato(P.poi).then(function (r) { if (r.error) ctx.toast("Rientro registrato, ma lo stato non è cambiato: sceglilo di nuovo."); }) : Promise.resolve();
        return dopo.then(function () {
          if (tipoMov === "consegna" && MOD && MOD.cartaModulo) return modulo({ nome: F.nome.value, cognome: F.cognome.value, corso: F.corso.value, accessori: F.acc.value, data: F.data.value || PUB.oggiIso() }, aChi);
          finito();
        });
      }, offline);
    });
    function modulo(form, aChi) {   // la consegna è registrata: come sul telefono, subito il modulo di comodato da stampare o condividere
      ctx.rileggi(a).then(function () { ctx.ridisegna(); }, function () {});
      vuota(w.corpo); w.titolo.textContent = "Consegna registrata"; w.box.classList.add("sch-larga");
      w.corpo.appendChild(MOD.cartaModulo({ scheda: { inventario: S.inv.nome, singolare: nomeTipo, modello: a.modello, codice: a.codice }, membro: { assegnato_a: aChi, data_consegna: form.data }, modulo: S.inv.modulo, form: form, fineEtichetta: "Fine", fine: function () { w.chiudi(true); } }));
      var primo = w.box.querySelector("input"); if (primo) primo.focus();
    }
    var primoCampo = F.nome || F.data; if (primoCampo) primoCampo.focus(); else ok.focus();
    return w;
  }

  root.INVScheda = { cambioStato: cambioStato, elimina: elimina, testoElimina: testoElimina, argomentiMovimento: argomentiMovimento, aperta: function () { return aperto; } };
})(typeof window !== "undefined" ? window : globalThis);
