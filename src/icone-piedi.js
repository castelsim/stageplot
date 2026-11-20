/* ── ICONE «IN PIEDI»: SECONDO FILE, CARICATO PIGRO (19/11/2026, lotto L1 dello split di icons.js) ─────────────────────────────
   Le figure dei musicisti in piedi (ogni art/art2 di POSA_PIEDI) stanno in /icons-piedi.js e in nessun altro file: icons.js scende
   di ~340 KB e cresce solo di ciò che non è «in piedi». Regola verificata da un test: nessuna chiave *Piedi di POSA_PIEDI in icons.js.
   Sul modello di icons-pro.js (src/catalogo-pro.js), ma con una differenza che conta: per i modelli pro c'è un disegno a codice di
   riserva, per le figure in piedi NO (libIconCon dà '' se la chiave manca = niente musicista). Perciò:
   · a SCHERMO, finché il file non c'è, si disegna il solo strumento (postArt dà null): mai la figura seduta, mai la sedia;
   · in USCITA (PDF, PNG, miniatura salvata) l'export ASPETTA il file (20 s) e, se non arriva, SI FERMA con un messaggio chiaro:
     mai un PDF senza il musicista (piediEsportaAttendi + piediControllo, in catena PRIMA di ogni disegno);
   · il cambio di posa (impostaPosa applica lo scarto dc dell'icona) aspetta il file: senza, il busto salterebbe di dc.
   Si carica: all'apertura di un progetto con almeno una figura in piedi · al primo disegno di una figura in piedi · prima di un
   cambio di posa · in quiete dopo l'avvio (non con rete assente o «risparmio dati»). Offline: sw.js lo tiene in PRECACHE. */
var PIEDI_ICONE_URL="/icons-piedi.js", _piediStato=0;   /* 0 da caricare · 1 in arrivo · 2 arrivato · 3 errore (nuovo tentativo solo se lo chiede un export o un clic) */
var PIEDI_ATTESA_EXPORT_MS=20000, PIEDI_ATTESA_POSA_MS=15000, PIEDI_ATTESA_MINIATURA_MS=3000;
var PIEDI_MSG_PDF="Il PDF non è stato creato: le figure in piedi non sono arrivate. Controlla la connessione e riprova.";
var PIEDI_MSG_PNG="Il PNG non è stato creato: le figure in piedi non sono arrivate. Controlla la connessione e riprova.";
var PIEDI_MSG_POSA="Figure in piedi non disponibili: controlla la connessione. Il disegno non è cambiato.";
/* le chiavi che POSA_PIEDI chiede (art e art2 di ogni tipo) */
function piediChiavi(){
  var ks=[]; Object.keys(POSA_PIEDI).forEach(function(t){ var P=POSA_PIEDI[t]; [P.art,P.art2].forEach(function(k){ if(k && ks.indexOf(k)<0) ks.push(k); }); });
  ks.push(TAST_FIG_ART);   /* il tastierista dietro doppia tastiera e Moog (20/11): nello stesso file */
  Object.keys(SGAB_ALTO).forEach(function(t){ var k=SGAB_ALTO[t].art; if(k && ks.indexOf(k)<0) ks.push(k); });   /* le figure su sgabello alto (19/11) stanno nello stesso file */
  return ks;
}
function piediIconaOk(k){ var L=window.LIB_ICONS; return !!(k && L && L[k] && L[k].vb && typeof L[k].body==="string"); }
function piediFilePronto(){ return piediChiavi().every(piediIconaOk); }
/* gli elementi in piedi la cui figura non c'è (ancora) */
function piediMancanti(items){ return (items||[]).filter(function(it){ return (inPiedi(it) && !piediIconaOk(artPiedi(it))) || (tastFig(it) && !piediIconaOk(TAST_FIG_ART)); }); }
function piediCarica(riprova){
  if(_piediStato===1 || _piediStato===2) return false;
  if(_piediStato===3 && !riprova) return false;
  _piediStato=1;
  try{
    var sc=document.createElement("script"); sc.async=true; sc.src=PIEDI_ICONE_URL;
    sc.onload=function(){ _piediStato=piediFilePronto() ? 2 : 3; };   /* arrivato ma senza le figure (file troncato) = errore */
    sc.onerror=function(){ _piediStato=3; try{ if(sc.parentNode) sc.parentNode.removeChild(sc); }catch(e){} };
    (document.head||document.documentElement).appendChild(sc);
  }catch(e){ _piediStato=3; }
  return true;
}
/* il progetto ha figure in piedi e il file non c'è: lo chiede (apertura di un progetto, disegno) */
function piediCaricaSeServe(items){
  if(_piediStato===1 || _piediStato===2) return false;
  if(!(items||[]).some(function(it){ return inPiedi(it) || tastFig(it); }) || piediFilePronto()) return false;
  return piediCarica();
}
/* aspetta che `ok()` diventi vero (di serie: il file c'è) al massimo `ms`; risolve true/false, mai rifiuta. Chiede il file anche dopo un errore. */
function piediAttendi(ms, ok){
  ok=ok||piediFilePronto;
  return new Promise(function(res){
    if(ok()) return res(true);
    piediCarica(true);
    var t0=Date.now(), max=(ms==null ? PIEDI_ATTESA_EXPORT_MS : ms);
    (function giro(){
      if(ok()) return res(true);
      if(_piediStato===3 || (_piediStato===2) || Date.now()-t0>=max) return res(false);   /* errore, o arrivato senza ciò che serve: inutile aspettare */
      setTimeout(giro,40);
    })();
  });
}
/* EXPORT: nessuna figura in piedi mancante → subito, zero richieste; se no aspetta il file e, se non arriva, RIFIUTA con un messaggio (e.piedi=true):
   nessun PDF, nessun PNG. L'avviso «Carico le figure in piedi…» si vede solo se c'è davvero da aspettare. */
