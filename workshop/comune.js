/* © 2026 Simone Castellan. Tutti i diritti riservati (vedi LICENSE).
 *
 * Parti comuni delle due pagine del workshop (bacheca dei partecipanti e regia): indirizzo del server,
 * elenchi di argomenti e destinatari, chiamata alle funzioni, numero casuale del telefono.
 * Scritto come modulo semplice: nel browser diventa window.WSComune, in Node (test) si carica con require.
 *
 * Perché un server a parte: le domande stanno in un progetto Supabase dedicato («workshop-domande»), senza
 * alcun legame con gli account o i progetti di StagePlot. Le tabelle non si toccano: la pagina chiama solo
 * funzioni (bacheca, invia_domanda, vota; per la regia regia_elenco e regia_imposta) che controllano
 * lunghezza, doppioni, raffiche e parolacce. La chiave qui sotto è quella PUBBLICA: senza le funzioni non apre nulla.
 * Nessun dato personale: niente nomi, niente email; ogni telefono ha un numero a caso (salvato nel browser)
 * che serve solo a dare un voto per domanda.
 */
(function (radice, fabbrica) {
  if (typeof module === "object" && module.exports) module.exports = fabbrica();
  else radice.WSComune = fabbrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var API = "https://cbsxooaacnwtxnbwwomm.supabase.co/rest/v1/rpc/";
  var CHIAVE = "sb_publishable_rYLH1N9DwmtZ3BgsgmkdJQ_Yeut8W55";
  var SESSIONE_PREDEFINITA = "workshop-audio-2026";

  /* [codice, testo]: i codici sono quelli già salvati nel database, non cambiarli */
  var ARGOMENTI = [
    ["presa-diretta", "Presa diretta"], ["pulizia", "Pulizia e restauro"], ["montaggio", "Montaggio"],
    ["foley", "Effetti e Foley"], ["manipolare", "Manipolare il suono"], ["musica", "Musica per immagini"],
    ["mix", "Mix e volume"], ["programmi", "Programmi"], ["lavoro", "Lavorare nel suono"], ["altro", "Altro"]
  ];
  /* [codice, testo, spiegazione] */
  var PER_CHI = [
    ["simone", "Simone", "tecnica, pulizia, editing"], ["marco", "Marco", "musica, armonia, emozioni"],
    ["entrambi", "Tutti e due", ""], ["non-so", "Non so", ""]
  ];
  var FRASE_PER_CHI = { simone: "per Simone", marco: "per Marco", entrambi: "per tutti e due", "non-so": "" };

  function nomeArgomento(codice) {
    for (var i = 0; i < ARGOMENTI.length; i++) if (ARGOMENTI[i][0] === codice) return ARGOMENTI[i][1];
    return String(codice == null ? "" : codice);
  }
  function frasePerChi(codice) { return Object.prototype.hasOwnProperty.call(FRASE_PER_CHI, codice) ? FRASE_PER_CHI[codice] : ""; }

  /* Una bacheca per workshop: ?s=nome ne apre una diversa. Senza ?s= c'è quella di tutti i giorni del workshop. */
  function sessioneDa(ricerca) {
    var s = "";
    try { s = new URLSearchParams(ricerca || "").get("s") || ""; } catch (e) { s = ""; }
    s = s.trim().slice(0, 60);
    return s || SESSIONE_PREDEFINITA;
  }

  function nuovoNumero(cifratore) {
    if (cifratore && typeof cifratore.randomUUID === "function") return cifratore.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.floor(Math.random() * 16);
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
  }
  /* Il numero del telefono: salvato nel browser se si può, altrimenti vale per questa apertura. */
  function numeroDispositivo(deposito, cifratore) {
    var chiave = "workshop-dispositivo", id = null;
    try { id = deposito && deposito.getItem(chiave); } catch (e) { id = null; }
    if (!id) {
      id = nuovoNumero(cifratore);
      try { if (deposito) deposito.setItem(chiave, id); } catch (e) { /* si vota lo stesso, solo non si ricorda */ }
    }
    return id;
  }

  /* Chiama una funzione del server. Risolve col JSON (o null); rifiuta con un Error dal messaggio leggibile. */
  function chiama(funzione, dati, recupera) {
    var f = recupera || (typeof fetch === "function" ? fetch.bind(self) : null);
    if (!f) return Promise.reject(new Error("Questo browser non può collegarsi. Prova con un altro."));
    return f(API + funzione, {
      method: "POST",
      headers: { apikey: CHIAVE, "Content-Type": "application/json" },
      body: JSON.stringify(dati)
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) throw new Error((j && typeof j.message === "string" && j.message) || "Il servizio non risponde. Riprova tra poco.");
        return j;
      });
    }, function () { throw new Error("Niente rete: controlla la connessione e riprova."); });
  }

  return {
    API: API, CHIAVE: CHIAVE, SESSIONE_PREDEFINITA: SESSIONE_PREDEFINITA,
    ARGOMENTI: ARGOMENTI, PER_CHI: PER_CHI,
    nomeArgomento: nomeArgomento, frasePerChi: frasePerChi, sessioneDa: sessioneDa,
    nuovoNumero: nuovoNumero, numeroDispositivo: numeroDispositivo, chiama: chiama
  };
});
