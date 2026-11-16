/* ===== ICONE APPROVATE (Simone, 16/11/2026: «le icone che ho visto le approvo, fai del tuo meglio e con
   il tempo le miglioriamo») — tavola v1 del 07/11 (stageplot-assistant/kb/proposte/icone_2026-11/).
   Telo, cabina interpreti, altare, ambone e numerazione delle americane erano già entrati (#33, A4): qui le
   altre. Stesse primitive delle icone dell'app (bar, circ, lin) e colori scritti sugli attributi, perché
   svg2pdf li porti nel PDF. Pianta dall'alto, 1 unità = 1 cm, pubblico verso y+.
   - Prese: SIMBOLO da 30 cm (la faccia vera di una CEE 16 A è 6-7 cm, invisibile in scala; Mennekes).
     CEE = cerchio con gli ampere e i poli come puntini (si legge anche in bianco e nero); blu = 230 V
     monofase 3 poli, rosso = 400 V trifase 5 poli (IEC 60309); civile = quadrato; tratteggio = la porta
     il service. La rossa 16 A 5 poli l'ha chiesta un tecnico luci di teatro (10/11).
   - Punto di appendimento: anello + croce + punto blu (il segno del dead-hang) con nome e carico; se il
     carico supera la portata scritta, anello e numeri in rosso. Mai una portata calcolata: si scrive.
   - Tiro della sala: tubo Ø 48-50 mm (in pianta 5 cm), numerato come le americane (A4) con la T.
   - Boccascena, linea del sipario (zero delle quote), linea di centro CL, quinta numerata per coppia,
     uscita di sicurezza nostra (figura geometrica, non il pittogramma ISO 7010), gonna della pedana,
     croce. */
