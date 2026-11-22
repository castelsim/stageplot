/* ═══ DOCUMENTO PER L'ESTERO (17/11/2026, lotto «estero»: lacune P1 n. 5 e 6 dal caso di uno stage manager in tour negli USA) ═══
   Due scelte del PROGETTO (non dell'interfaccia), salvate nel documento e uguali in tutte le scene (CAMPI_DOCUMENTO):
   - state.docLang  : "en" = documento in inglese; "it" = italiano scelto a mano (22/11/2026, L1); assente = «come l'app», che oggi è italiano, com'è sempre stato.
   - state.docUnits : "ft" = piedi e pollici, "both" = metri e piedi. Assente = metri, com'è sempre stato.
   Un progetto che non le ha esce identico a prima: ogni funzione qui restituisce il testo di sempre se docLang/docUnits mancano.

   Come arriva l'inglese sul foglio. Tutti i testi dei PDF (cartiglio, liste, avvisi, e anche le scritte del disegno, che svg2pdf scrive
   con doc.text) passano già da un punto solo, il costruttore avvolto di jsPDF (pdfTestoNeroInstalla). Lì si aggiunge pdfLinguaDoc:
   text, splitTextToSize, getTextWidth e getStringUnitWidth ricevono il testo già tradotto (le misure delle colonne si fanno sul testo
   inglese, non su quello italiano). La traduzione (docTesto) prova, nell'ordine:
     1. il dizionario delle frasi esatte (DOC_EN);
     2. lo stesso dizionario a «modelli»: ogni numero diventa «#» e si rimette al suo posto («# pedane» → «# risers»);
     3. i nomi automatici degli elementi («Violino 2» → «Violin 2»): solo i nomi che l'app dà da sé, dal catalogo;
     4. i pezzi separati da « · », «  ->  », « — », «: », «, » (ogni pezzo con 1-3);
   poi la data («17/11/2026» → «Nov 17, 2026»), la virgola decimale e, se le unità non sono metri, le misure in piedi.
   I TESTI DELL'UTENTE NON SI TOCCANO: titolo, luogo, contatti, note, nomi scritti a mano, canali scritti a mano… si raccolgono
   all'inizio di ogni documento (docUtenteRaccogli) e una scritta uguale a uno di loro (o a un loro pezzo) esce come l'ha scritta.
   Le misure del disegno (pedane, quote, barra di scala, cavi) si scrivono in piedi ALLA FONTE (misPedana, fmtM, pdfScaleBar,
   cabCutTxt…), così valgono anche a schermo: il disegno è l'anteprima del documento. Glossario e fonti:
   COWORK/STAGEPLOT/CONOSCENZA/GLOSSARIO_IT_EN.md (fuori dal repo). */
var DOC_LINGUE={it:"Italiano", en:"English"};
var DOC_UNITA={m:"metri", ft:"piedi e pollici (ft-in)", both:"metri e piedi"};
function docLingua(){ return (typeof state!=="undefined" && state && state.docLang==="en") ? "en" : "it"; }
function docUnita(){ var u=(typeof state!=="undefined" && state) ? state.docUnits : null; return (u==="ft" || u==="both") ? u : "m"; }
function docEn(){ return docLingua()==="en"; }
function docAttivo(){ return docEn() || docUnita()!=="m"; }
/* La scelta salvata: "en", "it" (esplicita) o "" (campo assente = come l'app). docLingua() resta quella che conta per i testi. */
function docLinguaScelta(){ var v=(typeof state!=="undefined" && state) ? state.docLang : null; return (v==="en" || v==="it") ? v : ""; }
function docLinguaImposta(v){ if(v==="en" || v==="it") state.docLang=v; else delete state.docLang; }
function docUnitaImposta(v){ if(v==="ft" || v==="both") state.docUnits=v; else delete state.docUnits; }

/* NOME DEL FILE in inglese (22/11/2026, L1): «… - v3 del 12-11-2026 - A3 orizz 1-50.pdf» → «… - v3 of 12-11-2026 - A3 landscape 1-50.pdf», stato e suffissi dei documenti.
   Si applica solo se il documento è in English; la data resta numerica (i file system rifiutano le virgole di «Nov 12, 2026»); il titolo scritto dall'utente non si tocca. */
