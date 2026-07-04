# Zone di palco + Piano di assorbimenti — Fase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dare a StagePlot le zone di cablaggio e il calcolo della potenza elettrica: ogni elemento porta una potenza, il tool la somma (totale e per zona) e la mette in header, nel pannello e nel PDF consulenza.

**Architecture:** Additivo sul monolite `index.template.html` (→ `node build.mjs` → `index.html`). Nuove mappe JS (`WATT`, `WATT_BY_AREA`, `GEN_KVA`) e funzioni pure (`wattOf`, `powerTotalW`, `suggestGen`). Le zone sono un nuovo array `state.zones` (annotazione, non palco) reso in `stageLayerMarkup` (regioni dietro gli elementi) + handle di edit in `overlayLayerMarkup` quando attiva la modalità `zoneEdit`. Il PDF riusa il pattern jsPDF-nativo di `pdfChannelPage`.

**Tech Stack:** Vanilla JS in monolite HTML; build `node build.mjs`; niente framework di test → il ciclo di verifica è **build pulita + verifica visiva in Chrome (localhost:8614) + console pulita**.

## Global Constraints

- Sorgente unica: `index.template.html` + `src/styles.css` → `node build.mjs` → `index.html`. **Mai editare `index.html` a mano.**
- Retrocompat totale: `state.zones` e `it.watt` sono additivi; assenti = comportamento attuale. `normalizeState` inizializza `s.zones=[]`.
- Potenza sugli **amp rack / device attivi**; casse passive = 0 (no doppio conteggio). LED wall = area×500 W/m². Generatori = sorgenti (kVA×0.8), non carichi.
- Margine fisso **25%** in Fase A. Valori nominali → disclaimer nel PDF ("non sostituisce il progetto di un tecnico abilitato").
- Gate PDF: "Piano elettrico" solo in `window.__consultMode` e se `powerTotalW()>0`.
- Zone: assegnazione **geometrica** (centro elemento dentro il rettangolo); overlap → ultima zona in `state.zones`.
- Commit dopo ogni task; push su main solo dopo verifica visiva (flusso sessione).

---

### Task 1: Modello potenza (mappe + funzioni pure)

**Files:** Modify `index.template.html` (dopo il blocco `var TYPES = {...};`, prima di `var CAT_ORDER`).

**Interfaces — Produces:**
- `WATT` : `{typeKey: watt}` (potenza AC nominale al muro, W)
- `WATT_BY_AREA` : `{typeKey: W_per_m2}`
- `GEN_KVA` : `{typeKey: kVA}`
- `wattOf(it) → number` (W di un elemento: override `it.watt` › area › WATT › 0)
- `powerTotalW() → number` (Σ wattOf su `state.items`)
- `genCapacityW() → number` (Σ GEN_KVA×0.8×1000 dei generatori piazzati)
- `suggestGen(w) → string` (testo taglia consigliata)

- [ ] **Step 1: Aggiungere le mappe e le funzioni** dopo `var CAT_ORDER = [...];`