function _iaT(x, y, s, size, fill, weight, anchor){
  return '<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+(weight||700)+'" fill="'+(fill||"#111827")+'" text-anchor="'+(anchor||"middle")+'">'+s+'</text>';
}
function _iaR(v){ return Math.round(v*100)/100; }
function presaSvg(amp, poli, civile, service){
  var col=civile ? "#1f2937" : (poli===3 ? "#2563eb" : "#dc2626"), dash=service ? ' stroke-dasharray="5 3.5"' : "";
  if(civile){
    return '<rect x="-14" y="-14" width="28" height="28" rx="5" fill="#fff" stroke="'+col+'" stroke-width="2.4"'+dash+'/>'
      +'<circle cx="-5.5" cy="-5" r="1.6" fill="#1f2937"/><circle cx="5.5" cy="-5" r="1.6" fill="#1f2937"/>'
      +_iaT(0, 9.5, String(amp), 11);
  }
  var s='<circle cx="0" cy="0" r="15" fill="#fff" stroke="'+col+'" stroke-width="2.6"'+dash+'/>'
    +'<rect x="-2" y="-16.6" width="4" height="4" rx="1" fill="'+col+'"/>';
  for(var k=0;k<poli;k++){
    var a=(90+360*k/poli+(poli===3?180/poli:0))*Math.PI/180;
    s+='<circle cx="'+_iaR(11*Math.cos(a))+'" cy="'+_iaR(11*Math.sin(a))+'" r="1.25" fill="#1f2937"/>';
  }
  return s+_iaT(0, 3.6, String(amp), amp<100 ? 11 : 9.5)+_iaT(0, 9.6, poli+"P", 5.2, "#6b7280", 600);
}
function badgeSvg(x, y, n, r){
  r=r||11;
  return '<circle cx="'+_iaR(x)+'" cy="'+_iaR(y)+'" r="'+r+'" fill="#fff" stroke="#1f2937" stroke-width="2"/>'+_iaT(_iaR(x), _iaR(y+r*0.42), n, _iaR(r*1.18));
}
function tratteggioSvg(x0, y0, w, h, passo){
  var s="", k=-h;
  for(; k<w; k+=passo){
    var p=[];
    [0,h].forEach(function(yy){ var xx=yy+k; if(xx>=0 && xx<=w) p.push([xx,yy]); });
    [0,w].forEach(function(xx){ var yy=xx-k; if(yy>=0 && yy<=h) p.push([xx,yy]); });
    if(p.length>=2){ p.sort(function(a,b){ return a[0]-b[0] || a[1]-b[1]; });
      s+='<line x1="'+_iaR(x0+p[0][0])+'" y1="'+_iaR(y0+p[0][1])+'" x2="'+_iaR(x0+p[p.length-1][0])+'" y2="'+_iaR(y0+p[p.length-1][1])+'" stroke="#6b7280" stroke-width="1"/>'; }
  }
  return s;
}
function ptAppCarico(it){ var v=Math.round(+(it && it.carico)); return (isFinite(v) && v>0) ? Math.min(v, 99999) : 0; }
function ptAppPortata(it){ var v=Math.round(+(it && it.portata)); return (isFinite(v) && v>0) ? Math.min(v, 99999) : 0; }
function ptAppOltre(it){ var c=ptAppCarico(it), p=ptAppPortata(it); return !!(c && p && c>p); }
function puntoAppSvg(it){
  var oltre=ptAppOltre(it), ring=oltre ? "#dc2626" : "#33383e";
  var s='<circle cx="0" cy="0" r="11.2" fill="#fff"/>'
    +'<circle cx="0" cy="0" r="9.8" fill="none" stroke="'+ring+'" stroke-width="1.6"/>'
    +'<line x1="-15" y1="0" x2="15" y2="0" stroke="'+ring+'" stroke-width="1.2"/>'
    +'<line x1="0" y1="-15" x2="0" y2="15" stroke="'+ring+'" stroke-width="1.2"/>'
    +'<circle cx="0" cy="0" r="2.6" fill="#3b82f6"/>';
  var nome=String(it && it.label!=null ? it.label : "P1").slice(0,12);
  if(nome) s+=_iaT(19, -2, esc(nome), 10, "#111827", 700, "start");
  var c=ptAppCarico(it), p=ptAppPortata(it);
  if(c || p) s+=_iaT(19, 11, (c ? c+" kg" : "—")+(p ? " / "+p+" kg" : ""), 8, oltre ? "#dc2626" : "#4b5563", 600, "start");
  return s;
}
function uscitaFigSvg(bn, specchio){
  var fondo=bn ? "#fff" : "#16a34a", segno=bn ? "#111827" : "#fff";
  var s='<rect x="-30" y="-17" width="60" height="34" rx="3" fill="'+fondo+'"'+(bn ? ' stroke="#111827" stroke-width="2"' : "")+'/>';
  var st='fill="none" stroke="'+segno+'" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"';
  var g='<rect x="11" y="-12" width="13" height="24" rx="1" fill="none" stroke="'+segno+'" stroke-width="2.2"/>'
    +'<circle cx="-2" cy="-9.5" r="3" fill="'+segno+'"/>'
    +'<path '+st+' d="M -3.5,-4.5 L -6.5,4"/>'
    +'<path '+st+' d="M -6.5,4 L -1,7 L 1,12.5"/>'
    +'<path '+st+' d="M -6.5,4 L -11.5,8 L -16,7"/>'
    +'<path '+st+' d="M -3.8,-3.5 L 1.5,-1 L 5,-4"/>'
    +'<path '+st+' d="M -4.2,-3.2 L -9,-1 L -12.5,-4"/>'
    +'<path fill="none" stroke="'+segno+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M -26,12 L -17,12 M -20,9 L -17,12 L -20,15"/>';
  return s+(specchio ? '<g transform="scale(-1,1)">'+g+'</g>' : g);
}
var _IA_PRESE={ presa16:[16,3,false,false], presa16r:[16,5,false,false], presa32:[32,5,false,false], presa63:[63,5,false,false],
  presa125:[125,5,false,false], presa32s:[32,5,false,true], presaciv:[16,0,true,false] };