var DOC_NOME_SUFFISSI={"cablaggio-audio":"audio-cabling","da-definire":"to-be-defined","responsabilita":"responsibilities","lista-carichi":"load-list","note":"notes","rete":"network","alimentazioni":"power","luci":"lighting","lista-rf":"rf-list","piano-elettrico":"power-plan","organico":"lineup"};
function docNomeFile(n){
  if(!docEn()) return n;
  n=String(n)
    .replace(/( - v\d+) del (\d{2}-\d{2}-\d{4})/, "$1 of $2")
    .replace(/( [A-Z]\d) orizz( \d+-\d+)/, "$1 landscape$2").replace(/( [A-Z]\d) vert( \d+-\d+)/, "$1 portrait$2")
    .replace(/ - palco((?:-definitivo|-provvisorio)?\.pdf)$/, " - stage$1").replace(/ - foglio teatro((?:-definitivo|-provvisorio)?\.pdf)$/, " - venue sheet$1")   /* senza versione lo stato è già in coda («palco-definitivo.pdf»): D2, 22/11 */
    .replace(/-(cablaggio-audio|da-definire|responsabilita|lista-carichi|note|rete|alimentazioni|luci|lista-rf|piano-elettrico|organico)((?:-definitivo|-provvisorio)?\.pdf)$/, function(all, k, coda){ return "-"+DOC_NOME_SUFFISSI[k]+coda; })
    .replace(/\b(D)efinitivo\b/g, function(_, c){ return c==="D" ? "Final" : "final"; }).replace(/\bdefinitivo\b/g, "final")
    .replace(/\bProvvisorio\b/g, "Preliminary").replace(/\bprovvisorio\b/g, "preliminary");
  return n;
}

/* ── UNITÀ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Il documento resta in centimetri. 1 ft = 30,48 cm e 1 in = 2,54 cm ESATTI: una pedana 8'×4' è 243,84 × 121,92 cm e non si
   arrotonda (19 moduli arrotondati a 244 cm sballerebbero di 3 cm). In piedi si scrive al pollice: 16' 5", 8', 10". */
var CM_PER_FT=30.48, CM_PER_IN=2.54;
function ftIn(cm){
  var t=Math.round((+cm||0)/CM_PER_IN), neg=t<0; t=Math.abs(t);
  var f=Math.floor(t/12), i=t%12;
  return (neg?"-":"")+(f ? f+"'"+(i ? " "+i+'"' : "") : i+'"');
}
/* il numero alla maniera della lingua del documento: «11,5» in italiano, «11.5» in inglese */
function docNum(n, dec){ var s=(Math.round((+n||0)*Math.pow(10,dec==null?2:dec))/Math.pow(10,dec==null?2:dec)).toString(); return docEn() ? s : s.replace(".",","); }
/* una lunghezza (cm). `std` = il testo metrico di sempre di quel punto di stampa («11,5 m»): in metri esce quello (in inglese col punto). */
function docLen(cm, std){
  var u=docUnita(), m=(std!=null ? String(std) : docNum(cm/100,2)+" m");
  if(docEn()) m=m.replace(/(\d),(\d)/g,"$1.$2");
  return u==="ft" ? ftIn(cm) : (u==="both" ? m+" ("+ftIn(cm)+")" : m);
}
function docArea(w, d, std){
  var u=docUnita(), m=(std!=null ? String(std) : docNum(w/100,2)+" × "+docNum(d/100,2)+" m");
  if(docEn()) m=m.replace(/(\d),(\d)/g,"$1.$2");
  var f=ftIn(w)+" × "+ftIn(d);
  return u==="ft" ? f : (u==="both" ? m+" ("+f+")" : m);
}
/* quota o altezza (cm), riser e scale: «h40» → «h 1' 4"» */
function docQuotaH(h, std){
  var u=docUnita(), m=String(std!=null ? std : "h"+Math.round(+h||0));
  if(docEn()) m=m.replace(/(\d),(\d)/g,"$1.$2");
  return u==="ft" ? "h "+ftIn(h) : (u==="both" ? m+" ("+ftIn(h)+")" : m);
}
/* Legge una misura scritta a mano: «8'», «8' 6"», «8'6», «8 ft 6 in», «8.5 ft», «96"», «96 in» → cm; i numeri nudi sono nell'unità
   `unita` del campo ("m", "cm" o "ft"). Virgola o punto. null se non è una misura. */