```js
/* ===== POTENZA ELETTRICA (Fase A: assorbimenti) ===== */
/* W nominali al muro. Solo i tipi che si alimentano; tutto il resto = 0 (non compare). */
var WATT = {
  comboamp:300, stack:450, bassamp:500, keysamp:200, leslie:300, edrums:80, djset:400,
  stagepiano:60, doppiatastiera:120, celesta:40,
  dm3:60, dm7c:120, dm7:150, csr3:280, csr5:350, csr10:600,
  sq5:90, sq6:100, sq7:110, avantis:180, dlives5:250, dlives7:280,
  q338:340, hd96:300, laptop:90, audiointerface:15, mixermonitor:150, foh:200,
  amprack:2500,
  consolaluci:100, dimmerluci:3600, testamobile:400, parluci:120, sagomatore:750,
  followspot:1200, strobo:900, fumomachine:1000, hazer:800, proiettore:400, camera:30,
  torrefaro:1500
};
var WATT_BY_AREA = { schermo:500, ledwallmod:500 };   /* LED wall: W per m² */
var GEN_KVA = { gen60:60, gen20:20 };                 /* sorgenti, non carichi */
function wattOf(it){
  if(!it) return 0;
  if(it.watt!=null && isFinite(it.watt)) return Math.max(0, +it.watt);
  if(WATT_BY_AREA[it.type]!=null) return Math.round((it.w/100)*(it.d/100)*WATT_BY_AREA[it.type]);
  return WATT[it.type]||0;
}
function hasWatt(type){ return WATT[type]!=null || WATT_BY_AREA[type]!=null; }
function powerTotalW(){ return (state.items||[]).reduce(function(a,it){ return a+wattOf(it); },0); }
function genCapacityW(){ return (state.items||[]).reduce(function(a,it){ return a + (GEN_KVA[it.type]?GEN_KVA[it.type]*800:0); },0); }
function suggestGen(w){
  var kw=w/1000;
  if(kw<=0) return "";
  if(kw<15) return "allaccio di rete (no generatore)";
  var sizes=[20,40,60,100,125,150,200,250,320];
  for(var i=0;i<sizes.length;i++){ if(sizes[i]*0.8>=kw) return "generatore "+sizes[i]+" kVA"; }
  return "≥2 generatori / cabina";
}
```

- [ ] **Step 2: Build** — `node build.mjs` → atteso `✓ index.html generato dai sorgenti.`
- [ ] **Step 3: Verifica in console** (localhost:8614 dopo reload): `wattOf` e `powerTotalW` esistono; `suggestGen(9000)` → `"generatore 20 kVA"`; `suggestGen(3000)` → `"allaccio di rete (no generatore)"`. Console pulita.
- [ ] **Step 4: Commit** — `git add index.template.html index.html && git commit -m "feat(power): modello potenza — mappe WATT/area/kVA + wattOf/powerTotalW/suggestGen"`

---

### Task 2: Potenza totale in header

**Files:** Modify `index.template.html` — `renderAccessoriCount()` (~riga 5580).

**Interfaces — Consumes:** `powerTotalW()`.

- [ ] **Step 1: Aggiungere la riga potenza** in `renderAccessoriCount`, dopo `if(c.hearbacks)…`:

```js
  var pw=powerTotalW();
  if(pw>0) parts.push('<span class="stat-pw" title="Potenza elettrica stimata (nominale)">⚡ '+(pw/1000).toFixed(1).replace(".",",")+" kW</span>");
```

- [ ] **Step 2: Build** — `node build.mjs`.
- [ ] **Step 3: Verifica in Chrome:** apri catalogo → Band e backline → Ampli → piazza "Combo chitarra" (300W) e un altro ampli; header mostra "⚡ 0,X kW". Rimuovi tutto → la voce sparisce.
- [ ] **Step 4: Commit** — `git commit -m "feat(power): potenza totale in header"`

---

### Task 3: Campo potenza nel pannello elemento (override `it.watt`)

**Files:** Modify `index.template.html` — HTML pannello `#selProps` (dopo la riga rotazione `pRot`, ~riga 421) + `renderProps()` (~riga 2857) + listener.

**Interfaces — Consumes:** `hasWatt(type)`, `wattOf(it)`. **Produces:** `it.watt` (number, W).

- [ ] **Step 1: HTML** — dopo `<div class="sldrow">…pRot…</div>` aggiungere:

```html
    <div id="pWattWrap" style="display:none"><label>Potenza (W)</label>
      <input type="number" id="pWatt" min="0" step="10" inputmode="numeric">
    </div>
```

- [ ] **Step 2: renderProps** — dentro `renderProps()`, prima del blocco Postazione, aggiungere:

```js
  var pw2=document.getElementById("pWattWrap");
  if(pw2){ var powered=hasWatt(it.type); pw2.style.display = powered ? "block" : "none";
    if(powered) document.getElementById("pWatt").value = wattOf(it); }
```

- [ ] **Step 3: Listener** — accanto agli altri listener del pannello (es. dopo il listener di `pRot`):

```js
document.getElementById("pWatt").addEventListener("change", function(){
  var v=parseInt(this.value,10); mutSel(function(it){ it.watt = isFinite(v)&&v>=0 ? v : null; });
});
```