(function(){
  function presaTipo(k, nome, dim, alias){
    var p=_IA_PRESE[k];
    TYPES[k]={nome:nome, dim:dim, cat:"Elettrico", sub:"Prese", w:30, d:30, defLabel:"", alias:alias,
      draw:function(){ return presaSvg(p[0], p[1], p[2], p[3]); }};
  }
  presaTipo("presa16", "Presa CEE 16 A · 3 poli", "blu · 230 V · simbolo", "presa cee blu monofase 16a 16 ampere industriale 230v spina");
  presaTipo("presa16r", "Presa CEE 16 A · 5 poli", "rossa · 400 V · simbolo", "presa cee rossa trifase pentapolare 16a 400v industriale");
  presaTipo("presa32", "Presa CEE 32 A · 5 poli", "rossa · 400 V · simbolo", "presa cee rossa trifase pentapolare 32a 400v industriale");
  presaTipo("presa63", "Presa CEE 63 A · 5 poli", "rossa · 400 V · simbolo", "presa cee rossa trifase pentapolare 63a 400v industriale");
  presaTipo("presa125", "Presa CEE 125 A · 5 poli", "rossa · 400 V · simbolo", "presa cee rossa trifase pentapolare 125a 400v industriale");
  presaTipo("presa32s", "Presa CEE 32 A del service", "tratteggiata · la porta il service", "presa cee service portata dal service generatore 32a rossa");
  presaTipo("presaciv", "Presa civile 16 A", "quadrata · simbolo", "presa civile schuko bipasso 10a 16a domestica 230v");
  TYPES.puntoapp={nome:"Punto di appendimento", dim:"nome · carico · portata", cat:"Rigging e strutture", w:30, d:30, defLabel:"P1", innerLabel:true,
    alias:"punto di appendimento rigging point appendimento motore carico portata kg punto",
    draw:function(it){ return puntoAppSvg(it); }};
  TYPES.tiro={nome:"Tiro della sala (tubo)", dim:"tubo Ø 5 · numerato", cat:"Rigging e strutture", w:600, d:5, resizable:true, z:1, defLabel:"",
    alias:"tiro tiri stangone stangoni tubo graticcia americana di sala teatro",
    draw:function(it){ return bar(0,0,it.w,Math.max(3,it.d),'ic fGrey',2.5); }};
  TYPES.boccascena={nome:"Boccascena", dim:"luce 10 m · spalle in muratura", cat:"Palco e strutture", w:1240, d:60, resizable:true, z:1, defLabel:"",
    alias:"boccascena proscenio arco scenico spalle muro teatro apertura",
    draw:function(it){
      var W=it.w, D=it.d, muro=Math.min(120, W*0.12), luce=W-2*muro, s="";
      [-1,1].forEach(function(sd){ var x0=sd>0 ? W/2-muro : -W/2;
        s+='<rect x="'+_iaR(x0)+'" y="'+_iaR(-D/2)+'" width="'+_iaR(muro)+'" height="'+_iaR(D)+'" fill="#e5e7eb" stroke="#1f2937" stroke-width="2"/>'+tratteggioSvg(x0, -D/2, muro, D, 12); });
      var y=-D/2-26;
      s+='<line x1="'+_iaR(-luce/2)+'" y1="'+_iaR(y)+'" x2="'+_iaR(luce/2)+'" y2="'+_iaR(y)+'" stroke="#4b5563" stroke-width="1"/>'
        +'<line x1="'+_iaR(-luce/2)+'" y1="'+_iaR(y-7)+'" x2="'+_iaR(-luce/2)+'" y2="'+_iaR(y+7)+'" stroke="#4b5563" stroke-width="1"/>'
        +'<line x1="'+_iaR(luce/2)+'" y1="'+_iaR(y-7)+'" x2="'+_iaR(luce/2)+'" y2="'+_iaR(y+7)+'" stroke="#4b5563" stroke-width="1"/>'
        +_iaT(0, _iaR(y-6), "boccascena "+(luce/100).toFixed(2).replace(".",",")+" m", 13, "#4b5563", 600);
      return s; }};
  TYPES.lineasipario={nome:"Linea zero", dim:"linea del sipario · zero delle quote", cat:"Palco e strutture", w:1000, d:12, resizable:true, z:2, defLabel:"",
    alias:"linea del sipario sipario zero quote boccascena tenda",
    draw:function(it){ var W=it.w;
      return '<line x1="'+_iaR(-W/2)+'" y1="0" x2="'+_iaR(W/2)+'" y2="0" stroke="#7f1d1d" stroke-width="3"/>'
        +'<line x1="'+_iaR(-W/2)+'" y1="5" x2="'+_iaR(W/2)+'" y2="5" stroke="#7f1d1d" stroke-width="1" stroke-dasharray="3 4"/>'
        +_iaT(_iaR(W/2-6), -8, "LINEA DEL SIPARIO · 0,00", 11, "#7f1d1d", 600, "end"); }};
  TYPES.lineacentro={nome:"Linea di centro (CL)", dim:"tratto-punto", cat:"Palco e strutture", w:30, d:800, resizable:true, z:2, defLabel:"",
    alias:"linea di centro centro palco cl center line asse mezzeria",
    draw:function(it){ var D=it.d, s='<line x1="0" y1="'+_iaR(-D/2+28)+'" x2="0" y2="'+_iaR(D/2-28)+'" stroke="#1f2937" stroke-width="1.4" stroke-dasharray="24 6 4 6"/>';
      [-D/2+14, D/2-14].forEach(function(y){ s+='<circle cx="0" cy="'+_iaR(y)+'" r="13" fill="#fff" stroke="#1f2937" stroke-width="1.6"/>'+_iaT(0, _iaR(y+4), "CL", 10.5); });
      return s; }};
  TYPES.quintanum={nome:"Quinta numerata", dim:"150×12 · numero della coppia", cat:"Palco e strutture", w:150, d:12, resizable:true, z:1, defLabel:"1", innerLabel:true,
    alias:"quinta quinte numerata coppia di quinte teatro",
    draw:function(it){ var W=it.w, n=esc(String(it.label==null ? "" : it.label).slice(0,3));
      return bar(0,0,W,it.d,'ic fBlack',2)+lin(-W/2+12,0,W/2-12,0,'sil')+(n ? badgeSvg(W/2+16, 0, n, 10) : ""); }};
  TYPES.uscitafig={nome:"Uscita di sicurezza", dim:"segnale 60×34 · verde", cat:"Sicurezza e site", w:60, d:34, defLabel:"",
    alias:"uscita di sicurezza uscita emergenza exit via di fuga",
    draw:function(){ return uscitaFigSvg(false, false); }};
  TYPES.uscitafigsx={nome:"Uscita di sicurezza (verso sinistra)", dim:"segnale 60×34 · verde", cat:"Sicurezza e site", w:60, d:34, defLabel:"",
    alias:"uscita di sicurezza uscita emergenza exit via di fuga sinistra",
    draw:function(){ return uscitaFigSvg(false, true); }};
  TYPES.uscitafigbn={nome:"Uscita di sicurezza (bianco e nero)", dim:"segnale 60×34 · per la stampa", cat:"Sicurezza e site", w:60, d:34, defLabel:"",
    alias:"uscita di sicurezza uscita emergenza exit bianco e nero stampa",
    draw:function(){ return uscitaFigSvg(true, false); }};
  TYPES.gonna={nome:"Gonna della pedana", dim:"tessuto sul lato · 200", cat:"Palco e strutture", w:200, d:8, resizable:true, z:1, defLabel:"",
    alias:"gonna gonne skirt tessuto pedana copri pedana mantovana",
    draw:function(it){ var W=it.w, s='<line x1="'+_iaR(-W/2)+'" y1="0" x2="'+_iaR(W/2)+'" y2="0" stroke="#111827" stroke-width="4.5"/>', n=Math.max(2, Math.floor(W/12));
      for(var k=1;k<n;k++){ var x=-W/2+W*k/n; s+='<line x1="'+_iaR(x)+'" y1="0" x2="'+_iaR(x)+'" y2="5" stroke="#111827" stroke-width="1.4"/>'; }
      return s; }};
  TYPES.croce={nome:"Croce", dim:"su base · elemento del luogo", cat:"Palco e strutture", w:44, d:60, resizable:true, z:1, defLabel:"",
    alias:"croce crocifisso chiesa altare",
    draw:function(it){ var h=Math.min(it.d, 60);
      return circ(0,0,Math.min(22, it.w/2),'ic soft thin')+bar(0,0,5,h,'ic fGrey thin',1)+bar(0,-h*0.18,h*0.6,5,'ic fGrey thin',1); }};
})();
