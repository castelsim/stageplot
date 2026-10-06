/* GENERATO da src/pianta-posti.js con `node build.mjs`: NON modificare questo file.
   Lo stesso testo è dentro l'editor (app.js): una sola fonte per la foto della sala (specifica area §4.2). */
/* LA PIANTA DEI POSTI — una sola fonte per l'editor e per la biglietteria (specifica area §4.2, ottobre 2026).
   `node build.mjs` mette questo testo nell'editor, al posto del marcatore PIANTA_POSTI del template, e lo copia uguale
   in biglietteria/pianta-posti.js, che l'area dell'organizzatore carica come file. Due copie della stessa funzione
   renderebbero falso il confronto «la sala del progetto è cambiata»: un test (bgl-pianta-posti) lo impedisce.
   Regole di questo file: SOLO dichiarazioni di funzione (all'avvio dell'editor una `var` scritta più in basso vale
   undefined, AGENTS §8 «Boot»), niente DOM, niente rete; `state` e `TYPES` dell'editor non si leggono qui: lo stato
   arriva come argomento (l'editor, se non lo passa, usa il suo `state`). */
function postoTipo(it){ return !!it && it.type==="sediapubblico"; }
function postoNumerato(it){ return postoTipo(it) && typeof it.fila==="string" && it.fila!=="" && typeof it.posto==="number" && isFinite(it.posto) && it.posto>0; }
function postoSettore(it){ return (it && typeof it.settore==="string" && it.settore.trim()) ? it.settore.trim() : "Platea"; }
function postoNomeSettore(v){ v=(v==null?"":String(v)).replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim().slice(0,24); return v||"Platea"; }
/* Sanificazione dei campi in arrivo da file/link/cloud: tipi e lunghezze garantiti, o via */
function postoSanifica(it){
  if(!it) return;
  if(it.fila!=null){ var f=(typeof it.fila==="string"||typeof it.fila==="number") ? String(it.fila).replace(/[^0-9A-Za-z]/g,"").slice(0,4).toUpperCase() : ""; if(f) it.fila=f; else delete it.fila; }
  if(it.posto!=null){ var p=Math.round(+it.posto); if(isFinite(p) && p>0 && p<10000) it.posto=p; else delete it.posto; }
  if(it.settore!=null){ if(typeof it.settore==="string" && it.settore.trim()) it.settore=postoNomeSettore(it.settore); else delete it.settore; }
  if(!postoTipo(it) || it.fila==null || it.posto==null){ delete it.fila; delete it.posto; delete it.settore; }
}
/* Dove guarda una sedia: lo schienale è disegnato a y negativa, quindi chi siede guarda verso +y
   del suo disegno, girato della rotazione dell'elemento. */
function postoVerso(it){ var r=(+it.rot||0)*Math.PI/180; return {x:-Math.sin(r), y:Math.cos(r)}; }
/* Il verso comune delle sedie: la media. Se guardano da parti troppo diverse (media corta: due metà
   girate di 80° o più l'una dall'altra) non c'è un palco a cui riferire le file → null, e lo si dice. */
function postiVerso(seats){
  var x=0, y=0; seats.forEach(function(s){ var v=postoVerso(s); x+=v.x; y+=v.y; });
  var n=Math.sqrt(x*x+y*y);
  return (seats.length && n>=seats.length*0.75) ? {x:x/n, y:y/n} : null;
}
/* angoli del blocco: r.pts (quadrilatero libero) se presente, altrimenti i 4 spigoli del rettangolo.
   Ordine: TL, TR, BR, BL. Solo i blocchi rettangolari possono diventare quadrilateri (i semicerchi no). */
