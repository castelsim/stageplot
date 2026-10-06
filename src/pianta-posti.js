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
/* Tutto il modulo in un oggetto: per Node (module.exports) e per chi lo vuole per nome. */
function piantaPostiModulo(){
  return {postoTipo:postoTipo, postoNumerato:postoNumerato, postoSettore:postoSettore, postoNomeSettore:postoNomeSettore,
    postoSanifica:postoSanifica, postoVerso:postoVerso, postiVerso:postiVerso, hasPts:hasPts, blockCorners:blockCorners,
    itemCorners:itemCorners, bglChiave:bglChiave, bglPostoNome:bglPostoNome, bglPostiNomi:bglPostiNomi,
    bglSemiPoligono:bglSemiPoligono, bglPianta:bglPianta, bglProblemiPianta:bglProblemiPianta, bglSenzaNumero:bglSenzaNumero,
    piantaPedana:piantaPedana, piantaSediaMisure:piantaSediaMisure, piantaVarianti:piantaVarianti,
    piantaStatoDaDocumento:piantaStatoDaDocumento, piantaDaDocumento:piantaDaDocumento};
}
if(typeof module==="object" && module && module.exports) module.exports=piantaPostiModulo();
