/* Biglietteria — AREA DELL'ORGANIZZATORE, parte pura (specifica area §2). Nessun DOM e nessuna rete nelle funzioni
   esportate: le prova test/bgl-gestione.test.mjs in Node. Qui stanno, spostate dall'editor (che dal task 18 non ha più
   il pannello), lista per l'ingresso, CSV, PDF, tenuti da parte scritti a mano e date di Roma; e, nuove, le regole del
   modulo, l'elenco, gli indirizzi proposti, i messaggi e le chiamate. La pianta NON sta qui: è in
   biglietteria/pianta-posti.js (una sola fonte con l'editor). */
(function (root) {
  "use strict";
  var BGL = root.BGL || (typeof require === "function" ? require("../bgl.js") : null);
  var I = root.BGLIndirizzi || (typeof require === "function" ? require("../indirizzi.js") : null);
  var PP = typeof root.piantaPostiModulo === "function" ? root.piantaPostiModulo() : (typeof require === "function" ? require("../pianta-posti.js") : null);
  var esc = BGL.esc, bglPostoNome = PP.bglPostoNome, bglPostiNomi = PP.bglPostiNomi;
  var NON_ABILITATO = "La biglietteria è in prova solo su invito. Scrivi a info@stageplot.it";

  /* ---- spostate dall'editor (che dal task 18 non le ha più), con due ritocchi: il «per chi» e i bottoni in più ---- */
  function bglRiservatiDaTesto(testo, chiavi){
    chiavi=chiavi||[];
    var idx=Object.create(null), tutte=Object.create(null), settori=[];
    chiavi.forEach(function(k){
      var p=k.split("|"); if(p.length!==3) return;
      var a=p[1]+"|"+p[2], s=p[0]+"|"+p[1];
      (idx[a]=idx[a]||[]).push(k); (tutte[s]=tutte[s]||[]).push(k);
      if(settori.indexOf(p[0])<0) settori.push(p[0]);
    });
    settori.sort(function(a,b){ return b.length-a.length; });
    var out=[], sconosciuti=[], gia=Object.create(null);
    function dentro(k){ if(!gia[k]){ gia[k]=1; out.push(k); } }
    String(testo==null?"":testo).split(/[,;\n]+/).forEach(function(tok0){
      var tok=tok0.replace(/\s+/g," ").trim(); if(!tok) return;
      var t=tok, sett=null;
      for(var i=0;i<settori.length;i++){ var pre=settori[i].toLowerCase()+"/"; if(t.toLowerCase().indexOf(pre)===0){ sett=settori[i]; t=t.slice(pre.length).trim(); break; } }
      var m, fila, p0, p1, trovati=[];
      function filtra(l){ return (l||[]).filter(function(k){ return sett==null || k.split("|")[0]===sett; }); }
      if((m=/^(?:tutta\s+la\s+fila\s+|fila\s+)?([A-Za-z]{1,4})$/i.exec(t))){
        fila=m[1].toUpperCase();
        settori.concat([]).forEach(function(se){ trovati=trovati.concat(filtra(tutte[se+"|"+fila])); });
      } else if((m=/^([A-Za-z]{1,4})\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?$/.exec(t)) || (m=/^(\d{1,4})\s*[.:\/]\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?$/.exec(t))){
        fila=m[1].toUpperCase(); p0=+m[2]; p1=m[3]!=null ? +m[3] : p0;
        if(p1<p0){ var x=p0; p0=p1; p1=x; }
        for(var n=p0;n<=p1 && n-p0<=2000;n++) trovati=trovati.concat(filtra(idx[fila+"|"+n]));
      }
      if(!trovati.length){ sconosciuti.push(tok); return; }
      trovati.forEach(dentro);
      /* un intervallo che copre solo in parte posti che esistono (A1-4 con la fila di 3) non è un errore: avanza quel che c'è */
    });
    return {chiavi:out, sconosciuti:sconosciuti};
  }
  function bglRiservatiATesto(chiavi, tutte){
    var settori=Object.create(null), nS=0;
    (tutte||chiavi||[]).forEach(function(k){ var s=k.split("|")[0]; if(!settori[s]){ settori[s]=1; nS++; } });
    var per=Object.create(null), ordine=[];
    (chiavi||[]).forEach(function(k){
      var p=k.split("|"); if(p.length!==3) return;
      var g=p[0]+"|"+p[1]; if(!per[g]){ per[g]={s:p[0], f:p[1], n:[]}; ordine.push(g); }
      per[g].n.push(+p[2]);
    });
    return ordine.map(function(g){
      var r=per[g], n=r.n.sort(function(a,b){ return a-b; }), parti=[], i=0;
      while(i<n.length){ var j=i; while(j+1<n.length && n[j+1]===n[j]+1) j++;
        parti.push(j>i ? n[i]+"-"+n[j] : String(n[i])); i=j+1; }
      return (nS>1 ? r.s+"/" : "")+r.f+parti.join(", "+(nS>1 ? r.s+"/" : "")+r.f);
    }).join(", ");
  }
  function bglOffsetRoma(ms){
    var o={}; new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})
      .formatToParts(new Date(ms)).forEach(function(p){ o[p.type]=p.value; });
    return Math.round((Date.UTC(+o.year,+o.month-1,+o.day,+o.hour,+o.minute,+o.second)-Math.floor(ms/1000)*1000)/60000);
  }
  function bglDueCifre(n){ return (n<10?"0":"")+n; }
  function bglInizioIso(data, ora){
    var d=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data||"")), h=/^(\d{1,2}):(\d{2})$/.exec(String(ora||""));
    if(!d || !h) return null;
    var Y=+d[1], Mo=+d[2], D=+d[3], H=+h[1], Mi=+h[2];
    if(Mo<1||Mo>12||D<1||D>31||H>23||Mi>59) return null;
    var loc=Date.UTC(Y,Mo-1,D,H,Mi);
    if(new Date(loc).getUTCDate()!==D) return null;   /* 31 novembre e simili */
    var off=bglOffsetRoma(loc-2*3600000), ist=loc-off*60000, off2=bglOffsetRoma(ist);
    if(off2!==off){ off=off2; ist=loc-off*60000; }
    var seg=off<0?"-":"+", a=Math.abs(off);
    return d[1]+"-"+d[2]+"-"+d[3]+"T"+bglDueCifre(H)+":"+h[2]+":00"+seg+bglDueCifre(Math.floor(a/60))+":"+bglDueCifre(a%60);
  }
  function bglDataOra(iso){
    var ms=Date.parse(iso); if(!isFinite(ms)) return null;
    var l=new Date(ms+bglOffsetRoma(ms)*60000).toISOString();
    return {data:l.slice(0,10), ora:l.slice(11,16)};
  }
  function bglQuando(iso){
    var ms=Date.parse(iso); if(!isFinite(ms)) return "";
    var g=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(ms)), o=bglDataOra(iso);
    return g+", ore "+o.ora;
  }
  function bglQuandoBreve(iso){
    var ms=Date.parse(iso); if(!isFinite(ms)) return "";
    var o=bglDataOra(iso);
    return new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",weekday:"short",day:"numeric",month:"short"}).format(new Date(ms))+" · "+o.ora;
  }
  function bglNomeCompleto(p){
    var c=(p.cognome==null?"":String(p.cognome)).trim(), n=(p.nome==null?"":String(p.nome)).trim();
    return (c||n) ? (c+(c&&n?" ":"")+n) : "(dati cancellati)";
  }
  function bglSenzaAccenti(s){ return String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
  function bglCmp(a,b){ return String(a).localeCompare(String(b),"it",{sensitivity:"base"}); }
  function bglCmpFila(a,b){ return (a.length-b.length) || bglCmp(a,b); }
  function bglPostoDiChiave(k){ var p=String(k).split("|"); return {settore:p[0], fila:p[1], posto:+p[2]}; }
  function bglListaIngresso(dati, ordine){
    dati=dati||{};
    var per=(dati.evento && dati.evento.riservati_per) || {};   /* «per chi» dei posti tenuti da parte (specifica §2.3) */
    var pren=(dati.prenotazioni||[]).filter(function(p){ return p.stato==="attiva"; });
    if(ordine==="fila"){
      var righe=[], occ=Object.create(null);
      pren.forEach(function(p){ (p.posti||[]).forEach(function(k){ occ[k]=1;
        var q=bglPostoDiChiave(k); righe.push({k:k, settore:q.settore, fila:q.fila, posto:q.posto, chi:bglNomeCompleto(p), codice:p.codice||"", tipo:"prenotazione"}); }); });
      ((dati.evento && dati.evento.riservati) || []).forEach(function(k){ if(occ[k]) return;
        var q=bglPostoDiChiave(k); righe.push({k:k, settore:q.settore, fila:q.fila, posto:q.posto, chi:"Tenuto da parte"+(per[k] ? " — "+per[k] : ""), codice:"", tipo:"riservato"}); });
      var y=Object.create(null), n=Object.create(null), pianta=dati.evento && dati.evento.pianta;
      if(pianta && pianta.posti) pianta.posti.forEach(function(q){ var g=q.settore+"|"+q.fila; y[g]=(y[g]||0)+q.y; n[g]=(n[g]||0)+1; });
      function ordFila(r){ var g=r.settore+"|"+r.fila; return n[g] ? y[g]/n[g] : null; }
      righe.sort(function(a,b){
        var c=bglCmp(a.settore,b.settore); if(c) return c;
        var oa=ordFila(a), ob=ordFila(b);
        if(oa!=null && ob!=null && oa!==ob) return oa-ob;
        if(a.fila!==b.fila) return bglCmpFila(a.fila,b.fila);
        return a.posto-b.posto;
      });
      return righe;
    }
    return pren.map(function(p){
      return {cognome:(p.cognome==null?"":String(p.cognome)).trim(), nome:(p.nome==null?"":String(p.nome)).trim(), chi:bglNomeCompleto(p),
              posti:bglPostiNomi((p.posti||[]).slice().sort(function(a,b){ var x=bglPostoDiChiave(a), z=bglPostoDiChiave(b); return bglCmp(x.settore,z.settore)||bglCmpFila(x.fila,z.fila)||(x.posto-z.posto); })),
              codice:p.codice||"", tipo:"prenotazione"};
    }).sort(function(a,b){ return bglCmp(a.cognome||a.nome, b.cognome||b.nome) || bglCmp(a.nome,b.nome) || bglCmp(a.codice,b.codice); });
  }
  function bglDataCsv(iso){ var o=iso?bglDataOra(iso):null; return o ? o.data+" "+o.ora : ""; }
  function bglCsv(dati){
    var rows=[], stati={attiva:"Attiva", disdetta:"Disdetta", annullata:"Annullata dall'organizzatore"};
    ((dati||{}).prenotazioni||[]).slice().sort(function(a,b){ return bglCmp((a.cognome||"")+" "+(a.nome||""), (b.cognome||"")+" "+(b.nome||"")) || bglCmp(a.codice||"",b.codice||""); }).forEach(function(p){
      var posti=(p.stato==="attiva" ? p.posti : (p.posti_chiesti&&p.posti_chiesti.length ? p.posti_chiesti : p.posti))||[];
      posti.forEach(function(k){ var q=bglPostoDiChiave(k);
        rows.push([p.cognome||"", p.nome||"", p.email||"", q.settore, q.fila, String(q.posto), p.codice||"", stati[p.stato]||String(p.stato||""), bglDataCsv(p.creata_il)]); });
    });
    return rowsToCsv(["Cognome","Nome","Email","Settore","Fila","Posto","Codice","Stato","Prenotato il"], rows, ";", true);
  }
  function bglPdfTesto(s){
    return String(s==null?"":s).replace(/[\u0000-\u001f]/g," ").replace(/[^\u0000-ÿ–—‘’“”…€]/g,function(c){
      var b=c.normalize("NFD").replace(/[\u0300-\u036f]/g,""); return /^[ -~]+$/.test(b) ? b : "?"; });
  }
  function bglScriviLista(doc, dati, ordine){
    var ev=dati.evento||{}, c=dati.conteggi||{};
    var perC=(ordine==="fila") ? [] : bglListaIngresso(dati,"cognome"), perF=(ordine==="cognome") ? [] : bglListaIngresso(dati,"fila");
    (function(){
      var M=14, y=0, pag="";
      function tronca(t, mm){ t=bglPdfTesto(t); if(doc.getTextWidth(t)<=mm) return t; while(t.length>1 && doc.getTextWidth(t+"...")>mm) t=t.slice(0,-1); return t+"..."; }
      function banda(){
        doc.setFillColor("#0d9488"); doc.rect(0,0,210,14,"F");
        doc.setTextColor("#ffffff"); doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.text("STAGE PLOT — Lista per l'ingresso", M, 9);
        doc.setFont("helvetica","normal"); doc.setFontSize(9);
        doc.text("aggiornata il "+new Date().toLocaleDateString("it-IT")+" "+new Date().toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}), 196, 9, {align:"right"});
      }
      function intestazione(){
        y=22; doc.setTextColor("#111827"); doc.setFont("helvetica","bold"); doc.setFontSize(14);
        doc.splitTextToSize(bglPdfTesto(ev.titolo||""), 182).forEach(function(r){ doc.text(r, M, y); y+=6.2; });
        doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor("#374151");
        doc.text(bglPdfTesto(bglQuando(ev.inizio)+" — "+(ev.luogo||"")), M, y); y+=5.4;
        doc.setFontSize(9.5); doc.setTextColor("#555555");
        doc.text((c.prenotati||0)+" posti prenotati ("+(c.prenotazioni_attive||0)+" prenotazioni) · "+(c.riservati||0)+" tenuti da parte · "+(c.liberi||0)+" liberi · "+(c.totali||0)+" posti in tutto", M, y); y+=8;
      }
      function colonne(tipo){
        doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor("#0d9488");
        if(tipo==="cognome"){ doc.text("COGNOME E NOME", M+8, y); doc.text("POSTI", M+100, y); doc.text("CODICE", M+156, y); }
        else { doc.text("FILA", M+8, y); doc.text("POSTO", M+22, y); doc.text("NOME", M+40, y); doc.text("CODICE", M+156, y); }
        doc.setDrawColor("#0d9488"); doc.setLineWidth(0.4); doc.line(M, y+1.8, 196, y+1.8); y+=7.4;
      }
      function nuovaPagina(tipo){ doc.addPage("a4","portrait"); y=16; doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor("#6b7280");
        doc.text(bglPdfTesto(ev.titolo||"")+" — "+pag, M, y); y+=7; colonne(tipo); }
      function riga(tipo, r, grassetto){
        if(y>279) nuovaPagina(tipo);
        doc.setDrawColor("#374151"); doc.setLineWidth(0.3); doc.rect(M, y-4, 4.6, 4.6);
        doc.setFont("helvetica", grassetto?"bold":"normal"); doc.setFontSize(12); doc.setTextColor(r.tipo==="riservato" ? "#4b5563" : "#111827");
        if(tipo==="cognome"){ doc.text(tronca(r.chi, 88), M+8, y); doc.text(tronca(r.posti, 52), M+100, y); doc.text(bglPdfTesto(r.codice), M+156, y); }
        else { doc.text(bglPdfTesto(String(r.fila)), M+8, y); doc.text(String(r.posto), M+22, y); doc.text(tronca(r.chi, 112), M+40, y); doc.text(bglPdfTesto(r.codice), M+156, y); }
        doc.setDrawColor("#e5e7eb"); doc.line(M+8, y+2.2, 196, y+2.2); y+=8.2;
      }
      banda(); intestazione();
      if(ordine!=="fila"){
        pag="per cognome"; doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor("#111827"); doc.text("Per cognome", M, y); y+=6; colonne("cognome");
        if(!perC.length){ doc.setFont("helvetica","italic"); doc.setFontSize(12); doc.setTextColor("#6b7280"); doc.text("Nessuna prenotazione.", M, y); y+=8; }
        perC.forEach(function(r){ riga("cognome", r, false); });
        doc.setFont("helvetica","normal"); doc.setFontSize(11); doc.setTextColor("#555555"); y+=2;
        if(y>284){ nuovaPagina("cognome"); }
        doc.text(perC.length+(perC.length===1?" prenotazione":" prenotazioni"), M, y); y+=7;
      }
      if(ordine!=="cognome"){
        if(ordine!=="fila"){ doc.addPage("a4","portrait"); y=16; }
        pag="per fila"; doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor("#111827"); doc.text("Per fila (dal palco)", M, y); y+=6; colonne("fila");
        if(!perF.length){ doc.setFont("helvetica","italic"); doc.setFontSize(12); doc.setTextColor("#6b7280"); doc.text("Nessun posto prenotato o tenuto da parte.", M, y); y+=8; }
        var ultima=null;
        perF.forEach(function(r){
          var g=r.settore+"|"+r.fila;
          if(g!==ultima){ ultima=g; if(y>266) nuovaPagina("fila"); y+=1.6; doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor("#0d9488");
            doc.text(bglPdfTesto("FILA "+r.fila+(r.settore!=="Platea" ? " — "+r.settore : "")), M+8, y); y+=6.2; }
          riga("fila", r, false);
        });
      }
    })();
  }
  function bglRigaPrenotazione(p, azioni){
    var etic={attiva:"", disdetta:"Disdetta dall'utente", annullata:"Disdetta da te"};
    var attiva=p.stato==="attiva", posti=attiva ? p.posti : (p.posti_chiesti&&p.posti_chiesti.length ? p.posti_chiesti : p.posti);
    var conn=(typeof p.connessione==="number" && p.connessione>=1 && p.connessione%1===0) ? p.connessione : null;
    return '<li class="'+(attiva?'':'bgl-spenta')+'"><div class="bgl-p-chi"><strong>'+esc(bglNomeCompleto(p))+'</strong>'+(etic[p.stato]?'<span class="bgl-badge bgl-b-chiusa">'+esc(etic[p.stato])+'</span>':'')+
      (conn ? '<span class="bgl-badge bgl-b-conn" title="Prenotazioni arrivate dalla stessa connessione internet: possono essere della stessa persona con email diverse">Stessa connessione '+conn+'</span>' : '')+'</div>'+
      '<div class="bgl-ev-s">'+esc(bglPostiNomi(posti))+' · codice <b class="bgl-cod">'+esc(p.codice||"")+'</b></div>'+
      (p.email ? '<div class="bgl-ev-s">'+esc(p.email)+'</div>' : '')+
      (attiva ? '<button type="button" class="btn" data-az="disdici" data-id="'+esc(p.id)+'">Disdici per conto suo</button>'+
        (azioni||[]).map(function(a){ return '<button type="button" class="btn" data-az="'+esc(a.az)+'" data-id="'+esc(p.id)+'">'+esc(a.testo)+'</button>'; }).join("") : '')+'</li>';
  }
  function bglGruppiConnessione(prenotazioni){
    var visti=Object.create(null), n=0;
    (prenotazioni||[]).forEach(function(p){ var c=p.connessione; if(typeof c==="number" && c>=1 && c%1===0 && !visti[c]){ visti[c]=1; n++; } });
    return n;
  }
  function bglSlug(s){ return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"evento"; }
  function csvCell(v, sep){ v=(v==null?"":String(v)); return (v.indexOf(sep)>-1 || /["\n\r]/.test(v)) ? '"'+v.replace(/"/g,'""')+'"' : v; }
  function csvTesto(v){ v=(v==null?"":String(v)); return /^[=+\-@\t\r]/.test(v) ? "'"+v : v; }
  function rowsToCsv(headers, rows, sep, proteggi){
    sep=sep||";";
    var cella=proteggi ? function(c){ return csvCell(csvTesto(c),sep); } : function(c){ return csvCell(c,sep); };
    var out=[]; if(headers) out.push(headers.map(cella).join(sep));
    rows.forEach(function(r){ out.push(r.map(cella).join(sep)); });
    return "﻿"+out.join("\r\n")+"\r\n";   /* BOM + CRLF: massima compatibilità Excel/console */
  }


  /* ---- indirizzi proposti: gemelli di bgl_slug_da_testo / bgl_slug_proposto (0074; stessa tabella nei due test) ---- */
  var TRASLITTERA = { "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "è": "e", "é": "e", "ê": "e", "ë": "e", "ì": "i", "í": "i",
    "î": "i", "ï": "i", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ù": "u", "ú": "u", "û": "u", "ü": "u", "ý": "y", "ÿ": "y", "ç": "c", "ñ": "n" };
  var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  function slugDaTesto(t) {
    var s = String(t == null ? "" : t).replace(/[àáâãäåèéêëìíîïòóôõöùúûüýÿçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÇÑ]/g, function (c) { return TRASLITTERA[c.toLowerCase()]; });
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function slugProposto(titolo, inizioIso) {
    var o = bglDataOra(inizioIso); if (!o) return null;
    var coda = String(+o.data.slice(8, 10)) + "-" + MESI[+o.data.slice(5, 7) - 1];
    var base = slugDaTesto(titolo) || "spettacolo";
    return base.slice(0, 40 - coda.length - 1).replace(/-+$/, "") + "-" + coda;
  }

  /* ---- la sala in parole, per la scelta del progetto: «100 posti, file A–J» ---- */
  function piantaRiassuntoBreve(p) {
    var posti = (p && p.posti) || [];
    if (!posti.length) return "Nessun posto numerato";
    var settori = Object.create(null), y = Object.create(null), n = Object.create(null);
    posti.forEach(function (q) { settori[q.settore] = 1; y[q.fila] = (y[q.fila] || 0) + (+q.y || 0); n[q.fila] = (n[q.fila] || 0) + 1; });
    var tot = posti.length + (posti.length === 1 ? " posto" : " posti"), ns = Object.keys(settori).length;
    if (ns > 1) return tot + " in " + ns + " settori";
    var file = Object.keys(n).sort(function (a, b) { return y[a] / n[a] - y[b] / n[b]; });
    return tot + ", " + (file.length === 1 ? "fila " + file[0] : "file " + file[0] + "–" + file[file.length - 1]);
  }

  /* ---- «I miei spettacoli» (specifica §2.2) ---- */
  function statoRiga(ev) {
    if (!ev || ev.pubblicato === false) return { t: "bozza", c: "bozza" };
    if (ev.stato_pubblico === "conclusa") return { t: "concluso", c: "concluso" };
    if (ev.stato_pubblico === "aperta") return { t: "aperte", c: "aperte" };
    return { t: "chiuse", c: "chiuse" };
  }
  function contaRiga(ev) {
    var p = +ev.prenotati || 0, l = +ev.liberi || 0;
    return p + (p === 1 ? " prenotato" : " prenotati") + " · " + l + (l === 1 ? " libero" : " liberi");
  }
  function dividiSpettacoli(lista, adessoMs) {
    var prossimi = [], passati = [];
    (lista || []).forEach(function (e) { (Date.parse(e.inizio) + 12 * 3600 * 1000 >= adessoMs ? prossimi : passati).push(e); });
    prossimi.sort(function (a, b) { return Date.parse(a.inizio) - Date.parse(b.inizio); });
    passati.sort(function (a, b) { return Date.parse(b.inizio) - Date.parse(a.inizio); });
    return { prossimi: prossimi, passati: passati };
  }
  function luogoPredefinito(lista) {
    var l = (lista || []).filter(function (e) { return e && e.luogo; }).sort(function (a, b) { return Date.parse(b.inizio) - Date.parse(a.inizio); });
    return l.length ? l[0].luogo : "";
  }

  /* ---- il modulo «Nuovo spettacolo / modifica» (specifica §2.3) ---- */
  function lunghezza(s) { return Array.from(String(s)).length; }
  function riservatiPerPuliti(obj, riservati) {
    var out = {};
    (riservati || []).forEach(function (k) {
      var v = obj && Object.prototype.hasOwnProperty.call(obj, k) ? String(obj[k] == null ? "" : obj[k]).replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
      if (v) out[k] = v.slice(0, 60);
    });
    return out;
  }
  function datiModulo(c, opz) {
    opz = opz || {}; c = c || {};
    var e = {}, d = {};
    /* il database rifiuta i caratteri di controllo (bgl_testo; in descrizione e nota passa solo l'a capo): un tab
       incollato da Word diventa uno spazio qui, invece di un «Controlla la descrizione» che non si capisce */
    function riga(s) { return String(s || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim(); }
    function righe(s) { return String(s || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim(); }
    var titolo = riga(c.titolo), luogo = riga(c.luogo);
    var descr = righe(c.descrizione), note = righe(c.note);
    if (!titolo) e.titolo = "Scrivi il titolo dello spettacolo."; else if (lunghezza(titolo) > 120) e.titolo = "Al massimo 120 caratteri.";
    if (!luogo) e.luogo = "Scrivi dove si tiene."; else if (lunghezza(luogo) > 160) e.luogo = "Al massimo 160 caratteri.";
    if (lunghezza(descr) > 600) e.descrizione = "Al massimo 600 caratteri (adesso " + lunghezza(descr) + ").";
    if (lunghezza(note) > 200) e.note = "Al massimo 200 caratteri (adesso " + lunghezza(note) + ").";
    var inizio = bglInizioIso(c.data, c.ora), chiusura = null;
    if (!inizio) e.data = "Scegli il giorno e l'ora.";
    if (!c.chiusuraAllInizio) {
      chiusura = bglInizioIso(c.chiusuraData, c.chiusuraOra);
      if (!chiusura) e.chiusura = "Scegli quando chiudere le prenotazioni.";
      else if (inizio && Date.parse(chiusura) > Date.parse(inizio)) e.chiusura = "Le prenotazioni si chiudono prima dell'inizio, non dopo.";
    }
    if (opz.nuovo && !c.project_id) e.sala = "Scegli la sala: un progetto con i posti numerati.";
    if (c.slug_breve && !I.slugOk(c.slug_breve)) e.slug_breve = "Solo lettere minuscole, numeri e trattini (da 3 a 40).";
    d.titolo = titolo; d.luogo = luogo; d.descrizione = descr || null; d.note = note || null; d.inizio = inizio; d.chiusura = chiusura;
    if (c.project_id) d.project_id = c.project_id;
    if (c.variante !== undefined) d.variante = c.variante || null;
    if (c.locandina_path !== undefined) d.locandina_path = c.locandina_path || null;
    if (Array.isArray(c.riservati)) { d.riservati = c.riservati.slice(); d.riservati_per = riservatiPerPuliti(c.riservatiPer, c.riservati); }
    if (c.slug_breve) d.slug_breve = c.slug_breve;
    if (typeof c.pubblicato === "boolean") d.pubblicato = c.pubblicato;
    return { dati: d, errori: e };
  }

  /* ---- i messaggi per chi organizza (parole da concerto) ---- */
  function messaggio(r, contesto) {
    r = r || {};
    switch (r.errore) {
      case "non_autenticato": return "L'accesso è scaduto: entra di nuovo.";
      case "non_abilitato": return NON_ABILITATO;
      case "organizzatore_mancante": return "Prima scegli il nome e l'indirizzo della tua pagina.";
      case "non_tuo": return "Questo spettacolo non è tuo, o non esiste più.";
      case "pianta_non_valida": return "La sala non si può pubblicare" + (r.motivo ? ": " + (/doppi|stesso numero/.test(r.motivo) ? "ci sono posti con lo stesso numero" : String(r.motivo).replace(/_/g, " ")) : "") + ".";
      case "posto_prenotato": return (r.posti && r.posti.length ? bglPostiNomi(r.posti) + (r.posti.length > 1 ? " sono già prenotati" : " è già prenotato") : "Un posto è già prenotato") + ": prima disdici o sposta la prenotazione.";
      case "slug_occupato": return "Questo indirizzo è già usato: scegline un altro.";
      case "slug_bloccato": return contesto === "organizzatore"
        ? "L'indirizzo della tua pagina non si cambia più: dal primo spettacolo pubblicato il link può essere già stampato o condiviso."
        : "L'indirizzo dello spettacolo non si cambia più: qualcuno ha già prenotato con questo link.";
      case "ha_prenotazioni": return "Ci sono già prenotazioni: lo spettacolo non torna in bozza. Puoi chiudere le prenotazioni.";
      case "troppi_eventi": return "Hai già 50 spettacoli: eliminane qualcuno vecchio.";
      case "numero_diverso": return "Scegli " + (r.prima || "gli stessi") + " posti, come quelli di adesso.";
      case "posto_preso": return (r.presi && r.presi.length ? bglPostiNomi(r.presi) + (r.presi.length > 1 ? " sono appena stati presi" : " è appena stato preso") : "Un posto è appena stato preso") + ": scegline un altro.";
      case "posto_inesistente": return "Quel posto non c'è nella sala.";
      case "gia_disdetta": return "Questa prenotazione è già stata disdetta.";
      case "evento_concluso": return "Lo spettacolo è finito: non si cambia più.";
      case "dati_non_validi": return "Controlla " + ({ titolo: "il titolo", luogo: "il luogo", note: "la nota", descrizione: "la descrizione", inizio: "data e ora",
        chiusura: "la chiusura delle prenotazioni", slug: "l'indirizzo", slug_breve: "l'indirizzo", nome: "il nome", contatto_email: "l'email di contatto",
        locandina_path: "la locandina", logo_path: "il logo", posti: "i posti" }[r.campo] || "i dati") + ".";
      case "rete": return "Non riesco a collegarmi: controlla la rete e riprova.";
      default: return "Qualcosa non ha funzionato" + (r.errore ? " (" + r.errore + ")" : "") + ". Riprova fra un momento.";
    }
  }

  /* ---- le chiamate (stessa forma del pannello dell'editor: mai un'eccezione, mai undefined) ---- */
  var api = {
    trasporto: null,
    chiama: function (fn, args) {
      var T = api.trasporto;
      if (typeof T !== "function") return Promise.resolve({ ok: false, errore: "non_autenticato" });
      return new Promise(function (res) { res(T(fn, args || {})); }).then(function (r) {
        if (!r) return { ok: false, errore: "rete" };
        if (r.error) {
          var c = String(r.error.code || "");
          return { ok: false, errore: (c === "non_autenticato" || /^(PGRST30[123]|42501)$/.test(c)) ? "non_autenticato" : "rete", dettaglio: String(r.error.message || "") };
        }
        var d = r.data;
        return (d && typeof d === "object" && !Array.isArray(d) && typeof d.ok === "boolean") ? d : { ok: false, errore: "risposta_inattesa" };
      }, function (e) { return { ok: false, errore: "rete", dettaglio: String(e && e.message || e) }; });
    },
    organizzatoreMio: function () { return api.chiama("bgl_organizzatore_mio", {}); },
    slugLibero: function (s) { return api.chiama("bgl_slug_libero", { p_slug: s }); },
    organizzatoreSalva: function (d) { return api.chiama("bgl_organizzatore_salva", { p_dati: d }); },
    progettiSala: function () { return api.chiama("bgl_progetti_sala", {}); },
    spettacoloSalva: function (id, d) { return api.chiama("bgl_spettacolo_salva", { p_id: id || null, p_dati: d }); },
    prenotati: function (id) { return api.chiama("bgl_prenotati", { p_evento_id: id }); },
    annulla: function (pid, posti) { var a = { p_prenotazione_id: pid }; if (posti && posti.length) a.p_posti = posti; return api.chiama("bgl_annulla", a); },
    elimina: function (id) { return api.chiama("bgl_elimina", { p_evento_id: id }); },
    sposta: function (pid, posti) { return api.chiama("bgl_sposta", { p_prenotazione_id: pid, p_posti: posti }); }
  };

  /* ---- solo nel browser: PDF della lista e file da scaricare ---- */
  function creditoPdf(doc) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      var ps = doc.internal.pageSize, pw = ps.getWidth(), ph = ps.getHeight();
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(156, 163, 175);
      doc.text("Creato con stageplot.it", pw - 10, ph - 4.5, { align: "right" });
      if (n > 1) { doc.setFontSize(8); doc.setTextColor(107, 114, 128); doc.text("pag " + i + "/" + n, pw / 2, ph - 4.5, { align: "center" }); }
    }
  }
  function caricaJsPdf() {
    if (root.jspdf && root.jspdf.jsPDF) return Promise.resolve();
    return new Promise(function (ok, no) {
      var s = document.createElement("script"); s.src = "/vendor/pdf.min.js"; s.async = true;
      s.onload = function () { (root.jspdf && root.jspdf.jsPDF) ? ok() : no(new Error("jsPDF")); };
      s.onerror = function () { no(new Error("Impossibile caricare le librerie PDF")); };
      document.head.appendChild(s);
    });
  }
  function listaPdf(dati, ordine) {
    return caricaJsPdf().then(function () {
      var doc = new root.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      bglScriviLista(doc, dati, ordine); creditoPdf(doc);
      doc.save(bglSlug((dati.evento || {}).titolo) + "-lista-ingresso.pdf");
    });
  }
  function scarica(testo, nome, tipo) {
    var u = URL.createObjectURL(new Blob([testo], { type: tipo || "text/plain;charset=utf-8" })), a = document.createElement("a");
    a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }

  /* Email di contatto dell'organizzatore (revisione T23): vuota = nessuna email in pagina; altrimenti lo stesso schema
     della migrazione 0074 (un test controlla che la classe di caratteri sia la stessa) */
  var CONTATTO_RE = /^[^\s@<>"'`,;]+@[^\s@<>"'`,;]+\.[^\s@<>"'`,;]+$/;
  function contattoOk(v) {
    var t = String(v == null ? "" : v).trim();
    return t === "" || (t.length >= 3 && t.length <= 254 && CONTATTO_RE.test(t));
  }

  var GST = root.GST || {};
  /* le funzioni copiate dall'editor (Step 3), per nome */
  GST.bglRiservatiDaTesto = bglRiservatiDaTesto; GST.bglRiservatiATesto = bglRiservatiATesto; GST.bglOffsetRoma = bglOffsetRoma;
  GST.bglInizioIso = bglInizioIso; GST.bglDataOra = bglDataOra; GST.bglQuando = bglQuando;
  GST.bglQuandoBreve = bglQuandoBreve; GST.bglNomeCompleto = bglNomeCompleto; GST.bglSenzaAccenti = bglSenzaAccenti;
  GST.bglCmp = bglCmp; GST.bglCmpFila = bglCmpFila; GST.bglPostoDiChiave = bglPostoDiChiave;
  GST.bglListaIngresso = bglListaIngresso; GST.bglDataCsv = bglDataCsv; GST.bglCsv = bglCsv;
  GST.bglPdfTesto = bglPdfTesto; GST.bglScriviLista = bglScriviLista; GST.bglRigaPrenotazione = bglRigaPrenotazione;
  GST.bglGruppiConnessione = bglGruppiConnessione; GST.bglSlug = bglSlug; GST.csvCell = csvCell;
  GST.csvTesto = csvTesto; GST.rowsToCsv = rowsToCsv;
  GST.NON_ABILITATO = NON_ABILITATO; GST.slugDaTesto = slugDaTesto; GST.slugProposto = slugProposto;
  GST.piantaRiassuntoBreve = piantaRiassuntoBreve; GST.statoRiga = statoRiga; GST.contaRiga = contaRiga;
  GST.dividiSpettacoli = dividiSpettacoli; GST.luogoPredefinito = luogoPredefinito; GST.riservatiPerPuliti = riservatiPerPuliti;
  GST.datiModulo = datiModulo; GST.messaggio = messaggio; GST.api = api; GST.creditoPdf = creditoPdf;
  GST.listaPdf = listaPdf; GST.scarica = scarica; GST.CONTATTO_RE = CONTATTO_RE; GST.contattoOk = contattoOk;
  root.GST = GST;
  if (typeof module === "object" && module && module.exports) module.exports = GST;
})(typeof globalThis !== "undefined" ? globalThis : this);