function hasPts(r){ return !!(r.pts && r.pts.length===4 && r.shape!=="semi"); }
function blockCorners(r){
  if(hasPts(r)) return r.pts.map(function(p){ return [p[0],p[1]]; });
  return [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.d],[r.x,r.y+r.d]];
}
function itemCorners(it){
  var hw=(it.w||40)/2, hd=(it.d||40)/2, a=(it.rot||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(function(p){ return [it.x+p[0]*c-p[1]*s, it.y+p[0]*s+p[1]*c]; });
}
function bglChiave(it){ return postoSettore(it).replace(/\|/g,"/")+"|"+it.fila+"|"+it.posto; }
/* «Platea|A|5» → «A 5» (il settore si dice solo se non è la Platea) */
function bglPostoNome(k){
  var p=String(k==null?"":k).split("|"); if(p.length!==3) return String(k||"");
  return (p[0]==="Platea" ? "" : p[0]+" ")+p[1]+" "+p[2];
}
function bglPostiNomi(chiavi){ return (chiavi||[]).map(bglPostoNome).join(", "); }
function bglSemiPoligono(r){
  /* il semicerchio del palco (mezza ellisse nel suo riquadro) come poligono di 24 vertici: 23 passi d'arco + il lato dritto */
  var x=r.x, y=r.y, w=r.w, d=r.d, flat=r.flat||"top", cx, cy, rx, ry, a0, out=[], N=24;
  if(flat==="top"){ cx=x+w/2; cy=y; rx=w/2; ry=d; a0=0; }                 /* dritto in alto, bulge in basso */
  else if(flat==="bottom"){ cx=x+w/2; cy=y+d; rx=w/2; ry=d; a0=Math.PI; }  /* bulge in alto */
  else if(flat==="left"){ cx=x; cy=y+d/2; rx=w; ry=d/2; a0=-Math.PI/2; }   /* bulge a destra */
  else { cx=x+w; cy=y+d/2; rx=w; ry=d/2; a0=Math.PI/2; }                   /* right: bulge a sinistra */
  for(var i=0;i<N;i++){ var a=a0+Math.PI*i/(N-1); out.push([cx+rx*Math.cos(a), cy+ry*Math.sin(a)]); }
  return out;
}
/* La FOTO della scena (pianta v1, vedi la specifica): coordinate in cm interi, girate perché le sedie guardino
   in alto (palco in alto) e traslate perché il riquadro parta da 0,0, con 100 cm di margine.
   Null se non ci sono posti numerati. `st` = lo stato da fotografare (di norma quello vivo). */
function bglPianta(st){
  st=st||(typeof state!=="undefined" ? state : null); if(!st) return null;
  var items=st.items||[], seats=items.filter(postoNumerato);
  if(!seats.length) return null;
  var f=postiVerso(seats);
  if(!f){   /* sedie che guardano da parti diverse: ci si regola sul settore più numeroso */
    var per=Object.create(null), best=null;
    seats.forEach(function(s){ var n=postoSettore(s); (per[n]=per[n]||[]).push(s); });
    Object.keys(per).forEach(function(n){ if(best==null || per[n].length>per[best].length) best=n; });
    f=postiVerso(per[best]);
  }
  var th=f ? (-Math.PI/2-Math.atan2(f.y,f.x)) : 0, c=Math.cos(th), s=Math.sin(th), gradi=th*180/Math.PI;
  function R(p){ return [p[0]*c-p[1]*s, p[0]*s+p[1]*c]; }
  function rotNorm(r){ r=((r+180)%360+360)%360-180; return r===-180 ? 180 : r; }
  var blocchi=(st.stage && st.stage.blocks && st.stage.blocks.length) ? st.stage.blocks : [{x:0,y:0,w:(st.stage&&st.stage.w)||1200,d:(st.stage&&st.stage.d)||800}];
  var palco=blocchi.slice(0,16).map(function(b){ return (b.shape==="semi" ? bglSemiPoligono(b) : blockCorners(b)).map(R); });
  var pedane=items.filter(function(it){ return piantaPedana(it.type); }).slice(0,200)
    .map(function(it){ return itemCorners(it).map(R); });
  var sedie=seats.map(function(it){
    var p=R([it.x,it.y]), w=Math.max(10,Math.min(300,Math.round(+it.w||piantaSediaMisure().w))), d=Math.max(10,Math.min(300,Math.round(+it.d||piantaSediaMisure().d)));
    return {it:it, x:p[0], y:p[1], w:w, d:d, rot:rotNorm((+it.rot||0)+gradi)};
  });
  var x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
  function tocca(px,py){ if(px<x0) x0=px; if(px>x1) x1=px; if(py<y0) y0=py; if(py>y1) y1=py; }
  palco.concat(pedane).forEach(function(poly){ poly.forEach(function(p){ tocca(p[0],p[1]); }); });
  sedie.forEach(function(q){
    var a=q.rot*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
    [[-q.w/2,-q.d/2],[q.w/2,-q.d/2],[q.w/2,q.d/2],[-q.w/2,q.d/2]].forEach(function(p){ tocca(q.x+p[0]*ca-p[1]*sa, q.y+p[0]*sa+p[1]*ca); });
  });
  var M=100, dx=M-x0, dy=M-y0;
  function P(p){ return [Math.round(p[0]+dx), Math.round(p[1]+dy)]; }
  return {
    v:1,
    box:[0, 0, Math.round(x1-x0+2*M), Math.round(y1-y0+2*M)],
    palco:palco.map(function(poly){ return poly.map(P); }),
    pedane:pedane.map(function(poly){ return poly.map(P); }),
    posti:sedie.map(function(q){ var p=P([q.x,q.y]);
      return {k:bglChiave(q.it), settore:postoSettore(q.it).replace(/\|/g,"/"), fila:String(q.it.fila), posto:q.it.posto, x:p[0], y:p[1], w:q.w, d:q.d, rot:Math.round(q.rot)}; })
  };
}
/* Cosa impedirebbe di pubblicare la foto (il server rifiuterebbe), detto in italiano: [] se va bene */
function bglProblemiPianta(p){
  var out=[];
  if(!p || !p.posti || !p.posti.length){ out.push("Non ci sono posti numerati."); return out; }
  if(p.posti.length>2000) out.push("Troppi posti: ne sono ammessi al massimo 2000, qui ce ne sono "+p.posti.length+".");
  var visti=Object.create(null), doppi=[];
  p.posti.forEach(function(q){ if(visti[q.k]) { if(doppi.indexOf(q.k)<0) doppi.push(q.k); } else visti[q.k]=1; });
  if(doppi.length) out.push("Questi posti esistono due volte: "+bglPostiNomi(doppi.slice(0,6))+(doppi.length>6?"…":"")+". Rinumera i posti, o dai un nome diverso al settore.");
  return out;
}
/* Sedie del pubblico che non hanno un numero: restano fuori dalla pianta, e va detto */
function bglSenzaNumero(st){ st=st||(typeof state!=="undefined" ? state : null); if(!st) return 0; return (st.items||[]).filter(function(it){ return postoTipo(it) && !postoNumerato(it); }).length; }
/* I tipi che la foto disegna come pedane: gli stessi che nel catalogo dell'editor hanno `riser:true`
   (un test confronta questa funzione con TYPES: un tipo pedana nuovo va aggiunto qui). */
function piantaPedana(type){ return type==="pedana" || type==="pedanacoro"; }
/* Le misure della sedia del pubblico quando l'elemento non le ha (le stesse di TYPES.sediapubblico) */
function piantaSediaMisure(){ return {w:50, d:53}; }
/* Le varianti (scene) di un documento salvato: [{id, nome, attiva}]. Un progetto «piatto» (versioni vecchie) ha una
   sola variante senza id. */
function piantaVarianti(doc){
  if(!doc || typeof doc!=="object") return [];
  if(!Array.isArray(doc.variants)) return Array.isArray(doc.items) ? [{id:null, nome:"Variante 1", attiva:true}] : [];
  var attiva=(typeof doc.active==="string"||typeof doc.active==="number") ? String(doc.active) : null, out=[];
  doc.variants.forEach(function(v, i){
    if(!v || typeof v!=="object" || !v.state || typeof v.state!=="object") return;
    var id=(typeof v.id==="string"||typeof v.id==="number") ? String(v.id) : null;
    out.push({id:id, nome:String(v.name||"Variante "+(i+1)).slice(0,80), attiva:false});
  });
  var a=null; out.forEach(function(v){ if(v.id!==null && v.id===attiva) a=v; });
  if(!a && out.length) a=out[0];
  if(a) a.attiva=true;
  return out;
}
/* Lo stato di una variante del documento salvato (quello di stageplot_projects.data). varianteId nullo = la variante
   attiva (o l'unica, per i documenti piatti). Una variante che non c'è più → null. */
function piantaStatoDaDocumento(doc, varianteId){
  if(!doc || typeof doc!=="object") return null;
  if(!Array.isArray(doc.variants)){
    if(varianteId!=null) return null;
    return Array.isArray(doc.items) ? doc : null;
  }
  var vs=piantaVarianti(doc), scelta=null;
  vs.forEach(function(v){ if(varianteId!=null ? v.id===String(varianteId) : v.attiva) scelta=v; });
  if(!scelta) return null;
  for(var i=0;i<doc.variants.length;i++){
    var v=doc.variants[i];
    if(v && v.state && typeof v.state==="object" && (scelta.id===null ? i===vs.indexOf(scelta) : String(v.id)===scelta.id)) return v.state;
  }
  return null;
}
/* La FOTO della pianta calcolata dal documento salvato, come la calcola l'editor dopo averlo aperto. L'editor passa
   ogni elemento da postoSanifica all'apertura (normalizeLoadedItems): qui si fa lo stesso su una COPIA. Se un giorno
   l'apertura dell'editor cambierà altri campi che la foto legge, il test RF1 diventerà rosso: si aggiunge qui quella
   stessa trasformazione (solo quella), mai una copia di normalizeState. */
function piantaDaDocumento(doc, varianteId){
  try{
    var st=piantaStatoDaDocumento(doc, varianteId); if(!st) return null;
    var items=(Array.isArray(st.items) ? st.items : []).map(function(it){
      if(!it || typeof it!=="object") return null;
      var c={}; for(var k in it) if(Object.prototype.hasOwnProperty.call(it,k)) c[k]=it[k];
      postoSanifica(c); return c;
    }).filter(function(x){ return !!x; });
    return bglPianta({items:items, stage:st.stage});
  }catch(e){ return null; }
}
/* ===== CONFRONTO FRA LA FOTO PUBBLICATA E LA SALA DI ADESSO (specifica area §4) =====
   Le due piante hanno ciascuna il suo riquadro (0,0 = 100 cm prima del punto più a sinistra e più in alto) e il suo
   verso (le sedie girate a guardare in su): aggiungere una sedia a sinistra sposta TUTTE le coordinate, e una sedia
   girata cambia di poco il verso medio. Prima si sovrappongono le due piante (la rotazione e la traslazione che meglio
   portano l'una sull'altra: il palco se è lo stesso, altrimenti i posti con lo stesso numero, scartando quelli mossi),
   poi si confronta posto per posto. Tolleranze in cm e gradi. */
function piantaTolleranze(){ return {cm:5, gradi:3, sedia:15}; }
/* rotazione + traslazione (Kabsch nel piano) che porta i punti c[0] sui punti c[1] */
function piantaKabsch(coppie){
  var n=coppie.length; if(!n) return null;
  var mx=0, my=0, fx=0, fy=0;
  coppie.forEach(function(c){ mx+=c[0][0]; my+=c[0][1]; fx+=c[1][0]; fy+=c[1][1]; });
  mx/=n; my/=n; fx/=n; fy/=n;
  var a=0, b=0;
  coppie.forEach(function(c){ var x=c[0][0]-mx, y=c[0][1]-my, u=c[1][0]-fx, v=c[1][1]-fy; a+=x*u+y*v; b+=x*v-y*u; });
  var ang=(n>=2 && (a||b)) ? Math.atan2(b, a) : 0, co=Math.cos(ang), si=Math.sin(ang);
  return {c:co, s:si, tx:fx-(mx*co-my*si), ty:fy-(mx*si+my*co), gradi:ang*180/Math.PI};
}
function piantaPorta(T, x, y){ return [x*T.c-y*T.s+T.tx, x*T.s+y*T.c+T.ty]; }
function piantaScarto(T, c){ var q=piantaPorta(T, c[0][0], c[0][1]); return Math.sqrt((q[0]-c[1][0])*(q[0]-c[1][0])+(q[1]-c[1][1])*(q[1]-c[1][1])); }
function piantaAllinea(foto, nuova){
  var tol=piantaTolleranze(), pf=(foto&&foto.palco)||[], pn=(nuova&&nuova.palco)||[], coppie=[], T=null;
  if(pf.length && pf.length===pn.length && pf.every(function(poly,i){ return poly.length===pn[i].length; })){
    pn.forEach(function(poly,i){ poly.forEach(function(p,j){ coppie.push([p, pf[i][j]]); }); });
    T=piantaKabsch(coppie);
    if(T && coppie.every(function(c){ return piantaScarto(T, c)<=tol.cm; })){ T.base="palco"; return T; }
  }
  var F=Object.create(null); coppie=[];
  ((foto&&foto.posti)||[]).forEach(function(q){ F[q.k]=q; });
  ((nuova&&nuova.posti)||[]).forEach(function(q){ if(F[q.k]) coppie.push([[q.x,q.y],[F[q.k].x,F[q.k].y]]); });
  T=piantaKabsch(coppie);
  for(var giro=0; T && giro<3; giro++){   /* i posti davvero spostati non devono tirare l'allineamento */
    var dentro=coppie.filter(function(c){ return piantaScarto(T, c)<=tol.sedia; });
    if(dentro.length===coppie.length || dentro.length<Math.max(2, coppie.length/2)) break;
    T=piantaKabsch(dentro);
  }
  if(T){ T.base="posti"; return T; }
  return {c:1, s:0, tx:0, ty:0, gradi:0, base:"nessuna"};
}
function piantaPoligoniUguali(T, a, b, cm){
  a=a||[]; b=b||[]; if(a.length!==b.length) return false;
  var usati=[];
  return b.every(function(pb){
    for(var i=0;i<a.length;i++){
      if(usati[i] || a[i].length!==pb.length) continue;
      var ok=pb.every(function(p,j){ var q=piantaPorta(T,p[0],p[1]); return Math.abs(q[0]-a[i][j][0])<=cm && Math.abs(q[1]-a[i][j][1])<=cm; });
      if(ok){ usati[i]=1; return true; }
    }
    return false;
  });
}
function piantaConfronta(foto, nuova, prenotati){
  var T=piantaAllinea(foto, nuova), tol=piantaTolleranze(), F=Object.create(null), N=Object.create(null), occ=Object.create(null);
  ((foto&&foto.posti)||[]).forEach(function(q){ F[q.k]=q; });
  ((nuova&&nuova.posti)||[]).forEach(function(q){ N[q.k]=q; });
  (prenotati||[]).forEach(function(k){ occ[k]=1; });
  function giro(a, b){ return Math.abs(((a-b)%360+540)%360-180); }
  function dist(q, f){ var p=piantaPorta(T, q.x, q.y); return Math.sqrt((p[0]-f.x)*(p[0]-f.x)+(p[1]-f.y)*(p[1]-f.y)); }
  var spostati=[], aggiunti=[], tolti=[];
  Object.keys(N).forEach(function(k){
    var q=N[k], f=F[k]; if(!f){ aggiunti.push(k); return; }
    if(dist(q, f)>tol.cm || giro((+q.rot||0)+T.gradi, +f.rot||0)>tol.gradi) spostati.push(k);
  });
  Object.keys(F).forEach(function(k){ if(!N[k]) tolti.push(k); });
  /* una sedia tolta e una aggiunta nello stesso punto sono la stessa sedia con un numero nuovo */
  var rinumerati=[], usati=Object.create(null);
  tolti.forEach(function(k){
    var best=null, bd=Infinity;
    aggiunti.forEach(function(k2){ if(usati[k2]) return; var d=dist(N[k2], F[k]); if(d<bd){ bd=d; best=k2; } });
    if(best!==null && bd<=tol.sedia){ usati[best]=1; rinumerati.push({da:k, a:best}); }
  });
  var daRin=Object.create(null); rinumerati.forEach(function(r){ daRin[r.da]=1; });
  tolti=tolti.filter(function(k){ return !daRin[k]; });
  aggiunti=aggiunti.filter(function(k){ return !usati[k]; });
  function file(P){ var o=Object.create(null); Object.keys(P).forEach(function(k){ o[P[k].settore+"|"+P[k].fila]={settore:P[k].settore, fila:P[k].fila}; }); return o; }
  var fF=file(F), fN=file(N);
  var fileNuove=Object.keys(fN).filter(function(g){ return !fF[g]; }).map(function(g){ return fN[g]; });
  var fileTolte=Object.keys(fF).filter(function(g){ return !fN[g]; }).map(function(g){ return fF[g]; });
  var palcoCambiato=!piantaPoligoniUguali(T, foto&&foto.palco, nuova&&nuova.palco, tol.cm) ||
    !piantaPoligoniUguali(T, foto&&foto.pedane, nuova&&nuova.pedane, tol.cm);
  var bloccanti=[], prenotatiSpostati=[];
  tolti.forEach(function(k){ if(occ[k]) bloccanti.push({k:k, motivo:"tolto"}); });
  rinumerati.forEach(function(r){ if(occ[r.da]) bloccanti.push({k:r.da, motivo:"rinumerato", a:r.a}); });
  spostati.forEach(function(k){ if(occ[k]) prenotatiSpostati.push(k); });
  return {uguale:!spostati.length && !aggiunti.length && !tolti.length && !rinumerati.length && !palcoCambiato,
    spostati:spostati, aggiunti:aggiunti, tolti:tolti, rinumerati:rinumerati, fileNuove:fileNuove, fileTolte:fileTolte,
    palcoCambiato:palcoCambiato, bloccanti:bloccanti, prenotatiSpostati:prenotatiSpostati};
}
/* Il confronto in parole: «12 posti spostati · 2 posti in più · fila J nuova · nessun posto prenotato coinvolto» */
function piantaRiassunto(c){
  if(!c) return "";
  if(c.uguale) return "Nessuna differenza";
  function n(x, uno, tanti){ return x===1 ? "1 "+uno : x+" "+tanti; }
  function elenco(v){ return v.length<=1 ? v.join("") : v.slice(0,-1).join(", ")+" e "+v[v.length-1]; }
  function nomeFila(f){ return (f.settore!=="Platea" ? f.settore+" " : "")+f.fila; }
  var out=[];
  if(c.spostati.length) out.push(n(c.spostati.length, "posto spostato", "posti spostati"));
  if(c.aggiunti.length) out.push(n(c.aggiunti.length, "posto in più", "posti in più"));
  if(c.tolti.length) out.push(n(c.tolti.length, "posto in meno", "posti in meno"));
  if(c.rinumerati.length) out.push(n(c.rinumerati.length, "posto con un numero nuovo", "posti con un numero nuovo"));
  if(c.fileNuove.length) out.push((c.fileNuove.length===1 ? "fila " : "file ")+elenco(c.fileNuove.map(nomeFila))+(c.fileNuove.length===1 ? " nuova" : " nuove"));
  if(c.fileTolte.length) out.push((c.fileTolte.length===1 ? "fila " : "file ")+elenco(c.fileTolte.map(nomeFila))+(c.fileTolte.length===1 ? " tolta" : " tolte"));
  if(c.palcoCambiato) out.push("palco o pedane cambiati");
  if(c.bloccanti.length) out.push(n(c.bloccanti.length, "posto prenotato coinvolto", "posti prenotati coinvolti"));
  else if(c.prenotatiSpostati.length) out.push(n(c.prenotatiSpostati.length, "posto prenotato solo spostato", "posti prenotati solo spostati"));
  else out.push("nessun posto prenotato coinvolto");
  return out.join(" · ");
}
/* Tutto il modulo in un oggetto: per Node (module.exports) e per chi lo vuole per nome. */
function piantaPostiModulo(){
  return {postoTipo:postoTipo, postoNumerato:postoNumerato, postoSettore:postoSettore, postoNomeSettore:postoNomeSettore,
    postoSanifica:postoSanifica, postoVerso:postoVerso, postiVerso:postiVerso, hasPts:hasPts, blockCorners:blockCorners,
    itemCorners:itemCorners, bglChiave:bglChiave, bglPostoNome:bglPostoNome, bglPostiNomi:bglPostiNomi,
    bglSemiPoligono:bglSemiPoligono, bglPianta:bglPianta, bglProblemiPianta:bglProblemiPianta, bglSenzaNumero:bglSenzaNumero,
    piantaPedana:piantaPedana, piantaSediaMisure:piantaSediaMisure, piantaVarianti:piantaVarianti,
    piantaStatoDaDocumento:piantaStatoDaDocumento, piantaDaDocumento:piantaDaDocumento,
    piantaTolleranze:piantaTolleranze, piantaAllinea:piantaAllinea, piantaPorta:piantaPorta, piantaConfronta:piantaConfronta,
    piantaRiassunto:piantaRiassunto};
}
if(typeof module==="object" && module && module.exports) module.exports=piantaPostiModulo();