- [ ] **Step 4: Build** — `node build.mjs`.
- [ ] **Step 5: Verifica in Chrome:** seleziona il Combo chitarra → compare "Potenza (W)"=300; cambialo a 800 → header sale; seleziona una sedia → il campo è nascosto.
- [ ] **Step 6: Commit** — `git commit -m "feat(power): campo Potenza (W) per-elemento nel pannello"`

---

### Task 4: Modello zone + rendering regioni

**Files:** Modify `index.template.html` — init `state` (2077), `normalizeState` (~2369), `stageLayerMarkup` (2751) + nuove funzioni `zonesRegionsMarkup`, `zoneOf`, `zoneWattW`; CSS in `src/styles.css`.

**Interfaces — Produces:**
- `state.zones` : array di `{id,label,x,y,w,d,color}`
- `zoneOf(it) → zoneId|null` (centro-in-rettangolo, ultima zona vince)
- `zoneWattW(zid) → number`
- `zonesRegionsMarkup() → string` (regioni dietro gli elementi)

- [ ] **Step 1: Init** — riga 2077, aggiungere `zones:[]`:

```js
var state = { titolo:"", luogo:"", stage:{w:1200,d:800,blocks:[{x:0,y:0,w:1200,d:800}]}, items:[], inputs:[], outputs:[], zones:[] };
```

- [ ] **Step 2: normalizeState** — prima di `return s;` aggiungere:

```js
  s.zones = Array.isArray(s.zones) ? s.zones.map(function(z,i){ return {
    id: z.id||("z"+(i+1)+"_"+Math.random().toString(36).slice(2,6)),
    label: String(z.label||"").slice(0,12),
    x:Math.max(0,Math.round(z.x||0)), y:Math.max(0,Math.round(z.y||0)),
    w:Math.max(30,Math.round(z.w||200)), d:Math.max(30,Math.round(z.d||200)),
    color: /^#[0-9a-fA-F]{6}$/.test(z.color||"") ? z.color : "#0d9488"
  }; }) : [];
```

- [ ] **Step 3: Funzioni zone** — accanto a `stageBlocks()`:

```js
function zoneOf(it){
  if(!it || !state.zones) return null;
  var cx=it.x, cy=it.y, hit=null;
  state.zones.forEach(function(z){ if(cx>=z.x && cx<=z.x+z.w && cy>=z.y && cy<=z.y+z.d) hit=z.id; });
  return hit;   /* ultima zona che contiene il centro */
}
function zoneWattW(zid){ return (state.items||[]).reduce(function(a,it){ return a + (zoneOf(it)===zid ? wattOf(it) : 0); },0); }
function zonesRegionsMarkup(){
  return (state.zones||[]).map(function(z){
    return '<g class="zone-reg">'
      +'<rect x="'+z.x+'" y="'+z.y+'" width="'+z.w+'" height="'+z.d+'" rx="10" fill="'+z.color+'" fill-opacity="0.05" stroke="'+z.color+'" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="12 8"/>'
      +'<text class="zone-tag" x="'+(z.x+8)+'" y="'+(z.y+20)+'" fill="'+z.color+'">'+esc(z.label||"")+'</text>'
      +'</g>';
  }).join("");
}
```

- [ ] **Step 4: Render** — in `stageLayerMarkup`, inserire `zonesRegionsMarkup()` **prima** dei text FONDO/PUBBLICO (le regioni stanno dietro agli elementi perché layStage precede layItems):

```js
function stageLayerMarkup(){
  var W=state.stage.w, D=state.stage.d;
  return stageFloorMarkup()+stageDimsMarkup()+zonesRegionsMarkup()
    +'<text class="zone-lbl" x="'+(W/2)+'" y="-42" text-anchor="middle">FONDO PALCO</text>'
    +'<text class="zone-lbl" x="'+(W/2)+'" y="'+(D+38)+'" text-anchor="middle">PUBBLICO</text>';
}
```

- [ ] **Step 5: CSS** — in `src/styles.css`:

```css
  .zone-tag{font:600 15px/1 system-ui,sans-serif}
  .stat-pw{color:var(--accent);font-weight:600}
```

- [ ] **Step 6: Build + verifica console:** `node build.mjs`; in Chrome console: `state.zones.push({id:"z1",label:"A",x:100,y:100,w:400,d:300,color:"#0d9488"}); render();` → si vede il rettangolo dashed teal con "A". Poi `state.zones=[]; render();`.
- [ ] **Step 7: Commit** — `git commit -m "feat(zone): modello state.zones + rendering regioni dietro gli elementi"`

---

### Task 5: Strumento "Zona" (crea/etichetta/colore/elimina + trascina/ridimensiona + kW per zona)

**Files:** Modify `index.template.html` — HTML nuovo pannello `#zoneSec` accanto a `#stageEditPanel`/`#venueSec`; azione "Zona" in `buildCatalog` (~3510); `overlayLayerMarkup` (2757) per gli handle; pointer handlers (pointerdown/move/up) per `mode:"zone"`/`"zoneresize"`; funzioni `toggleZoneEdit`, `renderZonePanel`, `addZone`, `delZone`.

**Interfaces — Consumes:** `zonesRegionsMarkup`, `zoneWattW`, `redrawStageLayers`. **Produces:** `zoneEdit` (bool), `selZone` (id).

- [ ] **Step 1: Variabili** — accanto a `var stageEdit=…`:

```js
var zoneEdit=false, selZone=null;
```

- [ ] **Step 2: Azione "Zona"** — in `buildCatalog`, nel blocco `if(c==="Palco e strutture"){…}`, dopo il bottone "Planimetria":

```js
      var ZONE_ICON='<svg class="mini" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect x="5" y="7" width="22" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="4 3"/></svg>';
      body.appendChild(makeActionBtn("Zona di cablaggio","raggruppa e calcola i kW", null, toggleZoneEdit, ZONE_ICON)); n++;
      entries.push({nome:"Zona di cablaggio", dim:"raggruppa e calcola i kW", action:toggleZoneEdit, iconHtml:ZONE_ICON});
```

- [ ] **Step 3: HTML pannello** — dopo `</div>` di `#venueSec` (dentro `#stageEditPanel`), aggiungere:

```html
    <div id="zoneSec" hidden>
      <h3 style="margin:0 0 8px">Zone di cablaggio</h3>
      <div class="hint" style="font-size:11.5px;color:var(--text-2);margin-bottom:9px">Ogni zona raggruppa gli elementi che contiene: 1 sub-stagebox + 1 power drop. Serve a organizzare cablaggio e potenza.</div>
      <button class="btn primary" id="bAddZone" style="width:100%">＋ Aggiungi zona</button>
      <div id="zoneList" style="display:flex;flex-direction:column;gap:6px;margin-top:10px"></div>
      <div id="zoneProps" hidden style="border-top:1px solid var(--border);margin-top:11px;padding-top:9px">
        <label>Etichetta</label><input type="text" id="zLabel" maxlength="12" placeholder="A / SX / Backline">
        <label style="margin-top:8px">Colore</label>
        <div class="chips" data-zcolor style="margin-top:4px">
          <button type="button" data-c="#0d9488" style="background:#0d9488"></button>
          <button type="button" data-c="#3b82f6" style="background:#3b82f6"></button>
          <button type="button" data-c="#d97706" style="background:#d97706"></button>
          <button type="button" data-c="#7c3aed" style="background:#7c3aed"></button>
          <button type="button" data-c="#dc2626" style="background:#dc2626"></button>
        </div>
        <div class="comp-dim" id="zoneReadout" style="margin-top:10px">—</div>
        <button class="btn danger" id="bDelZone" style="width:100%;margin-top:9px;font-size:12px">Elimina zona</button>
      </div>
      <button class="btn primary" id="bZoneDone" style="width:100%;margin-top:11px">Fatto</button>
    </div>
```

- [ ] **Step 4: renderStagePanel** — mostrare `#zoneSec` quando `stagePanelView==="zone"` (aggiungere a `stagePanelView` il terzo valore) e nascondere blocchi/planimetria; `toggleZoneEdit`:

