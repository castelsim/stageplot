/* Biglietteria — locandine e loghi: RIDOTTI NEL BROWSER prima dell'invio (specifica §5): lato lungo 1200 px, WebP o JPEG,
   al massimo 400 KB. Safari, chiesto WebP, può restituire PNG: allora JPEG (RF4). Una foto che il browser non sa aprire
   (HEIC in Chrome) lo dice in parole. Il nome del file è casuale (crypto.getRandomValues), nella cartella dell'account:
   lo spazio bgl-locandine accetta solo quello (0076). Parte pura esportata per i test; parte browser sotto. */
(function (root) {
  "use strict";
  var LATO = 1200, MAX_BYTE = 400 * 1024, QUALITA = [0.85, 0.75, 0.65, 0.55, 0.45];
  var MESSAGGI = {
    non_immagine: "Scegli un'immagine (JPEG, PNG, WebP o una foto del telefono).",
    formato: "Questo browser non riesce ad aprire l'immagine (forse è una foto HEIC dell'iPhone): salvala come JPEG e riprova.",
    troppo_grande: "L'immagine resta troppo pesante anche ridotta: prova con un'altra.",
    carica: "La locandina non si è caricata: controlla la rete e riprova."
  };
  function dimensioniRidotte(w, h, lato) {
    lato = lato || LATO;
    if (!(w > 0) || !(h > 0)) return null;
    var k = Math.min(1, lato / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  function sceltaFormato(tipo) {
    return tipo === "image/webp" ? { tipo: "image/webp", est: "webp" } : (tipo === "image/jpeg" ? { tipo: "image/jpeg", est: "jpg" } : null);
  }
  function tipoAccettato(file) {
    return !!file && (/^image\//.test(file.type || "") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name || ""));
  }
  /* prima WebP alle qualità in ordine, poi JPEG: il primo che il browser fa DAVVERO in quel formato e sta sotto i 400 KB */
  function cercaFormato(toBlob) {
    function prova(tipo, i) {
      if (i >= QUALITA.length) return Promise.resolve(null);
      return Promise.resolve(toBlob(tipo, QUALITA[i])).then(function (b) {
        var f = b && sceltaFormato(b.type);
        if (!f || f.tipo !== tipo) return null;
        if (b.size <= MAX_BYTE) return { blob: b, tipo: f.tipo, est: f.est };
        return prova(tipo, i + 1);
      });
    }
    return prova("image/webp", 0).then(function (r) { return r || prova("image/jpeg", 0); });
  }
  function esadecimale(n, casuale) {
    var a = casuale(new Uint8Array(n)), s = "";
    for (var i = 0; i < n; i++) s += (a[i] < 16 ? "0" : "") + a[i].toString(16);
    return s;
  }
  function nomeFile(uid, hex, est) { return uid + "/" + hex + "." + est; }
  function errore(codice) { var e = new Error(MESSAGGI[codice]); e.codice = codice; return e; }

  /* ---- browser ---- */
  function apri(file) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return conImg(file); });
    }
    return conImg(file);
  }
  function conImg(file) {
    return new Promise(function (ok, no) {
      var u = URL.createObjectURL(file), i = new Image();
      i.onload = function () { URL.revokeObjectURL(u); ok(i); };
      i.onerror = function () { URL.revokeObjectURL(u); no(errore("formato")); };
      i.src = u;
    });
  }
  function riduci(file) {
    if (!tipoAccettato(file)) return Promise.reject(errore("non_immagine"));
    return apri(file).then(function (img) {
      var d = dimensioniRidotte(img.naturalWidth || img.width, img.naturalHeight || img.height);
      if (!d) throw errore("formato");
      var c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
      var g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, d.w, d.h); g.drawImage(img, 0, 0, d.w, d.h);
      if (img.close) { try { img.close(); } catch (e) { /* niente */ } }
      return cercaFormato(function (tipo, q) { return new Promise(function (ok) { c.toBlob(ok, tipo, q); }); }).then(function (r) {
        if (!r) throw errore("troppo_grande");
        return { blob: r.blob, tipo: r.tipo, est: r.est, w: d.w, h: d.h };
      });
    }, function (e) { throw e && e.codice ? e : errore("formato"); });
  }
  /* un giorno (revisione T23): eliminato lo spettacolo, il file sparisce anche dal CDN di Supabase entro un giorno
     senza dipendere dalla Smart CDN; un anno lo lascerebbe raggiungibile dal suo indirizzo (specifica §5) */
  var CACHE = "86400";
  function carica(cfg, uid, ridotta) {
    var path = nomeFile(uid, esadecimale(16, function (a) { return root.crypto.getRandomValues(a); }), ridotta.est);
    return root.BGLAccesso.cliente(cfg).then(function (c) {
      return c.storage.from("bgl-locandine").upload(path, ridotta.blob, { contentType: ridotta.tipo, upsert: false, cacheControl: CACHE });
    }).then(function (r) { return r && !r.error ? { path: path } : { errore: "carica" }; }, function () { return { errore: "carica" }; });
  }
  function togli(cfg, path) {
    if (!path) return Promise.resolve();
    return root.BGLAccesso.cliente(cfg).then(function (c) { return c.storage.from("bgl-locandine").remove([path]); }).then(function () {}, function () {});
  }

  var IMG = { CACHE: CACHE, LATO: LATO, MAX_BYTE: MAX_BYTE, QUALITA: QUALITA, MESSAGGI: MESSAGGI, dimensioniRidotte: dimensioniRidotte,
    sceltaFormato: sceltaFormato, tipoAccettato: tipoAccettato, cercaFormato: cercaFormato, esadecimale: esadecimale,
    nomeFile: nomeFile, riduci: riduci, carica: carica, togli: togli };
  if (root.GST) root.GST.immagine = IMG;
  if (typeof module === "object" && module && module.exports) module.exports = IMG;
})(typeof globalThis !== "undefined" ? globalThis : this);