function parseLunghezza(txt, unita){
  var s=String(txt==null?"":txt).trim().toLowerCase().replace(/[’′‘`´]/g,"'").replace(/[”″“]/g,'"').replace(/''/g,'"').replace(/,/g,".");
  if(!s) return null;
  var m=/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/.exec(s);
  if(m) return (+m[1])*CM_PER_FT+(m[2] ? (+m[2])*CM_PER_IN : 0);
  m=/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)$/.exec(s); if(m) return (+m[1])*CM_PER_IN;
  m=/^(\d+(?:\.\d+)?)\s*cm$/.exec(s); if(m) return +m[1];
  m=/^(\d+(?:\.\d+)?)\s*m$/.exec(s); if(m) return (+m[1])*100;
  m=/^(\d+(?:\.\d+)?)$/.exec(s); if(!m) return null;
  var n=+m[1]; return unita==="ft" ? n*CM_PER_FT : (unita==="in" ? n*CM_PER_IN : (unita==="cm" ? n : n*100));
}
/* Tagli commerciali dei cavi negli USA (glossario § Cavi): XLR 10/15/25/50/75/100 ft, multicore 50-300 ft. Si calcolano dalla lunghezza
   VERA del cavo (lenM), non dal taglio metrico, che arrotonderebbe due volte. Oltre l'ultimo: null, come «oltre 50 m». */
var CAB_TAGLI_FT=[10,15,25,50,75,100], CAB_TAGLI_FT_MC=[50,75,100,150,200,250,300];
function cabCutFt(lenM, mc){ var ft=(+lenM||0)/0.3048, T=mc ? CAB_TAGLI_FT_MC : CAB_TAGLI_FT;
  for(var i=0;i<T.length;i++){ if(T[i]>=ft-1e-9) return T[i]; } return null; }
/* il taglio di un cavo come si scrive sul documento: «10 m» · «25 ft» · «10 m / 25 ft». null se è oltre l'ultimo taglio. */
function cabCutTxt(l, mc){
  if(!l) return null; var u=docUnita(), us=cabCutFt(l.lenM, mc);
  if(u==="ft") return us ? us+" ft" : null;
  if(!l.cut) return null;
  return u==="both" ? l.cut+" m"+(us ? " / "+us+" ft" : "") : l.cut+" m";
}
function cabOltreTxt(mc){ var u=docUnita(); return u==="ft" ? (mc ? "oltre 300 ft" : "oltre 100 ft") : (mc ? "oltre 100 m" : "oltre 50 m"); }
/* la chiave del taglio per contare i cavi «per taglio» nell'unità del documento */
function cabCutKey(l, mc){ return docUnita()==="ft" ? cabCutFt(l.lenM, mc) : l.cut; }
function cabTaglioUnita(){ return docUnita()==="ft" ? " ft" : " m"; }
/* barra di scala in piedi: 1, 2, 5, 10, 20, 50 ft (la più lunga che sta sotto i 60 mm di carta) */
function niceBarFeet(N){ var c=[1,2,5,10,20,50,100], best=c[0]; c.forEach(function(f){ if(f*CM_PER_FT*10/N<=60) best=f; }); return best; }
/* Pedane in piedi (lotto 7 di analisi/2026-11-16_CATALOGO_PRO): moduli da tour, misure esatte. */
var PEDANA_MISURE_RAPIDE_FT=[{t:"8'×4'", w:8*CM_PER_FT, d:4*CM_PER_FT},{t:"8'×8'", w:8*CM_PER_FT, d:8*CM_PER_FT},{t:"4'×4'", w:4*CM_PER_FT, d:4*CM_PER_FT},{t:"8'×2'", w:8*CM_PER_FT, d:2*CM_PER_FT}];
/* Aggancio in piedi (19/11/2026): 6", 1', 2', 3' in centimetri esatti; dal 22/11 anche 1" e 3" (passi fini). Le chiavi sono i valori di DOC_EXTRA.snap. */
/* testi accanto ai campi (non sono la loro etichetta) */
var DOC_CAMPI_SUFFISSI={pPedMisLbl:["Misura in metri (L × P)","Misura in piedi (L × P)"], pPedAltLbl:["Altezza in cm","Altezza in piedi e pollici"], pMountHU:["cm","ft-in"], pAntHU:["— metri da terra","— piedi da terra"]};
var DOC_SNAP_FT={ft1:CM_PER_IN, ft3:3*CM_PER_IN, ft6:6*CM_PER_IN, ft12:CM_PER_FT, ft24:2*CM_PER_FT, ft36:3*CM_PER_FT};
var PEDANA_ALTEZZE_RAPIDE_FT=[{t:"8\"", h:8*CM_PER_IN},{t:"1'", h:CM_PER_FT},{t:"16\"", h:16*CM_PER_IN},{t:"2'", h:2*CM_PER_FT},{t:"3'", h:3*CM_PER_FT},{t:"4'", h:4*CM_PER_FT}];

/* ── DATA ── «Nov 17, 2026»: il mese in lettere, mai 11/17/2026 (un europeo lo legge al contrario). Glossario § Unità e date. */
var DOC_MESI_EN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function docDataEn(g, m, a){ g=+g; m=+m; return (m>=1 && m<=12 && g>=1 && g<=31) ? DOC_MESI_EN[m-1]+" "+g+", "+a : null; }

/* ── TESTI DELL'UTENTE ──────────────────────────────────────────────────────────────────────────────────────────────────── */
var DOC_SEP=/(\s+·\s+|\s+->\s+|\s+—\s+|\s+-\s+|:\s+|,\s+|\s+\/\s+|\s+\(|\)\s*|\s{2,})/;
var __docUtente=null;
function _docUtenteAdd(set, v){
  if(typeof v!=="string") return; var t=v.trim(); if(!t || /^[\d\s.,:\/×x-]+$/.test(t)) return;
  set[t]=1; t.split(DOC_SEP).forEach(function(p){ p=p.trim(); if(p && !DOC_SEP.test(p) && !/^\d+$/.test(p)) set[p]=1; });
}
/* nome scritto dall'utente = diverso dal nome automatico del tipo (con o senza numero) */
function docEtichettaAuto(it, raw){
  if(!it || typeof raw!=="string") return false;
  var b=(typeof defaultLabel==="function") ? defaultLabel(it.type) : ""; var basi=[b];
  if(typeof INSTR_BASE!=="undefined" && INSTR_BASE[it.type]) basi.push(INSTR_BASE[it.type]);   /* la base dei nomi numerati («Basso 1», «Chitarra 2») */
  if(it.type==="corista") basi.push("Corista");
  var t=TYPES[it.type]; if(t && t.nome) basi.push(t.nome);
  var mig=(typeof LABEL_MIGRATE!=="undefined") && LABEL_MIGRATE[it.type]; if(mig) mig.forEach(function(p){ basi.push(p[1]); });
  return basi.some(function(x){ return x && (raw===x || new RegExp("^"+x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\s+[IVX\\d]+(?:\\s+\\d+)?$").test(raw)); });
}
var __docUtenteFirma=null;
function docUtenteRaccogli(){
  var S={}, s=state||{};
  __docUtenteFirma={st:state, n:(s.items||[]).length, t:s.titolo, l:s.luogo};
  ["titolo","luogo","techContact","pdfHeader"].forEach(function(k){ _docUtenteAdd(S, s[k]); });
  var giro=function(o, d){ if(d>4 || o==null) return; if(typeof o==="string"){ _docUtenteAdd(S, o); return; }
    if(Array.isArray(o)) o.forEach(function(x){ giro(x, d+1); }); else if(typeof o==="object") Object.keys(o).forEach(function(k){ giro(o[k], d+1); }); };
  giro(s.contacts, 0); giro(s.scaletta, 0); giro(s.rider, 0); giro(s.orari, 0); giro(s.allegatiRichiesti, 0); giro(s.dotazioni, 0);
  (s.items||[]).forEach(function(it){
    ["label","label2"].forEach(function(k){ if(it[k] && !docEtichettaAuto(it, it[k])) _docUtenteAdd(S, it[k]); });
    ["note","nota","text","testo","notes","desc","nomeCustom","sigla"].forEach(function(k){ _docUtenteAdd(S, it[k]); });
  });
  /* channel list scritta a mano: si proteggono le note e i nomi che non sono nomi del catalogo (le aste e i nomi copiati dagli elementi
     sono parole dell'app, salvate nella riga: si traducono come nel resto del documento) */
  ["inputs","outputs"].forEach(function(k){ (s[k]||[]).forEach(function(r){ if(!r || typeof r!=="object") return;
    ["note","notes","nota","comment"].forEach(function(c){ _docUtenteAdd(S, r[c]); });
    ["name","nome","label"].forEach(function(c){ var v=r[c]; if(typeof v!=="string" || !v.trim()) return;
      var base=v.trim().split(/\s+-\s+/)[0]; if(docEnEtichetta(base)==null && !DOC_EN.hasOwnProperty(v.trim())) _docUtenteAdd(S, v); });
  }); });
  if(s.cab && s.cab.manual) giro(s.cab.manual, 2);
  __docUtente=S; return S;
}

/* ── TRADUZIONE ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
var DOC_EN={}, DOC_EN_TIPI={}, __docEnEtichette=null;
/* nomi automatici del catalogo: «base italiana» → «base inglese» (etichette, nomi dei tipi, basi migrate) */
function docEnEtichette(){
  if(__docEnEtichette) return __docEnEtichette;
  var E={};
  Object.keys(DOC_EN_TIPI).forEach(function(id){ var t=TYPES[id], en=DOC_EN_TIPI[id]; if(!t || !en) return;
    var lab=(typeof defaultLabel==="function") ? defaultLabel(id) : "";
    if(lab && en.etichetta) E[lab]=en.etichetta;
    if(t.nome && en.nome && E[t.nome]==null) E[t.nome]=en.nome;
    if(t.defLabel && en.etichetta && E[t.defLabel]==null) E[t.defLabel]=en.etichetta;
  });
  Object.keys(DOC_EN_BASI||{}).forEach(function(k){ if(E[k]==null) E[k]=DOC_EN_BASI[k]; });
  return (__docEnEtichette=E);
}
var DOC_EN_BASI={};
/* «Violino 2», «Violini I 3», «Batteria 1»: base del catalogo + numero (o numero romano della fila) */
function docEnEtichetta(s){
  var E=docEnEtichette(); if(E[s]!=null) return E[s];
  var m=/^(.+?)(\s+(?:[IVX]+|\d+)(?:\s+\d+)?)$/.exec(s); if(m && E[m[1]]!=null) return E[m[1]]+m[2];
  return null;
}
var DOC_FTIN_RE=/\d+(?:[.,]\d+)? m \((?:\d+' \d+"|\d+'|\d+")\)|\d+' \d+"|\d+'|\b\d+"/g;   /* «5' 3"» e, con «entrambe», «1,6 m (5' 3")» */
function _docEnSemplice(s){
  if(DOC_EN.hasOwnProperty(s)) return DOC_EN[s];
  /* una misura già in piedi (scritta alla fonte, «5' 3"») vale come il «# m» del modello italiano e si rimette com'è */
  var mis=[], s1=s.replace(DOC_FTIN_RE, function(x){ mis.push(x); return "@"+String.fromCharCode(96+mis.length)+"@ m"; });
  var nums=[], k=s1.replace(/@[a-z]@|\d+(?:[.,]\d+)?/g, function(x){ nums.push(x); return "#"; });
  if(nums.length && DOC_EN.hasOwnProperty(k)){ var i=0;
    return DOC_EN[k].replace(/#/g, function(){ var n=nums[i++]; return n==null ? "#" : n.replace(/(\d),(\d)/,"$1.$2"); })
      .replace(/@([a-z])@ m\b/g, function(_, c){ return mis[c.charCodeAt(0)-97]; }); }
  var e=docEnEtichetta(s); if(e!=null) return e;
  var c=/^(\d+\s?×\s?)(\D.*)$/.exec(s);   /* «3× asta giraffa»: il numero davanti e il resto dal dizionario */
  if(c){ var r=DOC_EN.hasOwnProperty(c[2]) ? DOC_EN[c[2]] : docEnEtichetta(c[2]); if(r!=null) return c[1]+r; }
  return null;
}
/* pezzi con dentro una misura già in piedi («12 da 6' 7" × 3' 3"»), che il modello italiano non può prevedere */
var _docEnNome=function(x){ var e=docEnEtichetta(x); return e==null ? x : e; };
var DOC_EN_REGOLE=[[/^Sorgente senza destinazione: (.+) \(ingressi palco esauriti\)(?: — (?:aggiungi una stage box vicino alla regia e marcala come «lato mixer», poi collegali lì a mano\.|collegali a mano alla stage box del mixer \((\w+)\)\.))?$/,
    function(all, n, b){ return "Source with no destination: "+_docEnNome(n)+" (stage inputs used up)"+(/ — aggiungi/.test(all) ? " — add a stage box near FOH, mark it as “mixer side”, then patch them there by hand." : (b ? " — patch them by hand to the mixer stage box ("+b+")." : "")); }],
  [/^evento (.+)$/, "show $1"], [/^(\d+) da (\d.*)$/, "$1 at $2"], [/^(\d+) pedana (\d.*)$/, "$1 riser $2"], [/^(\d+) pedane (\d.*)$/, "$1 risers $2"], [/^pedana (\d.*)$/, "riser $1"],
  /* pedana ad arco (20/11/2026): corda × freccia (+ spessore della fascia), mai la misura di un rettangolo */
  [/^(\d+)× pedana (\d[^·:()]*)$/, "$1× riser $2"],   /* una pedana rettangolare accanto a un arco: il rider non ha più l'intera frase a dizionario */
    [/^(\d+)× pedana ad arco (\d[^·:()]*)$/, "$1× curved riser $2"], [/^(\d+) pedana ad arco (\d[^·:()]*)$/, "$1 curved riser $2"], [/^(\d+) ad arco (\d[^·:()]*)$/, "$1 curved at $2"],
  [/^sp\. (\d[^·:()]*)$/, "width $1"], [/^spessore (\d[^·:()]*)$/, "width $1"], [/^(\d[^·:()]*) corda × freccia$/, "$1 chord × rise"],
  [/^(\d+) pedana ad arco$/, "$1 curved riser"], [/^(\d+) pedane ad arco$/, "$1 curved risers"], [/^Pedane ad arco$/, "Curved risers"],
  [/^(\d+) in tutto, forma curva: non sono moduli 2×1$/, "$1 in total, curved shape: not 2×1 modules"],
  [/^(\d+) (pedana|pedane) ad arco: forma curva, fuori dai moduli 2×1\.$/, function(all, n){ return n+(+n===1 ? " curved riser" : " curved risers")+": curved shape, outside the 2×1 modules."; }],
 
  [/^altezza (\d.*)$/, "height $1"], [/^disegnato (\d.*)$/, "drawn $1"], [/^(\d+) in tutto$/, "$1 total"]];
function _docEnRegola(s){ for(var j=0;j<DOC_EN_REGOLE.length;j++){ if(DOC_EN_REGOLE[j][0].test(s)) return s.replace(DOC_EN_REGOLE[j][0], DOC_EN_REGOLE[j][1]); } return null; }
/* PLURALI delle aste (22/11/2026, L1): il dizionario traduce «# asta giraffa» con «# boom stand» e il numero entra dopo: con N≠1 serve «3 boom stands».
   Si corregge a valle, sul testo già inglese e solo se è cambiato (un testo dell'utente non si tocca); idempotente («boom stands» non ricade nella regola). */
var DOC_EN_PLURALI={"boom stand":"boom stands","short boom/clip":"short booms/clips","short boom":"short booms","straight stand":"straight stands","tall boom":"tall booms","headset":"headsets","clip":"clips"};
var DOC_EN_PLURALI_RE=/(^|[^\w.,])(\d+)(×? )(boom stand|short boom\/clip|short boom|straight stand|tall boom|headset|clip)(?![\w\/])/g;
function docEnPlurali(t){ return t.replace(DOC_EN_PLURALI_RE, function(all, pre, n, sep, nome){ return +n===1 ? all : pre+n+sep+DOC_EN_PLURALI[nome]; }); }
function _docEnTrad(s){ var r=_docEnTradBase(s); return r===s ? r : docEnPlurali(r); }
function _docEnTradBase(s){
  if(DOC_EN.hasOwnProperty(s)) return DOC_EN[s];   /* chiavi con gli spazi in testa (« — stampare a 100%…») */
  var lead=/^\s*/.exec(s)[0], trail=/\s*$/.exec(s)[0], core=s.slice(lead.length, s.length-trail.length);
  if(!core) return s;
  var U=__docUtente||{};
  if(U[core]) return s;
  var r=_docEnSemplice(core); if(r!=null) return lead+r+trail;
  r=_docEnRegola(core); if(r!=null) return lead+r+trail;
  /* «• » davanti agli avvisi */
  var b=/^(•\s+|\*\s+|-\s+)(.+)$/.exec(core); if(b){ r=_docEnSemplice(b[2]); if(r==null) r=_docEnRegola(b[2]); if(r!=null) return lead+b[1]+r+trail; }
  /* frase per frase (i paragrafi del rider e della corrente si compongono di frasi fisse) */
  var frasi=core.replace(/([.!?])\s+(?=[A-ZÀ-Ý«“(•])/g, "$1\u0001").split("\u0001");   /* niente lookbehind: i Safari vecchi non lo leggono e salterebbe tutto app.js */
  if(frasi.length>1){ var cf=false, tf=frasi.map(function(x){ var y=_docEnTrad(x); if(y!==x) cf=true; return y; }); if(cf) return lead+tf.join(" ")+trail; }
  /* a pezzi */
  var parti=core.split(DOC_SEP); if(parti.length<2) return s;
  var cambiato=false;
  parti=parti.map(function(p, i){
    if(i%2===1){ return p; }
    var pl=/^\s*/.exec(p)[0], pt=/\s*$/.exec(p)[0], pc=p.slice(pl.length, p.length-pt.length);
    if(!pc || U[pc]) return p;
    var t=_docEnSemplice(pc);
    if(t==null) t=_docEnRegola(pc);
    if(t==null) return p; cambiato=true; return pl+t+pt;
  });
  return cambiato ? lead+parti.join("")+trail : s;
}
/* misure metriche scritte dentro un testo dell'app («2 m», «12,5 × 8 m», «h40», «40 cm») → piedi, quando l'unità non è metri */
function _docUnitaTesto(s){
  var u=docUnita(); if(u==="m") return s;
  var num=function(x){ return parseFloat(String(x).replace(",",".")); };
  var due=function(cm, orig){ return u==="ft" ? ftIn(cm) : orig+" ("+ftIn(cm)+")"; };
  s=s.replace(/(oltre|over)\s+50\s?m\b(!?)/g, function(_, o, e){ return o+" "+(u==="ft" ? "100 ft" : "50 m")+e; })
     .replace(/(oltre|over)\s+100\s?m\b/g, function(_, o){ return o+" "+(u==="ft" ? "300 ft" : "100 m"); });
  s=s.replace(/(\d+(?:[.,]\d+)?)\s?[×x]\s?(\d+(?:[.,]\d+)?)\s?m\b(?![²\w])(?!\s\(\d+['"])/g, function(all, a, b){   /* la guardia: con «entrambe» il testo passa più volte (misura, a capo, scrittura) e l'area non va raddoppiata (rilettura #170) */
    var f=ftIn(num(a)*100)+" × "+ftIn(num(b)*100); return u==="ft" ? f : all+" ("+f+")"; });
  s=s.replace(/(\d+(?:[.,]\d+)?)\s?[×x]\s?(\d+(?:[.,]\d+)?)\s?cm\b(?!\s\(\d+['"])/g, function(all, a, b){   /* «200×100 cm» (ingombro, 19/11/2026) */
    var f=ftIn(num(a))+" × "+ftIn(num(b)); return u==="ft" ? f : all+" ("+f+")"; });
  s=s.replace(/(^|[\s(·])h\s?(\d+(?:[.,]\d+)?)(?:\s?cm\b)?(?![\d'"])(?!\s\(\d+['"])(?!\s?cm\s\(\d+['"])/g, function(all, pre, n){ return pre+"h "+(u==="ft" ? ftIn(num(n)) : n+" cm ("+ftIn(num(n))+")"); });
  s=s.replace(/(^|[^\w'"×.,])(\d+(?:[.,]\d+)?)\s?(m|cm)\b(?![²\w'"])(?!\s\(\d+['"])(?!\s\/\s\d+\sft)/g, function(all, pre, n, un){   /* «10 m / 25 ft» (taglio con entrambe) resta com'è */
    return pre+due(num(n)*(un==="m" ? 100 : 1), n+" "+un); });
  return s;
}
function docTesto(s){
  if(typeof s!=="string" || !s) return s;
  var en=docEn(), u=docUnita()!=="m"; if(!en && !u) return s;
  var f=__docUtenteFirma, st=state||{};   /* i testi dell'utente si rileggono se il progetto è cambiato (il cartiglio si misura prima di creare il PDF) */
  if(!f || f.st!==state || f.n!==(st.items||[]).length || f.t!==st.titolo || f.l!==st.luogo) docUtenteRaccogli();
  var U=__docUtente||{}, core=s.trim();
  if(core && U[core]) return s;
  var r=en ? _docEnTrad(s) : s;
  if(en){
    r=r.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, function(all, g, m, a){ return docDataEn(g, m, a) || all; })
       .replace(/(\d),(\d)/g, "$1.$2")
       .replace(/\b(\d+) wedge\b(?!s)/g, function(all, n){ return +n===1 ? all : n+" wedges"; });   /* l'italiano non fa il plurale di «wedge» */
  }
  if(u && !(core && U[core])) r=_docUnitaTesto(r);
  return r;
}
/* A SCHERMO (19/11/2026, lotto «unità nell'editor»): una funzione sola per le misure scritte dentro i testi dell'interfaccia. In metri restituisce il testo com'è
   (progetti identici a prima); in piedi o in entrambe converte «2 m», «4×1,2 m», «h40», «25 cm» come sul PDF. Non traduce e non tocca i testi dell'utente. */
/* le voci del catalogo (sottotitoli «2×1 m · …») seguono l'unità: il testo di partenza sta in data-u0 */
function catalogoUnita(){ if(typeof document==="undefined" || !document.querySelectorAll) return;
  Array.prototype.forEach.call(document.querySelectorAll("#catalog small[data-u0]"), function(el){ var t=uTxt(el.getAttribute("data-u0")); if(el.textContent!==t) el.textContent=t; }); }
function uTxt(s){ return (typeof s==="string" && s && docUnita()!=="m") ? _docUnitaTesto(s) : s; }
/* il disegno del palco a schermo: ogni <text>/<tspan> passa da uTxt, tranne le scritte dell'utente (nomi, note, titolo…) */
function docSvgUnita(svg){
  if(docUnita()==="m") return svg;
  docUtenteRaccogli(); var U=__docUtente||{};
  var un=function(t){ return t.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&"); };
  var es=function(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); };
  return String(svg).replace(/(<(?:text|tspan)\b[^>]*>)([^<]+)(?=<)/g, function(all, a, t){
    var raw=un(t), core=raw.trim(); if(!core || U[core] || !/\d/.test(core)) return all;
    var r=_docUnitaTesto(raw); return r===raw ? all : a+es(r); });
}
/* il documento jsPDF: ogni testo scritto o misurato passa dalla traduzione (dopo, il filtro dei caratteri WinAnsi) */
function pdfLinguaDoc(d){
  if(!d || d.__lingua) return d;
  docUtenteRaccogli();
  var tr=function(x){ return Array.isArray(x) ? x.map(docTesto) : docTesto(x); };
  ["text","getTextWidth","splitTextToSize","getStringUnitWidth","textWithLink"].forEach(function(nome){
    var orig=d[nome]; if(typeof orig!=="function") return;
    d[nome]=function(){ if(!docAttivo()) return orig.apply(this, arguments); var a=Array.prototype.slice.call(arguments); a[0]=tr(a[0]); return orig.apply(this, a); };
  });
  d.__lingua=true; return d;
}
/* a schermo e nell'SVG del disegno: le scritte fisse del palco e i nomi automatici degli elementi */
function docZona(it){ return docEn() ? ({"FONDO PALCO":"UPSTAGE", "PUBBLICO":"AUDIENCE"}[it] || it) : it; }
function docEtichetta(raw, it){
  if(!docEn() || !raw || !it || !docEtichettaAuto(it, raw)) return raw;
  var e=docEnEtichetta(raw); return e==null ? raw : e;
}
/* i testi di un SVG (anteprima dell'Esporta): ogni <text>/<tspan> passa da docTesto, come nel PDF */
function docSvgTesti(svg){
  docUtenteRaccogli();
  var un=function(t){ return t.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&"); };
  var es=function(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); };
  return String(svg).replace(/(<(?:text|tspan)\b[^>]*>)([^<]+)(?=<)/g, function(_, a, t){ return a+es(docTesto(un(t))); });
}
/* ── CAMPI DEL PANNELLO IN PIEDI ── In piedi i campi mostrano piedi (lunghezze) o pollici (altezze) e si scrive anche «8'», «8' 6"», «96"».
   base: "cm" (campo in centimetri), "m" (campo in metri), "h" (altezza in centimetri). Il documento resta in centimetri, senza arrotondare
   le misure intere in pollici (8' = 243,84 cm); in metri tutto resta com'era. */
var DOC_CAMPI_ETICHETTE={pW:["L (cm)","L (ft-in)"], pD:["P (cm)","P (ft-in)"], pH:["h (cm)","h (ft-in)"], pSpess:["Spessore (cm)","Spessore (ft-in)"], frameW:["Larghezza (m)","Larghezza (ft-in)"], frameH:["Profondità (m)","Profondità (ft-in)"], frameX:["X (m)","X (ft-in)"], frameY:["Y (m)","Y (ft-in)"], blkH:["Altezza (cm)","Altezza (ft-in)"], pRigH:["Altezza (trim, cm)","Altezza (trim, ft-in)"], pMountH:null, pAntH:null, blkW:["Largh. (m)","Largh. (ft-in)"], blkD:["Prof. (m)","Prof. (ft-in)"], blkX:["X (m)","X (ft-in)"], blkY:["Y (m)","Y (ft-in)"]};
function docCmEsatti(c){ var r=Math.round(c), inch=c/CM_PER_IN; return (Math.abs(c-r)>1e-6 && Math.abs(inch-Math.round(inch))<1e-6) ? Math.round(c*100)/100 : r; }
function docCampoEtichette(){
  var ft=docUnita()==="ft";
  Object.keys(DOC_CAMPI_SUFFISSI).forEach(function(id){ var e=document.getElementById(id); if(e) e.textContent=DOC_CAMPI_SUFFISSI[id][ft?1:0]; });
  Object.keys(DOC_CAMPI_ETICHETTE).forEach(function(id){
    var el=document.getElementById(id); if(!el || !el.getAttribute) return;
    var lb=document.querySelector ? document.querySelector('label[for="'+id+'"]') : null;
    if(lb && DOC_CAMPI_ETICHETTE[id] && typeof lb.textContent==="string") lb.textContent=DOC_CAMPI_ETICHETTE[id][ft?1:0];
    if(ft){ if(el.getAttribute("data-step-m")==null) el.setAttribute("data-step-m", el.getAttribute("step")||""); el.setAttribute("step", id==="pH" ? "1" : "0.5"); el.setAttribute("type","text"); el.setAttribute("inputmode","decimal"); }
    else if(el.getAttribute("data-step-m")!=null){ el.setAttribute("step", el.getAttribute("data-step-m")); el.removeAttribute("data-step-m"); el.setAttribute("type","number"); }
  });
}
/* Il valore di un campo in piedi, scritto come si legge sul disegno: «6' 7"», «8'», «1' 4"». Esatto fino al centesimo di pollice (2,54 cm → «1"», 250 cm → «8' 2.43"»):
   non arrotonda al pollice, così riaprire il campo non sposta di nulla una misura in centimetri che non è un pollice intero. Si rilegge con parseLunghezza. */
function docFtInTesto(cm){
  var t=Math.round(Math.abs(+cm||0)/CM_PER_IN*100)/100, f=Math.floor(t/12+1e-9), i=Math.round((t-f*12)*100)/100;
  if(i>=12){ f++; i=0; }
  var iTxt=String(+i.toFixed(2));
  return ((+cm||0)<0 ? "-" : "")+(f ? f+"'"+(i ? " "+iTxt+'"' : "") : iTxt+'"');
}
/* un campo del pannello con la misura NELL'UNITÀ DEL CODICE (19/11/2026): «m» (metri), «cm» o «h» (centimetri). In metri e in entrambe il campo resta com'era, un numero;
   in piedi si scrive «8' 6"» e si legge anche «8'», «96"», «2.5m». docCampoNativo restituisce NaN se non è una misura. */
function docCampoNativo(el, base){
  if(typeof el==="string") el=document.getElementById(el); if(!el) return NaN;
  if(docUnita()!=="ft") return +el.value;
  /* il segno meno davanti (X e Y dell'area di stampa sono spesso negativi: «-8' 5.18"», che docFtInTesto scrive così) */
  var s=String(el.value==null ? "" : el.value).trim(), neg=/^[-−]/.test(s);
  var c=docCampoCm({value: neg ? s.replace(/^[-−]\s*/, "") : s}, base==="h" ? "h" : (base==="m" ? "m" : "cm")); if(c==null) return NaN;
  if(neg) c=-c;
  return base==="m" ? c/100 : c;
}
function docCampoPonne(el, nativo, base, std){
  if(typeof el==="string") el=document.getElementById(el); if(!el) return;
  if(docUnita()!=="ft" || nativo===""|| nativo==null || !isFinite(+nativo)){ el.value=(std!=null && docUnita()!=="ft") ? std : (nativo==null ? "" : nativo); return; }
  el.value=docFtInTesto(base==="m" ? nativo*100 : +nativo);
}
function docCampoScrivi(id, cm, base){
  var el=document.getElementById(id); if(!el) return;
  if(docUnita()==="ft"){ el.value=docFtInTesto(cm); return; }   /* 19/11/2026: «6' 7"» invece di 6.562 */
  el.value = base==="m" ? (+cm||0)/100 : cm;
}
/* il valore del campo in centimetri; null se non è un numero */
function docCampoCm(el, base){
  if(typeof el==="string") el=document.getElementById(el); if(!el) return null;
  var ft=docUnita()==="ft", c=parseLunghezza(el.value, ft ? (base==="h" ? "in" : "ft") : (base==="m" ? "m" : "cm"));
  if(c==null && ft && base==="h"){ var n=parseFloat(String(el.value).replace(",",".")); c=isFinite(n) ? n*CM_PER_IN : null; }
  return c==null || !isFinite(c) ? null : docCmEsatti(c);
}