```js
function toggleZoneEdit(){
  if(stageEdit && stagePanelView!=="zone"){ stagePanelView="zone"; selBlock=null; renderStagePanel(); render(); return; }
  if(!stageEdit){ stageEdit=true; stagePanelView="zone"; selBlock=null; exitHubModes("palco"); clearSelection(); }
  else { stageEdit=false; selZone=null; }
  zoneEdit=stageEdit && stagePanelView==="zone";
  renderStagePanel(); render();
}
```
(In `renderStagePanel`, dopo i toggle di `_bs`/`_vs`, aggiungere `var _zs=document.getElementById("zoneSec"); if(_zs) _zs.hidden = stagePanelView!=="zone"; zoneEdit = stageEdit && stagePanelView==="zone";`)

- [ ] **Step 5: renderZonePanel + add/del** — chiamare `renderZonePanel()` dentro `renderStagePanel` quando view zone:

```js
function addZone(){
  var W=state.stage.w, D=state.stage.d, w=Math.min(400,W*0.4), d=Math.min(300,D*0.4);
  var z={id:"z"+Date.now(), label:String.fromCharCode(65+state.zones.length), x:Math.round((W-w)/2), y:Math.round((D-d)/2), w:Math.round(w), d:Math.round(d), color:"#0d9488"};
  state.zones.push(z); selZone=z.id; save(); renderZonePanel(); redrawStageLayers();
}
function delZone(){ state.zones=state.zones.filter(function(z){return z.id!==selZone;}); selZone=null; save(); renderZonePanel(); redrawStageLayers(); }
function renderZonePanel(){
  var list=document.getElementById("zoneList"); if(!list) return;
  list.innerHTML="";
  state.zones.forEach(function(z){
    var b=document.createElement("button"); b.type="button"; b.className="blkchip"+(selZone===z.id?" sel":"");
    b.textContent=(z.label||"—")+" · "+(zoneWattW(z.id)/1000).toFixed(1).replace(".",",")+" kW";
    b.style.borderColor=z.color; b.addEventListener("click", function(){ selZone=z.id; renderZonePanel(); redrawStageLayers(); });
    list.appendChild(b);
  });
  var zp=document.getElementById("zoneProps"), z=state.zones.filter(function(x){return x.id===selZone;})[0];
  zp.hidden=!z;
  if(z){ document.getElementById("zLabel").value=z.label||"";
    document.querySelectorAll('[data-zcolor] button').forEach(function(btn){ btn.classList.toggle("on", btn.dataset.c===z.color); });
    var n=(state.items||[]).filter(function(it){return zoneOf(it)===z.id;}).length;
    document.getElementById("zoneReadout").textContent=n+" element"+(n===1?"o":"i")+" · "+(zoneWattW(z.id)/1000).toFixed(1).replace(".",",")+" kW";
  }
}
```

- [ ] **Step 6: Handle di edit in overlay** — modificare `overlayLayerMarkup`:

```js
function overlayLayerMarkup(){ return stageBlocksOverlay()+zonesOverlay()+frameMarkup(); }
function zonesOverlay(){
  if(!zoneEdit) return '';
  return (state.zones||[]).map(function(z){
    var sel=(selZone===z.id), s='<rect class="zone-hit" data-zone="'+z.id+'" x="'+z.x+'" y="'+z.y+'" width="'+z.w+'" height="'+z.d+'" rx="10"/>';
    if(sel){ var T=16;
      s+='<rect class="zone-edge ew" data-zedge="r" data-zone="'+z.id+'" x="'+(z.x+z.w-T/2)+'" y="'+z.y+'" width="'+T+'" height="'+z.d+'"/>'
        +'<rect class="zone-edge ew" data-zedge="l" data-zone="'+z.id+'" x="'+(z.x-T/2)+'" y="'+z.y+'" width="'+T+'" height="'+z.d+'"/>'
        +'<rect class="zone-edge ns" data-zedge="b" data-zone="'+z.id+'" x="'+z.x+'" y="'+(z.y+z.d-T/2)+'" width="'+z.w+'" height="'+T+'"/>'
        +'<rect class="zone-edge ns" data-zedge="t" data-zone="'+z.id+'" x="'+z.x+'" y="'+(z.y-T/2)+'" width="'+z.w+'" height="'+T+'"/>';
    }
    return s;
  }).join("");
}
```