function piediEsportaAttendi(ms, msg){
  var mancano=function(){ return piediMancanti((typeof state==="object" && state && state.items) ? state.items : []); };
  if(!mancano().length) return Promise.resolve(true);
  try{ if(typeof showToast==="function") showToast("Carico le figure in piedi…"); }catch(e){}
  return piediAttendi(ms==null ? PIEDI_ATTESA_EXPORT_MS : ms, function(){ return !mancano().length; }).then(function(ok){
    if(!ok || mancano().length){ var e=new Error(msg||PIEDI_MSG_PDF); e.piedi=true; throw e; }
    return true;
  });
}
/* cintura e bretelle: subito prima di disegnare, ogni figura in piedi deve avere vb e body; se no stesso stop (sincrono) */
function piediControllo(msg){
  var m=piediMancanti((typeof state==="object" && state && state.items) ? state.items : []);
  if(m.length){ var e=new Error(msg||PIEDI_MSG_PDF); e.piedi=true; throw e; }
  return true;
}
/* prefetch in quiete: dopo l'arrivo di icons.js, una volta sola, senza rete assente né «risparmio dati». Spento con window.__piediPrefetch=false (banco di prova) */
var _piediPrefetch=false;
function piediPrefetchQuiete(){
  if(_piediPrefetch || window.__piediPrefetch===false) return;
  _piediPrefetch=true;
  var vai=function(){
    try{ if(navigator.onLine===false) return; var c=navigator.connection; if(c && c.saveData) return; }catch(e){}
    piediCarica();
  };
  if(typeof requestIdleCallback==="function") requestIdleCallback(vai,{timeout:8000}); else setTimeout(vai,4000);
}
/* cambio di posa: le funzioni che applicano lo scarto dc aspettano il file. `fa` si esegue UNA volta, solo con il file arrivato;
   senza, un avviso e nessuna modifica (mai dc=[0,0]). Il file c'è già → fa subito, in modo sincrono (come prima). */
function piediPrimaDiPosa(fa, ms, ok){
  ok=ok||piediFilePronto;
  if(ok()){ return fa(); }
  try{ if(typeof showToast==="function") showToast("Carico le figure in piedi…"); }catch(e){}
  return piediAttendi(ms==null ? PIEDI_ATTESA_POSA_MS : ms, ok).then(function(ok){
    if(ok){ return fa(); }
    try{ if(typeof showToast==="function") showToast(PIEDI_MSG_POSA,"err"); }catch(e){}
    return null;
  });
}