- [ ] **Step 7: Pointer** — in `pointerdown` del canvas, **prima** del ramo blocchi, aggiungere il ramo zone (attivo solo in `zoneEdit`):

```js
  if(zoneEdit){
    var ze=e.target && e.target.getAttribute && e.target.getAttribute("data-zedge");
    var zid=e.target && e.target.getAttribute && e.target.getAttribute("data-zone");
    if(zid){ selZone=zid; var z=state.zones.filter(function(x){return x.id===zid;})[0];
      if(z){ drag = ze ? {mode:"zoneresize", zid:zid, edge:ze, x0:z.x,y0:z.y,w0:z.w,d0:z.d, sx:sp.x, sy:sp.y}
                       : {mode:"zone", zid:zid, ox:sp.x-z.x, oy:sp.y-z.y};
        renderZonePanel(); render(); svg.setPointerCapture(e.pointerId); return; }
    }
  }
```

- [ ] **Step 8: Pointer move** — nel `pointermove`, aggiungere i rami:

```js
  } else if(drag.mode==="zone"){
    var z=state.zones.filter(function(x){return x.id===drag.zid;})[0]; if(z){ z.x=Math.round(sp.x-drag.ox); z.y=Math.round(sp.y-drag.oy); drag.moved=true; redrawStageLayers(); }
  } else if(drag.mode==="zoneresize"){
    var z2=state.zones.filter(function(x){return x.id===drag.zid;})[0];
    if(z2){ var dx=sp.x-drag.sx, dy=sp.y-drag.sy;
      if(drag.edge==="r") z2.w=Math.max(30,Math.round(drag.w0+dx));
      if(drag.edge==="l"){ z2.x=Math.round(drag.x0+dx); z2.w=Math.max(30,Math.round(drag.w0-dx)); }
      if(drag.edge==="b") z2.d=Math.max(30,Math.round(drag.d0+dy));
      if(drag.edge==="t"){ z2.y=Math.round(drag.y0+dy); z2.d=Math.max(30,Math.round(drag.d0-dy)); }
      drag.moved=true; redrawStageLayers(); }
  }
```

- [ ] **Step 9: Pointer up** — nel `pointerup`, gestire i mode zone:

```js
  if(drag && (drag.mode==="zone"||drag.mode==="zoneresize")){ if(drag.moved){ save(); } renderZonePanel(); redrawStageLayers(); drag=null; return; }
```

- [ ] **Step 10: Listener pannello zone**:

```js
document.getElementById("bAddZone").addEventListener("click", addZone);
document.getElementById("bDelZone").addEventListener("click", delZone);
document.getElementById("bZoneDone").addEventListener("click", toggleZoneEdit);
document.getElementById("zLabel").addEventListener("input", function(){ var z=state.zones.filter(function(x){return x.id===selZone;})[0]; if(z){ z.label=this.value.slice(0,12); save(); renderZonePanel(); redrawStageLayers(); } });
document.querySelector('[data-zcolor]').addEventListener("click", function(e){ var b=e.target.closest("button"); if(!b) return; var z=state.zones.filter(function(x){return x.id===selZone;})[0]; if(z){ z.color=b.dataset.c; save(); renderZonePanel(); redrawStageLayers(); } });
```

- [ ] **Step 11: CSS** — `src/styles.css`:

```css
  .zone-hit{fill:transparent;stroke:transparent;cursor:move}
  body.stage-edit .zone-hit{pointer-events:auto}
  .zone-edge{fill:transparent}
  .zone-edge.ew{cursor:ew-resize} .zone-edge.ns{cursor:ns-resize}
  [data-zcolor]{display:flex;gap:6px}
  [data-zcolor] button{width:26px;height:26px;border-radius:7px;border:2px solid transparent;cursor:pointer}
  [data-zcolor] button.on{border-color:var(--text)}
```

- [ ] **Step 12: Build + verifica in Chrome:** Palco e strutture → "Zona di cablaggio" → "＋ Aggiungi zona"; compare rettangolo "A"; trascinalo sopra un ampli; il readout mostra "1 elemento · 0,3 kW"; cambia colore e label; aggiungi 2ª zona; "Fatto" chiude. Console pulita.
- [ ] **Step 13: Commit** — `git commit -m "feat(zone): strumento Zona (crea/etichetta/colore/trascina/ridimensiona + kW per zona)"`

---

### Task 6: PDF "Piano elettrico" (consulenza)

**Files:** Modify `index.template.html` — nuova `pdfPowerPage` (accanto a `pdfChannelPage`, ~7300) + call site (~7112).

**Interfaces — Consumes:** `powerTotalW`, `zoneWattW`, `genCapacityW`, `suggestGen`, `wattOf`, `zoneOf`.

- [ ] **Step 1: Funzione** — dopo `pdfChannelPage(...)`:

```js
function pdfPowerPage(doc, L, paperKey){
  var M=L.M, x=M, y=M+8, pw=L.pw, colW=pw-2*M;
  var dateStr=new Date().toLocaleDateString("it-IT");
  doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(17,24,39);
  doc.text(String(state.titolo||"Stage plot"), x, y);
  doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(120,120,120); doc.text(dateStr, pw-M, y, {align:"right"}); y+=5.5;
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text("PIANO ELETTRICO — valori nominali", x, y); y+=4;
  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(120,120,120);
  doc.text("Stima indicativa. Non sostituisce il progetto di un tecnico abilitato. Le casse passive sono alimentate dagli amp rack.", x, y); y+=4;
  doc.setDrawColor(17,24,39); doc.setLineWidth(0.5); doc.line(x,y,pw-M,y); y+=6;
  var cW=[colW*0.24, colW*0.56, colW*0.20];
  function row(a,b,c,bold){ doc.setFont("helvetica",bold?"bold":"normal"); doc.setFontSize(9); doc.setTextColor(17,24,39);
    doc.text(String(a), x, y); doc.text(String(b), x+cW[0], y); doc.text(String(c), pw-M, y, {align:"right"}); y+=5.4; }
  doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(120,120,120);
  doc.text("ZONA", x, y); doc.text("CARICHI ALIMENTATI", x+cW[0], y); doc.text("POTENZA", pw-M, y, {align:"right"}); y+=4;
  function labelsIn(zid){ var seen={},out=[]; (state.items||[]).forEach(function(it){ if(zoneOf(it)===zid && wattOf(it)>0){ var nm=(TYPES[it.type]&&TYPES[it.type].nome)||it.type; if(!seen[nm]){seen[nm]=1; out.push(nm);} } }); return out.join(", ")||"—"; }
  function kw(w){ return (w/1000).toFixed(1).replace(".",",")+" kW"; }
  var groups=(state.zones||[]).map(function(z){ return {label:z.label||"(zona)", zid:z.id}; });
  groups.push({label:"Fuori zona", zid:null});
  groups.forEach(function(g){ var w=zoneWattW(g.zid); if(w<=0 && g.zid!==null) return;
    var lab=doc.splitTextToSize(labelsIn(g.zid), cW[1]-2);
    row(g.label, lab[0]+(lab.length>1?"…":""), kw(w)); });
  y+=1; doc.setDrawColor(17,24,39); doc.setLineWidth(0.4); doc.line(x,y-3,pw-M,y-3);
  var tot=powerTotalW();
  row("TOTALE","", kw(tot), true);
  row("+ margine 25%","", kw(tot*1.25));
  var cap=genCapacityW();
  var sugg = cap>0 ? ("generatori sul palco: "+kw(cap)+" — "+(cap>=tot*1.25?"capienti":"INSUFFICIENTI")) : ("suggerito: "+suggestGen(tot*1.25));
  doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(cap>0&&cap<tot*1.25?200:17, cap>0&&cap<tot*1.25?60:24, cap>0&&cap<tot*1.25?60:39);
  doc.text(sugg, x, y); y+=5.4;
}
```

- [ ] **Step 2: Call site** — dopo il blocco channel list (~7112):

```js
    if(window.__consultMode && powerTotalW()>0){
      doc.addPage(paperKey, L.orient);
      pdfPowerPage(doc, L, paperKey);
    }
```

- [ ] **Step 3: Build** — `node build.mjs`.
- [ ] **Step 4: Verifica in Chrome (consult mode):** con `window.__consultMode=true`, piazza console + amp rack in una zona "FOH" e un ampli in zona "Backline", esporta PDF (click umano) → ultima pagina "Piano elettrico" con tabella per zona, totale, margine, taglia generatore. (Il click sintetico non scarica: verifica che `pdfPowerPage` non lanci errori via `makePdfDoc(...)` in console.)
- [ ] **Step 5: Commit** — `git commit -m "feat(power): pagina PDF 'Piano elettrico' nella consulenza (tabella per zona + totale + margine + generatore)"`

---

### Task 7: Colonna "Zona" nella channel list

**Files:** Modify `index.template.html` — `pdfChannelPage` colonne input (aggiunge ZONA) + (opzionale) badge zona nella UI channel list.

**Interfaces — Consumes:** `zoneOf`, `linkChannelsToItems`, `state.zones`.

- [ ] **Step 1: Zona per riga input nel PDF** — in `pdfChannelPage`, dentro `section`, calcolare la zona da `r.linked_item_id`:

```js
  function zoneLabelForRow(r){
    if(!r.linked_item_id) return "";
    var it=(state.items||[]).filter(function(x){return x.id===r.linked_item_id;})[0]; if(!it) return "";
    var zid=zoneOf(it); var z=(state.zones||[]).filter(function(x){return x.id===zid;})[0];
    return z ? (z.label||"") : "";
  }
```
E aggiungere la colonna ZONA allo schema `in` (prima di NOTE), riducendo NOTE:
```js
      ? [ {t:"CH",w:9,c:1,k:function(r,i){return i+1;}}, {t:"SORGENTE",w:56,k:function(r){return r.src;}}, {t:"MIC / DI",w:32,k:function(r){return r.mic;}}, {t:"STAND",w:24,k:function(r){return r.stand;}}, {t:"48V",w:10,c:1,k:function(r){return r.p48?"sì":"";}}, {t:"ZONA",w:14,c:1,k:function(r){return zoneLabelForRow(r);}}, {t:"FORN.",w:18,k:function(r){return r.by;}}, {t:"NOTE",w:0,k:function(r){return r.notes;}} ]
```
Prima del `section(...)`, chiamare `linkChannelsToItems();` così le righe hanno `linked_item_id`.

- [ ] **Step 2: Build** — `node build.mjs`.
- [ ] **Step 3: Verifica in Chrome (consult):** con una channel list e elementi in zone, il PDF input list mostra la colonna ZONA popolata (via `makePdfDoc` senza errori).
- [ ] **Step 4: Commit** — `git commit -m "feat(zone): colonna Zona nella input list del PDF consulenza"`

---

## Self-Review

**Spec coverage (§8 Fase A):** WATT+areaWatt+override → Task 1,3 ✓ · totale kW header → Task 2 ✓ · strumento Zona+kW per zona → Task 4,5 ✓ · PDF Piano elettrico+taglia generatore → Task 6 ✓ · colonna Zona channel list → Task 7 ✓.

**Type consistency:** `wattOf/powerTotalW/hasWatt/zoneOf/zoneWattW/genCapacityW/suggestGen` usati coerentemente tra i task. `state.zones` con campi `{id,label,x,y,w,d,color}` identici in init/normalize/render/edit. `zoneEdit`/`selZone`/`stagePanelView==="zone"` coerenti tra toggle/render/pointer.

**Note reali del codebase:** niente unit test → verifica = build pulita + Chrome. Push su main dopo verifica visiva (deploy GitHub Pages). Attenzione al `cd` esplicito nella repo `GITHUB/stageplot` prima dei git.
