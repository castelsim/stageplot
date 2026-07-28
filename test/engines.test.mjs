/* StagePlot — test dei MOTORI (cablaggio audio, elettrico, monitoraggio digitale, microfonazione, zona).
 *
 * Perché: i motori sono la logica critica del tool; in sviluppo diverse regressioni si prendevano solo
 * col test manuale nel browser. Questa suite carica il codice REALE di index.html in un sandbox node
 * (stub DOM universale) e asserisce sui risultati dei motori puri. Zero dipendenze (solo node:vm).
 *
 * Uso:  node build.mjs && node test/engines.test.mjs
 *       (exit 1 se un test fallisce → usabile in pre-merge/CI)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appjs = readFileSync(join(root, "app.js"), "utf8");   /* l'app e' nel bundle defer app.js (build.mjs) */
const stylesCss = readFileSync(join(root, "src/styles.css"), "utf8");   /* il CSS e' sorgente: alcuni comportamenti (lock delle pedane) vivono li' */

/* ---- sandbox: carica gli <script> inline reali con uno stub DOM che ingoia tutto ---- */
function loadApp() {
  const mkU = () => { const f = function () { return U; }; const U = new Proxy(f, {
    get: (t, k) => { if (k === Symbol.toPrimitive) return () => 0; if (k === "length") return 0; return U; },
    apply: () => U, construct: () => U, set: () => true, has: () => true }); return U; };
  const U = mkU();
  const ctx = {
    console,
    navigator: { serviceWorker: { register: () => ({ then: () => ({ catch: () => {} }) }) }, userAgent: "node" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    Event: function () {}, CustomEvent: function () {},
    fetch: () => Promise.reject(new Error("no net")),
    location: { search: "", href: "http://localhost/", pathname: "/" },
    performance: { now: () => 0 }, atob: (s) => s, btoa: (s) => s,
    URL, URLSearchParams, XMLSerializer: function () { this.serializeToString = () => ""; },
  };
  ctx.document = new Proxy({}, { get: () => U });
  ctx.window = new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : U), set: (t, k, v) => { t[k] = v; return true; } });
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(appjs, ctx, { timeout: 20000 }); } catch (e) { /* il boot tocca il DOM (stub): ok, i motori sono gia' definiti (function-hoisting) */ }
  if (typeof ctx.TYPES !== "object" || typeof ctx.audioCablingEngine !== "function") {
    throw new Error("Sandbox non caricato: TYPES/motori mancanti (index.html cambiato struttura?)");
  }
  return ctx;
}

const A = loadApp();

/* ---- mini test runner ---- */
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } }
function eq(got, exp, msg) { const g = JSON.stringify(got), e = JSON.stringify(exp); if (g !== e) throw new Error((msg || "") + " atteso " + e + ", ottenuto " + g); }
function ok(cond, msg) { if (!cond) throw new Error(msg || "condizione falsa"); }
function throws(fn, code) {
  try { fn(); } catch (e) {
    if (code && e.code !== code) throw new Error("errore atteso " + code + ", ottenuto " + (e.code || e.message));
    return e;
  }
  throw new Error("eccezione attesa" + (code ? " (" + code + ")" : ""));
}
function reset() {
  A.state.items = []; A.state.inputs = []; A.state.outputs = []; A.state.contacts = []; A.state.rider = {};
  A.state.status = "bozza"; A.state.approval = { by: "", at: "" };
  A.state.lookDefault = "illustrato";   /* «Postazione» = default del progetto (senza questo, un test che lo lascia su «Strumento solo» inquina i successivi) */
  A.state.titolo = ""; A.state.luogo = ""; A.state.techContact = ""; A.state.venue = null; A.state.printFrame = null; A.state.zones = [];
  A.state.stage = { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] };   /* palco default: base per isFreshBlankProject */
  A.state.cab.on = false; A.state.cab.mode = "manual"; A.state.cab.manual = {};
  A.state.elec.on = false; A.state.elec.manual = {}; A.state.elec.uplinks = {};
  A.state.mond.on = false; A.state.mond.manual = {};
  A.__cabRes = null; A.__elecRes = null; A.__mondRes = null;
  /* confine documento: i test che caricano documenti multi-variante (loadDoc) lasciavano VARIANTS e
     DOC_EXTRA popolati, contaminando chi legge il DOCUMENTO e non la sola variante attiva
     (hasMeaningfulDocument → isFreshBlankProject). */
  A.VARIANTS = []; A.activeVar = null; A.DOC_EXTRA = {}; A.ensureVariants();
}
function add(type, x, y) { return A.addItem(type, { x, y }) || A.state.items[A.state.items.length - 1]; }   /* addItem puo' creare anche la DI: vale il valore restituito */
function chans(it) { return A.cabItemInputs(it); }

console.log("StagePlot — test motori\n");

console.log("Microfonazione / cabItemInputs:");
t("batteria = 8 canali (generica)", () => { reset(); const b = add("batteria", 400, 400); eq(chans(b).length, 8); });
t("archi vln1x2 default (archetto) = 2 canali DPA", () => { reset(); const v = add("vln1x2", 300, 300); eq(chans(v).length, 2); eq(chans(v)[0].mic, "DPA 4099"); });
t("archi vln1x2 miking pan1 = 1 canale, pan2 = 2", () => { reset(); const v = add("vln1x2", 300, 300); v.miking = "pan1"; A.__cabRes = null; eq(chans(v).length, 1); v.miking = "pan2"; eq(chans(v).length, 2); });
t("corista: nasce col SUO microfono (SM58); panoramico = 0", () => { reset(); const c = add("corista", 200, 300); eq(chans(c).length, 1, "un corista aggiunto a mano ha il suo mic"); eq(chans(c)[0].mic, "SM58"); c.micMode = "pano"; eq(chans(c).length, 0, "panoramico: lo copre il mic di sezione"); });
t("il coro generato in massa nasce panoramico (overhead, non un mic a testa)", () => {
  reset();
  const gen = A.choirItems ? A.choirItems({ s: 3, a: 3, t: 2, b: 2 }) : null;
  if (gen && gen.length) {
    const coristi = gen.filter(x => x.type === "corista");
    ok(coristi.length > 0, "il generatore crea coristi");
    ok(coristi.every(x => x.micMode === "pano"), "tutti panoramici: la ripresa e' d'insieme");
  } else {
    ok(appjs.indexOf('donna:s.donna, micMode:"pano"') > -1, "il generatore coro deve marcare i coristi come panoramici");
  }
});
t("cantante: mic personale (1 SM58) tranne panoramico (0)", () => { reset(); const c = add("cantante", 200, 300); eq(chans(c).length, 1); eq(chans(c)[0].mic, "SM58"); ["tonda","giraffa","mano"].forEach(function(m){ c.micMode=m; eq(chans(c).length,1,m+" = 1 canale"); }); c.micMode="pano"; eq(chans(c).length,0); });
t("fiato (tromba) default = 1 (e906), panoramico = 0", () => { reset(); const tr = add("tromba", 200, 300); eq(chans(tr).length, 1); eq(chans(tr)[0].mic, "e906"); tr.miking = "pan"; eq(chans(tr).length, 0); });
t("archi singolo (violoncello) archetto = 1, panoramico = 0", () => { reset(); const vc = add("violoncello", 200, 300); eq(chans(vc).length, 1); vc.miking = "pan"; eq(chans(vc).length, 0); });
t("Overhead sezione (micover) = 2 canali KM184 stereo", () => { reset(); const o = add("micover", 300, 300); eq(chans(o).length, 2); eq(chans(o).map((c) => c.mic), ["KM184", "KM184"]); });
t("Mic coro (micchoir) = 1 canale KM184 (sorgente)", () => { reset(); const mc = add("micchoir", 300, 300); eq(chans(mc).length, 1); eq(chans(mc)[0].mic, "KM184"); });

console.log("\nZona microfono panoramico:");
t("elemento dentro una zona -> 0 canali; la zona -> 1 canale inferito", () => {
  reset(); const v = add("vlnpost", 300, 300); const z = add("miczone", 300, 300); z.w = 220; z.d = 150;
  eq(chans(v).length, 0, "violino coperto"); eq(chans(z).length, 1, "zona"); eq(chans(z)[0].mic, "KM184", "mic zona");
});
t("micZoneLabel = sezione prevalente plurale (14/07): 'Violini'; zona vuota = KM184 / 'Zona panoramica'", () => {
  reset(); add("vlnpost", 300, 300); add("vlnpost", 340, 300); const z = add("miczone", 320, 300); z.w = 220; z.d = 150;
  eq(A.micZoneLabel(z), "Violini"); const z2 = add("miczone", 1500, 1500); z2.w = 100; z2.d = 100;
  eq(A.micZoneMic(z2), "KM184"); eq(A.micZoneLabel(z2), "Zona panoramica");
});
t("micZoneLabel con label numerati: 'Violino I 1/2' -> 'Violini I'", () => {
  reset(); const a = add("vlnpost", 300, 300); a.label = "Violino I 1"; const b = add("vlnpost", 340, 300); b.label = "Violino I 2";
  const z = add("miczone", 320, 300); z.w = 220; z.d = 150;
  eq(A.micZoneLabel(z), "Violini I");
});
t("ownMic: in zona 0 canali di default; con ownMic il mic singolo torna (zona resta 1 canale)", () => {
  reset(); const v = add("vlnpost", 300, 300); const z = add("miczone", 300, 300); z.w = 220; z.d = 150;
  eq(chans(v).length, 0, "default: coperto");
  v.ownMic = true; A.__cabRes = null;
  ok(chans(v).length >= 1, "ownMic: il mic singolo conta di nuovo");
  eq(chans(z).length, 1, "la zona resta 1 canale");
});
t("close-mic obbligato: kick/rullante/tom/hi-hat tengono il close mic in zona; crash/ride assorbiti", () => {
  reset();
  const z = add("miczone", 300, 300); z.w = 260; z.d = 200;
  const sn = add("snareR", 300, 300);
  const cr = add("crashR", 320, 300);
  A.__cabRes = null;
  ok(A.effOwnMic(sn), "rullante: close-obligato di default");
  ok(chans(sn).length >= 1, "rullante in zona tiene il suo mic");
  eq(chans(sn)[0].mic, "SM57", "rullante = SM57");
  ok(!A.effOwnMic(cr), "crash: non close-obligato");
  eq(chans(cr).length, 0, "crash in zona assorbito dall'overhead");
});
t("close-mic obbligato: override ownMic=false riporta il pezzo ad assorbito; micZoneSources ignora i kept", () => {
  reset();
  const z = add("miczone", 300, 300); z.w = 300; z.d = 220;
  const sn = add("snareR", 300, 300);
  const cr = add("crashR", 330, 300);
  A.__cabRes = null;
  const srcs = A.micZoneSources(z).map((s) => s.type);
  ok(srcs.includes("crashR") && !srcs.includes("snareR"), "la zona infera dai piatti, non dal rullante kept");
  sn.ownMic = false; A.__cabRes = null;
  eq(chans(sn).length, 0, "override esplicito: rullante assorbito");
});
t("close-mic esteso: chitarre/ampli/DI/voci tengono il mic in zona; sezioni archi/fiati assorbite", () => {
  reset();
  const z = add("miczone", 300, 300); z.w = 420; z.d = 320;
  const gt = add("gtstand", 280, 300);   // chitarra (MIKING senza pan)
  const amp = add("comboamp", 300, 280); // ampli (IN_SRC)
  const di = add("dimono", 320, 300);    // DI
  const vox = add("wireless", 300, 320); // voce (radiomic)
  const tr = add("tromba", 340, 300);    // fiato a sezione (MIKING con pan) → assorbibile
  A.__cabRes = null;
  ok(!A.zoneAbsorbable(gt) && chans(gt).length >= 1, "chitarra tiene il mic");
  ok(!A.zoneAbsorbable(amp) && chans(amp).length >= 1, "ampli tiene il mic");
  ok(!A.zoneAbsorbable(di) && chans(di).length >= 1, "DI tiene il canale");
  ok(!A.zoneAbsorbable(vox) && chans(vox).length >= 1, "voce tiene il mic");
  ok(A.zoneAbsorbable(tr), "fiato a sezione: assorbibile (ha opzione pan)");
  eq(chans(tr).length, 0, "fiato a sezione: assorbito dalla zona (invariato)");
});
t("coerenza ottoni: musTromboneBasso si comporta come gli altri tromboni (assorbibile in zona)", () => {
  reset();
  ok(A.zoneAbsorbable({ type: "musTromboneBasso" }), "trombone basso: assorbibile (ha close/pan come gli ottoni)");
  eq(A.zoneAbsorbable({ type: "musTromboneBasso" }), A.zoneAbsorbable({ type: "trombone" }), "coerente col trombone");
  const z = add("miczone", 300, 300); z.w = 260; z.d = 200;
  const tb = add("musTromboneBasso", 300, 300);
  A.__cabRes = null;
  eq(chans(tb).length, 0, "trombone basso in zona: assorbito");
  reset();
  const tb2 = add("musTromboneBasso", 300, 300);
  eq(chans(tb2)[0].mic, "MD421", "fuori zona: mic MD421 (default close, invariato)");
});
t("mono/stereo: tastiere stereo di default (invariate); it.stereo=false → mono; celesta mono→stereo", () => {
  reset();
  const gp = add("grancoda", 300, 300);
  eq(chans(gp).length, 2, "grancoda: stereo di default (2 canali, IN_MULTI invariato)");
  gp.stereo = false; A.__cabRes = null;
  eq(chans(gp).length, 1, "grancoda mono: 1 canale");
  eq(chans(gp)[0].mic, "KM184", "grancoda mono: mic KM184");
  reset();
  const ce = add("celesta", 300, 300);
  eq(chans(ce).length, 1, "celesta: mono di default");
  ce.stereo = true; A.__cabRes = null;
  const cc = chans(ce);
  eq(cc.length, 2, "celesta stereo: 2 canali");
  ok(/ L$/.test(cc[0].name) && / R$/.test(cc[1].name), "celesta stereo: nomi L/R");
});
t("mono/stereo: laptop/djset/pedaliera diventano sorgenti audio", () => {
  reset();
  const lp = add("laptop", 300, 300), dj = add("djset", 340, 300), pd = add("pedaliera", 380, 300);
  ok(A.isAudioSource(lp) && A.isAudioSource(dj) && A.isAudioSource(pd), "sono sorgenti audio");
  eq(chans(lp).length, 2, "laptop: stereo di default");
  eq(chans(dj).length, 2, "djset: stereo di default");
  eq(chans(pd).length, 1, "pedaliera: mono di default");
  pd.stereo = true; A.__cabRes = null;
  eq(chans(pd).length, 2, "pedaliera stereo: 2 canali");
});
t("L=dispari: alignStereoOdd porta L della coppia stereo su canale dispari (spare)", () => {
  const rows = [
    { n: 1, name: "Basso", itemId: "a" },
    { n: 2, name: "Piano L", itemId: "b" }, { n: 3, name: "Piano R", itemId: "b" },
  ];
  const out = A.alignStereoOdd(rows);
  eq(out.length, 4, "3 righe + 1 spare");
  ok(out.some((r) => r.spare), "inserito un canale spare");
  const pl = out.find((r) => r.name === "Piano L"), pr = out.find((r) => r.name === "Piano R");
  eq(pl.n % 2, 1, "Piano L su canale dispari");
  eq(pr.n, pl.n + 1, "Piano R subito dopo (pari)");
});
t("L=dispari: coppia già allineata (L dispari) non aggiunge spare", () => {
  const rows = [{ n: 1, name: "Piano L", itemId: "b" }, { n: 2, name: "Piano R", itemId: "b" }];
  const out = A.alignStereoOdd(rows);
  eq(out.length, 2, "nessuno spare");
  eq(out[0].n, 1, "L resta su 1 (dispari)");
  ok(A.isStereoPairStart(rows[0], rows[1]), "riconosce la coppia stereo L/R");
});
t("colonna Asta: micInfo espone lo stand; patchList lo porta nella riga", () => {
  eq(A.micInfo("KM184").stand, "asta giraffa", "KM184 → asta giraffa");
  eq(A.micInfo("SM57").stand, "asta bassa", "SM57 → asta bassa");
  eq(A.micInfo("DPA 4099").stand, "clip strumento", "DPA 4099 → clip strumento");
  eq(A.micInfo("DI").stand, "", "DI → nessuna asta");
  reset();
  add("grancoda", 300, 300);   // piano stereo microfonato KM184
  const rows = A.patchList().rows;
  ok(rows.length >= 1 && rows[0].stand === "asta giraffa", "la riga patchList porta lo stand del mic (KM184 → asta giraffa)");
});
t("Galleria Modelli: le 3 formazioni IT esistono e producono elementi", () => {
  ["matrimonio", "dj", "tributo"].forEach((k) => {
    const fd = A.formationData(k);
    ok(fd && fd.out && fd.out.length >= 8, k + ": formazione con elementi (" + (fd && fd.out ? fd.out.length : 0) + ")");
    ok(fd.out.some((it) => A.TYPES[it.type]), k + ": tipi validi");
  });
  eq(A.FORM_TITLES.matrimonio, "Matrimonio", "titolo matrimonio");
  eq(A.FORM_TITLES.dj, "DJ set", "titolo DJ");
});
t("Passacavi: 4 varianti con dimensioni reali + disegno giallo/nero", () => {
  ["micro", "midi", "xxl", "end"].forEach((k) => {
    ok(A.RAMP_TYPES[k], k + " esiste");
    const svg = A.drawCableRamp({ type: "cableramp", rampType: k, w: A.RAMP_TYPES[k].w, d: A.RAMP_TYPES[k].d });
    ok(svg && svg.indexOf("#efc31f") > -1 && svg.indexOf("#1c1c1c") > -1, k + ": disegno giallo+nero");
  });
  eq(A.RAMP_TYPES.micro.ch, 2, "Micro = 2 canali");
  eq(A.RAMP_TYPES.midi.ch, 5, "Midi = 5 canali");
  eq([A.RAMP_TYPES.midi.w, A.RAMP_TYPES.midi.d].join("x"), "88x54", "Midi 88x54 (≈ Defender MIDI 5)");
});
t("Passacavi tratta modulare: conteggio moduli dalla lunghezza + badge lunghezza in metri", () => {
  eq(A.rampModules({ type: "cableramp", rampType: "midi", w: 88 * 5 }), 5, "midi 440cm = 5 moduli");
  eq(A.rampModules({ type: "cableramp", rampType: "micro", w: 100 * 3 }), 3, "micro 300cm = 3 moduli");
  eq(A.rampModules({ type: "cableramp", rampType: "midi", w: 88 }), 1, "1 modulo");
  eq(A.rampModules({ type: "cableramp", rampType: "end", w: 54 }), 1, "rampa terminale conta 1");
  const svg = A.drawCableRamp({ type: "cableramp", rampType: "midi", w: 300, d: 54 });
  ok(svg.indexOf("3,0 m") > -1, "il disegno mostra la lunghezza reale (3,0 m), non il n° moduli");
  ok(svg.indexOf("×") === -1, "niente più conteggio ×N sul badge");
});
t("Coperture (gazebo/tende): telaio NON occludente + etichetta UNICA nome+dimensione", () => {
  const svg = A.drawGazebo({ type: "gazebo33", w: 300, d: 600 });
  ok(svg.indexOf('fill="none"') > -1, "perimetro senza riempimento → gli elementi sotto si vedono");
  ok(svg.indexOf("<text") === -1, "nessun testo nel disegno: l'etichetta è unica, gestita a livello app");
  eq(A.gazStructLabel({ type: "gazebo33", w: 300, d: 600 }), "Gazebo 3×6 m", "etichetta = nome + dimensione automatica");
  eq(A.gazStructLabel({ type: "gazebo33", w: 300, d: 600, label: "Bar" }), "Bar 3×6 m", "nome personalizzato, dimensione sempre automatica");
  ok(A.GAZ_TYPES.gazebo33 && A.GAZ_TYPES.tenda63 && A.GAZ_TYPES.pma, "gazebo, tenda 6×3 e PMA = coperture a telaio");
  ok(A.drawGazebo({ type: "pma", w: 500, d: 400 }, { cross: true }).indexOf("#dc2626") > -1, "PMA: croce rossa");
  ok(A.GAZEBO_SIZES.length >= 4, "taglie preset presenti");
  eq(A.gazLabel(450, 400), "4,5×4", "gazLabel converte cm→m");
});
t("Layer Coperture: isCover riconosce coperture (gazebo/tende/PMA/copertura palco), non gli altri", () => {
  ok(A.isCover({ type: "gazebo33" }) && A.isCover({ type: "tenda63" }) && A.isCover({ type: "pma" }), "gazebo, tenda, PMA = coperture");
  ok(A.isCover({ type: "roof86" }) && A.isCover({ type: "roof1210" }), "copertura palco = copertura");
  ok(!A.isCover({ type: "wedge" }) && !A.isCover({ type: "djset" }), "monitor/strumenti NON sono coperture");
});
t("Coperture — info: h di default, punto-nella-copertura, gear a rischio + copertura", () => {
  eq(A.coverH({ type: "gazebo33" }), 250, "gazebo: h default 2,5 m");
  eq(A.coverH({ type: "roof86" }), 500, "copertura palco: h default 5 m");
  eq(A.coverH({ type: "gazebo33", h: 300 }), 300, "h override rispettato");
  const g = { type: "gazebo33", x: 500, y: 500, w: 300, d: 600 };
  ok(A.ptInCover(500, 500, g) && A.ptInCover(640, 500, g), "centro e bordo (x=+140<150) dentro");
  ok(!A.ptInCover(700, 500, g), "x=+200>150 fuori");
  ok(A.coverAtRisk({ type: "djset" }) && !A.coverAtRisk({ type: "gazebo33" }), "gear teme la pioggia, la copertura no");
  reset();
  const gz = add("gazebo33", 500, 500); gz.w = 300; gz.d = 600;
  add("djset", 500, 500); add("djset", 1100, 1100);
  eq(A.coveredBy(gz).length, 1, "solo il DJ sotto il gazebo risulta coperto");
});
t("Direttore: microfono talkback → sorgente audio collegabile alla stage box", () => {
  reset();
  const d = add("direttore", 400, 300);
  ok(!A.isAudioSource(d), "senza mic: NON è sorgente");
  eq(A.cabItemInputs(d).length, 0, "senza mic: 0 canali");
  d.mic = true;
  ok(A.isAudioSource(d), "col mic: è sorgente audio");
  const ch = A.cabItemInputs(d);
  eq(ch.length, 1, "col mic: 1 canale talkback");
  ok(/palmare/i.test(ch[0].mic), "default = palmare (gelato) on/off");
  d.micType = "collodoca";
  ok(/collo/i.test(A.cabItemInputs(d)[0].mic), "collo d'oca se scelto");
});
t("Layer Musicisti: persone + strumenti suonati dentro, backline/arredo fuori", () => {
  ok(A.musLayerItem("gtstand") && A.musLayerItem("bassstand") && A.musLayerItem("batteristaR"), "chitarra/basso/batterista dentro");
  ok(A.musLayerItem("marimba") && A.musLayerItem("timpani") && A.musLayerItem("arpa") && A.musLayerItem("grancoda"), "mallet/timpani/arpa/piano dentro");
  ok(!A.musLayerItem("comboamp") && !A.musLayerItem("bassamp") && !A.musLayerItem("panchetta"), "ampli/panchetta (backline/arredo) FUORI");
  ok(A.musLayerItem("pedaliera"), "la pedaliera È strumento del musicista → DENTRO");
  ok(A.musLayerItem("vlnpost") && A.musLayerItem("direttore"), "compatibile con quelli già dentro");
  ok(!A.contactEligible("marimba") && A.contactEligible("vlnpost"), "il Contatto (stretto) resta 'persone', niente strumenti nudi");
});
t("Leggio generico: arpa e strumenti-musicista senza leggio nativo", () => {
  ok(A.leggioExtra({ type: "arpa" }) && A.leggioExtra({ type: "marimba" }) && A.leggioExtra({ type: "grancoda" }), "arpa/marimba/piano hanno il leggio opzionale");
  ok(!A.leggioExtra({ type: "vlnpost" }) && !A.leggioExtra({ type: "direttore" }) && !A.leggioExtra({ type: "batteria" }), "leggio nativo o batteria/direttore → niente generico");
  ok(!A.leggioExtra({ type: "comboamp" }) && !A.leggioExtra({ type: "wedge" }), "non-musicisti → niente leggio");
  ok(A.canHaveLucetta({ type: "arpa" }), "l'arpa col leggio può avere la lucetta");
});
t("Lucetta leggio: dove è ammessa + glyph lampada", () => {
  ok(A.canHaveLucetta({ type: "leggio" }) && A.canHaveLucetta({ type: "sedialeggio" }) && A.canHaveLucetta({ type: "vlnpost" }) && A.canHaveLucetta({ type: "direttore" }), "leggii standalone + postazioni + direttore");
  ok(!A.canHaveLucetta({ type: "wedge" }) && !A.canHaveLucetta({ type: "gazebo33" }), "chi non ha leggio → niente lucetta");
  ok(A.leggioLamp(0).indexOf("#f4c430") > -1, "la lampada ha la testa illuminata (ambra)");
});
t("Parapetto pedana: spessore 8 cm di default, si estende in lunghezza", () => {
  eq(A.TYPES.parapetto.d, 8, "spessore di default 8 cm");
  ok(A.TYPES.parapetto.resizable, "resizable (in lunghezza)");
  const svg = A.TYPES.parapetto.draw({ w: 400, d: 8 });
  ok(svg.indexOf('height="8"') > -1, "alla profondità di default il disegno è spesso 8 cm");
  // lo spessore resta fisso in resize (hook itemresize: nd=TYPES.parapetto.d) → verificato nel browser
});
t("zona da selezione: hull poligonale aderente (gruppo in diagonale → area << bbox)", () => {
  reset();
  const a = add("vlnpost", 300, 300); a.rot = 40;
  const b = add("vlnpost", 420, 380); b.rot = 40;
  const c = add("vlnpost", 540, 460); c.rot = 40;
  const shape = A.miczoneShapeFromItems([a, b, c], 25);
  ok(shape && shape.pts && shape.pts.length >= 4, "hull con vertici poligonali");
  function area(pts){ let s2 = 0; for (let i = 0; i < pts.length; i++){ const p = pts[i], q = pts[(i + 1) % pts.length]; s2 += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s2) / 2; }
  const bb = A.polyBBox(shape.pts);
  ok(area(shape.pts) < bb.w * bb.d * 0.75, "hull sensibilmente più aderente del rettangolo assiale (area " + Math.round(area(shape.pts)) + " vs bbox " + Math.round(bb.w * bb.d) + ")");
  // i centri degli elementi restano DENTRO la zona creata
  const z = add("miczone", shape.x, shape.y); z.pts = shape.pts; A.miczoneRecenter(z); A.__cabRes = null;
  eq(A.micZoneSources(z).length, 3, "tutte le sorgenti coperte dall'hull");
});
t("zona: il cavo audio parte dal pallino mic (micPos), e lo segue quando si sposta", () => {
  reset();
  const v = add("vlnpost", 300, 300); const z = add("miczone", 300, 300); z.w = 220; z.d = 150;
  const sb = add("stagebox", 800, 600);
  A.state.cab.on = true; A.__cabRes = null;
  const a1 = A.portAnchor(z, "audio");
  eq(a1, [300, 300 + Math.round(150 / 2 - 18)], "default: dentro il bordo davanti");
  z.micPos = [-60, 40]; A.__cabRes = null;
  const a2 = A.portAnchor(z, "audio");
  eq(a2, [240, 340], "l'ancora segue micPos");
  z.rot = 90; A.__cabRes = null;
  const a3 = A.portAnchor(z, "audio");
  eq(a3, [300 - 40, 300 - 60], "l'ancora segue anche la rotazione della zona");
  z.rot = 0;
  ok(!A.portKinds(z).includes("audio"), "niente porta audio duplicata sulla zona (il mic È la porta)");
  ok(A.cabResult(true).sources.some((s) => (s.it || s).type === "miczone"), "la zona resta sorgente del motore");
});
t("zone: colori tutti diversi alla creazione (zcol dalla palette)", () => {
  reset(); const z1 = add("miczone", 200, 200); const z2 = add("miczone", 600, 200); const z3 = add("miczone", 1000, 200);
  if (!z1.zcol || !z2.zcol || !z3.zcol) throw new Error("zcol mancante");
  if (z1.zcol === z2.zcol || z2.zcol === z3.zcol || z1.zcol === z3.zcol) throw new Error("colori duplicati: " + [z1.zcol, z2.zcol, z3.zcol].join(","));
});

console.log("\nContratto side-effect (audit M-15): i motori di calcolo NON salvano né renderizzano");
t("i motori puri (audio/elec/mond/audit) non chiamano save() né render()", () => {
  reset();
  const mic = add("astamic", 200, 400); const box = add("stagebox", 600, 250);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(mic, box.id); A.__cabRes = null;
  A.state.elec = A.state.elec || {}; A.state.elec.on = true; A.__elecRes = null;
  const origSave = A.save, origRender = A.render;
  let saves = 0, renders = 0;
  A.save = function () { saves++; }; A.render = function () { renders++; };
  try {
    A.audioCablingEngine();
    if (typeof A.electricEngine === "function") A.electricEngine();
    if (typeof A.monDigEngine === "function") A.monDigEngine();
    if (typeof A.auditEngine === "function") A.auditEngine();
    if (typeof A.netEngine === "function") A.netEngine();
  } finally { A.save = origSave; A.render = origRender; }
  eq(saves, 0, "un motore di calcolo non deve salvare (classe dell'incidente cloud: engine che chiama save)");
  eq(renders, 0, "un motore di calcolo non deve renderizzare");
});

console.log("\nCavo unico (audioCablingEngine):");
t("batteria + box: 8 canali ma 1 sola KEY (un cavo)", () => {
  reset(); const b = add("batteria", 400, 500); const box = add("stagebox", 600, 250);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(b, box.id); A.__cabRes = null;
  const R = A.audioCablingEngine(); const bl = R.links.filter((l) => l.s.it.id === b.id);
  eq(bl.length, 8, "canali"); eq(new Set(bl.map((l) => l.key)).size, 1, "chiavi distinte"); ok(bl[0].bundleN === 8, "bundleN");
});
t("microfono singolo: cavo per-canale (key id#0, non grp)", () => {
  reset(); const mic = add("astamic", 200, 400); const box = add("stagebox", 600, 250);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(mic, box.id); A.__cabRes = null;
  const l = A.audioCablingEngine().links.filter((x) => x.s.it.id === mic.id)[0];
  ok(l && /#0$/.test(l.key) && l.key.indexOf("grp:") !== 0, "key per-canale");
});
t("postazione doppia: 2 cavi separati (1 per musicista), NON un bundle grp", () => {
  reset(); const d = add("vlnpost", 400, 250); d.doppia = true; d.sep = 90; const box = add("stagebox", 700, 500);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(d, box.id); A.__cabRes = null;
  const bl = A.audioCablingEngine().links.filter((l) => l.s.it.id === d.id);
  eq(bl.length, 2, "2 canali");
  eq(new Set(bl.map((l) => l.key)).size, 2, "2 chiavi distinte (non bundle)");
  ok(bl.every((l) => l.key.indexOf("grp:") !== 0), "nessuna key grp");
  const s0 = bl[0].pts[0], s1 = bl[1].pts[0];
  ok(Math.abs(s0[0] - s1[0]) > 40, "i 2 cavi partono da sedute diverse");
});
t("layer Input: il pallino del musicista è maniglia del cavo, non lo sposta", () => {
  reset();
  const v = add("cantante", 400, 300); v.micMode = "tonda";
  A.state.cab.on = true; A.state.cab.lockIn = false;
  const wasStatic = A.__cabStatic; A.__cabStatic = false;   // nel browser è falsy → editing attivo
  A.layerSoloUI = { cabin: true };
  const mk = A.sectionDotMarkup(v);
  ok(mk.indexOf('class="port-hit"') >= 0 && mk.indexOf('data-port="audio"') >= 0, "il pallino è una maniglia del cavo (port-hit audio)");
  ok(mk.indexOf('class="hit"') < 0, "niente hit di spostamento nel layer Input");
  A.layerSoloUI = {}; A.__cabStatic = wasStatic;
});
t("ascolto per performer: crea/sostituisce/rimuove il monitor collegato", () => {
  reset();
  const v = add("cantante", 400, 300);
  const dir = add("direttore", 200, 300);
  const box = add("stagebox", 700, 500);
  ok(A.ascoltoEligible(v) && A.ascoltoEligible(dir), "cantante e direttore idonei");
  ok(!A.ascoltoEligible(box), "stage box NON idonea");
  // wedge → crea un wedge collegato
  A.setAscolto(v, "wedge");
  let mon = A.state.items.find(x => x.id === v.ascoltoId);
  ok(v.ascolto === "wedge" && mon && mon.type === "wedge", "wedge creato e collegato");
  const firstId = mon.id;
  // cambio → personal mixer: sostituisce (via il wedge, entra hearback)
  A.setAscolto(v, "pm");
  ok(!A.state.items.some(x => x.id === firstId), "il wedge precedente è stato rimosso");
  mon = A.state.items.find(x => x.id === v.ascoltoId);
  ok(v.ascolto === "pm" && mon && mon.type === "hearback", "personal mixer creato al posto del wedge");
  // none → rimuove
  A.setAscolto(v, "none");
  ok(!v.ascolto && !v.ascoltoId, "ascolto azzerato");
  ok(!A.state.items.some(x => x.type === "hearback"), "il personal mixer è stato rimosso");
  // normalize: link orfano si azzera
  A.setAscolto(dir, "iem");
  A.state.items = A.state.items.filter(x => x.id !== dir.ascoltoId);   // cancello il monitor a mano
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const dir2 = A.state.items.find(x => x.type === "direttore");
  ok(!dir2.ascolto && !dir2.ascoltoId, "link orfano azzerato da normalizeState");
});
t("stage box del mixer (foh): esclusa dall'auto, resta target manuale", () => {
  reset();
  const mic = add("astamic", 300, 200);
  const palco = add("stagebox", 500, 250);
  const foh = add("stagebox", 500, 900); foh.foh = true;   // lato regia
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;   // auto puro (senza override dell'auto-connect di addItem)
  let R = A.audioCablingEngine();
  let l = R.links.find(x => x.s.it.id === mic.id);
  ok(l && l.box && l.box.id === palco.id, "auto instrada sul palco, NON sulla box del mixer");
  // senza box palco, l'auto NON usa la foh → sorgente non assegnata (da collegare a mano)
  reset();
  const mic2 = add("astamic", 300, 200);
  const foh2 = add("stagebox", 500, 900); foh2.foh = true;
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  R = A.audioCablingEngine();
  ok(!R.links.some(x => x.s.it.id === mic2.id && x.box), "niente auto-connessione sulla box del mixer");
  ok(R.issues.some(i => /mixer/i.test(i.msg)), "avviso che punta alla stage box del mixer");
  // ma il collegamento MANUALE alla foh funziona
  A.state.cab.mode = "manual"; A.cabSetItemBox(mic2, foh2.id); A.__cabRes = null;
  R = A.audioCablingEngine();
  ok(R.links.some(x => x.s.it.id === mic2.id && x.box && x.box.id === foh2.id), "collegamento manuale alla box del mixer OK");
});
t("vln1x2 (×2 dedicata): 2 cavi separati per i 2 musicisti", () => {
  reset(); const v = add("vln1x2", 400, 250); const box = add("stagebox", 700, 500);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(v, box.id); A.__cabRes = null;
  const bl = A.audioCablingEngine().links.filter((l) => l.s.it.id === v.id);
  eq(bl.length, 2, "2 canali"); eq(new Set(bl.map((l) => l.key)).size, 2, "2 cavi separati");
});

console.log("\nMonitoraggio digitale (monDigEngine):");
t("catena m2->m1->hub: 2 tratte, 0 pending, nessun errore", () => {
  reset(); const m1 = add("hearback", 200, 400); const m2 = add("hearback", 300, 400); const h = add("mixhub", 500, 200);
  A.mondManual(m1.id).to = h.id; A.mondManual(m2.id).to = m1.id; A.__mondRes = null;
  const R = A.monDigEngine(); eq(R.links.length, 2, "tratte"); eq(R.pending.length, 0, "pending");
  ok(!R.issues.some((i) => i.lvl === "err"), "nessun err");
});
t("mixerino senza .to = pending", () => {
  reset(); add("hearback", 200, 400); add("mixhub", 500, 200);
  A.state.mond.manual = {}; A.__mondRes = null;   /* l'aggancio automatico di addItem lo aveva già collegato */
  eq(A.monDigEngine().pending.length, 1);
});
t("loop A<->B = issue di livello err", () => {
  reset(); const a = add("hearback", 200, 400); const b = add("hearback", 300, 400);
  A.mondManual(a.id).to = b.id; A.mondManual(b.id).to = a.id; A.__mondRes = null;
  ok(A.monDigEngine().issues.some((i) => i.lvl === "err"), "err loop");
});

console.log("\nIntegrazione elettrico:");
t("hub = carico elettrico (WATT), mixerino no", () => {
  reset(); const h = add("mixhub", 100, 100); add("hearback", 300, 100); A.state.elec.on = true;
  const loads = A.electricEngine().loads.map((l) => l.it.type);
  ok(loads.indexOf("mixhub") > -1, "hub carico"); ok(loads.indexOf("hearback") === -1, "mixerino non carico");
});
t("itemChannels coerente: batteria 8, corista 1, zona 1", () => {
  reset(); const b = add("batteria", 400, 400); eq(A.itemChannels(b), 8);
  reset(); const c = add("corista", 200, 300); c.micMode = "tonda"; eq(A.itemChannels(c), 1);
  reset(); const z = add("miczone", 300, 300); eq(A.itemChannels(z), 1);
});

console.log("\nLayer Manager (nomi/gruppi):");
t("Layer v3: Ingressi/Output/P.M. separati con occhio/lucchetto/cestino propri", () => {
  reset(); A.state.cab.on = true;
  const by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  ok(by.cabin && by.cabin.name === "Input", "layer Input");
  ok(by.cabout && by.cabout.name === "Output", "layer Output");
  ok(!by.cabaudio, "il layer unico non esiste piu'");
  by.cabin.setVisible(false);
  ok(A.state.cab.showInputs === false && A.state.rfShow === false && A.state.cab.showNet === false, "occhio Ingressi: cavi input + rete + RF");
  ok(A.state.cab.showReturns !== false, "i ritorni NON sono toccati dall'occhio Ingressi");
  by.cabout.setVisible(false);
  ok(A.state.cab.showReturns === false, "occhio Output: ritorni");
  by.cabin.setLocked(true);
  ok(A.state.cab.lockIn === true && A.state.cab.lockOut !== true, "lucchetto Ingressi non blocca gli Output");
  A.state.cab.manual = { "grp:x": { box: "b1" }, "mix:L:M1": { box: "b1" }, "ret:m1:s1": { pts: [[0, 0]] } };
  by.cabin.remove();
  ok(!A.state.cab.manual["grp:x"] && A.state.cab.manual["mix:L:M1"] && A.state.cab.manual["ret:m1:s1"], "cestino Ingressi azzera solo gli input");
  A.layerRegistry().find((x) => x.id === "cabout").remove();
  eq(Object.keys(A.state.cab.manual).length, 0, "cestino Output azzera mix e ritorni");
});
t("migrate v1→v2: cab.locked unico → lockIn + lockOut", () => {
  const s = A.migrate({ _v: 1, cab: { locked: true, on: true } });
  ok(s.cab.lockIn === true && s.cab.lockOut === true, "locked propagato ai due rami");
  ok(!("locked" in s.cab), "vecchio cab.locked rimosso");
});
t("layer: ordine Ingressi → Output → P.M. → Power → Planimetria", () => {
  reset(); A.state.cab.on = true;
  const ids = A.layerRegistry().map((L) => L.id);
  ok(ids.indexOf("cabin") > -1 && ids.indexOf("cabout") > ids.indexOf("cabin"), "Ingressi poi Output");
  ok(ids.indexOf("mond") > ids.indexOf("cabout"), "poi P.M.");
  ok(ids.indexOf("mond") < ids.indexOf("elec"), "P.M. < Power");
  ok(ids.indexOf("elec") < ids.indexOf("venue"), "Power < Planimetria");
});

console.log("\nCatalogo — strumenti sempre visibili (niente 'Mostra tutti'):");
t("ogni strumento (categoria Strumenti) è essenziale", () => {
  ["oboe", "fagotto", "tuba", "saxbaritono", "timpani", "grancassa", "arpa", "celesta", "vibrafono", "marimba", "pianoverticale"]
    .forEach((k) => { ok(A.catOf(k) === "Strumenti", k + " deve essere in Strumenti"); ok(A.isEss(k), k + " deve essere essenziale"); });
});
t("il filtro 'Mostra tutti' resta per gli accessori (non-Strumenti)", () => {
  ok(!A.isEss("truss40"), "truss40 (Allestimento) NON essenziale"); ok(!A.isEss("gazebo33"), "gazebo (Allestimento) NON essenziale");
});

console.log("\nVersioning documento (schema_version + migrate, R-ORA-1):");
t("migrate: blob senza _v = v1 (identità), non perde dati", () => {
  const s = A.migrate({ items: [{ id: "a" }], titolo: "x", cab: { on: true } });
  eq(s.titolo, "x"); eq(s.items.length, 1); eq(s.cab.on, true);
  ok(!("_v" in s), "_v non deve restare nello state runtime");
});
t("migrate: _v alla versione corrente è identità e viene consumato", () => {
  const s = A.migrate({ _v: A.SCHEMA_VERSION, items: [], elec: { on: true } });
  ok(!("_v" in s), "_v rimosso al load"); eq(s.elec.on, true);
});
t("stateToJSON marca il documento con _v = SCHEMA_VERSION", () => {
  reset();
  const blob = JSON.parse(A.stateToJSON());
  ok(typeof blob._v === "number" && blob._v >= 1, "il blob salvato deve portare la versione"); eq(blob._v, A.SCHEMA_VERSION);
});
t("round-trip salva→carica: _v consumato, items conservati", () => {
  reset(); A.state.items = [{ id: "z", type: "cantante", x: 10, y: 10 }];
  const back = A.normalizeState(JSON.parse(A.stateToJSON()));
  ok(!("_v" in back), "_v consumato al load"); eq(back.items[0].id, "z");
});
t("loadDoc→save→load conserva campi tecnici, relazioni e campi additivi", () => {
  const richItems = [
    { id: "rack-a", type: "rack", x: 100, y: 120, w: 60, d: 50, rackU: 18, rackFn: "rf" },
    { id: "sb-a", type: "stagebox", x: 100, y: 120, w: 58, d: 46, hw: "rio3224d2",
      sbId: 7, sbRes: [2, 4], sbTo: "main", foh: true, rackId: "rack-a", rackPos: 0, rackUh: 3 },
    { id: "mon-a", type: "wedge", x: 220, y: 180, w: 60, d: 52 },
    { id: "rx-a", type: "rxrf", x: 260, y: 180, w: 48, d: 36, hw: "ewdxem2", rxN: 2, band: "R1-9" },
    { id: "voice-a", type: "wireless", x: 300, y: 220, w: 18, d: 32, ascolto: "wedge",
      ascoltoId: "mon-a", rxId: "rx-a", rxCh: 2, rf: "550.125", band: "R1-9", ownMic: false },
    { id: "hub-a", type: "mixhub", x: 360, y: 220, w: 60, d: 34, pm: "p16d",
      pmFeed: "dante", pmFeedCh: 32 },
    { id: "net-a", type: "netswitch", x: 430, y: 220, w: 46, d: 30, swPorts: 24 },
    { id: "power-a", type: "ciabatta", x: 500, y: 220, w: 44, d: 17, prese: 12 },
    { id: "zone-a", type: "miczone", x: 560, y: 260, w: 220, d: 150, zcol: "#2563eb",
      micPos: [12, -7], safeDesc: "Carico sospeso", safeCap: "250 kg", safeNote: "Verifica tecnica" },
    { id: "laptop-a", type: "laptop", x: 650, y: 260, w: 44, d: 34, uso: "playback_audio",
      by: "Band", modelId: "fixture-model",
      modelData: { brand: { value: "Fixture" }, model: { value: "Offline" } },
      modelOverride: { powerConsumption_W: { value: 65, unit_orig: "W" } },
      futureExtension: { revision: 3, flags: ["keep"] } },
  ];
  const doc = { _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Rich", items: richItems, inputs: [], outputs: [],
      buses: [{ id: "bus-a", name: "Monitor", kind: "aux", boxId: "sb-a", port: 2 }] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [
      { id: "sb-b", type: "stagebox", x: 90, y: 90, w: 58, d: 46, hw: "dx168", sbId: 3, foh: true },
    ], inputs: [], outputs: [] } },
  ] };
  const assertActiveRich = () => {
    const by = Object.fromEntries(A.state.items.map((it) => [it.id, it]));
    eq({ hw: by["sb-a"].hw, sbId: by["sb-a"].sbId, sbRes: by["sb-a"].sbRes, sbTo: by["sb-a"].sbTo,
      foh: by["sb-a"].foh, rackId: by["sb-a"].rackId, rackPos: by["sb-a"].rackPos, rackUh: by["sb-a"].rackUh },
      { hw: "rio3224d2", sbId: 7, sbRes: [2, 4], sbTo: "main", foh: true, rackId: "rack-a", rackPos: 0, rackUh: 3 },
      "stagebox/rack");
    eq({ rackU: by["rack-a"].rackU, rackFn: by["rack-a"].rackFn }, { rackU: 18, rackFn: "rf" }, "rack");
    eq({ ascolto: by["voice-a"].ascolto, ascoltoId: by["voice-a"].ascoltoId, rxId: by["voice-a"].rxId,
      rxCh: by["voice-a"].rxCh, rf: by["voice-a"].rf, band: by["voice-a"].band, ownMic: by["voice-a"].ownMic },
      { ascolto: "wedge", ascoltoId: "mon-a", rxId: "rx-a", rxCh: 2, rf: "550.125", band: "R1-9", ownMic: false },
      "ascolto/RF");
    eq({ pm: by["hub-a"].pm, pmFeed: by["hub-a"].pmFeed, pmFeedCh: by["hub-a"].pmFeedCh },
      { pm: "p16d", pmFeed: "dante", pmFeedCh: 32 }, "personal monitor");
    eq(by["net-a"].swPorts, 24, "porte switch"); eq(by["power-a"].prese, 12, "prese");
    eq({ zcol: by["zone-a"].zcol, micPos: by["zone-a"].micPos, safeDesc: by["zone-a"].safeDesc,
      safeCap: by["zone-a"].safeCap, safeNote: by["zone-a"].safeNote },
      { zcol: "#2563eb", micPos: [12, -7], safeDesc: "Carico sospeso", safeCap: "250 kg", safeNote: "Verifica tecnica" },
      "zona/safety");
    eq({ uso: by["laptop-a"].uso, by: by["laptop-a"].by, modelId: by["laptop-a"].modelId,
      modelData: by["laptop-a"].modelData, modelOverride: by["laptop-a"].modelOverride,
      futureExtension: by["laptop-a"].futureExtension },
      { uso: "playback_audio", by: "Band", modelId: "fixture-model",
        modelData: { brand: { value: "Fixture" }, model: { value: "Offline" } },
        modelOverride: { powerConsumption_W: { value: 65, unit_orig: "W" } },
        futureExtension: { revision: 3, flags: ["keep"] } },
      "modello/campi additivi");
    eq(A.state.buses[0].boxId, "sb-a", "relazione bus→stagebox");
  };
  A.loadDoc(JSON.parse(JSON.stringify(doc))); assertActiveRich();
  A.loadDoc(JSON.parse(A.docToJSON())); assertActiveRich();
  A.switchVariant("vB");
  const sbB = A.state.items.find((it) => it.id === "sb-b");
  eq({ hw: sbB.hw, sbId: sbB.sbId, foh: sbB.foh }, { hw: "dx168", sbId: 3, foh: true },
    "campi tecnici variante inattiva");
});
t("Input/Output List restano intatte in tutte le varianti anche fuori dalla consulenza", () => {
  const oldConsult = A.__consultMode;
  const before = A.docToJSON();
  A.__consultMode = false;
  try {
    A.loadDoc({ _doc: 1, active: "one", variants: [
      { id: "one", name: "Uno", state: { _v: A.SCHEMA_VERSION, items: [
        { id: "voice", type: "cantante" }, { id: "mon", type: "wedge" },
      ], inputs: [{ src: "Voce", linked_item_id: "voice", notes: "keep-in" }],
      outputs: [{ src: "Mix 1", linked_item_id: "mon", notes: "keep-out" }] } },
      { id: "two", name: "Due", state: { _v: A.SCHEMA_VERSION, items: [{ id: "di", type: "dimono" }],
        inputs: [{ src: "DI", linked_item_id: "di" }], outputs: [{ src: "Spare" }] } },
    ] });
    const saved = JSON.parse(A.docToJSON());
    const one = saved.variants.find((v) => v.id === "one").state;
    const two = saved.variants.find((v) => v.id === "two").state;
    eq([one.inputs.length, one.outputs.length, two.inputs.length, two.outputs.length], [1, 1, 1, 1]);
    eq([one.inputs[0].linked_item_id, one.outputs[0].linked_item_id, two.inputs[0].linked_item_id],
      ["voice", "mon", "di"], "relazioni delle liste preservate");
  } finally {
    A.__consultMode = oldConsult;
    A.loadDoc(JSON.parse(before));
  }
});
t("campi additivi al root del documento sopravvivono a load/save/load", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc({ _doc: 1, active: "r1", futureRootMeta: { revision: 7, flags: ["keep"] }, variants: [
      { id: "r1", name: "Root", state: { _v: A.SCHEMA_VERSION, titolo: "Root", items: [], inputs: [], outputs: [] } },
    ] });
    let saved = JSON.parse(A.docToJSON());
    eq(saved.futureRootMeta, { revision: 7, flags: ["keep"] }, "extra root serializzato");
    A.loadDoc(saved); saved = JSON.parse(A.docToJSON());
    eq(saved.futureRootMeta, { revision: 7, flags: ["keep"] }, "extra root preservato al secondo load");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("sanitizeItems scarta tipi ereditati dal prototype senza eccezioni", () => {
  ["constructor", "__proto__", "toString"].forEach((type) => {
    eq(A.sanitizeItems([{ id: "bad-" + type, type, x: 0, y: 0 }]), [], type);
  });
});
t("normalizeState conserva il backfill dimensionale di elementi componibili e doppi legacy", () => {
  const legacy = A.normalizeState({ items: [
    { id: "kit", type: "batteria", x: 10, y: 20,
      parts: { toms: 3, floor: true, hihat: true, crash: 2, ride: true, kick2: true, mus: true, stool: true } },
    { id: "duo", type: "vln1x2", x: 30, y: 40, sep: 120 },
  ], inputs: [], outputs: [] });
  const kit = legacy.items.find((it) => it.id === "kit");
  const duo = legacy.items.find((it) => it.id === "duo");
  eq([kit.w, kit.d], A.sizeBatteria(kit), "dimensioni kit derivate dai pezzi");
  eq([duo.w, duo.d], [A.sepToW(A.DOUBLE_TYPES.vln1x2, 120), A.DOUBLE_TYPES.vln1x2.dbl[1]],
    "dimensioni doppia derivate dalla separazione");
});
t("ID numerici legacy mantengono tutte le relazioni dopo la canonicalizzazione", () => {
  const oldConsult = A.__consultMode;
  A.__consultMode = true;
  try {
    const s = A.normalizeState({ _v: A.SCHEMA_VERSION, items: [
      { id: 1, type: "rack", rackU: 12 },
      { id: 2, type: "stagebox", rackId: 1, rackPos: 0 },
      { id: 3, type: "wedge" },
      { id: 4, type: "rxrf" },
      { id: 5, type: "wireless", ascolto: "wedge", ascoltoId: 3, rxId: 4, rxCh: 1 },
      { id: 6, type: "pedana" },
      { id: 7, type: "sedia", distOf: 6 },
      { id: 8, type: "ciabatta" },
      { id: 9, type: "quadro" },
      { id: 10, type: "hearback" },
      { id: 11, type: "mixhub" },
      { id: 12, type: "stagebox", sbTo: 2 },
    ], buses: [{ id: "bus", name: "Main", kind: "st", boxId: 2, port: 1 }],
      inputs: [{ src: "Voce", linked_item_id: 5 }], outputs: [{ src: "Mix", linked_item_id: 3 }],
      cab: { on: true, manual: { "5#0": { box: 2 } } },
      elec: { on: true, manual: { 7: { distro: 8 } }, uplinks: { 8: { to: 9 } } },
      mond: { on: true, manual: { 10: { to: 11 } } } });
    const by = Object.fromEntries(s.items.map((it) => [it.id, it]));
    eq(s.items.map((it) => it.id), ["1","2","3","4","5","6","7","8","9","10","11","12"], "ID canonici");
    eq({ rackId: by["2"].rackId, ascoltoId: by["5"].ascoltoId, rxId: by["5"].rxId,
      distOf: by["7"].distOf, sbTo: by["12"].sbTo },
      { rackId: "1", ascoltoId: "3", rxId: "4", distOf: "6", sbTo: "2" }, "relazioni item");
    eq({ bus: s.buses[0].boxId, cab: s.cab.manual["5#0"].box,
      distro: s.elec.manual["7"].distro, up: s.elec.uplinks["8"].to, mond: s.mond.manual["10"].to,
      input: s.inputs[0].linked_item_id, output: s.outputs[0].linked_item_id },
      { bus: "2", cab: "2", distro: "8", up: "9", mond: "11", input: "5", output: "3" },
      "grafi tecnici");
  } finally {
    A.__consultMode = oldConsult;
  }
});
t("ID di 80 caratteri e chiavi di routing composte non vengono troncati", () => {
  const src = "s".repeat(80), box = "b".repeat(80), load = "l".repeat(80);
  const s = A.normalizeState({ _v: A.SCHEMA_VERSION, items: [
    { id: src, type: "cantante" }, { id: box, type: "stagebox" },
    { id: load, type: "sedia" }, { id: "d".repeat(80), type: "ciabatta" },
    { id: "q".repeat(80), type: "quadro" },
  ], inputs: [], outputs: [],
  cab: { on: true, manual: { [src + "#0"]: { box } } },
  elec: { on: true, manual: { [load]: { distro: "d".repeat(80) }, [src]: "d".repeat(80) },
    uplinks: { ["d".repeat(80)]: { to: "q".repeat(80) } } } });
  ok(Object.prototype.hasOwnProperty.call(s.cab.manual, src + "#0"), "chiave cavo composta completa");
  eq(s.cab.manual[src + "#0"].box, box, "target stagebox completo");
  ok(Object.prototype.hasOwnProperty.call(s.elec.manual, load), "chiave carico completa");
  eq(s.elec.manual[load].distro, "d".repeat(80), "target distro completo");
  eq(s.elec.manual[src].distro, "d".repeat(80), "target distro legacy stringa completo");
  eq(s.elec.uplinks["d".repeat(80)].to, "q".repeat(80), "uplink completo");
});
t("documenti futuri, tipi ignoti e liste non valide sono rifiutati senza commit parziale", () => {
  reset();
  A.loadDoc({ _v: A.SCHEMA_VERSION, items: [{ id: "stable", type: "cantante" }], inputs: [], outputs: [] });
  const beforeState = A.state;
  const beforeDoc = A.docToJSON();
  throws(() => A.loadDoc({ _v: A.SCHEMA_VERSION + 1, items: [{ id: "future", type: "cantante" }] }), "FUTURE_SCHEMA");
  ok(A.state === beforeState, "schema futuro non sostituisce lo state");
  eq(A.docToJSON(), beforeDoc, "schema futuro non altera il documento");
  throws(() => A.loadDoc({ _doc: 2, active: "v", variants: [
    { id: "v", state: { _v: A.SCHEMA_VERSION, items: [] } },
  ] }), "FUTURE_DOCUMENT");
  throws(() => A.loadDoc({ _doc: 1, _v: A.SCHEMA_VERSION + 1, active: "v", variants: [
    { id: "v", state: { _v: A.SCHEMA_VERSION, items: [] } },
  ] }), "FUTURE_SCHEMA");
  throws(() => A.loadDoc({ _v: A.SCHEMA_VERSION, items: [{ id: "future", type: "tipo_futuro" }] }), "UNKNOWN_ITEM_TYPE");
  throws(() => A.loadDoc({ _v: A.SCHEMA_VERSION, items: {} }), "INVALID_ITEMS");
  throws(() => A.loadDoc({ _doc: 1, active: "ok", variants: [
    { id: "ok", name: "OK", state: { _v: A.SCHEMA_VERSION, items: [{ id: "kept", type: "cantante" }] } },
    { id: "bad", name: "Future", state: { _v: A.SCHEMA_VERSION + 1, items: [] } },
  ] }), "FUTURE_SCHEMA");
  ok(A.state === beforeState, "variante inattiva invalida non produce commit parziale");
  eq(A.docToJSON(), beforeDoc, "documento invariato dopo tutti i rifiuti");
});
t("ID duplicati / non-safe vengono riassegnati (niente lockout) e restano sicuri e unici", () => {
  reset();
  // id da injection, duplicati, chiavi pericolose e vuoti: il documento DEVE aprirsi, non bloccarsi
  A.loadDoc({ _v: A.SCHEMA_VERSION, items: [
    { id: 'x" data-extra="1', type: "cantante", label: "A" },
    { id: "dup", type: "cantante", label: "B" },
    { id: "dup", type: "wedge", label: "C" },
    { id: "toString", type: "cantante", label: "D" },
    { id: "__proto__", type: "cantante", label: "E" },
    { id: "", type: "cantante", label: "F" },
  ] });
  const items = A.state.items;
  eq(items.length, 6, "tutti gli elementi conservati: nessun lockout, nessuna perdita");
  const ids = items.map((it) => it.id);
  ok(ids.every((id) => A.safeItemId(id)), "tutti gli id sono sicuri dopo la riparazione");
  eq(new Set(ids).size, 6, "tutti gli id sono unici");
  ok(!ids.some((id) => /["'<>]/.test(id)), "nessun id sopravvive con caratteri da injection");
  eq(items.map((it) => it.label).join(""), "ABCDEF", "i dati degli elementi restano intatti e nell'ordine originale");
});
t("boot con documento futuro sospende ogni persistenza e non riaggancia il progetto cloud", () => {
  const oldStorage = A.localStorage;
  const oldCloud = A.__cloud;
  const oldDocument = A.document;
  const oldConsult = A.__consultMode;
  const oldBlocked = A.__docLoadBlocked;
  const oldBootCloudId = A.__bootCloudId;
  const oldBootCloudRev = A.__bootCloudRev;
  const oldBootCloudMeta = A.__bootCloudMeta;
  const oldUnavailable = A.__localStorageUnavailable;
  const beforeState = A.state;
  const beforeDoc = A.docToJSON();
  const reads = [], writes = [], removals = [];
  let cloudSaves = 0;
  A.localStorage = {
    getItem: (key) => {
      reads.push(key);
      if (key === A.LS_KEY) return JSON.stringify({
        _v: A.SCHEMA_VERSION + 1,
        items: [{ id: "future", type: "cantante" }],
        inputs: [],
        outputs: [],
      });
      if (key === A.LS_KEY + "_cloudid") return "cloud-project-existing";
      return null;
    },
    setItem: (key, value) => writes.push([key, value]),
    removeItem: (key) => removals.push(key),
  };
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  A.__cloud = { user: () => ({ id: "u" }), save: () => { cloudSaves++; }, currentId: () => "cloud-project-existing" };
  try {
    A.load();
    eq(A.__docLoadBlocked.code, "FUTURE_SCHEMA", "motivo del blocco");
    eq(A.__bootCloudId, null, "il cloud ID non viene adottato");
    ok(!reads.includes(A.LS_KEY + "_cloudid"), "nessuna lettura dell'associazione cloud durante il blocco");
    ok(A.state === beforeState && A.docToJSON() === beforeDoc, "il documento runtime resta intatto");
    A.persistLocalState();
    A.persistVenueImg();
    A.cloudAutosaveNow();
    eq({ writes: writes.length, removals: removals.length, cloudSaves },
      { writes: 0, removals: 0, cloudSaves: 0 },
      "nessuna sovrascrittura locale, rimozione o scrittura cloud");
  } finally {
    A.localStorage = oldStorage;
    A.__cloud = oldCloud;
    A.document = oldDocument;
    A.__consultMode = oldConsult;
    A.__docLoadBlocked = oldBlocked;
    A.__bootCloudId = oldBootCloudId;
    A.__bootCloudRev = oldBootCloudRev;
    A.__bootCloudMeta = oldBootCloudMeta;
    A.__localStorageUnavailable = oldUnavailable;
  }
});
t("persistenza locale: documento e binding cloud sono un unico commit; nessun ID se il blob fallisce", () => {
  const oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document, oldConsult = A.__consultMode;
  const oldUnavailable = A.__localStorageUnavailable;
  const writes = [];
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  A.__cloud = { currentId: () => "project-B", currentRev: () => "rev-B", user: () => ({ id: "u" }) };
  try {
    A.localStorage = {
      getItem: () => null,
      setItem: (key, value) => { writes.push([key, value]); if (key === A.LS_KEY) throw new Error("quota"); },
      removeItem: (key) => writes.push([key, null]),
    };
    eq(A.persistLocalState(), false, "il commit documento fallisce esplicitamente");
    ok(!writes.some(([key]) => key === A.LS_KEY + "_cloudid"), "binding separato mai scritto dopo il fallimento");

    writes.length = 0;
    A.localStorage = {
      getItem: () => null,
      setItem: (key, value) => writes.push([key, value]),
      removeItem: (key) => writes.push([key, null]),
    };
    eq(A.persistLocalState(), true, "commit riuscito");
    const rootWrite = writes.find(([key]) => key === A.LS_KEY);
    ok(rootWrite, "documento scritto");
    const meta = JSON.parse(rootWrite[1])._local;
    eq({ cloudId: meta.cloudId, cloudRev: meta.cloudRev, venueSig: meta.venueSig,
      venueKey: meta.venueKey, venueUnavailable: meta.venueUnavailable },
      { cloudId: "project-B", cloudRev: "rev-B", venueSig: "", venueKey: null, venueUnavailable: false },
      "binding cloud e riferimento planimetria incorporati atomicamente");
    ok(typeof meta.contentSig === "string" && meta.contentSig.length > 0, "firma contenuto persistita");
    ok(typeof meta.localRevision === "string" && meta.localRevision.length > 0, "revisione locale persistita");
    eq(meta.cloudPending, true, "documento cloud nuovo resta marcato come da sincronizzare");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument; A.__consultMode = oldConsult;
    A.__localStorageUnavailable = oldUnavailable;
  }
});
t("quota planimetria non committa un root che renda irraggiungibile l'ultima copia completa", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document;
  const oldConflict = A.__localConflict, oldUnavailable = A.__localStorageUnavailable;
  const oldBootVenueUnavailable = A.__bootVenueUnavailable;
  const oldPersistedSig = A.venuePersistedSig, oldPersistedKey = A.venuePersistedKey;
  const oldStageFailedSig = A.venueStageFailedSig, oldExpectedRevision = A.localExpectedRevision;
  const oldStorageIdentity = A.localStorageIdentity;
  const store = new Map();
  let rejectNewVenueAsset = false;
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => {
        if (rejectNewVenueAsset && key.startsWith(A.LS_KEY_VENUE + ".")) {
          const error = new Error("quota");
          error.name = "QuotaExceededError";
          throw error;
        }
        store.set(key, value);
      },
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => null };
    A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    A.__localConflict = false; A.__localStorageUnavailable = false; A.__bootVenueUnavailable = false;
    A.venuePersistedSig = null; A.venuePersistedKey = null; A.venueStageFailedSig = null;
    A.localExpectedRevision = null; A.localStorageIdentity = oldStorageIdentity;
    A.loadDoc({ _v: A.SCHEMA_VERSION, venue: {
      name: "A.png", _dataUrl: "data:image/png;base64,QUFB", _imgW: 100, _imgH: 80,
      x: 0, y: 0, w: 100, h: 80,
    }, items: [], inputs: [], outputs: [] });
    eq(A.persistLocalState(), true, "prima coppia root+asset salvata");
    const durableRoot = store.get(A.LS_KEY);
    const durableKeys = [...store.keys()].filter((key) => key.startsWith(A.LS_KEY_VENUE + "."));
    eq(durableKeys.length, 1, "asset A presente");

    A.state.venue = {
      name: "B.png", _dataUrl: "data:image/png;base64,QkJC", _imgW: 120, _imgH: 90,
      x: 0, y: 0, w: 120, h: 90,
    };
    rejectNewVenueAsset = true;
    eq(A.persistLocalState(), false, "quota della nuova bitmap fallisce chiusa");
    eq(store.get(A.LS_KEY), durableRoot, "il root autorevole resta quello associato alla bitmap A");
    eq([...store.keys()].filter((key) => key.startsWith(A.LS_KEY_VENUE + ".")), durableKeys,
      "l'asset durevole precedente non viene eliminato");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument;
    A.__localConflict = oldConflict; A.__localStorageUnavailable = oldUnavailable;
    A.__bootVenueUnavailable = oldBootVenueUnavailable;
    A.venuePersistedSig = oldPersistedSig; A.venuePersistedKey = oldPersistedKey;
    A.venueStageFailedSig = oldStageFailedSig; A.localExpectedRevision = oldExpectedRevision;
    A.localStorageIdentity = oldStorageIdentity;
    A.loadDoc(JSON.parse(before));
  }
});
t("errore di accesso a localStorage non viene scambiato per documento incompatibile", () => {
  const oldStorage = A.localStorage, oldDocument = A.document, oldConsult = A.__consultMode;
  const oldBlocked = A.__docLoadBlocked, oldUnavailable = A.__localStorageUnavailable;
  const oldBootCloudId = A.__bootCloudId, oldBootCloudRev = A.__bootCloudRev, oldBootCloudMeta = A.__bootCloudMeta;
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  A.localStorage = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {}, removeItem: () => {} };
  try {
    A.load();
    eq(A.__docLoadBlocked, null, "nessun blocco di compatibilità");
    eq(A.__localStorageUnavailable, true, "errore storage distinto e visibile");
  } finally {
    A.localStorage = oldStorage; A.document = oldDocument; A.__consultMode = oldConsult;
    A.__docLoadBlocked = oldBlocked; A.__localStorageUnavailable = oldUnavailable;
    A.__bootCloudId = oldBootCloudId; A.__bootCloudRev = oldBootCloudRev; A.__bootCloudMeta = oldBootCloudMeta;
  }
});
t("getter localStorage negato non interrompe il boot dell'app", () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(A, "localStorage");
  const oldDocument = A.document, oldConsult = A.__consultMode;
  const oldBlocked = A.__docLoadBlocked, oldUnavailable = A.__localStorageUnavailable;
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  Object.defineProperty(A, "localStorage", {
    configurable: true,
    get: () => { throw new Error("SecurityError"); },
  });
  try {
    A.load();
    eq(A.__docLoadBlocked, null, "nessun falso blocco documento");
    eq(A.__localStorageUnavailable, true, "storage negato segnalato senza eccezione");
  } finally {
    if (storageDescriptor) Object.defineProperty(A, "localStorage", storageDescriptor);
    else delete A.localStorage;
    A.document = oldDocument; A.__consultMode = oldConsult;
    A.__docLoadBlocked = oldBlocked; A.__localStorageUnavailable = oldUnavailable;
  }
});
t("import invalido non stacca il cloud; import valido azzera la cronologia cross-documento", () => {
  const oldCloud = A.__cloud, oldBlocked = A.__docLoadBlocked;
  const before = A.docToJSON(), beforeUndo = A.undoStack.slice(), beforeRedo = A.redoStack.slice();
  const detached = [];
  A.__cloud = { setCurrentId: (id) => detached.push(id), currentId: () => "project-A", currentRev: () => "rev-A", user: () => null };
  try {
    A.undoStack.push("sentinel"); A.redoStack.push("sentinel");
    throws(() => A.importProject(JSON.stringify({ _v: A.SCHEMA_VERSION + 1, items: [] })), "FUTURE_SCHEMA");
    eq(detached.length, 0, "nessun lifecycle alterato dal documento invalido");
    A.importProject(JSON.stringify({ _v: A.SCHEMA_VERSION, items: [{ id: "new", type: "cantante" }], inputs: [], outputs: [] }),
      { autosave: false });
    eq(detached, [null], "stacco soltanto dopo la validazione");
    eq([A.undoStack.length, A.redoStack.length], [0, 0], "nessun undo può attraversare il confine progetto");
  } finally {
    A.__cloud = oldCloud; A.__docLoadBlocked = oldBlocked;
    A.loadDoc(JSON.parse(before));
    A.undoStack.length = 0; beforeUndo.forEach((x) => A.undoStack.push(x));
    A.redoStack.length = 0; beforeRedo.forEach((x) => A.redoStack.push(x));
  }
});
t("cache planimetria viene isolata al cambio documento anche con nomi uguali", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc({ _v: A.SCHEMA_VERSION, venue: { name: "plan.png", _dataUrl: "data:image/png;base64,AA==" },
      items: [], inputs: [], outputs: [] });
    A.cacheVenueImg(A.state.venue);
    A.loadDoc({ _doc: 1, active: "b1", variants: [
      { id: "b1", name: "B1", state: { _v: A.SCHEMA_VERSION, venue: { name: "plan.png" }, items: [], inputs: [], outputs: [] } },
      { id: "b2", name: "B2", state: { _v: A.SCHEMA_VERSION, venue: { name: "plan.png" }, items: [], inputs: [], outputs: [] } },
    ] });
    ok(!A.state.venue._dataUrl, "il progetto B non eredita l'immagine di A");
    A.switchVariant("b2");
    ok(!A.state.venue._dataUrl, "neppure una variante inattiva riaggancia la cache di A");
  } finally {
    A.loadDoc(JSON.parse(before));
  }
});
t("firma planimetria locale impedisce il mix documento B / bitmap A dopo una write parziale", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage;
  try {
    A.loadDoc({ _doc: 1, active: "b", variants: [
      { id: "b", name: "B", state: { titolo: "B", venue: { name: "stage.png", x: 0, y: 0, w: 100, h: 80 }, items: [], inputs: [], outputs: [] } },
    ] });
    const stale = { _venueDoc: 1, active: "b", images: {
      b: { name: "stage.png", _dataUrl: "data:image/png;base64,QUFB", _imgW: 100, _imgH: 80 },
    } };
    A.localStorage = { getItem: (key) => key === A.LS_KEY_VENUE ? JSON.stringify(stale) : null,
      setItem: () => {}, removeItem: () => {} };
    eq(A.loadVenueImg("firma-di-B-diversa"), false, "bundle stale rifiutato");
    ok(!A.state.venue._dataUrl, "la bitmap A non viene mostrata come documento B");
  } finally { A.localStorage = oldStorage; A.loadDoc(JSON.parse(before)); }
});
t("bundle planimetrie locale v2 deduplica il base64 e torna alla forma canonica", () => {
  const dataUrl = "data:image/png;base64,QUFB";
  const canonical = { _venueDoc: 1, active: "a", images: {
    a: { name: "Piena", _dataUrl: dataUrl, _imgW: 100, _imgH: 80 },
    b: { name: "Ridotta", _dataUrl: dataUrl, _imgW: 100, _imgH: 80 },
  } };
  const compact = A.compactVenueImageBundle(canonical);
  eq(compact._venueDoc, 2, "formato locale compatto");
  eq(Object.keys(compact.assets).length, 1, "un solo asset per due varianti clonate");
  eq((JSON.stringify(compact).match(/data:image\/png;base64,QUFB/g) || []).length, 1,
    "il payload base64 compare una sola volta");
  const roundTrip = A.normalizeVenueImageBundle(compact, "a");
  eq({ active: roundTrip.active, keys: Object.keys(roundTrip.images).sort(),
    names: [roundTrip.images.a.name, roundTrip.images.b.name],
    urls: [roundTrip.images.a._dataUrl, roundTrip.images.b._dataUrl] },
    { active: "a", keys: ["a", "b"], names: ["Piena", "Ridotta"], urls: [dataUrl, dataUrl] },
    "round-trip v2 → v1 senza perdita");
});
t("puntatore planimetria mancante blocca la propagazione di una cancellazione involontaria", () => {
  const oldStorage = A.localStorage, oldUnavailable = A.__bootVenueUnavailable;
  try {
    A.__bootVenueUnavailable = false;
    A.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    eq(A.loadVenueImg("firma-attesa", A.LS_KEY_VENUE + ".asset-atteso"), false, "asset assente");
    eq(A.__bootVenueUnavailable, true, "assenza distinta dalla cancellazione intenzionale");
  } finally {
    A.localStorage = oldStorage;
    A.__bootVenueUnavailable = oldUnavailable;
  }
});
t("undo/redo ripristina la bitmap corretta e recupera una planimetria eliminata", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage, oldCloud = A.__cloud;
  const oldConflict = A.__localConflict, oldBlocked = A.__docLoadBlocked, oldConsult = A.__consultMode;
  const store = new Map();
  const imageA = "data:image/png;base64,QUFB", imageB = "data:image/png;base64,QkJC";
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => null };
    A.__localConflict = false; A.__docLoadBlocked = null; A.__consultMode = false;
    A.loadDoc({ _v: A.SCHEMA_VERSION, venue: {
      name: "A.png", _dataUrl: imageA, _imgW: 100, _imgH: 80, x: 0, y: 0, w: 100, h: 80,
    }, items: [], inputs: [], outputs: [] });
    A.resetHistory();
    A.state.venue = {
      name: "B.png", _dataUrl: imageB, _imgW: 120, _imgH: 90, x: 0, y: 0, w: 120, h: 90,
    };
    A.recordHistory();
    A.undo();
    eq(A.state.venue._dataUrl, imageA, "undo ripristina l'immagine A");
    A.redo();
    eq(A.state.venue._dataUrl, imageB, "redo ripristina l'immagine B");

    A.resetHistory();
    A.state.venue = null;
    A.recordHistory();
    A.undo();
    eq(A.state.venue._dataUrl, imageB, "undo dell'eliminazione recupera la bitmap B");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud;
    A.__localConflict = oldConflict; A.__docLoadBlocked = oldBlocked; A.__consultMode = oldConsult;
    A.loadDoc(JSON.parse(before)); A.resetHistory();
  }
});
t("concorrenza tra schede sospende la scrittura locale invece di sovrascrivere", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document;
  const oldConflict = A.__localConflict, oldDirty = A._cloudDirty, oldSaving = A._cloudSaving;
  const store = new Map();
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => null };
    A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    A.__localConflict = false; A._cloudDirty = false; A._cloudSaving = false;
    eq(A.persistLocalState(), true, "prima revisione scritta");
    const external = JSON.parse(store.get(A.LS_KEY));
    external._local.localRevision = "altra-scheda:1";
    store.set(A.LS_KEY, JSON.stringify(external));
    const beforeRejectedWrite = store.get(A.LS_KEY);
    A.state.titolo = "Modifica concorrente locale";
    eq(A.persistLocalState(), false, "seconda scrittura rifiutata");
    eq(A.__localConflict, true, "conflitto reso esplicito");
    eq(store.get(A.LS_KEY), beforeRejectedWrite, "root dell'altra scheda non sovrascritto");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument;
    A.__localConflict = oldConflict; A._cloudDirty = oldDirty; A._cloudSaving = oldSaving;
    A.loadDoc(JSON.parse(before));
  }
});
t("sessione autenticata senza binding o dirty non resuscita un progetto cloud eliminato", () => {
  const oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document;
  const oldDirty = A._cloudDirty, oldSaving = A._cloudSaving, oldPending = A.__bootCloudPending;
  const oldCloudId = A.__bootCloudId, oldCloudSig = A.__bootCloudSig, oldConflict = A.__localConflict;
  const store = new Map();
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => ({ id: "logged-in" }) };
    A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    A._cloudDirty = false; A._cloudSaving = false; A.__bootCloudPending = false;
    A.__bootCloudId = null; A.__bootCloudSig = null; A.__localConflict = false;
    eq(A.persistLocalState(), true, "copia locale conservata");
    const meta = JSON.parse(store.get(A.LS_KEY))._local;
    eq({ cloudId: meta.cloudId, cloudPending: meta.cloudPending }, { cloudId: null, cloudPending: false },
      "il solo login non arma una nuova INSERT cloud");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument;
    A._cloudDirty = oldDirty; A._cloudSaving = oldSaving; A.__bootCloudPending = oldPending;
    A.__bootCloudId = oldCloudId; A.__bootCloudSig = oldCloudSig; A.__localConflict = oldConflict;
  }
});
t("Nuovo usa un confine documento unico: scarta varianti, contatti, extra e invalida callback", () => {
  const before = A.docToJSON(), oldCloud = A.__cloud, oldEpoch = A.__docEpoch || 0;
  const detached = [];
  try {
    A.loadDoc({ _doc: 1, active: "old-a", privateRoot: { keep: false }, variants: [
      { id: "old-a", name: "A", state: { titolo: "A", items: [], inputs: [{ src: "Segreto" }], outputs: [],
        contacts: [{ role: "Tecnico", name: "Ada", contact: "private@example.invalid" }] } },
      { id: "old-b", name: "B", state: { titolo: "B", items: [{ id: "old", type: "cantante" }], inputs: [], outputs: [] } },
    ] });
    const loadedEpoch = A.__docEpoch || 0;
    A.__cloud = { setCurrentId: (id) => detached.push(id), currentId: () => "old-project", currentRev: () => "old-rev" };
    A.beginNewDocument({ titolo: "", luogo: "", stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
      items: [], inputs: [], outputs: [] });
    const fresh = JSON.parse(A.docToJSON());
    eq(fresh.variants.length, 1, "una sola variante pulita");
    ok(!("privateRoot" in fresh), "metadata root del vecchio progetto scartati");
    eq([A.state.items.length, A.state.inputs.length, A.state.outputs.length, A.state.contacts.length], [0,0,0,0],
      "nessun dato tecnico/personale attraversa il confine");
    ok((A.__docEpoch || 0) > loadedEpoch && (A.__docEpoch || 0) > oldEpoch, "epoch incrementato");
    eq(detached, [null], "associazione cloud azzerata una volta");
  } finally { A.__cloud = oldCloud; A.loadDoc(JSON.parse(before)); }
});
t("parts componibili manipolate vengono normalizzate senza crash o prototype pollution", () => {
  const parts = JSON.parse('{"count":{},"layout":"constructor","orient":null,"mus":"false","__proto__":{"polluted":true}}');
  const s = A.normalizeState({ _v: A.SCHEMA_VERSION, items: [{ id: "tim", type: "timpani", parts }], inputs: [], outputs: [] });
  const p = s.items[0].parts;
  eq({ count: p.count, layout: p.layout, orient: p.orient, mus: p.mus },
    { count: 2, layout: "arco", orient: "americano", mus: true });
  ok(!Object.prototype.hasOwnProperty.call(p, "__proto__") && !p.polluted, "chiavi magiche eliminate");
  ok(Number.isFinite(s.items[0].w) && Number.isFinite(s.items[0].d), "dimensioni calcolabili");
});

console.log("\nBatteria — disposizione destrorsa + toggle mancino:");
t("destrorsa di default: hi-hat a sinistra del batterista (x>0), floor a destra (x<0)", () => {
  const S = A.drumSlots({ toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true });
  const by = {}; S.forEach((s) => { if (!by[s.k]) by[s.k] = s; });
  ok(by.hihat.x > 0, "hi-hat a destra schermo = sinistra batterista (destrorso)");
  ok(by.floor.x < 0, "floor-tom a sinistra schermo = destra batterista");
  ok(by.snare.x > 0 && by.snare.x < by.hihat.x, "rullante tra cassa e hi-hat, lato sinistro del batterista");
});
t("floor accanto al batterista (profondità del rullante), ride davanti al floor", () => {
  const S = A.drumSlots({ toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true });
  const by = {}; S.forEach((s) => { if (!by[s.k]) by[s.k] = s; });
  ok(Math.abs(by.floor.y - by.snare.y) <= 10, "floor alla profondità del rullante, non davanti alla cassa");
  ok(by.ride.y > by.floor.y, "ride davanti al floor, mai dietro");
});
t("batteria base (Simone): posizioni di default combaciano col kit di riferimento", () => {
  const S = A.drumSlots({ toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true, mus: true });
  const by = {}; S.forEach((s) => { if (s.seat) by.seat = s; else if (!by[s.k]) by[s.k] = s; });
  const near = (got, exp, tol = 4) => ok(Math.abs(got - exp) <= tol, `atteso ~${exp}, ottenuto ${got}`);
  /* coord relative alla cassa (kick a 0,0) */
  near(by.snare.x, 21); near(by.snare.y, -35);
  near(by.hihat.x, 57); near(by.hihat.y, -53);
  near(by.crash.x, 47); near(by.crash.y, -18);
  near(by.ride.x, -45); near(by.ride.y, -14);
  near(by.floor.x, -36); near(by.floor.y, -37);
  near(by.seat.x, 9); near(by.seat.y, -91);
});
t("batteria: nessun pezzo perfettamente coincidente (default + config grandi)", () => {
  const cfgs = [
    { toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true },
    { toms: 3, floor: true, hihat: true, crash: 2, ride: true, stool: true },
    { toms: 2, floor: true, hihat: true, crash: 2, ride: true, stool: true, kick2: true },
    { toms: 3, floor: true, hihat: true, crash: 2, ride: true, stool: true, kick2: true },
  ];
  cfgs.forEach((cfg, ci) => {
    const S = A.drumSlots(cfg).filter((s) => !s.seat);
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const d = Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y);
      ok(d > 8, `cfg#${ci} ${S[i].k}↔${S[j].k}: centri troppo vicini (${Math.round(d)} cm)`);
    }
  });
});
t("toggle mancino: specchia il kit sull'asse x", () => {
  const base = { toms: 2, floor: true, hihat: true, ride: true, stool: true };
  const R = A.drumSlots(Object.assign({}, base));
  const Lf = A.drumSlots(Object.assign({ lefty: true }, base));
  const rh = {}; R.forEach((s) => { if (!rh[s.k]) rh[s.k] = s; });
  const lh = {}; Lf.forEach((s) => { if (!lh[s.k]) lh[s.k] = s; });
  ok(rh.hihat.x > 0 && lh.hihat.x < 0, "hi-hat si specchia");
  ok(rh.floor.x < 0 && lh.floor.x > 0, "floor si specchia");
  eq(lh.hihat.x, -rh.hihat.x, "specchio esatto");
});
t("la batteria espone il controllo 'lefty' (default destrorso)", () => {
  ok(A.COMP.batteria.controls.map((c) => c.key).indexOf("lefty") >= 0, "control lefty presente");
  eq(A.COMP.batteria.defParts.lefty, false, "default = destrorso");
});

console.log("\nAnalytics — classificazione ambiente (env):");
t("analyticsEnv distingue prod / localhost / other", () => {
  eq(A.analyticsEnv("stageplot.it"), "prod");
  eq(A.analyticsEnv("www.stageplot.it"), "prod");
  eq(A.analyticsEnv("localhost"), "localhost");
  eq(A.analyticsEnv("127.0.0.1"), "localhost");
  eq(A.analyticsEnv("castelsim.github.io"), "other");
});

console.log("\nPrimo PDF completo (C) — channel list instrument-driven:");
t("autoInputs genera la input list dagli strumenti, senza attivare il cablaggio", () => {
  reset();
  add("batteria", 400, 400);       // kit → più canali (IN_MULTI)
  A.state.inputs = [];             // lista vuota, come dopo un template
  A.state.cab.on = false;
  A.autoInputs();
  ok(A.state.inputs.length >= 8, "batteria → ≥8 canali auto (ottenuti: " + A.state.inputs.length + ")");
  eq(A.state.cab.on, false, "il cablaggio NON viene attivato (C: nessun cavo disegnato)");
});
t("M-04: autoInputs(silent) genera in memoria SENZA salvare (apertura Esporta = anteprima non-mutante)", () => {
  reset();
  add("batteria", 400, 400);
  A.state.inputs = [];
  let saves = 0;
  const origSave = A.save;
  A.save = function () { saves++; };
  try {
    A.autoInputs(true);                       // silent, come l'apertura dell'hub Esporta
    ok(A.state.inputs.length >= 8, "le liste sono generate in memoria per l'anteprima");
    eq(saves, 0, "silent: nessun salvataggio all'apertura dell'anteprima");
    A.state.inputs = [];
    A.autoInputs();                           // normale (bottone Auto) → salva
    ok(saves >= 1, "non-silent: il salvataggio avviene (comportamento invariato)");
  } finally { A.save = origSave; }
});
console.log("\nAudit connessioni elementi (14/07):");
t("strumenti elettronici assorbono corrente: Hammond 250W, pedaliera 30W, SPD-SX 15W+2 DI", () => {
  reset();
  eq(A.wattOf(add("organohammond", 300, 300)), 250);
  reset(); eq(A.wattOf(add("pedaliera", 300, 300)), 30); reset(); eq(chans(add("pedaliera", 300, 300)).length, 1, "pedaliera = sorgente audio mono di default (modeler diretto; toggle stereo disponibile)");
  reset(); const sp = add("spdsx", 300, 300); eq(A.wattOf(sp), 15); eq(chans(sp).length, 2, "SPD-SX stereo via DI");
});
t("postazione DOPPIA (flag) = 2 microfoni; singola = 1; ×2 dedicata resta 2", () => {
  reset(); const v = add("vlnpost", 300, 300); eq(chans(v).length, 1, "singola");
  v.doppia = true; v.label = "Violino I 1"; v.label2 = "Violino I 2"; A.__cabRes = null;
  eq(chans(v).map((c) => c.name), ["Violino I 1", "Violino I 2"], "doppia = 2 nomi");
  reset(); eq(chans(add("vln1x2", 300, 300)).length, 2, "×2 dedicata già 2");
});
t("ampli/pedaliera su chitarra/basso = carico elettrico", () => {
  reset(); const g = add("gtstand", 300, 300); eq(A.wattOf(g), 0, "chitarra sola non consuma");
  g.ampli = true; eq(A.wattOf(g), 150, "+ampli combo"); g.pedaliera = true; eq(A.wattOf(g), 180, "+pedaliera");
  reset(); const b = add("bassstand", 300, 300); b.ampli = true; eq(A.wattOf(b), 400, "ampli basso");
});
t("batteria divisa nei pezzi conserva 8 microfoni", () => {
  reset();
  const parts = { kickR: "D6", snareR: "SM57", tomR: "e904", tomR2: "e904", floorR: "e904", hihatKR: "SM81", crashR: "KM184", rideR: "KM184" };
  let tot = 0;
  ["kickR", "snareR", "tomR", "tomR", "floorR", "hihatKR", "crashR", "rideR", "stoolR"].forEach((t2) => { reset(); tot += chans(add(t2, 200, 200)).length; });
  eq(tot, 8, "somma dei mic dei pezzi = 8 (stoolR = sgabello, 0)");
});

console.log("\nPersonal monitor model-driven (B1):");
t("P16-M diretto a hub = alimentato dal cavo; in serie = warn + PSU contato", () => {
  reset();
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const m1 = add("hearback", 300, 300); m1.pm = "p16m";
  const m2 = add("hearback", 400, 300); m2.pm = "p16m";
  A.state.mond.manual = {}; A.state.mond.manual[m1.id] = { to: h.id }; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  eq(R.power[m1.id], "data", "diretto a hub"); eq(R.power[m2.id], "psu", "in serie");
  eq(R.psuCount, 1, "PSU locali");
  ok(R.issues.some((i) => i.lvl === "warn" && /alimentatore locale/.test(i.msg)), "manca il warn PSU");
});
t("A320 in serie = err bloccante (hub-only, no PSU)", () => {
  reset();
  const m1 = add("hearback", 300, 300); m1.pm = "a320";
  const m2 = add("hearback", 400, 300); m2.pm = "a320";
  A.state.mond.manual = {}; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /serie/.test(i.msg)), "manca err serie A320");
  eq(R.power[m2.id], "invalid");
});
t("protocolli diversi (A-Net su hub ULTRANET) = err compatibilità", () => {
  reset();
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const m = add("hearback", 300, 300); m.pm = "a16ii";
  A.state.mond.manual = {}; A.state.mond.manual[m.id] = { to: h.id };
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /NON sono compatibili/.test(i.msg)), "manca err protocolli");
});
t("9 OCTO su un OCTO Hub (8 porte) = err capacità", () => {
  reset();
  const h = add("mixhub", 900, 300); h.pm = "octohub";
  A.state.mond.manual = {};
  for (let i = 0; i < 9; i++) { const mx = add("hearback", 100 + i * 60, 300); mx.pm = "hbocto"; A.state.mond.manual[mx.id] = { to: h.id }; }
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /porte/.test(i.msg)), "manca err capacità");
  eq(R.hubLoad[h.id], 9);
});
t("B2: il DESTINATARIO senza Thru (A320) non può ricevere un mixerino in serie", () => {
  reset();
  const m1 = add("hearback", 300, 300); m1.pm = "a320";     // A320 = niente Thru
  const m2 = add("hearback", 400, 300); m2.pm = "a16ii";    // A-16II può fare daisy, ma non VERSO un A320
  A.state.mond.manual = {}; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /Thru/.test(i.msg)), "manca err Thru sul destinatario");
});
t("B2 pmLinkCheck: blocca protocolli misti, serie vietata, hub pieno; ok sui validi", () => {
  reset(); A.state.mond.on = true;
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const mB = add("hearback", 300, 300); mB.pm = "p16m";
  const mA = add("hearback", 400, 300); mA.pm = "a16ii";
  ok(A.pmLinkCheck(mB, h) === null, "P16-M → P16-D deve essere valido");
  ok(A.pmLinkCheck(mA, h) !== null, "A-16II → P16-D va bloccato (protocolli)");
  const m320 = add("hearback", 500, 300); m320.pm = "a320";
  ok(A.pmLinkCheck(m320, mB) !== null, "A320 → mixer va bloccato (hub-only)");
  ok(A.pmLinkCheck(mB, m320) !== null, "mixer → A320 va bloccato (niente Thru)");
  // hub pieno: 8 collegati, il nono si blocca
  A.state.mond.manual = {};
  for (let i = 0; i < 8; i++) { const mx = add("hearback", 100 + i * 50, 500); mx.pm = "p16m"; A.state.mond.manual[mx.id] = { to: h.id }; }
  A.__mondRes = null;
  const m9 = add("hearback", 700, 500); m9.pm = "p16m";
  delete A.state.mond.manual[m9.id]; A.__mondRes = null;   /* l'auto-aggancio l'aveva messo in catena: qui testiamo il drop sull'hub pieno */
  ok(A.pmLinkCheck(m9, h) !== null, "nono mixer su hub da 8 va bloccato");
  // ma la RICONNESSIONE di uno già collegato allo stesso hub resta valida
  const first = A.state.items.filter((x) => A.state.mond.manual[x.id] && A.state.mond.manual[x.id].to === h.id)[0];
  ok(A.pmLinkCheck(first, h) === null, "riconnessione sullo stesso hub non conta come porta nuova");
});
t("B3 pmSysCompatible: A360 (Pro16e) su D400 (Pro16) = famiglia A-Net OK; ULTRANET resta bloccato", () => {
  reset(); A.state.mond.on = true;
  const d4 = add("mixhub", 900, 300); d4.pm = "d400";
  const a3 = add("hearback", 300, 300); a3.pm = "a360";
  ok(A.pmLinkCheck(a3, d4) === null, "A360 → D400 deve essere valido (retrocompatibile)");
  A.state.mond.manual = {}; A.state.mond.manual[a3.id] = { to: d4.id };
  const R = A.monDigEngine();
  ok(!R.issues.some((i) => /NON sono compatibili/.test(i.msg)), "niente err protocolli in famiglia A-Net");
  const p16 = add("hearback", 400, 300); p16.pm = "p16m";
  ok(A.pmLinkCheck(p16, d4) !== null, "ULTRANET → D400 resta bloccato");
});
t("B3 Thru singolo: due mixerini sullo stesso Thru = drop bloccato + err motore", () => {
  reset(); A.state.mond.on = true;
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const m1 = add("hearback", 300, 300); m1.pm = "p16m";
  const m2 = add("hearback", 400, 300); m2.pm = "p16m";
  const m3 = add("hearback", 500, 300); m3.pm = "p16m";
  A.state.mond.manual = {}; A.state.mond.manual[m1.id] = { to: h.id }; A.state.mond.manual[m2.id] = { to: m1.id };
  ok(A.pmLinkCheck(m3, m1) !== null, "secondo mixer sullo stesso Thru va bloccato");
  A.state.mond.manual[m3.id] = { to: m1.id };   // forzato (es. progetto vecchio)
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /Thru/.test(i.msg) && /2 mixerini/.test(i.msg)), "manca err Thru multiplo");
});
t("B3 pmAutoConnect: stella fin dove c'è posto, poi catena per chi la supporta", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const ms = [];
  for (let i = 0; i < 9; i++) { const m = add("hearback", 100 + i * 60, 300); m.pm = "p16m"; ms.push(m); }
  A.state.mond.manual = {}; A.__mondRes = null;   /* l'hook di addItem ha già agganciato coi modelli default: riparti pulito per testare la chiamata esplicita */
  const r = A.pmAutoConnect("ultranet");
  eq(r.done, 9, "tutti collegati"); eq(r.left, 0); eq(r.needPsu, 1, "il nono in catena → 1 PSU");
  const R = A.monDigEngine();
  eq((R.hubLoad || {})[h.id], 8, "8 a stella sul hub");
  ok(!R.issues.some((i) => i.lvl === "err"), "nessun errore dopo autoconnect");
});
t("B3 pmAutoConnect hub-only (OCTO): stella fino a 8, gli altri restano liberi (niente catena)", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h = add("mixhub", 900, 300); h.pm = "octohub";
  for (let i = 0; i < 10; i++) { const m = add("hearback", 100 + i * 50, 300); m.pm = "hbocto"; }
  A.state.mond.manual = {}; A.__mondRes = null;   /* idem: l'hook di addItem aggancia già in automatico */
  const r = A.pmAutoConnect("hearbus");
  eq(r.done, 8, "solo 8 collegati"); eq(r.left, 2, "2 senza posto"); eq(r.needPsu, 0, "nessuna catena OCTO");
});
t("B3 pmAddHub: crea l'hub giusto per il sistema al baricentro dei liberi", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  for (let i = 0; i < 3; i++) { const m = add("hearback", 200 + i * 100, 400); m.pm = "hbocto"; }
  const h = A.pmAddHub("hearbus");
  ok(h && h.pm === "octohub", "hub OCTO creato");
  const r = A.pmAutoConnect("hearbus");
  eq(r.done, 3, "tutti collegati al nuovo hub");
});
t("B3+ cascata OCTO↔OCTO (bus dedicato): 8 mixer + cascata = nessun errore, link presente", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h1 = add("mixhub", 900, 300); h1.pm = "octohub";
  const h2 = add("mixhub", 1200, 300); h2.pm = "octohub";
  for (let i = 0; i < 8; i++) { const m = add("hearback", 100 + i * 50, 300); m.pm = "hbocto"; A.state.mond.manual[m.id] = { to: h1.id }; }
  A.state.mond.manual[h2.id] = { to: h1.id };   // cascata h2 ← h1
  const R = A.monDigEngine();
  ok(!R.issues.some((i) => i.lvl === "err"), "la cascata dedicata non deve consumare porte");
  ok(R.links.some((l) => l.isCasc && l.from.id === h2.id && l.to.id === h1.id), "manca il link di cascata");
  eq((R.hubLoad || {})[h1.id], 8, "8 porte usate dai mixer, cascata esclusa");
});
t("B3+ cascata P16-D (usa una porta): 8 mixer + cascata = err capacità 9/8", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h1 = add("mixhub", 900, 300); h1.pm = "p16d";
  const h2 = add("mixhub", 1200, 300); h2.pm = "p16d";
  for (let i = 0; i < 8; i++) { const m = add("hearback", 100 + i * 50, 300); m.pm = "p16m"; A.state.mond.manual[m.id] = { to: h1.id }; }
  A.state.mond.manual[h2.id] = { to: h1.id };
  const R = A.monDigEngine();
  eq((R.hubLoad || {})[h1.id], 9, "la cascata ULTRANET consuma una porta");
  ok(R.issues.some((i) => i.lvl === "err" && /porte/.test(i.msg)), "manca err capacità con cascata");
});
t("B3+ cascata cross-sistema e loop = err; pmLinkCheck hub→hub/hub→mixer", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const ho = add("mixhub", 900, 300); ho.pm = "octohub";
  const hp = add("mixhub", 1200, 300); hp.pm = "p16d";
  ok(A.pmLinkCheck(ho, hp) !== null, "cascata OCTO→P16-D va bloccata (sistemi diversi)");
  const m = add("hearback", 300, 300); m.pm = "hbocto";
  ok(A.pmLinkCheck(ho, m) !== null, "hub→mixer via drop cascata va spiegato/bloccato");
  const ho2 = add("mixhub", 600, 300); ho2.pm = "octohub";
  ok(A.pmLinkCheck(ho, ho2) === null, "cascata OCTO→OCTO valida");
  A.state.mond.manual[ho.id] = { to: ho2.id }; A.state.mond.manual[ho2.id] = { to: ho.id };   // anello
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /Loop nella cascata/.test(i.msg)), "manca err loop cascata");
});
t("generico (senza it.pm): zero vincoli nuovi, zero PSU contati", () => {
  reset();
  const h = add("mixhub", 900, 300);
  const m1 = add("hearback", 300, 300); const m2 = add("hearback", 400, 300);
  A.state.mond.manual = {}; A.state.mond.manual[m1.id] = { to: h.id }; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  ok(!R.issues.some((i) => i.lvl === "err"), "err inatteso sul generico");
  eq(R.psuCount, 0, "PSU sul generico");
});

console.log("\nPM — estensione modelli/sistemi (15/07):");
t("PM_DB: 10 nuovi modelli presenti (ver partial)", () => {
  ["a640", "me1", "me500", "meu", "dp48", "hub4", "klangk", "lmcsduo", "mix16", "mix32"].forEach((k) => ok(A.PM_DB[k], "manca " + k));
  eq(A.PM_DB.dp48.ver, "partial"); eq(A.PM_DB.meu.role, "hub"); eq(A.PM_DB.meu.ports, 10);
  eq(A.PM_DB.dp48.sys, "aes50pm"); eq(A.PM_DB.me1.daisy, true);
});
t("PM_SYS: 4 nuovi sistemi", () => { ["me", "aes50pm", "klang", "livemix"].forEach((s) => ok(A.PM_SYS[s], "manca sys " + s)); });
t("pmSysCompatible: sistemi diversi NON compatibili (RJ45 ≠ compatibile), A-Net famiglia sì", () => {
  ok(!A.pmSysCompatible("me", "aes50pm")); ok(!A.pmSysCompatible("livemix", "klang"));
  ok(A.pmSysCompatible("anet16", "anetpro16e")); ok(A.pmSysCompatible("me", "me"));
});
t("pmLinkCheck: ME-1 su Hub4 (sistemi diversi) = bloccato", () => {
  reset(); const mx = add("hearback", 300, 300); mx.pm = "me1"; const hub = add("mixhub", 400, 300); hub.pm = "hub4";
  const r = A.pmLinkCheck(mx, hub); ok(r && /NON sono compatibili/.test(r.msg), "atteso blocco cross-sistema; got " + JSON.stringify(r));
});
t("pmLinkCheck: DP48 su Hub4 (stesso AES50) = ok", () => {
  reset(); const mx = add("hearback", 300, 300); mx.pm = "dp48"; const hub = add("mixhub", 400, 300); hub.pm = "hub4";
  eq(A.pmLinkCheck(mx, hub), null);
});
t("PM_DEFAULT_HUB: nuovi sistemi mappati", () => { eq(A.PM_DEFAULT_HUB.me, "meu"); eq(A.PM_DEFAULT_HUB.aes50pm, "hub4"); eq(A.PM_DEFAULT_HUB.livemix, "mix32"); });

console.log("\nAudit T1 — controlli residui (auditEngine):");
function auditMsgs() { return A.auditEngine().findings.map((f) => f.msg); }
function hasMsg(re) { return auditMsgs().some((m) => re.test(m)); }
function auditFind(re) { return A.auditEngine().findings.filter((f) => re.test(f.msg)); }

t("48V forzato su mic dinamico (SM58) → avviso", () => {
  reset(); add("astamic", 400, 400);
  A.state.inputs = [{ src: "Voce", mic: "SM58", p48: true }];
  ok(hasMsg(/48V/), "atteso avviso 48V; findings: " + auditMsgs().join(" | "));
});
t("48V su condensatore (KM184) → nessun avviso 48V", () => {
  reset(); add("astamic", 400, 400);
  A.state.inputs = [{ src: "Overhead", mic: "KM184", p48: true }];
  ok(!hasMsg(/48V/), "48V atteso corretto (condensatore); findings: " + auditMsgs().join(" | "));
});
t("ingresso manuale con sorgente ma senza mic/DI → avviso", () => {
  reset(); add("astamic", 400, 400);
  A.state.inputs = [{ src: "Chitarra", mic: "" }];
  ok(hasMsg(/senza mic/), "findings: " + auditMsgs().join(" | "));
});
t("radiomic (wireless) senza frequenza RF → avviso", () => {
  reset(); add("wireless", 400, 400);
  ok(hasMsg(/RF/), "findings: " + auditMsgs().join(" | "));
});
t("radiomic con frequenza RF → nessun avviso RF", () => {
  reset(); const w = add("wireless", 400, 400); w.rf = "606.500"; A.__cabRes = null;
  ok(!hasMsg(/senza frequenza RF/), "findings: " + auditMsgs().join(" | "));
});
t("capienza stage box superata → err con fix a un click", () => {
  reset(); A.state.cab.on = true;
  const b = add("stagebox", 600, 600); b.ch = 2; b.outCh = 2; A.__cabRes = null;
  add("batteria", 300, 300); cabla();
  const f = auditFind(/superiori ai canali|satura/);
  ok(f.length > 0, "atteso errore capienza; findings: " + auditMsgs().join(" | "));
  ok(f.some((x) => x.act), "atteso fix a un click sull'errore capienza");
});
/* Audit 27/07: un duo acustico non è un progetto sbagliato. Le regole «manca la stage box», «manca il
   quadro», «mancano i monitor» erano tarate su una produzione media e scattavano su due canali e un
   ampli da 150 W, con l'aggravante che «nessun quadro» usciva DUE volte (warn qui, err dal motore
   elettrico, testi diversi → la dedup per stringa non scattava) e l'err bloccava l'export del PDF. */
t("progetto piccolo: niente stage box/distro/monitor richiesti, e nessun errore critico", () => {
  reset(); A.state.cab.on = true; A.state.elec.on = true;
  add("astamic", 300, 300);                 /* 1 canale voce */
  const amp = add("comboamp", 500, 300);    /* 150 W: un ampli in una Schuko */
  A.__cabRes = null; A.__elecRes = null;
  const R = A.auditEngine();
  eq(R.errs, 0, "un duo non deve avere errori critici; findings: " + auditMsgs().join(" | "));
  ok(!hasMsg(/nessuna stage box reale/), "sotto i 4 canali la stage box non serve");
  ok(!hasMsg(/nessun quadro\/distro/), "sotto 1 kW il quadro non serve");
  ok(!hasMsg(/i musicisti non si sentono/), "sotto i 4 canali i monitor sono del locale");
  ok(amp && A.WATT.comboamp === 150, "il carico di prova deve restare piccolo");
});
t("progetto grande: le stesse regole tornano, e «nessun quadro» esce UNA volta sola", () => {
  reset(); A.state.cab.on = true; A.state.elec.on = true;
  add("batteria", 300, 300); add("astamic", 400, 400); add("astamic", 500, 400);
  for (let i = 0; i < 6; i++) add("stack", 200 + i * 60, 600);   /* 6 × 250 W = 1,5 kW */
  A.__cabRes = null; A.__elecRes = null;
  ok(hasMsg(/nessuna stage box reale/), "sopra soglia la stage box torna a mancare davvero");
  const q = auditFind(/nessun quadro\/distro/);
  eq(q.length, 1, "la regola del quadro deve comparire una volta sola; findings: " + auditMsgs().join(" | "));
  eq(q[0].lvl, "err", "sopra soglia resta un errore critico: la dedup non deve declassarlo");
  ok(q[0].act, "e deve conservare il fix a un click (è la voce di auditEngine a sopravvivere)");
  ok(A.auditEngine().errs > 0, "il conteggio errori deve vederlo");
});
t("monitor scoperto (wedge lontano, no IEM) → avviso", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 200, 200); add("wedge", 1100, 700); A.__cabRes = null;
  ok(hasMsg(/lontan[ae] da ogni monitor/), "findings: " + auditMsgs().join(" | "));
});
t("monitor vicino → nessun avviso scoperto", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 400, 400); add("wedge", 430, 430); A.__cabRes = null;
  ok(!hasMsg(/lontan[ae] da ogni monitor/), "findings: " + auditMsgs().join(" | "));
});
t("palco su IEM/personal monitor → check prossimità saltato", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 200, 200); add("wedge", 1100, 700); add("iem", 1150, 700); A.__cabRes = null;
  ok(!hasMsg(/lontan[ae] da ogni monitor/), "con IEM il check va saltato; findings: " + auditMsgs().join(" | "));
});

console.log("\nT3 — viste liste nel link condiviso (availableViewerLists):");
t("stage vuoto → nessuna lista disponibile", () => {
  reset(); eq(A.availableViewerLists().length, 0);
});
t("sorgente audio → Input list disponibile", () => {
  reset(); A.state.cab.on = true; add("astamic", 400, 400); A.__cabRes = null;
  ok(A.availableViewerLists().some((l) => l.key === "inputlist"), "atteso inputlist; got " + JSON.stringify(A.availableViewerLists()));
});
t("radiomic → Lista RF disponibile", () => {
  reset(); A.state.cab.on = true; add("wireless", 400, 400); A.__cabRes = null;
  ok(A.availableViewerLists().some((l) => l.key === "rf"), "atteso rf; got " + JSON.stringify(A.availableViewerLists()));
});
t("sorgente + wedge → Monitor list disponibile", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); add("wedge", 350, 350); A.__cabRes = null;
  ok(A.availableViewerLists().some((l) => l.key === "monitorlist"), "atteso monitorlist; got " + JSON.stringify(A.availableViewerLists()));
});
t("listPreviewHtml('inputlist') → tabella HTML con dati reali", () => {
  reset(); A.state.cab.on = true; add("astamic", 400, 400); A.__cabRes = null;
  const h = A.listPreviewHtml("inputlist");
  ok(h && /pdf-list-tbl/.test(h) && /Input list/.test(h), "html: " + String(h).slice(0, 90));
});

console.log("\nMusicisti illustrati (icone top-down) — cablaggio tecnico:");
t("musViolino1 = 1 canale DPA 4099 (come vlnpost)", () => { reset(); const v = add("musViolino1", 300, 300); eq(chans(v).length, 1); eq(chans(v)[0].mic, "DPA 4099"); });
t("musTromba = 1 canale e906 · musCorno = MD421", () => { reset(); eq(chans(add("musTromba", 200, 200))[0].mic, "e906"); eq(chans(add("musCorno", 260, 200))[0].mic, "MD421"); });
t("musBatteria = 8 canali (riusa IN_MULTI.batteria)", () => { reset(); eq(chans(add("musBatteria", 400, 400)).length, 8); });
t("musPianoGranCoda = 2 canali KM184 · musBasso = 1 DI", () => { reset(); eq(chans(add("musPianoGranCoda", 400, 400)).length, 2); eq(chans(add("musBasso", 200, 400))[0].mic, "DI"); });
t("musDirettore = 0 canali (non è una sorgente audio)", () => { reset(); eq(chans(add("musDirettore", 300, 300)).length, 0); });
t("dimensioni calibrate dall'utente: musViolino1 80×81, musPianoGranCoda 135×238", () => {
  eq([A.TYPES.musViolino1.w, A.TYPES.musViolino1.d], [80, 81]);
  eq([A.TYPES.musPianoGranCoda.w, A.TYPES.musPianoGranCoda.d], [135, 238]);
});

console.log("\nSedie (peso per il rider):");
t("sediaorch 44×48 · 6 kg · sediapubblico 50×53 · 3,5 kg", () => {
  eq([A.TYPES.sediaorch.w, A.TYPES.sediaorch.d], [44, 48]);
  eq([A.TYPES.sediapubblico.w, A.TYPES.sediapubblico.d], [50, 53]);
  eq(A.weightOf({ type: "sediaorch" }), 6);
  eq(A.weightOf({ type: "sediapubblico" }), 3.5);
});
t("riderData.pesoKg somma il peso delle sedie", () => {
  reset(); add("sediaorch", 300, 300); add("sediaorch", 340, 300); add("sediapubblico", 500, 300);
  eq(A.riderData().pesoKg, 6 + 6 + 3.5);
});

console.log("\nT2 — rider tecnico generato dai dati:");
t("riderData: canali derivati + testo default", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); A.__cabRes = null;
  const r = A.riderData();
  ok(r.inCh >= 1, "inCh derivato; got " + r.inCh);
  ok(/line array/i.test(r.sistema), "default sistema audio presente");
});
t("riderData: monitor e pedane derivati", () => {
  reset(); A.state.cab.on = true; add("wedge", 300, 300); add("pedana", 500, 500); A.__cabRes = null;
  const r = A.riderData();
  eq(r.monitor.wedge, 1, "wedge contato");
  eq(r.pedane.length, 1, "pedana rilevata");
  ok(r.pedane[0].w > 0 && r.pedane[0].h > 0, "pedana con dimensioni: " + JSON.stringify(r.pedane[0]));
});
t("riderData: testo editabile (state.rider) vince sul default", () => {
  reset(); A.state.rider = { sistema: "Mio impianto XYZ" };
  const r = A.riderData();
  ok(r.sistema === "Mio impianto XYZ", "override sistema");
  eq(r.sedie, "", "sedie vuote di default");
});
t("riderData: sedie editabili", () => {
  reset(); A.state.rider = { sedie: 40 };
  eq(String(A.riderData().sedie), "40", "sedie dall'editabile");
});
t("riderHtml: documento con sezioni e numeri derivati", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); add("wedge", 320, 320); A.__cabRes = null;
  const h = A.riderHtml();
  ok(/Rider tecnico/.test(h) && /Microfoni/.test(h) && /Monitor/.test(h), "html: " + String(h).slice(0, 120));
});

console.log("\nT4 — rubrica contatti/ruoli:");
t("normContact: clamp lunghezze", () => {
  const c = A.normContact({ role: "x".repeat(50), name: "y".repeat(70), contact: "z".repeat(90), note: "w".repeat(200) });
  ok(c.role.length <= 40 && c.name.length <= 60 && c.contact.length <= 80 && c.note.length <= 120, "clamp: " + JSON.stringify([c.role.length, c.name.length, c.contact.length, c.note.length]));
});
t("primaryContactStr: preferisce ruolo tecnico/sala/FOH", () => {
  const s = A.primaryContactStr([{ role: "Service locale", name: "Mas", contact: "333" }, { role: "Fonico di sala", name: "Marco", contact: "339" }]);
  ok(/Marco/.test(s), "primario tecnico atteso; got " + s);
});
t("primaryContactStr: vuoto con arg → stringa vuota", () => { eq(A.primaryContactStr([]), ""); });
t("normalizeState: migra techContact → rubrica", () => {
  const s = { techContact: "Marco 339" }; A.normalizeState(s);
  ok(Array.isArray(s.contacts) && s.contacts.length === 1 && /339/.test(s.contacts[0].contact), "migrato: " + JSON.stringify(s.contacts));
});
t("riderData: espone contatti + contatto primario derivato", () => {
  reset(); A.state.contacts = [{ role: "Service locale", name: "Service Alfa", contact: "333111" }];
  const d = A.riderData();
  eq(d.contatti.length, 1, "1 contatto");
  ok(/Service Alfa/.test(d.contatto) || /333111/.test(d.contatto), "contatto derivato: " + d.contatto);
});
t("riderHtml: sezione Contatti e ruoli quando presenti", () => {
  reset(); A.state.contacts = [{ role: "Service locale", name: "Mas", contact: "333" }];
  const h = A.riderHtml();
  ok(/Contatti e ruoli/.test(h) && /Mas/.test(h), "sezione contatti nel rider");
});
t("audit T4: cablaggio senza contatto Service → nudge info", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); A.state.contacts = []; A.__cabRes = null;
  ok(A.auditEngine().findings.some((f) => /Service/i.test(f.msg) && f.lvl === "info"), "atteso nudge service");
});
t("audit T4: con contatto Service → nessun nudge", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300);
  A.state.contacts = [{ role: "Service locale", name: "Mas", contact: "333" }]; A.__cabRes = null;
  ok(!A.auditEngine().findings.some((f) => /Nessun contatto per il Service/.test(f.msg)), "nessun nudge col service presente");
});

console.log("\nT5 — stati di approvazione:");
t("statusInfo: stato corretto, fallback bozza", () => { eq(A.statusInfo("approvato").label, "Approvato"); eq(A.statusInfo("xxx").k, "bozza"); });
t("normalizeState: default bozza + approval normalizzato", () => {
  const s = {}; A.normalizeState(s); eq(s.status, "bozza"); ok(s.approval && s.approval.by === "" && s.approval.at === "", "approval vuoto");
  const s2 = { status: "zzz" }; A.normalizeState(s2); eq(s2.status, "bozza", "stato invalido → bozza");
});
t("setProjectStatus: approvato firma la data", () => {
  reset(); A.state.approval = { by: "", at: "" }; A.setProjectStatus("approvato");
  eq(A.state.status, "approvato"); ok(/^\d{4}-\d{2}-\d{2}$/.test(A.state.approval.at), "data firmata: " + A.state.approval.at);
});
t("setProjectStatus: stato non valido ignorato", () => { reset(); A.state.status = "bozza"; A.setProjectStatus("zzz"); eq(A.state.status, "bozza"); });
t("riderData: espone stato + firma", () => {
  reset(); A.state.status = "approvato"; A.state.approval = { by: "Anna", at: "2026-07-14" };
  const d = A.riderData(); eq(d.status, "approvato"); eq(d.approvedBy, "Anna"); eq(d.approvedAt, "2026-07-14");
});
t("riderHtml: badge stato + firma quando approvato", () => {
  reset(); A.state.status = "approvato"; A.state.approval = { by: "Anna", at: "2026-07-14" };
  const h = A.riderHtml(); ok(/APPROVATO/.test(h) && /Anna/.test(h), "badge+firma nel rider");
});
t("audit T5: bozza con contenuto → nudge info", () => {
  reset(); add("astamic", 300, 300); A.state.status = "bozza"; A.__cabRes = null;
  ok(A.auditEngine().findings.some((f) => /Bozza/i.test(f.msg) && f.lvl === "info"), "atteso nudge bozza");
});
t("audit T5: approvato → nessun nudge bozza", () => {
  reset(); add("astamic", 300, 300); A.state.status = "approvato"; A.__cabRes = null;
  ok(!A.auditEngine().findings.some((f) => /ancora una «Bozza»/.test(f.msg)), "nessun nudge da approvato");
});

console.log("\nT6 — varianti/scene (snapshot indipendenti):");
t("loadDoc: blob legacy piatto → 1 variante", () => {
  A.loadDoc({ titolo: "Legacy", luogo: "", items: [], inputs: [], outputs: [] });
  eq(A.VARIANTS.length, 1); eq(A.state.titolo, "Legacy"); eq(A.activeVar, A.VARIANTS[0].id);
});
t("loadDoc: blob doc con 2 varianti carica l'attiva", () => {
  A.loadDoc({ _doc: 1, active: "vB", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  eq(A.VARIANTS.length, 2); eq(A.activeVar, "vB"); eq(A.state.titolo, "Ridotta");
});
t("docToJSON: serializza tutte le varianti + active; state resta piatto", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  const doc = JSON.parse(A.docToJSON());
  eq(doc.variants.length, 2); eq(doc.active, "vA"); eq(doc.variants.map((v) => v.name), ["Piena", "Ridotta"]);
});
t("switchVariant: congela l'attiva e ripristina la target (modifiche indipendenti)", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  A.state.titolo = "Piena EDIT"; add("batteria", 400, 400);
  A.switchVariant("vB");
  eq(A.activeVar, "vB"); eq(A.state.titolo, "Ridotta"); eq(A.state.items.length, 0, "vB non eredita gli item di vA");
  A.switchVariant("vA");
  eq(A.state.titolo, "Piena EDIT", "modifica di vA congelata"); eq(A.state.items.length, 1, "item di vA preservato");
});
t("createVariant: duplica l'attiva (copia identica) e ci passa sopra", () => {
  A.loadDoc({ titolo: "Base", items: [], inputs: [], outputs: [] });
  add("astamic", 300, 300);
  const before = A.VARIANTS.length;
  const id = A.createVariant("Ridotta");
  eq(A.VARIANTS.length, before + 1); eq(A.activeVar, id);
  eq(A.state.titolo, "Base", "la copia parte identica"); eq(A.state.items.length, 1, "la copia eredita gli item");
  ok(JSON.parse(A.docToJSON()).variants.some((v) => v.name === "Ridotta"), "nuova variante nel doc");
});
t("deleteVariant: guardia — non elimina l'ultima variante", () => {
  A.loadDoc({ titolo: "Solo", items: [], inputs: [], outputs: [] });
  const only = A.activeVar; A.deleteVariant(only);
  eq(A.VARIANTS.length, 1, "resta 1 variante"); eq(A.activeVar, only);
});
t("deleteVariant: elimina l'attiva → passa a un'altra", () => {
  A.loadDoc({ _doc: 1, active: "vB", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  A.deleteVariant("vB");
  eq(A.VARIANTS.length, 1); eq(A.VARIANTS[0].id, "vA"); eq(A.activeVar, "vA"); eq(A.state.titolo, "Piena");
});
t("renameVariant: aggiorna il nome nel doc", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  A.renameVariant("vB", "Venue Y");
  eq(JSON.parse(A.docToJSON()).variants.find((v) => v.id === "vB").name, "Venue Y");
});
t("stateToJSON resta piatto (view/#p=/realtime): niente chiavi variants/active", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } } ] });
  const flat = JSON.parse(A.stateToJSON());
  ok(!("variants" in flat) && !("active" in flat), "stato piatto"); eq(flat.titolo, "Piena");
});
t("docToJSONFull conserva le planimetrie di tutte le varianti; docToJSON le strippa", () => {
  A.loadDoc({ _doc: 1, active: "va", variants: [
    { id: "va", name: "A", state: { titolo: "A", venue: { name: "same.png", _dataUrl: "data:image/png;base64,QUFB", _imgW: 100, _imgH: 80 }, items: [], inputs: [], outputs: [] } },
    { id: "vb", name: "B", state: { titolo: "B", venue: { name: "same.png", _dataUrl: "data:image/png;base64,QkJC", _imgW: 120, _imgH: 90 }, items: [], inputs: [], outputs: [] } },
  ] });
  const light = JSON.parse(A.docToJSON()), full = JSON.parse(A.docToJSONFull());
  const lv = light.variants.find((v) => v.id === light.active);
  const fv = full.variants.find((v) => v.id === full.active);
  ok(!lv.state.venue || !lv.state.venue._dataUrl, "docToJSON: immagine strippata");
  ok(fv.state.venue && fv.state.venue._dataUrl, "docToJSONFull: immagine presente sull'attiva");
  eq(full.variants.map((v) => v.state.venue._dataUrl),
    ["data:image/png;base64,QUFB", "data:image/png;base64,QkJC"], "bitmap distinte, anche con filename uguale");
  A.switchVariant("vb"); eq(A.state.venue._dataUrl, "data:image/png;base64,QkJC", "switch riaggancia la bitmap della variante corretta");
  A.switchVariant("va"); eq(A.state.venue._dataUrl, "data:image/png;base64,QUFB", "ritorno alla bitmap A");
});
t("safeVenueDataUrl: whitelist raster; scarta svg/js/breakout (difesa in profondità di applyVenueImage)", () => {
  eq(A.safeVenueDataUrl("data:image/png;base64,AAAB"), "data:image/png;base64,AAAB");
  eq(A.safeVenueDataUrl("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
  eq(A.safeVenueDataUrl("data:image/webp;base64,UklGRg=="), "data:image/webp;base64,UklGRg==");
  eq(A.safeVenueDataUrl("data:image/svg+xml;base64,PHN2Zz4="), "");        // svg = vettore XSS → scartato
  eq(A.safeVenueDataUrl('data:image/png;base64,AAA" onerror="alert(1)'), ""); // attribute breakout → scartato
  eq(A.safeVenueDataUrl("javascript:alert(1)"), "");
  eq(A.safeVenueDataUrl(""), "");
  eq(A.safeVenueDataUrl(null), "");
});
t("planimetria manipolata: geometria numerica e markup SVG senza attribute injection", () => {
  const v = A.normalizeVenue({ name: 7, _dataUrl: "data:image/png;base64,QUFB",
    x: '1" onload="alert(1)', y: "20", w: '50" onerror="alert(2)', h: -4,
    rot: '0) scale(9)" onload="alert(3)', opacity: "999", locked: false,
    calibration: { p1: { x: '0" onload="x', y: 2 }, realCm: "100" } });
  eq({ x: v.x, y: v.y, w: v.w, h: v.h, rot: v.rot, opacity: v.opacity },
    { x: 0, y: 20, w: 5000, h: 1, rot: 0, opacity: 100 }, "campi geometrici normalizzati/clampati");
  const oldVenue = A.state.venue;
  try {
    A.state.venue = v;
    const markup = A.venueMarkup();
    ok(markup.includes("<image ") && !/onload|onerror|alert|scale\(9\)/.test(markup), "nessun attributo/evento iniettato");
  } finally { A.state.venue = oldVenue; }
});
t("item ID opaco: markup SVG/HTML codificato e lookup senza selector interpolato", () => {
  reset();
  const id = 'audit" data-audit-marker="present';
  const it = { id, type: "astamic", x: 100, y: 100, rot: 0, w: 38, d: 80, label: "Asta" };
  A.selSet = {};
  const markup = A.itemMarkup(it);
  ok(markup.includes("data-id=\"audit&quot; data-audit-marker=&quot;present\""), "ID codificato nell'attributo");
  ok(!markup.includes('" data-audit-marker="'), "nessun secondo attributo iniettato");
  const dot = A.sectionDotMarkup({ id, type: "cantante", x: 20, y: 30, rot: 0, w: 90, d: 90, label: "Voce" });
  ok(dot.includes("data-id=\"audit&quot; data-audit-marker=&quot;present\""), "section dot codificato");
  const oldSvg = A.svg;
  const oldIndex = A.itemNodeIndex;
  const expected = { getAttribute: (name) => name === "data-id" ? id : null };
  let scans = 0;
  try {
    A.svg = { querySelectorAll: (selector) => {
      eq(selector, ".item[data-id]", "selector statico");
      scans++;
      return [{ getAttribute: () => "other" }, expected];
    } };
    A.itemNodeIndex = new Map();
    ok(A.itemNode(id) === expected, "lookup per confronto del valore opaco");
    expected.parentNode = {};
    ok(A.itemNode(id) === expected && scans === 1, "indice riusato senza scansioni per frame");
  } finally {
    A.svg = oldSvg;
    A.itemNodeIndex = oldIndex;
  }
});
t("sink dinamici: chiavi cavo codificate e nessun handler/selector costruito da ID", () => {
  ok(!/data-cab="'\+(?:l\.key|selCab)\+/.test(appjs), "nessuna chiave cavo interpolata senza esc");
  ok(!appjs.includes('onclick="window.__fixStagebox'), "nessun inline handler con ID stagebox");
  ok(!/querySelector\([^\n]*data-mus[^\n]*x\.id/.test(appjs), "nessun selector dinamico per ID musicista");
  ok(/function saveProject\(onSaved, silent, lockHeld\)\{\s*\/\*[^]*?if\(window\.__docLoadBlocked\)/.test(appjs),
    "il salvataggio cloud manuale rispetta il blocco documento");
  const copyFlow = appjs.slice(appjs.indexOf("function completeCopyFromToken"), appjs.indexOf("function loadProjects"));
  ok(!/cloudCurrentId=null[^]*importProject/.test(copyFlow),
    "salva una copia non stacca il cloud prima della validazione");
  ok(!copyFlow.includes("activatePreparedProject(prepared"),
    "il ritorno OAuth non sostituisce automaticamente l'unica copia locale");
  const openFlow = appjs.slice(appjs.indexOf("function openProject"), appjs.indexOf("function dupProject"));
  const preparePos = openFlow.indexOf("prepared=prepareDoc");
  const activatePos = openFlow.indexOf("activatePreparedProject(prepared");
  const bindPos = openFlow.indexOf("cloudCurrentId=id");
  ok(preparePos >= 0 && activatePos > preparePos && bindPos > activatePos,
    "apertura cloud valida e attiva il documento prima di cambiare associazione");
});
t("share pubblico: dati personali e firma nominativa sono fail-closed", () => {
  const oldLocked = A.__projLocked;
  try {
    A.__projLocked = false;
    const hidden = A.stateForPublicShare({
      contacts: [{ name: "Ada", contact: "ada@example.test" }],
      techContact: "Ada",
      pdfHeader: "Ada · +39 000",
      approval: { by: "Ada", at: "2026-07-23" },
      shareOpts: { contacts: false },
    });
    eq(hidden.contacts, undefined);
    eq(hidden.techContact, undefined);
    eq(hidden.pdfHeader, undefined);
    eq(hidden.approval, { at: "2026-07-23" });
    A.__projLocked = true;
    const locked = A.stateForPublicShare({
      contacts: [{ name: "Ada" }],
      approval: { by: "Ada", at: "2026-07-23" },
      shareOpts: { contacts: true },
    });
    eq(locked.contacts, undefined);
    eq(locked.approval, { at: "2026-07-23" });
  } finally { A.__projLocked = oldLocked; }
});
t("boot consulenza: il confine read-only precede rete e scenari QA", () => {
  const bootStart = appjs.indexOf('var vt = new URLSearchParams(location.search).get("view")');
  const fetchStart = appjs.indexOf("fetch(SB_URL+\"/functions/v1/get-shared-project", bootStart);
  const sessionStart = appjs.indexOf("function startSession", bootStart);
  const bootFlow = appjs.slice(bootStart, sessionStart);
  ok(bootStart >= 0 && fetchStart > bootStart && sessionStart > fetchStart, "flusso view individuato");
  ok(bootFlow.indexOf("window.__consultMode=true") < bootFlow.indexOf("fetch(SB_URL"),
    "modalità consulenza impostata sincronicamente prima della rete");
  ok(bootFlow.includes('classList.add("viewmode","consult-pending")'),
    "interazioni bloccate durante il caricamento del bearer link");
  const scenarioFlow = appjs.slice(appjs.indexOf("var allowStartupScenario="), appjs.indexOf("/* ===== Supabase", appjs.indexOf("var allowStartupScenario=")));
  ok(scenarioFlow.includes("!/[?&]view=/.test(location.search)") &&
    scenarioFlow.includes("allowStartupScenario && location.search.indexOf(\"demo=1\")"),
  "gli scenari QA non possono mutare un documento aperto con ?view=");
  ok(appjs.includes('var sharedLoaded=!/[?&]view=/.test(location.search) && loadFromHash()'),
    "?view= resta autorevole anche se l'URL contiene un hash documento");
  const sessionFlow = appjs.slice(sessionStart, appjs.indexOf("function setupTrustedViewerRefresh", sessionStart));
  ok(sessionFlow.includes("d.is_locked") && sessionFlow.includes("window.applyProjLock(true)") &&
    sessionFlow.includes("if(isEditor && d.is_locked)") && sessionFlow.includes("else if(isEditor) setupAutosave"),
  "un progetto consulenza bloccato nasce read-only e non installa l'autosave");
  const lockUiFlow = appjs.slice(appjs.indexOf("function applyProjLock"), appjs.indexOf("window.applyProjLock"));
  ok(lockUiFlow.includes("consultationLock=!!window.__consultMode") &&
    lockUiFlow.includes("lockDup.hidden=consultationLock") &&
    lockUiFlow.includes("lockUnlock.hidden=consultationLock"),
  "la consulenza bloccata non offre comandi proprietario che produrrebbero una falsa copia");
});
t("lifecycle cloud: snapshot immutabile, revision guard e cambio progetto fail-closed", () => {
  const saveFlow = appjs.slice(appjs.indexOf("function saveProject"), appjs.indexOf("function completeCopyFromToken"));
  ok(saveFlow.includes("snapshotData=JSON.parse(docToJSON())"), "payload catturato prima dell'asincronia");
  ok(saveFlow.includes('.eq("updated_at",targetRev)'), "ogni update porta la revisione catturata");
  ok(saveFlow.includes("if(cloudCurrentId && !cloudRev)"), "revisione ignota gestita prima dell'update");
  const unknownRev = saveFlow.slice(saveFlow.indexOf("if(cloudCurrentId && !cloudRev)"), saveFlow.indexOf("/* Snapshot immutabile"));
  ok(unknownRev.includes("enterConflict()") && !unknownRev.includes("setRev(r.data.updated_at)"),
    "una revisione ignota fallisce chiusa: conflitto, mai adozione cieca");
  ok(/stillCurrent=authStill\(targetUserId,targetAuth\)\s*&&\s*\(window\.__docEpoch\|\|0\)===saveEpoch\s*&&\s*cloudCurrentId===targetId/.test(saveFlow),
    "una risposta stale o appartenente a un altro account non può riagganciare il documento corrente");
  ok(appjs.includes("cloudWriteBusy=false, cloudWriteQueue=[]") && saveFlow.includes("cloudWriteQueue.push"),
    "INSERT e UPDATE concorrenti sono serializzati");
  const autosaveFlow = appjs.slice(appjs.indexOf("function cloudAutosaveNow"), appjs.indexOf("function renderAccountBtn"));
  ok(autosaveFlow.includes("window.__bootVenueUnavailable") &&
    autosaveFlow.includes('setDocState("conflict")') &&
    autosaveFlow.includes("resolveCloudFlush(false)"),
  "una planimetria locale mancante non può propagare venue_image=null al cloud");
  ok(appjs.includes('window.addEventListener("beforeunload",function(e){\n  if(!window.__localConflict) return;'),
    "gli edit sospesi dopo conflitto multi-tab attivano l'avviso di uscita");
  const openFlow = appjs.slice(appjs.indexOf("function openProject"), appjs.indexOf("function dupProject"));
  ok(openFlow.includes("window.flushCloudAutosave(function(ok)"), "il cambio progetto attende il flush");
  ok(openFlow.includes("window.__cloudNeedsFlush()"), "gli edit durante la lettura remota bloccano il commit");
  const conflictFlow = appjs.slice(appjs.indexOf('querySelector("#cbLoad")'), appjs.indexOf('querySelector("#cbCopy")'));
  ok(conflictFlow.includes("conflictSnapshot=docToJSON()") && conflictFlow.includes("venueImageBundleSig()!==conflictVenueSig"),
    "il load del conflitto non sostituisce edit o bitmap cambiati durante la GET");
  ok(conflictFlow.includes('select("data,title,updated_at,venue_image,is_locked")') &&
    conflictFlow.includes("applyProjLock(!!r.data.is_locked)") &&
    conflictFlow.includes("persistLocalState(true)"),
  "la risoluzione del conflitto applica e persiste anche il lock autorevole");
  ok(/function beginNewDocument\(initialState(?:,options)?\)/.test(appjs) && appjs.includes("function detachCloudDoc(epochAlreadyChanged)"),
    "Nuovo/modelli/copie usano un confine che invalida le callback");
  const copyFlow = appjs.slice(appjs.indexOf("function completeCopyFromToken"), appjs.indexOf("function loadProjects"));
  ok(copyFlow.includes('.insert({user_id:') && !copyFlow.includes("activatePreparedProject(prepared"),
    "la copia nasce nel cloud e lo slot locale non viene sostituito");
  ok(copyFlow.includes('d.kind!=="project"') &&
    copyFlow.includes("d.data.shareOpts.copy===false") &&
    copyFlow.indexOf("d.data.shareOpts.copy===false") < copyFlow.indexOf('.insert({user_id:'),
  "il permesso di copia viene ricontrollato dalla GET autorevole dopo login/OAuth");
  const copyInsertPos = copyFlow.indexOf('.insert({user_id:');
  ok(copyInsertPos >= 0 &&
    copyFlow.slice(copyInsertPos).includes('removeItem("copyFromToken")'),
  "un errore di insert lascia il token ritentabile; il successo lo consuma");
  ok(!appjs.includes("if(!window.__consultMode){ s.inputs=[]; s.outputs=[]; }"),
    "entitlement UI separato dalla persistenza delle liste");
  const fileSaveStart = appjs.indexOf("function fileSaveCloud");
  const fileSaveFlow = appjs.slice(fileSaveStart, appjs.indexOf("window.fileSaveVersion", fileSaveStart));
  ok(fileSaveFlow.includes("flushCloudAutosave(function(ok)") && fileSaveFlow.includes("if(ok)"),
    "Salva conferma il cloud soltanto dal callback reale");
  const shareRowFlow = appjs.slice(appjs.indexOf("function shareRow"), appjs.indexOf("function rubricaList"));
  ok(shareRowFlow.includes("flushCloudAutosave(function(ok)") && shareRowFlow.includes("if(ok) go()"),
    "Condividi non pubblica una versione stale se il save fallisce");
  const shareOptionFlow = appjs.slice(appjs.indexOf("function commitShareOption"), appjs.indexOf("function shareFillExtras"));
  ok(shareOptionFlow.includes("Esito non verificato") && shareOptionFlow.includes('urlEl.value=""') &&
    shareOptionFlow.includes("revoke.disabled=false") && !shareOptionFlow.includes("state.shareOpts[key]=old"),
  "una risposta persa sui permessi non mostra né afferma un link con stato privacy incerto");
  const revokeFlow = appjs.slice(appjs.indexOf("function clearShareTokenFor"), appjs.indexOf("function shareRow"));
  ok(revokeFlow.includes("update({share_token:null})") && revokeFlow.includes('select("share_token")') &&
    revokeFlow.includes("enterConflict()"),
  "la revoca privacy ha un fallback idempotente verificato senza adottare una revisione documentale ambigua");
  const accountFlow = appjs.slice(appjs.indexOf("function setCloudUser"), appjs.indexOf("function authStill"));
  ok(accountFlow.includes("authGeneration++") && accountFlow.includes("cloudOpenSeq++") &&
    accountFlow.includes("cloudProjectsLoadSeq++") && accountFlow.includes("cloudWriteQueue.splice(0)") &&
    accountFlow.includes("rubCache=null"),
  "il cambio account invalida callback, coda e cache del tenant precedente");
  const listFlow = appjs.slice(appjs.indexOf("function loadProjects"), appjs.indexOf("function openProject"));
  ok(listFlow.includes("request=++cloudProjectsLoadSeq") &&
    listFlow.includes("request!==cloudProjectsLoadSeq") &&
    listFlow.includes("if(cur && window.applyProjLock)"),
  "una lista cloud stale o priva del progetto corrente non può sbloccare l'editor");
  const lockFlow = appjs.slice(appjs.indexOf("function doLockUpdate"), appjs.indexOf("function unlockCurrent"));
  ok(lockFlow.includes("keepFrozenOnFailure") && lockFlow.includes("window.applyProjLock(true)") &&
    lockFlow.indexOf("window.applyProjLock(true)") < lockFlow.indexOf("doLockUpdate(id,true,true)"),
  "il comando Blocca congela subito l'editor e resta fail-closed se il CAS è ambiguo");
  const rubricaImportFlow = appjs.slice(appjs.indexOf("function rubricaImportCandidates"), appjs.indexOf("function itemContactsList"));
  ok(rubricaImportFlow.includes("requestUser=cloudUser.id") &&
    rubricaImportFlow.includes("authStill(requestUser,requestAuth)"),
  "l'import rubrica scarta risposte asincrone appartenenti a un account precedente");
  const analyticsStart = appjs.indexOf("window.__sendEvent=function");
  const analyticsFlow = appjs.slice(
    analyticsStart,
    appjs.indexOf("window.__flushEvents=function", analyticsStart),
  );
  ok(analyticsFlow.includes("if(!sb || !cloudUser) return") &&
    !analyticsFlow.includes("/rest/v1/analytics_events"),
  "analytics non espone più un endpoint INSERT anonimo dal client");
});
t("B4 Aspetto globale: normalizeState default illustrato + preserva schematico", () => {
  eq(A.normalizeState({ items: [], inputs: [], outputs: [] }).lookDefault, "illustrato");
  eq(A.normalizeState({ items: [], inputs: [], outputs: [], lookDefault: "schematico" }).lookDefault, "schematico");
});
t("B4 Aspetto globale: nuovi elementi ereditano lookDefault, override esplicito regge", () => {
  reset();
  A.state.lookDefault = "illustrato";
  var g1 = add("gtacustica", 300, 300);
  ok(g1.look !== "schematico", "col default illustrato il nuovo elemento non è schematico");
  ok(A.look2Art(g1) !== null, "illustrato → illustrazione presente");
  A.state.lookDefault = "schematico";
  var g2 = add("gtacustica", 500, 500);
  eq(g2.look, "schematico", "col default schematico il nuovo elemento eredita schematico");
  ok(A.look2Art(g2) === null, "schematico → nessuna illustrazione");
});

console.log("\nUnifica icone (Fase 1) — musicista↔postazione:");
t("postArt: default illustrato → art; schematico → null; non mappato → null", () => {
  eq(A.postArt({ type: "vlnpost" }), "musViolino1");
  eq(A.postArt({ type: "vlnpost", look: "schematico" }), null);
  eq(A.postArt({ type: "flauto" }), "musFlauto");
  eq(A.postArt({ type: "tuba" }), "musTuba");
  eq(A.postArt({ type: "astamic" }), null);
});
t("toggle look NON cambia i canali (illustrato == schematico)", () => {
  reset(); const a = add("vlnpost", 300, 300); const nA = chans(a).length;
  reset(); const b = add("vlnpost", 300, 300); b.look = "schematico"; A.__cabRes = null; const nB = chans(b).length;
  eq(nA, nB); ok(nA >= 1, "vlnpost ha almeno 1 canale");
});
t("migrazione v2→v3: musViolino1 → vlnpost, aspetto illustrato (default), dims postazione", () => {
  const s = { _v: 2, items: [{ type: "musViolino1", x: 100, y: 100, w: 80, d: 81, label: "Vln I" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items[0].type, "vlnpost");
  ok(s.items[0].look == null, "look non impostato = illustrato default");
  eq([s.items[0].w, s.items[0].d], [A.TYPES.vlnpost.w, A.TYPES.vlnpost.d]);
  eq(s.items[0].label, "Vln I", "etichetta preservata");
});
t("migrazione: musViolino1→vlnpost vsec 1, musViolino2→vlnpost vsec 2 (Violino I/II postazione)", () => {
  const s = { _v: 2, items: [{ type: "musViolino1", w: 80, d: 81 }, { type: "musViolino2", w: 81, d: 82 }, { type: "musChitClassica" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items.map((i) => i.type), ["vlnpost", "vlnpost", "musChitClassica"]);
  eq(s.items[0].vsec, 1); eq(s.items[1].vsec, 2);
  eq([s.items[1].w, s.items[1].d], [A.TYPES.vlnpost.w, A.TYPES.vlnpost.d]);
});
t("Violino II = vlnpost + vsec 2 con illustrazione dedicata (postArt=musViolino2), stessa postazione di Vln I", () => {
  eq(A.postArt({ type: "vlnpost" }), "musViolino1");
  eq(A.postArt({ type: "vlnpost", vsec: 2 }), "musViolino2");
  eq(A.postArt({ type: "vlnpost", vsec: 2, look: "schematico" }), null);
  ok(A.POSTAZ.vlnpost, "vlnpost è una postazione → Violino I e II hanno microfonazione/sedia/doppia");
});
t("catalogo: le 16 mus* con twin sono nascoste (catalog:false); Fase 2 (Batteria) resta visibile", () => {
  ["musViolino1", "musViolino2", "musViola", "musVioloncello", "musContrabbasso", "musCorno", "musTromba", "musTrombone", "musTuba", "musFlauto", "musOboe", "musClarinetto", "musFagotto", "musSaxAlto", "musSaxTenore", "musSaxBaritono"].forEach((k) => ok(A.TYPES[k].catalog === false, k + " deve essere catalog:false"));
  ok(A.TYPES.musChitClassica.catalog !== false, "musChitClassica (senza twin) resta in catalogo");
});

t("sigle italiane (convenzioni orchestra): Tr non Tpt, Sax A/T/B non ASax, Tbn B non Bass", () => {
  const sig = (tp) => A.abbrOf({ type: tp, label: A.defaultLabel(tp) });
  eq(sig("tromba"), "Tr");
  eq(sig("saxalto"), "Sax A"); eq(sig("saxtenore"), "Sax T"); eq(sig("saxbaritono"), "Sax B");
  eq(sig("musTromboneBasso"), "Tbn B", "trombone basso non deve matchare 'basso'→Bass");
  eq(sig("corno"), "Cor"); eq(sig("vlnpost"), "Vln"); eq(sig("violoncello"), "Vc"); eq(sig("trombone"), "Tbn");
});

console.log("\nAudit — voci senza mic (L8) + nomi canale duplicati (B4):");
t("audit L8: cantante senza mic → avviso azionabile", () => {
  reset(); add("cantante", 400, 400); A.__cabRes = null;
  const f = A.auditEngine().findings.filter((x) => /senza microfono/.test(x.msg));
  ok(f.length === 1 && f[0].act && /radiomic/i.test(f[0].act.label), "atteso avviso con fix; findings: " + auditMsgs().join(" | "));
});
t("audit L8: cantante con radiomic entro 1,5 m → nessun avviso", () => {
  reset(); add("cantante", 400, 400); add("wireless", 440, 400); A.__cabRes = null;
  ok(!hasMsg(/senza microfono/), "findings: " + auditMsgs().join(" | "));
});
t("audit L8: corista NON triggera l'avviso (vive nel mic di sezione)", () => {
  reset(); add("corista", 400, 400); A.__cabRes = null;
  ok(!hasMsg(/senza microfono/), "findings: " + auditMsgs().join(" | "));
});
t("audit L8: il fix piazza un radiomic col nome del cantante e spegne l'avviso", () => {
  reset(); const c = add("cantante", 400, 400); c.label = "Vocalist 2"; A.__cabRes = null;
  const f = A.auditEngine().findings.find((x) => /senza microfono/.test(x.msg));
  try { f.act.run(); } catch (e) { /* render/save toccano il DOM stub */ }
  A.__cabRes = null;
  const w = A.state.items.find((i) => i.type === "wireless");
  ok(w && w.label === "Vocalist 2", "radiomic col nome del cantante; items: " + A.state.items.map((i) => i.type).join(","));
  ok(!hasMsg(/senza microfono/), "dopo il fix: " + auditMsgs().join(" | "));
});
t("audit B4: due canali con lo stesso nome → avviso doppione", () => {
  reset(); const w1 = add("wireless", 300, 300); w1.label = "VOX LEAD 1"; const w2 = add("wireless", 700, 300); w2.label = "VOX LEAD 1"; A.__cabRes = null;
  ok(hasMsg(/si chiamano|compaiono più volte/), "findings: " + auditMsgs().join(" | "));
});
t("audit B4: spare dichiarato nel nome → nessun avviso doppione", () => {
  reset(); const w1 = add("wireless", 300, 300); w1.label = "VOX LEAD"; const w2 = add("wireless", 700, 300); w2.label = "VOX LEAD spare"; A.__cabRes = null;
  ok(!hasMsg(/si chiamano|compaiono più volte/), "findings: " + auditMsgs().join(" | "));
});
t("audit B4: doppione nella lista manuale (state.inputs) → avviso", () => {
  reset(); add("astamic", 300, 300);
  A.state.inputs = [{ src: "VOX LEAD 1", mic: "935" }, { src: "VOX LEAD 1", mic: "SM58" }];
  ok(hasMsg(/si chiamano|compaiono più volte/), "findings: " + auditMsgs().join(" | "));
});

console.log("\nOstacolo di sito:");
t("ostacolo: in catalogo (Sicurezza e site), ridimensionabile, zero canali e zero carico", () => {
  const t0 = A.TYPES.ostacolo;
  ok(t0 && t0.cat === "Sicurezza e site" && t0.resizable === true, "tipo presente e resizable");
  reset(); const o = add("ostacolo", 400, 400); o.label = "PALO"; A.__cabRes = null;
  eq(A.cabItemInputs(o).length, 0, "nessun canale audio");
  ok(A.auditEngine().findings.every((f) => !/PALO/.test(f.msg)), "nessuna criticità generata dall'ostacolo");
});

console.log("\nUnifica icone Fase 2 — tipi funzionali (batteria/arpa/chitarre/piani/direttore) → illustrazione:");
t("look2Art: chitarra/arpa default → illustrazione; schematico e non-mappati → null", () => {
  eq(A.look2Art({ type: "gtstand" }), "musChitElettrica");
  eq(A.look2Art({ type: "arpa" }), "musArpa");
  eq(A.look2Art({ type: "gtstand", look: "schematico" }), null);
  eq(A.look2Art({ type: "astamic" }), null);
});
t("corista: niente bottone 'Dividi in elementi' (isDecomposable false)", () => {
  ok(A.isDecomposable({ type: "corista" }) === false, "corista non scomponibile");
  ok(A.isDecomposable({ type: "cantante" }) === true, "cantante resta scomponibile");
  ok(A.isDecomposable({ type: "vlnpost" }) === true, "le postazioni restano scomponibili");
});
t("personal mixer digitale: piazzarlo attiva in automatico il layer P.M. (mond)", () => {
  reset(); ok(A.state.mond.on === false, "layer P.M. spento all'inizio");
  add("hearback", 400, 400);
  ok(A.state.mond.on === true, "hearback (personal mixer) attiva il layer P.M.");
  reset(); add("mixhub", 400, 400);
  ok(A.state.mond.on === true, "anche l'hub monitoraggio attiva il layer");
  reset(); add("wedge", 400, 400);
  ok(A.state.mond.on === false, "un monitor NON digitale (wedge) non attiva il layer");
});
t("zona mic da postazione a 2: un solo item doppia genera una zona che lo copre", () => {
  reset();
  const v = add("vlnpost", 450, 340); v.vsec = 1; v.doppia = true; v.sep = 120; A.recalcItemDims(v);
  const shape = A.miczoneShapeFromItems([v], 25);   /* stessa funzione del bottone "Crea zona microfonazione" */
  ok(shape && shape.pts && shape.pts.length >= 3, "genera un poligono anche da 1 solo item (la doppia)");
  const b = A.polyBBox(shape.pts);
  ok(b.w >= v.w, "la zona copre almeno la larghezza della doppia (entrambi i musicisti)");
});
t("chitarra illustrata: ampli/pedaliera nel footprint (bug visualizzazione)", () => {
  const base = A.recalcItemDims.bind(null);
  const it = { type: "gtstand", look: "illustrato" }; A.recalcItemDims(it); const d0 = it.d;
  const itA = { type: "gtstand", look: "illustrato", ampli: true }; A.recalcItemDims(itA);
  const itP = { type: "gtstand", look: "illustrato", pedaliera: true }; A.recalcItemDims(itP);
  ok(itP.d > d0, "pedaliera allunga la profondità in illustrato (era ignorata)");
  ok(itP.d >= 130, "footprint include la pedaliera");
  ok(itA.w >= 80, "footprint tiene conto dell'ampli in larghezza");
});
/* «Postazione» / «Strumento solo» (Simone 27/07): il toggle sceglie COSA si disegna, non lo stile.
   Le due scelte hanno stati canonici diversi e passare dall'una all'altra li riazzera. */
t("Strumento solo: sedia e leggio si spengono; Postazione: tornano", () => {
  reset();
  const v = add("vlnpost", 400, 400);
  eq(A.optSedia(v), true, "la postazione nasce con la sedia");
  eq(v.leggio, true, "e col leggio");
  A.lookReset(v, "schematico");
  eq(v.sedia, false, "«Strumento solo» = il solo violino, niente sedia");
  eq(v.leggio, false, "né leggio: si riaggiungono a mano dalla colonna di destra");
  A.lookReset(v, "illustrato");
  eq(A.optSedia(v), true, "tornando a «Postazione» la sedia è di nuovo implicita");
  eq(v.leggio, undefined, "e il leggio torna al default del tipo");
});
t("il riazzeramento non tocca chitarre, piani e postazioni doppie", () => {
  reset();
  const g = add("gtacustica", 400, 400);          /* gtr: la sedia è già spenta di suo */
  const before = JSON.stringify({ s: g.sedia, l: g.leggio });
  A.lookReset(g, "schematico");
  eq(JSON.stringify({ s: g.sedia, l: g.leggio }), before, "le chitarre hanno i loro default, non si toccano");
  const d = add("vlnpost", 600, 400); d.doppia = true; d.sedia = true; d.leggio = true;
  A.lookReset(d, "schematico");
  eq(d.sedia, true, "la postazione a 2 ha un leggio solo e la sedia bloccata: resta com'è");
  eq(d.leggio, true);
});
/* B3 (Simone 27/07): il pannello elemento è in gruppi col termine del mestiere, e le due misure
   che stavano su slider a tutta larghezza sono campi numerici — mezza riga invece di una intera. */
t("pannello elemento: gruppi col termine del mestiere, non riquadri", () => {
  const g = ["Etichetta", "Microfono", "Ascolto", "Accessori", "Dettagli tecnici", "Disegno"];
  g.forEach((n) => ok(appjs.indexOf('group("' + n + '"') > -1, "manca il gruppo «" + n + "»"));
  ok(appjs.indexOf("function syncPanelGroups") > -1, "un gruppo senza controlli visibili deve sparire, intestazione compresa");
  ok(appjs.indexOf('muteLabel("pLblModeWrap")') > -1, "la label che ripete il titolo del gruppo va zittita");
});
/* Dimensione resta uno SLIDER (Simone: «mi piace che vada da piccolo a sinistra a grande a destra»),
   ma sulla stessa riga di etichetta e valore. Rotazione e Distanza sono misure esatte: campo numerico. */
t("numero di canale: si cambia a mano e le altre righe scalano", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 900, 130); box.ch = 16; box.outCh = 8;
  const a1 = add("astamic", 200, 400), a2 = add("astamic", 400, 400), a3 = add("astamic", 600, 400);
  cabla();
  const nomi = () => A.patchList().rows.map(r => r.n + ":" + r.itemId);
  const prima = nomi();
  eq(prima.length, 3, "tre canali");
  const terza = A.patchList().rows[2];
  ok(A.cabSetChannelNo(terza.key, 1), "la terza diventa la prima");
  const dopo = A.patchList().rows;
  eq(dopo[0].itemId, terza.itemId, "ora è in cima");
  eq(dopo.map(r => r.n).join(","), "1,2,3", "numerazione sempre 1..N, senza buchi");
  eq(dopo[1].itemId, a1.id, "le altre scalano di uno");
  eq(dopo[2].itemId, a2.id);
  /* fuori scala: si aggancia agli estremi invece di sparire */
  A.cabSetChannelNo(dopo[0].key, 99);
  eq(A.patchList().rows[2].itemId, terza.itemId, "99 su 3 canali = ultimo posto");
  A.cabSetChannelNo(A.patchList().rows[2].key, 0);
  eq(A.patchList().rows[0].itemId, terza.itemId, "0 = primo posto");
  eq(A.cabSetChannelNo("chiave-inesistente", 1), false, "chiave ignota: non fa nulla");
});

t("asta e phantom: derivati dal microfono finché non li tocchi", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 900, 130); box.ch = 16; box.outCh = 8;
  add("astamic", 300, 400);
  cabla();
  let r = A.patchList().rows[0];
  const standAuto = r.stand;
  eq(r.standAuto, true, "l'asta arriva dal microfono");
  eq(r.p48Auto, true, "e così il phantom");
  A.cabSetStand(r.key, "asta giraffa"); A.__cabRes = null;
  r = A.patchList().rows[0];
  eq(r.stand, "asta giraffa", "asta scelta a mano");
  eq(r.standAuto, false, "e si sa che è una scelta, non un suggerimento");
  A.cabSetP48(r.key, true); A.__cabRes = null;
  r = A.patchList().rows[0];
  eq(r.p48, true, "phantom acceso a mano");
  eq(r.p48Auto, false);
  /* tornare all'automatico */
  A.cabSetStand(r.key, null); A.cabSetP48(r.key, null); A.__cabRes = null;
  r = A.patchList().rows[0];
  eq(r.stand, standAuto, "asta di nuovo dal microfono");
  eq(r.standAuto, true); eq(r.p48Auto, true);
  eq(A.state.cab.manual[r.key].stand, undefined, "e l'override sparisce, non resta a sporcare");
});

t("le scelte fatte sul canale sopravvivono a reload e undo", () => {
  /* 28/07 — normalizeState aveva una whitelist CHIUSA (pts/label/deleted/auto/box) e buttava via tutto
     il resto: il nome breve console, il microfono scelto a mano, la porta pinnata e il «togli
     microfono» sparivano a ogni ricaricamento E a ogni undo (applyHistory ripassa di qui). */
  reset();
  A.state.cab.manual = { k1: { seg:1, short:"VOX", mic:"SM58", stand:"asta giraffa", p48:false,
                               port:5, micOff:1, label:"x", pts:[[1,2],[3,4]], deleted:true, auto:1 } };
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const m = A.state.cab.manual.k1;
  eq(m.short, "VOX", "nome breve console");
  eq(m.mic, "SM58", "microfono scelto a mano");
  eq(m.stand, "asta giraffa", "asta scelta a mano");
  eq(m.p48, false, "phantom tolto a mano (false NON è «assente»)");
  eq(m.port, 5, "porta pinnata");
  eq(m.micOff, 1, "microfono tolto");
  eq(m.seg, 1, "cavo segmentato");
  eq(m.label, "x", "e ciò che già sopravviveva sopravvive ancora");
  eq(m.deleted, true); eq(m.auto, 1); eq(m.pts.length, 2);
  /* i valori fuori scala restano fuori */
  A.state.cab.manual = { k2: { port: 999, short: "x".repeat(40) } };
  const ns2 = A.normalizeState(A.state); if (ns2) A.state = ns2;
  eq(A.state.cab.manual.k2.port, undefined, "porta fuori range scartata");
  eq(A.state.cab.manual.k2.short.length, 12, "nome breve troncato");
});
t("etichetta: il campo sta staccato dai bottoni in TUTTE le modalità", () => {
  /* 28/07 — il riordino B3 ha messo i bottoni Intero/Sigla/Nascosto SOPRA il campo, ma il margine di
     stacco stava sul blocco dei bottoni: con «Intero» il riquadro finiva incollato, con «Sigla» il
     margin-top di pAbbrWrap lo salvava. Lo stacco ora sta sul campo. */
  const html = readFileSync(join(root, "index.html"), "utf8");
  const mode = (html.match(/<div id="pLblModeWrap"[^>]*>/) || [""])[0];
  eq(mode.indexOf("margin-top"), -1, "niente margine inline sul blocco dei bottoni: " + mode);
  ok(stylesCss.indexOf("#props #pLabelWrap{margin-top:6px}") > -1, "lo stacco sta sul campo nome");
  ok(html.indexOf('id="pAbbrWrap" style="display:none;margin-top:6px"') > -1, "stesso valore per la sigla");
});
t("dimensione e rotazione: slider su una riga; distanza: campo numerico", () => {
  /* 28/07 — dietrofront esplicito di Simone sulla rotazione: era tornata campo numerico col pannello
     B3, ora è di nuovo uno slider, come la Dimensione. Si ruota guardando il palco, non digitando. */
  const html = readFileSync(join(root, "index.html"), "utf8");
  const size = (html.match(/<div id="pLblSizeWrap"[^>]*>/) || [""])[0];
  ok(size.indexOf('class="sldrow"') > -1, "Dimensione: etichetta, slider e valore sulla stessa riga");
  ok(html.indexOf('<input type="range" id="pLblSize"') > -1, "e resta uno slider");
  const rotRow = (html.match(/<div class="sldrow" id="pRotRow"[^>]*>/) || [""])[0];
  ok(rotRow, "Rotazione: stessa riga singola della Dimensione");
  const rot = (html.match(/<input[^>]*id="pRot"[^>]*>/) || [""])[0];
  ok(rot.indexOf('type="range"') > -1, "pRot è uno slider: " + rot);
  ok(rot.indexOf('min="-180"') > -1 && rot.indexOf('max="180"') > -1, "giro completo");
  ok(rot.indexOf('step="1"') > -1, "step 1: tutti i gradi interi restano raggiungibili");
  ok(html.indexOf('<output id="pRotVal"') > -1, "il valore in gradi resta leggibile accanto allo slider");
  ok(appjs.indexOf("pRotVal") > -1, "e l'app lo aggiorna");
  const sep = (html.match(/<input[^>]*id="pSep"[^>]*>/) || [""])[0];
  ok(sep.indexOf('type="number"') > -1, "la distanza resta un campo numerico: " + sep);
  eq(appjs.indexOf("pSepVal"), -1);
});
/* Pannello layer (27/07): la riga chiusa dice quanto contiene, e il cestino esce dalla riga. */
/* ===== Regressioni della review 27-28/07 (harness Playwright in COWORK/STAGEPLOT/review/) ===== */
t("CANVAS-01: una pedana NON si aggancia fuori dal palco; un wedge sì (è voluto)", () => {
  reset();
  const ped = add("pedana", 100, 100);   // 200×100: minX=0, maxX=200
  // trascinata quasi tutta oltre il lato sinistro: maxX arriva a 5 → il vecchio candidato
  // incrociato [maxX,0] distava 5 (< soglia 15) e la incollava INTERAMENTE fuori (sdx=-5)
  let r = A.magneticSnap([{ id: ped.id, x0: ped.x, y0: ped.y }], -195, 300);
  eq(r.sdx, 0, "per i riser i candidati incrociati non esistono: nessun teletrasporto fuori");
  const w = add("wedge", 100, 300);      // per un monitor l'appoggio ESTERNO a filo resta legittimo
  const half = w.w / 2;
  r = A.magneticSnap([{ id: w.id, x0: w.x, y0: w.y }], -(w.x + half) + 5, 0);
  eq(r.sdx, -5, "il wedge si appoggia ancora fuori, a filo del bordo (comportamento voluto)");
});
t("LISTE-01: «MIX N» non riparte da 1 — due proposte in momenti diversi non si sovrappongono", () => {
  reset(); A.state.cab.on = true;
  add("corista", 200, 200); A.__cabRes = null;
  const n1 = A.monProposeWedges();
  ok(n1 >= 1, "prima proposta: almeno un monitor");
  add("corista", 1000, 700); A.__cabRes = null;
  const n2 = A.monProposeWedges();
  ok(n2 >= 1, "seconda proposta (musicista nuovo, scoperto)");
  const mix = A.state.items.map((i) => i.label).filter((L) => /^MIX \d+$/.test(L || ""));
  eq(new Set(mix).size, mix.length,
     "etichette MIX tutte diverse (prima: due «MIX 1» → stessa uscita cablata); trovate: " + mix.join(", "));
});
t("CABLAGGI-09: applyHistory invalida le cache dei motori", () => {
  ok(appjs.indexOf("__cabRes=null; __elecRes=null; __mondRes=null;") > -1 &&
     appjs.indexOf("Lo stato è appena stato sostituito") > -1,
     "dopo un undo il canvas disegnava i cavi verso la box PRE-undo");
});
t("LAYER-01: cavi al 100% in vista base, e il 70 salvato (default orfano) migra", () => {
  eq(A.state.cab.opacity, 100, "default del documento nuovo");
  const s = A.normalizeState({ items: [], inputs: [], outputs: [], cab: { opacity: 70 }, elec: { opacity: 70 }, mond: { opacity: 70 } });
  eq(s.cab.opacity, 100, "il 70 salvato era il default orfano (nessuna UI poteva cambiarlo): migra");
  eq(s.elec.opacity, 100); eq(s.mond.opacity, 100);
  eq(A.normalizeState({ items: [], inputs: [], outputs: [], cab: { opacity: 40 } }).cab.opacity, 40,
     "un valore davvero personalizzato (JSON a mano) si rispetta");
});
t("ICONE-01: niente height negative nella libreria icone", () => {
  const icons = readFileSync(join(root, "icons.js"), "utf8");
  eq(icons.match(/height=\\"-/g), null, "un rect con altezza negativa non renderizza e sporca la console a ogni scena");
});
t("CAT-01: «cassa» al singolare trova le casse PA", () => {
  ok(/(^|\s)cassa(\s|$)/.test(A.TYPES.arraylarge.alias || ""), "alias singolare su arraylarge");
  ok(/(^|\s)cassa(\s|$)/.test(A.TYPES.sub218.alias || ""), "e sul sub");
});
t("A11Y-SEL: i select orfani di label visibile hanno il nome accessibile", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  ok(html.indexOf('<select id="pMike" aria-label="Microfonazione">') > -1);
  ok(/<select id="pAscolto" aria-label="Ascolto[^"]*">/.test(html));
});
/* Input List (Simone 28/07): «aprire un layer non deve creare o modificare dati tecnici senza
   un'azione esplicita». Il cablaggio si chiede: barra in cima alla lista, non clic sul layer. */
t("aprire il layer Input non apre il wizard e non collega niente", () => {
  reset();
  add("astamic", 200, 200); add("astamic", 400, 200); add("astamic", 600, 200);
  add("astamic", 800, 200); add("astamic", 1000, 200);   /* 5 canali: sopra AUDIT_MIN_CH */
  A.__cabRes = null;
  const primaManual = JSON.stringify(A.state.cab.manual || {});
  A.cabActivateFlow();
  eq(JSON.stringify(A.state.cab.manual || {}), primaManual, "nessun collegamento creato aprendo il layer");
  eq(A.state.items.filter(A.cabIsBox).length, 0, "e nessuna stage box aggiunta dal wizard");
  ok(A.state.cab.on, "il motore si accende: la lista stessa ne deriva");
  ok(appjs.indexOf("openCabBoxWizard(needs); return;") === -1,
     "il wizard non parte più dall'apertura del layer");
});
t("la barra dice quanti canali mancano, e «Collega» rispetta i cablaggi a mano", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 200, 200); add("astamic", 400, 200); add("stagebox", 900, 700);
  A.__cabRes = null;
  eq(A.patchList().rows.filter((r) => !r.spare && !r.box).length, 2,
     "inserire la box NON collega: i canali restano liberi finché non lo chiedi");
  cabla();
  const pl = A.patchList();
  eq(pl.rows.filter((r) => !r.spare && !r.box).length, 0, "dopo «Collega» sono tutti cablati");
  ok(appjs.indexOf('bar.className="cab-bar"') > -1, "la barra esiste in cima alla lista");
  ok(appjs.indexOf("Tutti i canali sono cablati") > -1, "e dice anche quando non c'è nulla da fare");
});
t("inserire NON collega: né audio, né elettrico, né P.M.", () => {
  reset();
  /* Simone 28/07: «non voglio che si colleghino in automatico — se inserisco una stage box si attiva
     il collegamento e vedo i cavi». Vale per tutti e tre i motori. */
  add("cantante", 200, 200); add("stagebox", 900, 700); A.__cabRes = null;
  eq(A.cabResult(true).links.length, 0, "audio: nessun cavo dall'inserimento");
  add("comboamp", 300, 300); add("distro32", 800, 300); A.__elecRes = null;
  eq((A.elecResult(true).loadLinks || []).length, 0, "elettrico: nessuna linea dall'inserimento");
  add("mixhub", 500, 500); add("hearback", 550, 500); A.__mondRes = null;
  eq((A.monDigEngine().links || []).length, 0, "P.M.: nessun aggancio dall'inserimento");
  cabla();
  ok(A.cabResult(true).links.length > 0, "ma «Collega» li fa tutti");
});
t("un collegamento chiesto accende il motore (o il cavo non si vedrebbe)", () => {
  reset();
  eq(A.state.cab.on, false, "motore spento all'inizio");
  const mic = add("cantante", 200, 200); const box = add("stagebox", 900, 700);
  A.cabSetItemBox(mic, box.id);
  ok(A.state.cab.on, "collegare a mano accende il motore audio");
  reset();
  A.elecManual("x"); ok(A.state.elec.on, "idem per l'elettrico");
  reset();
  A.mondManual("y"); ok(A.state.mond.on, "idem per il P.M.");
});
/* Dal confronto con una channel list vera (28/07): delle nove colonne che il fonico compila a mano,
   quattro mancavano o erano sepolte. Qui le tre recuperate con i dati che avevamo già. */
t("il PDF input list ha FOH come colonna sua, separata dalla sorgente", () => {
  ok(appjs.indexOf('trow("#","SORGENTE","FOH","MIC / DI","ASTA","PATCH"') > -1,
     "sei colonne: il nome sul banco non è più accodato al nome dello strumento fra virgolette");
  eq(appjs.indexOf("r.name+(r.short?'  «'+r.short+'»':\"\")"), -1, "via l'accodamento");
});
t("asta e nome-banco vivono nella channel list, non nella colonna", () => {
  /* 28/07 (variante B): la colonna è un'ANTEPRIMA — una riga per canale, numero · nome · patch.
     Asta, microfono, 48V e nome-banco si leggono e si cambiano nella finestra, dove c'è spazio. */
  ok(appjs.indexOf('row.className="patch-lite"') > -1, "la colonna usa la riga a un livello");
  ok(appjs.indexOf('data-stand=') > -1, "l'asta è una colonna della channel list");
  ok(appjs.indexOf('class="cl-short"') > -1, "e il nome sul banco pure");
  ok(stylesCss.indexOf(".patch-lite{") > -1, "con il suo stile");
});
t("le mandate alla macchina cuffie prendono il nome dai gruppi sul palco", () => {
  reset(); A.state.cab.on = true;
  add("batteria", 300, 200); add("bassstand", 500, 300); add("gtstand", 700, 300);
  add("corista", 500, 500); add("vlnpost", 900, 400);
  A.__cabRes = null;
  const n = A.pmFeedNames(8);
  eq(n.length, 8, "una mandata per uscita, sempre");
  ["Drums", "Bass", "Guit", "Archi", "Voci"].forEach((g) =>
    ok(n.indexOf(g) > -1, "manca il gruppo «" + g + "»; ottenuti: " + n.join(", ")));
  ok(n[0] === "Drums", "l'ordine è quello dei banchi della channel list");
  reset();
  eq(A.pmFeedNames(4).join(","), "Mandata 1,Mandata 2,Mandata 3,Mandata 4",
     "palco vuoto: nomi generici, non un blocco anonimo");
});
t("le tastiere prendono due mandate (in cuffia si vogliono in stereo)", () => {
  reset(); A.state.cab.on = true;
  add("stagepiano", 400, 400); A.__cabRes = null;
  const n = A.pmFeedNames(8);
  ok(n.indexOf("Key L") > -1 && n.indexOf("Key R") > -1, "Key L e Key R; ottenuti: " + n.join(", "));
  eq(A.pmFeedNames(1)[0], "Key", "con una sola uscita resta mono, senza la L che prometterebbe una R");
});
t("il fulmine collega UN canale solo, senza toccare gli altri", () => {
  reset(); A.state.cab.on = true;
  const v1 = add("corista", 200, 300), v2 = add("corista", 500, 300), v3 = add("corista", 800, 300);
  add("stagebox", 1000, 700); A.__cabRes = null;
  const key = A.patchList().rows.find((r) => r.itemId === v2.id).key;
  const box = A.cabConnectOne(key);
  ok(box, "il canale trova la sua destinazione");
  const dopo = A.patchList().rows;
  eq(dopo.filter((r) => r.box).length, 1, "cablato solo quello chiesto");
  eq(dopo.find((r) => r.itemId === v2.id).box != null, true, "ed è proprio lui");
  ok(!dopo.find((r) => r.itemId === v1.id).box, "gli altri restano liberi");
  ok(!dopo.find((r) => r.itemId === v3.id).box);
  eq(A.state.cab.manual[key].auto, 1, "marcato come scelta del sistema: «Collega» potrà ridistribuirlo");
});
t("il fulmine non tocca un canale già cablato e non inventa destinazioni", () => {
  reset(); A.state.cab.on = true;
  const v = add("corista", 200, 300); const box = add("stagebox", 900, 700); A.__cabRes = null;
  const key = A.patchList().rows[0].key;
  A.cabSetItemBox(v, box.id);                       // scelta a mano
  const prima = A.state.cab.manual[key].box;
  eq(A.cabConnectOne(key), prima, "già cablato: restituisce la destinazione e non la cambia");
  eq(A.state.cab.manual[key].auto, undefined, "e resta «a mano», non diventa automatico");
  reset(); A.state.cab.on = true;
  add("corista", 200, 300); A.__cabRes = null;      // nessuna stage box sul palco
  eq(A.cabConnectOne(A.patchList().rows[0].key), null, "senza destinazione non collega nulla");
});
t("il fulmine c'è solo sulle righe non cablate, ed è VISIBILE senza passarci sopra", () => {
  /* 28/07 — aveva opacity:0 e compariva solo in hover: con due canali da collegare non si vedeva
     nessun comando. Ora la riga non cablata mostra il fulmine al posto del cestino. */
  ok(appjs.indexOf('zp.setAttribute("aria-label","Collega questo canale")') > -1, "nome accessibile");
  ok(appjs.indexOf('if(r.box){') > -1 && appjs.indexOf('lite-trash') > -1, "cablato = cestino, non cablato = fulmine");
  eq(stylesCss.indexOf(".cab-one{border:none;background:none;color:var(--accent-strong);font-size:11px;cursor:pointer;\n    opacity:0"), -1,
     "niente più opacity:0 sul fulmine");
  ok(stylesCss.indexOf(".lite-btn") > -1, "i due bottoni di riga hanno uno stile comune");
});
t("la Monitor list resta a due livelli (là il nome si troncava)", () => {
  ok(stylesCss.indexOf(".patch-row.editable>.psrc{grid-area:1/2/2/3}") > -1, "nome sulla prima riga");
  ok(stylesCss.indexOf(".patch-row.editable>.pmic{grid-area:2/2/3/3") > -1, "tipo sulla seconda");
  ok(appjs.indexOf('hd.innerHTML=\'<span>#</span><span>Monitor</span>') > -1, "ed è la Monitor list a usarla");
});
t("la riga del layer porta il suo numero", () => {
  reset(); A.state.cab.on = true; A.state.elec.on = true;
  add("astamic", 300, 300); add("astamic", 500, 300); add("stagebox", 900, 700);
  A.__cabRes = null; A.__elecRes = null;
  const L = A.layerRegistry();
  const by = (id) => L.filter((x) => x.id === id)[0];
  eq(A.layerSummary(by("cabin")), "2", "sotto un layer «Input» il numero nudo basta");
  eq(A.layerSummary(by("stage")), "12 × 8 m", "il palco dice la misura, non un conteggio");
  reset();
  eq(A.layerSummary(by("mus")), "", "niente musicisti: nessun numero, non uno zero");
});
t("il cestino non sta più accanto all'occhio", () => {
  eq(appjs.indexOf('tr.className="layer-ico layer-trash"'), -1,
     "azzerava tutti i percorsi a due pixel dall'occhio");
  ok(appjs.indexOf('rb.className="adv-btn adv-reset"') > -1, "ora è in fondo al corpo del layer");
  ok(appjs.indexOf("I collegamenti fatti a mano su questa lista vengono persi") > -1,
     "e chiede conferma prima di azzerare");   /* «lista», non «layer»: rename UI del 28/07 */
});
t("nessun collega-tutto è rimasto nell'interfaccia", () => {
  /* il cablaggio si fa un cavo alla volta (28/07): questi testi vivevano sui bottoni rimossi */
  eq(appjs.indexOf('go.textContent="Collega"'), -1, "bottone Collega della barra Input list");
  eq(appjs.indexOf("⚡ <span>Cablaggio automatico</span>"), -1, "⚡ Cablaggio automatico di lista");
  eq(appjs.indexOf("function layerAutoConnect"), -1, "il ponte verso i motori");
  eq(appjs.indexOf('b1.textContent="Collega automaticamente"'), -1, "personal monitor: collega tutti i liberi");
  eq(appjs.indexOf('b3.textContent="Collega i mixerini liberi'), -1, "hub: collega tutti i mixerini");
  /* l'alternativa uno-a-uno c'è per tutte e tre le liste */
  ok(appjs.indexOf("function cabConnectOne") > -1, "ingressi e monitor");
  ok(appjs.indexOf("function elecConnectOne") > -1, "carichi");
  ok(appjs.indexOf('title="Collega questo monitor"') > -1, "fulmine sulla Monitor list");
  ok(appjs.indexOf('title="Collega questo carico"') > -1, "fulmine sulla lista carichi");
  /* aggiungere un elemento non è cablare: l'hub si può ancora creare, senza collegare nulla */
  ok(appjs.indexOf('b2.textContent="Aggiungi hub ("+hd.model+")"') > -1, "resta la creazione dell'hub");
});
t("Dividi · Duplica · Elimina stanno su una riga sola", () => {
  ok(stylesCss.indexOf("#props .btns{display:flex;flex-wrap:nowrap") > -1,
     "con flex-wrap:wrap il terzo bottone andava a capo");
  ok(stylesCss.indexOf("#props .btns .btn{width:auto;flex:1 1 0") > -1,
     "base 0: si dividono la larghezza invece di pretendere 110px a testa");
});
t("la rotazione non salta a 0 mentre stai digitando", () => {
  ok(appjs.indexOf('if(el.value==="" || !isFinite(raw)) return;') > -1,
     "campo vuoto a metà digitazione: non deve ruotare l'elemento a 0");
});
t("il toggle si chiama «Postazione» / «Strumento solo», non più «Illustrato» / «Schematico»", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  ok(html.indexOf(">Postazione</button>") > -1, "il primo bottone dice cosa disegna");
  ok(html.indexOf(">Strumento solo</button>") > -1, "il secondo pure");
  eq(html.indexOf(">Illustrato</button>"), -1, "il vecchio nome descriveva lo stile, non il contenuto");
  eq(html.indexOf(">Schematico</button>"), -1);
});
t("direttore: sempre illustrato — NON in LOOK_ART, niente toggle Aspetto", () => {
  eq(A.look2Art({ type: "direttore" }), null);        /* fuori da LOOK_ART: nessuna sostituzione da render-interception */
  ok(!A.hasLookToggle({ type: "direttore" }));        /* niente Aspetto: il draw disegna sempre l'illustrazione + podio/leggio */
  eq(A.dirSize({ podio: false })[1], 114);            /* footprint base = illustrazione musDirettore (90×114) */
  eq(A.dirSize({ podio: true })[0], 120);             /* col podio = piattaforma 120×120 */
});
t("strumenti a misura reale: pezzi batteria/timpani NON ridimensionabili; strutture sì", () => {
  ["timp51R","timp58R","timp66R","timp74R","timp81R","tomR","crashR","rideR","timpsingolo","kickdrum","tomdrum","hihat"]
    .forEach((k) => ok(!A.TYPES[k].resizable, k + " non deve essere resizable (misura reale)"));
  ["pedana","truss","fondale","tappeto","metro"].forEach((k) => ok(A.TYPES[k].resizable === true, k + " resta ridimensionabile"));
});
t("batteria: come il timpanista — NON in LOOK_ART, niente toggle Aspetto; batterista in mezzo al kit", () => {
  eq(A.look2Art({ type: "batteria" }), null);         /* fuori da LOOK_ART: il draw è sempre il kit schematico + persona */
  ok(!A.hasLookToggle({ type: "batteria" }));         /* niente Aspetto */
  const ctl = A.COMP.batteria.controls.map((c) => c.key);
  ok(ctl.includes("mus") && ctl.includes("stool"));   /* toggle indipendenti Musicista + Sgabello */
  eq(A.COMP.batteria.reduced.join(","), "mus,stool,leggio"); /* pannello ridotto: solo questi due (il kit su misura è "Dividi") */
});
t("batteria seat slot: c'è se Musicista O Sgabello; sparisce se entrambi off", () => {
  const seat = (p) => A.drumSlots(p).some((s) => s.seat);
  ok(seat({ mus: true, stool: true }));
  ok(seat({ mus: true, stool: false }));
  ok(seat({ mus: false, stool: true }));
  ok(!seat({ mus: false, stool: false }));
});
t("batteristaR: elemento persona a misura reale — 0 canali, non resizable, catalog-visibile", () => {
  reset();
  eq(chans(add("batteristaR", 300, 300)).length, 0);   /* persona, non sorgente audio */
  ok(!A.TYPES.batteristaR.resizable);                   /* misura reale */
  ok(A.TYPES.batteristaR.catalog !== false);            /* draggabile dal catalogo */
});
t("z-order batterista: sopra lo sgabello, sotto i fusti/piatti", () => {
  const zDrum = A.TYPES.kickR.z || 2;
  ok((A.TYPES.batteristaR.z || 2) < zDrum, "batterista sotto i fusti");
  ok((A.TYPES.stoolR.z || 2) < zDrum, "sgabello sotto i fusti");
  ok((A.TYPES.stoolR.z || 2) <= (A.TYPES.batteristaR.z || 2), "sgabello non sopra il batterista");
  const ex = A.explodeBatteria({ type: "batteria", parts: { mus: true, stool: true } });
  const iStool = ex.findIndex((p) => p.type === "stoolR"), iBatt = ex.findIndex((p) => p.type === "batteristaR");
  ok(iStool >= 0 && iBatt > iStool, "explode: batterista dopo lo sgabello (sopra a parità di z)");
});
t("Dividi batteria: include il batterista se Musicista ON, non se OFF", () => {
  const withMus = A.explodeBatteria({ type: "batteria", label: "Dr", parts: { mus: true, stool: true } });
  const noMus = A.explodeBatteria({ type: "batteria", label: "Dr", parts: { mus: false, stool: true } });
  ok(withMus.some((p) => p.type === "batteristaR"));
  ok(!noMus.some((p) => p.type === "batteristaR"));
  ok(noMus.some((p) => p.type === "stoolR"));           /* lo sgabello resta comunque */
});
t("conteggio Sgabelli batteria: rispetta il toggle (solo musicista → 0 sgabelli)", () => {
  reset();
  const a = add("batteria", 100, 100);                       /* stool default true */
  const b = add("batteria", 300, 100); A.parts(b).stool = false; A.parts(b).mus = true;   /* solo musicista */
  eq(A.countAccessori().sgabelli, 1);                         /* solo la prima conta lo sgabello */
});
t("hasLookToggle: Fase 1 (vlnpost) sì; batteria/direttore e non mappati no", () => {
  ok(A.hasLookToggle({ type: "vlnpost" }));
  ok(!A.hasLookToggle({ type: "batteria" })); ok(!A.hasLookToggle({ type: "direttore" })); ok(!A.hasLookToggle({ type: "astamic" }));
});
t("Musicista/Sgabello NON cambiano i canali: batteria = 8 con e senza persona/sgabello", () => {
  reset(); const a = add("batteria", 400, 400); const nA = chans(a).length;
  reset(); const b = add("batteria", 400, 400); const p = A.parts(b); p.mus = false; p.stool = false; A.__cabRes = null; const nB = chans(b).length;
  eq(nA, nB); eq(nA, 8);
});
t("migrazione Fase 2: musBatteria→batteria, musDirettore→direttore, musChitElettrica→gtstand; senza twin resta", () => {
  const s = { _v: 2, items: [{ type: "musBatteria" }, { type: "musDirettore" }, { type: "musChitElettrica" }, { type: "musChitClassica" }, { type: "musFisarmonica" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items.map((i) => i.type), ["batteria", "direttore", "gtstand", "musChitClassica", "musFisarmonica"]);
});
t("catalogo Fase 2: 11 twin nascoste; senza twin (chitarra classica, fisarmonica, trombone basso) restano", () => {
  ["musArpa", "musTimpani", "musPercussioni", "musBatteria", "musPianoGranCoda", "musPianoMezzaCoda", "musTastiera", "musChitElettrica", "musChitAcustica", "musBasso", "musDirettore"].forEach((k) => ok(A.TYPES[k].catalog === false, k + " catalog:false"));
  ["musChitClassica", "musFisarmonica", "musTromboneBasso"].forEach((k) => ok(A.TYPES[k].catalog !== false, k + " resta visibile"));
});

t("timpani: toggle Musicista + Sgabello indipendenti (niente Aspetto); non in LOOK_ART/DRAW_LOOK", () => {
  ok(!A.hasLookToggle({ type: "timpani" }), "timpani NON ha il toggle Aspetto (usa Musicista/Sgabello)");
  eq(A.look2Art({ type: "timpani" }), null);
  ok(!A.LOOK_ART.timpani && !A.DRAW_LOOK.timpani);
  const keys = A.COMP.timpani.controls.map((c) => c.key);
  ok(keys.indexOf("mus") >= 0 && keys.indexOf("stool") >= 0, "controls Musicista + Sgabello presenti");
});
t("timpani: il posto (seat) c'è se Musicista O Sgabello; sparisce se entrambi off", () => {
  ok(A.timpSlots({ count: 2, layout: "arco", mus: true, stool: false }).some((s) => s.seat), "solo musicista → posto presente");
  ok(A.timpSlots({ count: 2, layout: "arco", mus: false, stool: true }).some((s) => s.seat), "solo sgabello → posto presente");
  ok(!A.timpSlots({ count: 2, layout: "arco", mus: false, stool: false }).some((s) => s.seat), "nessuno → niente posto");
});
t("migrazione: musTimpani → timpani (schema configurabile + timpanista in mezzo)", () => {
  const s = { _v: 2, items: [{ type: "musTimpani" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items[0].type, "timpani");
});

console.log("\nRubrica contatti — logica pura (spec 15/07):");
t("contactKey: normalizza maiuscole/spazi; vuoto = '|'", () => {
  eq(A.contactKey({ name: " Mario Rossi ", contact: "333-0000001" }), "mario rossi|333-0000001");
  eq(A.contactKey({}), "|");
});
t("rubricaDedupe: tiene la prima occorrenza, scarta chiavi vuote", () => {
  const out = A.rubricaDedupe([
    { name: "Marco", contact: "333", role: "Fonico di sala" },
    { name: "marco", contact: "333", role: "DUPLICATO" },
    { name: "", contact: "" },
    { name: "Anna", contact: "334" },
  ]);
  eq(out.length, 2); eq(out[0].role, "Fonico di sala"); eq(out[1].name, "Anna");
});
t("contactsFromDocs: doc multi-variante + legacy piatto, tronca ai limiti, deduplica", () => {
  const doc = { variants: [
    { state: { contacts: [{ role: "Service locale", name: "Alfa", contact: "045" }] } },
    { state: { contacts: [{ role: "Service locale", name: "Alfa", contact: "045" }, { name: "X".repeat(99), contact: "1" }] } },
  ] };
  const legacy = { contacts: [{ name: "Organizzatore", contact: "info@esempio.it" }] };
  const out = A.contactsFromDocs([doc, legacy, null]);
  eq(out.length, 3);
  eq(out[0].name, "Alfa");
  eq(out[1].name.length, 60, "name troncato a 60");
  eq(out[2].name, "Organizzatore");
});

/* ===== EQUIPMENT INTELLIGENCE (fase 2, spec H) — resolve puro + wattOf model-driven ===== */
console.log("\nEquipment Intelligence — resolve/watt/dims (spec H):");
t("equipResolve: snapshot ⊕ override (override vince), item nudo = {}", () => {
  const it = { modelData: { a: { value: 1 }, b: { value: 2 } }, modelOverride: { b: { value: 99, reliability: "user_override" } } };
  eq(A.equipVal(it, "a"), 1); eq(A.equipVal(it, "b"), 99, "override per-progetto vince sullo snapshot");
  eq(A.equipVal({}, "a"), null); eq(A.equipVal(null, "a"), null);
});
t("equipWatt: W di targa; unit A → W a 230V (derived); potenza audio MAI usata; null-safe", () => {
  eq(A.equipWatt({ modelData: { powerConsumption_W: { value: 5, unit_orig: "W" } } }), 5, "P16-M 5W");
  eq(A.equipWatt({ modelData: { powerConsumption_W: { value: 1.5, unit_orig: "A" } } }), 345, "LEOPARD 1.5A@230V (derived)");
  eq(A.equipWatt({ modelData: { power_handling_W: { value: 2150, unit_orig: "W" } } }), null, "potenza AUDIO ≠ consumo: ignorata");
  eq(A.equipWatt({ modelData: { powerConsumption_W: { value: null } } }), null); eq(A.equipWatt({}), null);
});
t("wattOf usa il consumo del modello (it.watt manuale resta prioritario)", () => {
  reset(); const it = add("amprack", 300, 300);
  const base = A.wattOf(it);
  it.modelData = { powerConsumption_W: { value: 300, unit_orig: "W", reliability: "official" } };
  eq(A.wattOf(it), 300, "modello vince sul generico (era " + base + ")");
  it.watt = 111; eq(A.wattOf(it), 111, "override manuale it.watt vince su tutto");
});
t("equipDimsCm: mm→cm, null se mancanti/non numerici", () => {
  const it = { modelData: { dims_w_mm: { value: 684 }, dims_d_mm: { value: 550 } } };
  const d = A.equipDimsCm(it); eq(d.w, 68); eq(d.d, 55);
  eq(A.equipDimsCm({ modelData: { dims_w_mm: { value: 684 } } }), null, "manca la profondità → null (mai inventare)");
  eq(A.equipDimsCm({}), null);
});
t("equipPhantom + equipName: ribbon_danger dal modello; nome robusto (stringa o SourcedValue)", () => {
  eq(A.equipPhantom({ modelData: { phantom: { value: "ribbon_danger" } } }), "ribbon_danger");
  eq(A.equipName({ modelData: { brand: "Royer", model: "R-121" } }), "Royer R-121");
  eq(A.equipName({ modelData: { brand: { value: "Shure" }, model: { value: "SM57" } } }), "Shure SM57");
  eq(A.equipName({}), null);
});
t("audit: elemento con modello ribbon passivo → avviso 'MAI +48V'", () => {
  reset(); const it = add("astamic", 300, 300);
  it.modelData = { brand: "Royer", model: "R-121", phantom: { value: "ribbon_danger", reliability: "official" } };
  const found = A.auditEngine().findings.filter(f => /nastro passivo|MAI \+48V/i.test(f.msg));
  eq(found.length >= 1, true, "avviso ribbon presente");
});

t("Input List dal modello: mic reale + phantom di targa sul canale derivato", () => {
  reset(); const it = add("astamic", 300, 300);   // default IN_SRC: SM58 (dinamico, no 48V)
  let r0 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r0.mic, "SM58"); eq(r0.p48, false, "default: dinamico senza phantom");
  // modello condensatore assegnato → mic reale + 48V dal datasheet
  it.modelData = { category: "microfono", model: "KM184", phantom: { value: "required", reliability: "official" } };
  A.__cabRes = null;
  let r1 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r1.mic, "KM184", "il canale mostra il modello reale");
  eq(r1.p48, true, "phantom di targa: required → 48V");
  eq(r1.stand, "asta giraffa", "stand da MIC_DEFAULTS quando il nome combacia");
  // ribbon passivo → phantom OFF per costruzione (l'audit avvisa già)
  it.modelData = { category: "microfono", model: "R-121", phantom: { value: "ribbon_danger", reliability: "official" } };
  A.__cabRes = null;
  let r2 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r2.mic, "R-121"); eq(r2.p48, false, "ribbon passivo: mai 48V sul derivato");
  // override manuale del canale vince sul modello
  A.cabSetMic(r2.key, "SM57");
  let r3 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r3.mic, "SM57", "override manuale (cabSetMic) prioritario sul modello");
  // modello NON-microfono (es. line array) → canale invariato
  reset(); const it2 = add("astamic", 300, 300);
  it2.modelData = { category: { value: "line_array" }, model: { value: "LEOPARD" }, powerConsumption_W: { value: 1.5, unit_orig: "A" } };
  A.__cabRes = null;
  let r4 = A.patchList().rows.find(r => r.itemId === it2.id);
  eq(r4.mic, "SM58", "categoria non-microfono: il canale resta col suggerito");
});

t("equipCatsFor: campo modello solo sugli elementi tecnici pertinenti (mai musicisti/arredo)", () => {
  eq(JSON.stringify(A.equipCatsFor({ type: "astamic" })), JSON.stringify(["microfono"]), "asta mic → solo microfono");
  eq(A.equipCatsFor({ type: "hearback" }), null, "personal mixer → null (unificato 28/07: il modello è il campo pm, blocco «Personal monitor»)");
  eq(A.equipCatsFor({ type: "mixhub" }), null, "hub PM → null, stessa ragione");
  eq(JSON.stringify(A.equipCatsFor({ type: "q338" })), JSON.stringify(["console"]), "console → console");
  eq(JSON.stringify(A.equipCatsFor({ type: "arraylarge" })), JSON.stringify(["line_array", "subwoofer", "amps"]), "PA → array/sub/amps");
  eq(A.equipCatsFor({ type: "stagebox" }), null, "stagebox → null (unificato: il modello è il campo hw STAGEBOX_DB)");
  eq(A.equipCatsFor({ type: "vlnpost" }), null, "postazione violino → nessun campo");
  eq(A.equipCatsFor({ type: "direttore" }) || A.equipCatsFor({ type: "conductor" }) || null, null, "direttore → nessun campo");
  eq(A.equipCatsFor({ type: "sedia" }), null, "sedia → nessun campo");
  eq(A.equipCatsFor(null), null);
  eq(A.equipFieldLabel(["microfono"]), "Microfono reale");
});

t("production: normalizeState crea i 6 sistemi, scarta risposte fuori enum, tronca le note", () => {
  const s0 = A.normalizeState({ items: [], stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] } });
  eq(!!s0.production, true); eq(s0.production.asked, false);
  eq(Object.keys(s0.production.systems).length, 6);
  eq(s0.production.systems.luci.ans, null, "nessun default implicito: niente piazzato bianco");
  const s1 = A.normalizeState({ items: [], stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
    production: { asked: true, systems: { playback: { ans: "service", note: "X".repeat(999) }, luci: { ans: "HACK" }, video: { ans: "configurato" } } } });
  eq(s1.production.asked, true);
  eq(s1.production.systems.playback.ans, "service");
  eq(s1.production.systems.playback.note.length, 300, "note troncate a 300");
  eq(s1.production.systems.luci.ans, null, "valore fuori enum → null");
  eq(s1.production.systems.video.ans, "configurato");
});
t("productionSummary: solo sistemi dichiarati (mai inventare), testi corretti", () => {
  const s = { production: { asked: true, systems: {
    playback: { ans: "service", note: "" }, video: { ans: "no", note: "" }, recaudio: { ans: null, note: "" },
    recvideo: { ans: "da_definire", note: "" }, streaming: { ans: null, note: "" },
    luci: { ans: "piazzato_bianco", note: "lettura spartiti" } } } };
  const rows = A.productionSummary(s);
  eq(rows.length, 3, "no e null non compaiono");
  eq(rows.find(r => r.key === "playback").text, "a carico del service tecnico");
  eq(rows.find(r => r.key === "recvideo").text.includes("da definire con un tecnico"), true);
  eq(rows.find(r => r.key === "luci").text, "piazzato bianco uniforme — lettura spartiti");
  eq(A.productionSummary({}).length, 0);
});

t("produzione fase 3: ITEM_USO copre i 7 tipi regia; usoSystemKey mappa uso→sistema", () => {
  ["laptop", "audiointerface", "camera", "proiettore", "schermo", "ledwallmod", "consolaluci"].forEach(k =>
    eq(!!A.ITEM_USO[k], true, "ITEM_USO manca: " + k));
  eq(!!A.ITEM_USO["vlnpost"], false, "postazione musicista: nessun campo utilizzo");
  // un computer NON è automaticamente playback: senza uso → nessun sistema
  eq(A.usoSystemKey("laptop", undefined), null);
  eq(A.usoSystemKey("laptop", "rec_audio"), "recaudio");
  eq(A.usoSystemKey("laptop", "luci"), "luci");
  eq(A.usoSystemKey("audiointerface", "entrambe"), "recaudio");
  eq(A.usoSystemKey("camera", "documentativa"), null, "camera documentativa: nessuna regia video assunta");
  eq(A.usoSystemKey("camera", "rec_streaming"), "streaming");
  eq(A.usoSystemKey("proiettore", "computer"), "video", "schermo/proiettore attivano sempre i contributi video");
  eq(A.usoSystemKey("consolaluci", null), "luci");
  eq(A.usoSystemKey("sedia", "x"), null);
});

t("produzione fase 4 — Scenario A: solo musicisti = ZERO falsi errori di produzione", () => {
  reset(); add("vlnpost", 300, 300); add("grancoda", 500, 300);
  const A4 = A.auditEngine();
  const prod = A4.findings.filter(f => f.cat === "Produzione");
  eq(prod.filter(f => f.lvl === "err").length, 0, "nessun errore produzione");
  eq(prod.filter(f => f.lvl === "warn").length, 0, "nessun avviso produzione");
});
t("produzione fase 4 — Scenario B: interfaccia senza utilizzo → 'da definire' (mai errore)", () => {
  reset(); add("audiointerface", 300, 300);
  const A4 = A.auditEngine();
  const td = A4.findings.filter(f => f.lvl === "todef" && /utilizzo/.test(f.msg));
  eq(td.length >= 1, true, "todef presente");
  eq((A4.todefs || 0) >= 1, true, "conteggio todefs nel return");
  eq(A4.findings.filter(f => f.cat === "Produzione" && f.lvl === "err").length, 0, "mai errore");
});
t("produzione fase 4 — playback 'configurato' senza postazione → avviso; con postazione → ok", () => {
  reset(); A.state.production.systems.playback.ans = "configurato";
  let W = A.auditEngine().findings.filter(f => f.lvl === "warn" && /playback/i.test(f.msg));
  eq(W.length, 1, "incoerenza reale segnalata");
  const it = add("laptop", 300, 300); it.uso = "playback_audio";
  W = A.auditEngine().findings.filter(f => f.lvl === "warn" && /playback/i.test(f.msg));
  eq(W.length, 0, "postazione presente: nessun avviso");
  A.state.production.systems.playback.ans = null;
});
t("produzione fase 4 — luci: mai piazzato bianco implicito; testo dichiarato", () => {
  reset();
  eq(A.productionLuciText(A.state), "Da definire.", "nessuna scelta → dichiarato, non inventato");
  A.state.production.systems.luci.ans = "service";
  eq(A.productionLuciText(A.state), "Luci a cura del service tecnico.");
  A.state.production.systems.luci.ans = "piazzato_bianco"; A.state.production.systems.luci.note = "";
  eq(/Piazzato bianco diffuso/.test(A.productionLuciText(A.state)), true, "piazzato SOLO se scelto (testo classico)");
  A.state.rider.luci = "Testo mio";
  eq(A.productionLuciText(A.state), "Testo mio", "il testo esplicito dell'utente vince");
  A.state.rider.luci = ""; A.state.production.systems.luci.ans = null;
});

t("produzione fase 5 — Scenario C: proiettore+schermo → sistema video attivato, sorgente richiesta, mai errore", () => {
  reset(); add("proiettore", 300, 300); add("schermo", 500, 300);
  const A5 = A.auditEngine();
  const prod = A5.findings.filter(f => f.cat === "Produzione");
  eq(prod.some(f => f.lvl === "todef" && /sorgente del contenuto/.test(f.msg)), true, "sorgente richiesta (da definire)");
  eq(prod.some(f => f.lvl === "todef" && /contributi video/.test(f.msg)), true, "sistema video da dichiarare nel Controllo tecnico");
  eq(prod.filter(f => f.lvl === "err").length, 0, "mai errore");
  // dichiarato nel Controllo tecnico + sorgente scelta → i todef si chiudono
  A.state.production.systems.video.ans = "configurato";
  A.state.items.forEach(i => { if (i.type === "proiettore" || i.type === "schermo") i.uso = "computer"; });
  const dopo = A.auditEngine().findings.filter(f => f.cat === "Produzione" && f.lvl === "todef");
  eq(dopo.length, 0, "tutto dichiarato: nessun aspetto aperto");
  A.state.production.systems.video.ans = null;
});
t("produzione fase 5 — Scenario D: rec multitraccia da definire → split da concordare (con n. canali reali)", () => {
  reset(); add("grancoda", 300, 300); add("vlnpost", 500, 300);   // canali reali >1
  add("laptop", 700, 300).uso = "rec_audio";   /* l'ultimo item puo' essere la DI del laptop */
  const A5 = A.auditEngine();
  const split = A5.findings.filter(f => f.lvl === "todef" && /split/.test(f.msg));
  eq(split.length, 1, "split da concordare");
  eq(/con \d+ canali/.test(split[0].msg), true, "porta il numero di canali reali");
  // dichiarata GIÀ CONFIGURATA → fiducia all'utente: niente todef split
  A.state.production.systems.recaudio.ans = "configurato";
  eq(A.auditEngine().findings.filter(f => f.lvl === "todef" && /split/.test(f.msg)).length, 0, "configurato: nessun todef split");
  A.state.production.systems.recaudio.ans = null;
});
t("produzione fase 5 — Scenario E: camera documentativa = nessuna assunzione di regia/streaming", () => {
  reset(); const c = add("camera", 300, 300); c.uso = "documentativa";
  const prod = A.auditEngine().findings.filter(f => f.cat === "Produzione");
  eq(prod.filter(f => f.lvl === "err" || f.lvl === "warn").length, 0, "nessun errore/avviso");
  eq(prod.some(f => /streaming|regia/.test(f.msg)), false, "nessuna regia video o streaming assunti");
});

t("pagine-vista per layer: il solo temporaneo pilota layerShown (cabin on → cabout off)", () => {
  reset(); A.state.cab.on = true; A.state.mond.on = true;
  // senza solo: entrambi visibili
  eq(A.layerShown("cabin"), true); eq(A.layerShown("cabout"), true); eq(A.layerShown("mond"), true);
  // con solo cabin (come fa stageSceneSvg per la pagina INGRESSI): solo cabin+net
  const keep = A.layerSoloUI;
  A.layerSoloUI = { cabin: true, net: true };
  eq(A.layerShown("cabin"), true); eq(A.layerShown("net"), true);
  eq(A.layerShown("cabout"), false, "ritorni esclusi dalla pagina Ingressi");
  eq(A.layerShown("mond"), false, "P.M. esclusi dalla pagina Ingressi");
  A.layerSoloUI = { mond: true };
  eq(A.layerShown("mond"), true); eq(A.layerShown("cabin"), false);
  A.layerSoloUI = keep;
  // classificazione fg per le nuove pagine
  reset(); const wedge = add("wedge", 300, 300);
  eq(A.layerFgItem("cabout", wedge), true, "wedge = fg della pagina Monitor");
  eq(A.layerFgItem("cabin", wedge), false, "wedge non è fg della pagina Ingressi");
});

t("productionStatusLine: conteggi risposte e da-definire", () => {
  reset();
  let st = A.productionStatusLine(A.state);
  eq(st.answered, 0, "nessuna risposta all'inizio");
  eq(st.todef, 6, "null conta come da definire");
  A.state.production.systems.playback.ans = "no";
  A.state.production.systems.video.ans = "configurato";
  A.state.production.systems.recaudio.ans = "da_definire";
  A.state.production.systems.recvideo.ans = "non_so";
  A.state.production.systems.streaming.ans = "service";
  A.state.production.systems.luci.ans = "da_concordare";
  st = A.productionStatusLine(A.state);
  eq(st.answered, 6, "tutte risposte");
  eq(st.todef, 2, "da_definire + non_so; luci da_concordare NON è todef");
  A.state.production.systems.luci.ans = "da_definire";
  eq(A.productionStatusLine(A.state).todef, 3, "luci da_definire conta");
});

t("pdfSuggestedKeys: suggerite tra le disponibili, mai le neutre", () => {
  const pages=[{key:"view-cabin"},{key:"rider"},{key:"pmlist"},{key:"cabmap"},{key:"todefine"}];
  eq(JSON.stringify(A.pdfSuggestedKeys(pages)), JSON.stringify(["view-cabin","pmlist","todefine"]));
  eq(A.pdfSuggestedKeys([]).length, 0);
});

t("productionElementHints: interfaccia audio senza dichiarazioni → invito mirato", () => {
  reset();
  /* reset() non tocca state.production: azzero i sistemi lasciati dai test precedenti */
  Object.keys(A.state.production.systems).forEach(k => { A.state.production.systems[k].ans = null; });
  eq(A.productionElementHints(A.state).length, 0, "palco vuoto: nessun invito");
  add("audiointerface", 300, 300);
  const h=A.productionElementHints(A.state);
  eq(h.length, 1);
  eq(/interfaccia audio/.test(h[0]), true, "l'invito nomina l'elemento");
  A.state.production.systems.playback.ans="no";
  A.state.production.systems.recaudio.ans="configurato";
  eq(A.productionElementHints(A.state).length, 0, "sistemi dichiarati: niente invito");
  add("camera", 400, 300);
  eq(/camera/.test(A.productionElementHints(A.state)[0]), true, "camera senza rec/streaming dichiarati");
});

t("pdfHeaderPropose: salvato > contatto primario > vuoto", () => {
  reset();
  A.state.pdfHeader = ""; A.state.contacts = [];
  eq(A.pdfHeaderPropose(A.state), "", "niente rubrica: vuoto");
  A.state.contacts = [
    { role: "Produzione", name: "Anna B.", contact: "anna@esempio.it", note: "" },
    { role: "Fonico di sala", name: "Marco V.", contact: "+39 333 000 0000", note: "" }
  ];
  eq(A.pdfHeaderPropose(A.state), "Fonico di sala: Marco V. · +39 333 000 0000", "primario = ruolo tecnico/sala, non il primo della lista");
  A.state.pdfHeader = "Testo mio";
  eq(A.pdfHeaderPropose(A.state), "Testo mio", "il testo salvato vince sempre");
  eq(A.pdfHeaderFromContact({ role: "", name: "Solo Nome", contact: "" }), "Solo Nome", "solo nome, senza ruolo");
  // cascata con account Google (nome · email): dopo la rubrica, prima del vuoto
  const acct = { role: "", name: "Nome Account", contact: "utente@esempio.it" };
  eq(A.pdfHeaderPropose(A.state, acct), "Testo mio", "il salvato vince anche sull'account");
  A.state.pdfHeader = "";
  eq(A.pdfHeaderPropose(A.state, acct), "Fonico di sala: Marco V. · +39 333 000 0000", "la rubrica del progetto vince sull'account");
  A.state.contacts = [];
  eq(A.pdfHeaderPropose(A.state, acct), "Nome Account · utente@esempio.it", "senza rubrica: account Google");
  eq(A.pdfHeaderPropose(A.state, null), "", "senza nulla: vuoto");
});

t("mond: il cavo segue il mixerino quando lo si sposta (cache invalidata)", () => {
  reset(); A.state.mond.on = true;
  const m = add("hearback", 300, 300), h = add("mixhub", 600, 300);
  A.mondManual(m.id).to = h.id; A.__mondRes = null;
  let l = A.mondResult().links[0];
  eq(!!l, true, "link creato");
  const x0 = l.pts[0][0], y0 = l.pts[0][1];
  eq(Math.abs(x0 - 300) < 80 && Math.abs(y0 - 300) < 80, true, "parte vicino al mixerino");
  // sposto l'elemento come fa il drag (aggiorna x/y e poi render+save, SENZA toccare la cache)
  m.x = 1000; m.y = 800;
  l = A.mondResult().links[0];
  eq(Math.abs(l.pts[0][0] - 1000) < 80 && Math.abs(l.pts[0][1] - 800) < 80, true,
     "il cavo parte dalla NUOVA posizione del mixerino");
});

t("pannello cavo: selectedCableInfo per un link P.M. + ripristina percorso", () => {
  reset(); A.state.mond.on = true;
  const m = add("hearback", 300, 300), h = add("mixhub", 600, 300);
  A.mondManual(m.id).to = h.id;
  A.mondManual(m.id).pts = [[450, 200]];              // segmento fatto "a mano"
  A.selMond = m.id; A.selCab = null; A.selElec = null;
  const info = A.selectedCableInfo();
  eq(!!info, true, "info trovata");
  eq(info.title, "Cavo personal monitor");
  eq(info.hasPts, true, "segnala il percorso modificato a mano");
  eq(info.rows.some(r => r[0] === "Lunghezza"), true, "riga lunghezza presente");
  info.resetPts();                                     // il tasto Ripristina percorso
  eq((A.state.mond.manual[m.id].pts || []).length, 0, "segmenti cancellati");
  eq(A.state.mond.manual[m.id].to, h.id, "il collegamento resta");
  A.selMond = null;
});

t("postazione a due: distanza default 90 cm (mai sotto il minimo fisico)", () => {
  reset();
  const v = add("vln1x2", 300, 300);
  eq(v.sep, 90, "addItem diretto: 90 cm subito");
  const cb = add("cbx2", 500, 300);
  eq(cb.sep, 100, "contrabbassi doppi: il minimo fisico 100 vince su 90");
  delete v.sep; delete cb.sep;
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.type === "vln1x2").sep, 90, "normalize (progetti caricati): 90 cm");
  eq(A.state.items.find(i => i.type === "cbx2").sep, 100, "normalize: minimo fisico rispettato");
  const single = add("vlnpost", 700, 300);
  eq(single.sep, 90, "postazione singola: sep pronto a 90 per quando diventa doppia");
});

t("shareOpts: default copia ON, contatti OFF (privacy); override persistiti", () => {
  reset();
  delete A.state.shareOpts;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.shareOpts.copy, true, "copia permessa di default");
  eq(A.state.shareOpts.contacts, false, "contatti nel link SPENTI di default");
  A.state.shareOpts = { copy: false, contacts: true };
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.shareOpts.copy, false, "scelta copia=off rispettata");
  eq(A.state.shareOpts.contacts, true, "opt-in contatti rispettato");
});

t("contactEligible: bottone Contatto solo sugli elementi-persona", () => {
  eq(A.contactEligible("vlnpost"), true, "postazione violino");
  eq(A.contactEligible("vln1x2"), true, "postazione doppia");
  eq(A.contactEligible("cantante"), true, "voce");
  eq(A.contactEligible("stagepiano"), true, "tastiera");
  eq(A.contactEligible("direttore"), true, "direttore");
  eq(A.contactEligible("batteria"), true, "batteria");
  eq(A.contactEligible("wedge"), false, "monitor: no");
  eq(A.contactEligible("laptop"), false, "computer: no");
  eq(A.contactEligible("stagebox"), false, "stage box: no");
});

t("icRoleMatch: sul violino solo i violini, mai i violoncelli", () => {
  eq(A.icRoleMatch("Postazione violino", "Violino"), true, "violino ↔ violino");
  eq(A.icRoleMatch("Violino I", "Violino II"), true, "I e II sono entrambi violinisti");
  eq(A.icRoleMatch("Violoncello", "Violoncello"), true);
  eq(A.icRoleMatch("Postazione violino", "Violoncello"), false, "violoncello NON è affine al violino");
  eq(A.icRoleMatch("Violoncello", "Violino"), false, "e viceversa");
  eq(A.icRoleMatch("Direttore", "Fonico di sala"), false);
  eq(A.icRoleMatch("Violino I", ""), false, "senza ruolo: non suggerito (si trova cercando)");
  eq(A.icRoleMatch("Cantante", "cantante"), true, "case-insensitive");
});

t("evento: evDate/evTime facoltativi, validati e persistiti", () => {
  reset();
  delete A.state.evDate; delete A.state.evTime;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.evDate, "", "default vuoto");
  eq(A.state.evTime, "", "default vuoto");
  A.state.evDate = "2026-08-01"; A.state.evTime = "21:30";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.evDate, "2026-08-01", "data valida preservata");
  eq(A.state.evTime, "21:30", "orario valido preservato");
  A.state.evDate = "spazzatura"; A.state.evTime = "25h";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.evDate, "", "data non valida azzerata");
  eq(A.state.evTime, "", "orario non valido azzerato");
});

t("layer Musicisti: fg = persone, visibilità da musLayerUI, attivo solo con persone", () => {
  reset();
  const v = add("vlnpost", 300, 300), w = add("wedge", 500, 300);
  eq(A.layerFgItem("mus", v), true, "violinista = fg del layer Musicisti");
  eq(A.layerFgItem("mus", w), false, "wedge no");
  eq(A.layerShown("mus"), true, "visibile di default");
  A.musLayerUI.vis = false;
  eq(A.layerShown("mus"), false, "occhio chiuso");
  A.musLayerUI.vis = true;
  const reg = A.layerRegistry();
  eq(reg.some(L => L.id === "mus" && L.active), true, "attivo con una persona sul palco");
  A.state.items = [];
  eq(A.layerRegistry().some(L => L.id === "mus" && L.active), false, "senza persone: non attivo");
  // il solo Musicisti deve SOPRAVVIVERE a pruneSolo quando ci sono persone (bug 18/07)
  add("vlnpost", 300, 300);
  A.layerSoloUI = { mus: true };
  A.pruneSolo();
  eq(!!A.layerSoloUI.mus, true, "solo Musicisti vivo con persone sul palco");
  A.state.items = [];
  A.pruneSolo();
  eq(!!A.layerSoloUI.mus, false, "senza persone il solo decade");
  A.layerSoloUI = {};
});

/* 25/07: le misure seguono la geometria reale (XLR 26 mm di passo, max 16 per fila come sui 19").
   Piu' canali = telaio piu' grande, non connettori piu' fitti. */
t("stagebox: le misure seguono i canali come nella realta'", () => {
  reset();
  const sb = add("stagebox", 400, 200);
  const dim = (o) => { Object.assign(sb, o); A.sbAutoSize(sb); return [sb.w, sb.d].join("x"); };
  const d8 = dim({ ch: 8, outCh: 0 }), d16 = dim({ ch: 16, outCh: 8 }), d32 = dim({ ch: 32, outCh: 16 });
  ok(d8 !== d16 && d16 !== d32, "8, 16 e 32 canali devono avere misure diverse: " + [d8, d16, d32].join(" / "));
  const [w8, h8] = d8.split("x").map(Number), [w16, h16] = d16.split("x").map(Number), [w32, h32] = d32.split("x").map(Number);
  eq(w8, w16, "fino a 16 canali la larghezza non cambia (8 connettori per fila)");
  ok(w32 > w16, "oltre i 16 canali la fila si allarga (16 per fila, come un 19\")");
  ok(h16 > h8, "piu' file di connettori = piu' profondita'");
  ok(w16 < 58 && h16 < 46, "una stage box vera e' piu' piccola del vecchio 58x46: " + d16);
  /* il passo dei connettori resta identico fra box diverse: e' il telaio a cambiare */
  const L8 = A.sbLayout({ type: "stagebox", ch: 8, outCh: 0 }), L32 = A.sbLayout({ type: "stagebox", ch: 32, outCh: 16 });
  const passo = (L) => (L.w - 2 * A.SB_PAD - A.SB_CTRL) / L.cols;   /* la larghezza e' arrotondata al cm: tolleranza */
  ok(Math.abs(passo(L8) - A.SB_PITCH) < 0.05 && Math.abs(passo(L32) - A.SB_PITCH) < 0.05,
    "il passo dei connettori deve restare 26 mm su ogni box: " + passo(L8).toFixed(2) + " vs " + passo(L32).toFixed(2));
  eq(L32.per, 16, "oltre 16 canali si usano 16 connettori per fila");
  eq(L8.per, 8, "fino a 16 canali, 8 per fila");
});
t("stagebox: modelli reali e misure personalizzate non vengono toccati", () => {
  reset();
  const sb = add("stagebox", 400, 200);
  sb.ch = 16; A.sbAutoSize(sb);
  sb.hw = "tio1608d"; const prima = [sb.w, sb.d].join("x");
  sb.ch = 32; A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), prima, "col modello hw le misure vengono dal datasheet");
  delete sb.hw; sb.w = 77; sb.d = 33; sb.ch = 8; A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), "77x33", "una misura personalizzata non va sovrascritta");
});
t("stagebox: una box appena creata ha gia' le misure dei suoi canali", () => {
  reset();
  const b8 = A.addItem("stagebox", { x: 200, y: 200, ch: 8, outCh: 0 });
  const b32 = A.addItem("stagebox", { x: 600, y: 200, ch: 32, outCh: 16 });
  const g = (it) => [it.w, it.d].join("x");
  ok(g(b8) !== "58x46" && g(b32) !== "58x46", "addItem usa ancora le misure fisse del tipo");
  ok(g(b8) !== g(b32), "8 e 32 canali devono nascere con misure diverse: " + g(b8) + " / " + g(b32));
  eq(g(b32), [A.sbLayout(b32).w, A.sbLayout(b32).d].join("x"));
});
t("stagebox: il pallino dei cavi sta sul bordo, non sul pannello", () => {
  const box = { x: 500, y: 300, w: 33, d: 17 };
  const a = A.boxAnchor(box);
  eq(a[0], 500, "il pallino resta centrato in orizzontale");
  ok(a[1] > box.y + box.d / 2, "il pallino deve stare FUORI dal pannello, verso il pubblico: " + a[1]);
  ok(a[1] < box.y + box.d / 2 + 8, "ma attaccato alla box, non staccato: " + a[1]);
  /* i cavi devono arrivare li', non al centro: nessun capo cavo hard-coded sul centro della box */
  ok(appjs.indexOf("concat([[b.x,b.y]])") === -1 && appjs.indexOf("[[m.box.x,m.box.y]]") === -1,
    "restano capi cavo agganciati al centro della box");
});
t("stagebox: i progetti vecchi (58x46, 34x26) migrano alle misure reali", () => {
  reset();
  const sb = add("stagebox", 400, 200);
  sb.w = 58; sb.d = 46; sb.ch = 16; sb.outCh = 8; A.sbAutoSize(sb);
  ok(sb.w !== 58 || sb.d !== 46, "la misura legacy non e' stata migrata");
  const dopo = [sb.w, sb.d].join("x");
  A.sbAutoSize(sb); eq([sb.w, sb.d].join("x"), dopo, "sbAutoSize deve essere idempotente");
});

t("rack: contenuti ordinati, U dai datasheet noti, orfani liberati dal normalize", () => {
  reset();
  const rk = add("rack", 500, 200);
  const b1 = add("stagebox", 500, 200); b1.hw = "rio3224d2"; b1.rackId = rk.id; b1.rackPos = 1;
  const b2 = add("stagebox", 500, 200); b2.hw = "rio1608d2"; b2.rackId = rk.id; b2.rackPos = 0;
  const hub = add("mixhub", 500, 200); hub.rackId = rk.id; hub.rackPos = 2;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.type === "rack").rackU, 12, "default 12U");
  const cont = A.rackContents(rk.id);
  eq(cont.map(x => x.hw || x.type).join(","), "rio1608d2,rio3224d2,mixhub", "ordine per rackPos");
  eq(A.rackUsedU(rk.id), 2 + 3 + 1, "U: 2 (Rio16) + 3 (Rio32) + 1 (default hub)");
  cont[2].rackUh = 2;
  eq(A.rackUsedU(rk.id), 7, "U modificabile a mano vince");
  // rack eliminato → gli apparecchi si liberano
  A.state.items = A.state.items.filter(i => i.id !== rk.id);
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.some(i => i.rackId), false, "nessun rackId orfano dopo il normalize");
});

t("F2: device ID + FOH continuo + porte riservate/pinnate + conflitti", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {};
  const b32 = add("stagebox", 700, 250); b32.hw = "rio3224d2";
  const b16 = add("stagebox", 900, 250); b16.hw = "rio1608d2"; b16.sbId = 1;   // il 16 diventa ID1 → FOH 1-16
  const mic = add("astamic", 880, 400);
  A.__cabRes = null;
  let R = A.audioCablingEngine();
  const B16 = R.boxes.find(b => b.id === b16.id), B32 = R.boxes.find(b => b.id === b32.id);
  eq(B16.eid, 1, "sbId esplicito vince"); eq(B16.fohBase, 0, "ID1 parte da FOH 1");
  eq(B32.fohBase, 16, "la 32 continua da 17");
  const l = R.links.find(x => x.s.it.id === mic.id);
  eq(l.box.id, b16.id, "il mic va sulla box vicina");
  const row = A.patchList().rows.find(r => r.key === l.key);
  eq(row.foh, B16.fohBase + l.ch, "canale FOH continuo in lista"); eq(A.patchList().hasFoh, true, "hasFoh con 2 box");
  // porta riservata: la 1 resta libera (spare), il mic scala
  b16.sbRes = [l.ch]; A.__cabRes = null; R = A.audioCablingEngine();
  const l2 = R.links.find(x => x.s.it.id === mic.id);
  ok(l2.ch !== l.ch, "la porta riservata viene saltata");
  // pin manuale porta 5 + nome breve
  A.cabManual(l2.key).port = 5; A.cabManual(l2.key).short = "VOX";
  A.__cabRes = null; R = A.audioCablingEngine();
  const l3 = R.links.find(x => x.s.it.id === mic.id);
  eq(l3.ch, 5, "porta pinnata rispettata"); eq(l3.pinned, true, "flag pinned");
  eq(A.patchList().rows.find(r => r.key === l3.key).short, "VOX", "nome breve in lista");
  // conflitto: seconda sorgente pinnata sulla stessa porta → err
  const mic2 = add("astamic", 920, 400);
  A.__cabRes = null; R = A.audioCablingEngine();
  const lx = R.links.find(x => x.s.it.id === mic2.id);
  A.cabManual(lx.key).port = 5; A.__cabRes = null; R = A.audioCablingEngine();
  ok(R.issues.some(i => i.lvl === "err" && /Porta duplicata/.test(i.msg)), "porta duplicata = errore");
  // device ID duplicato → warn
  delete A.state.cab.manual[l3.key]; delete A.state.cab.manual[lx.key];
  b32.sbId = 1; A.__cabRes = null; R = A.audioCablingEngine();
  ok(R.issues.some(i => i.lvl === "warn" && /Device ID duplicato/.test(i.msg)), "ID duplicato = warn");
  // normalize sanifica sbId/sbRes fuori range
  b32.sbId = 99; b16.sbRes = [0, 3, 3, 70];
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const n32 = A.state.items.find(i => i.id === b32.id), n16 = A.state.items.find(i => i.id === b16.id);
  eq(n32.sbId, undefined, "sbId fuori range rimosso");
  eq(JSON.stringify(n16.sbRes), "[3]", "sbRes dedup + solo porte valide");
});

t("F3: ricevitori RF — associazione auto, pin, capienza, sorgente audio dal ricevitore", () => {
  reset();
  const v1 = add("wireless", 300, 200); v1.label = "Voce 1";
  const v2 = add("wireless", 350, 200); v2.label = "Voce 2";
  const pr = add("headset", 400, 200); pr.label = "Presentatore";
  // senza ricevitori: tutto come prima (i tx sono sorgenti)
  eq(A.rfAssign().rxs.length, 0, "nessun rx");
  eq(A.cabItemInputs(v1).length, 1, "senza rx il palmare resta sorgente");
  // rx generico da 2: i primi due assegnati, il terzo orfano
  const rx = add("rxrf", 600, 300);
  let R = A.rfAssign();
  eq(R.byTx[v1.id].ch, 1, "Voce 1 → ch 1"); eq(R.byTx[v2.id].ch, 2, "Voce 2 → ch 2");
  eq(R.orphans.length, 1, "Presentatore orfano");
  eq(A.cabItemInputs(v1).length, 0, "tx assegnato: 0 canali dal palmare");
  const chans = A.cabItemInputs(rx);
  eq(chans.length, 2, "il ricevitore è la sorgente");
  eq(chans[0].name, "Voce 1", "nome canale dal tx"); eq(chans[0].mic, "Beta 58A", "capsula da IN_SRC");
  eq(A.cabItemInputs(pr).length, 1, "l'orfano resta sorgente diretta");
  ok(A.rfIssues().some(i => i.lvl === "warn" && /senza ricevitore/.test(i.msg)), "warn orfano");
  // pin esplicito: Presentatore sul ch 1 → Voce 1 scala, Voce 2 orfana (2 posti)
  pr.rxId = rx.id; pr.rxCh = 1;
  R = A.rfAssign();
  eq(R.byTx[pr.id].ch, 1, "pin rispettato"); eq(R.byTx[v1.id].ch, 2, "auto scala");
  eq(R.orphans[0].id, v2.id, "Voce 2 orfana");
  // modello reale: ULXD4Q = 4 canali → tutti dentro
  rx.hw = "ulxd4q";
  R = A.rfAssign();
  eq(R.orphans.length, 0, "capienza 4: nessun orfano");
  eq(A.rxCapOf(rx), 4, "canali di targa");
  // frequenza duplicata = err; fuori banda nota = warn
  v1.rf = "524.375"; v2.rf = "524.375";
  ok(A.rfIssues().some(i => i.lvl === "err" && /duplicata/.test(i.msg)), "freq duplicata = err");
  delete v2.rf; rx.band = "R1-9"; v1.rf = "700.000";
  ok(A.rfIssues().some(i => i.lvl === "warn" && /fuori dalla banda/.test(i.msg)), "700 MHz fuori R1-9 = warn");
  v1.rf = "524.375";
  ok(!A.rfIssues().some(i => /fuori dalla banda/.test(i.msg)), "524.375 in R1-9: ok");
  // lista RF: colonna ricevitore
  const row = A.rfList().rows.find(r => r.name === "Voce 1");
  ok(/ch/.test(row.rx), "lista: ricevitore + canale");
  // normalize: rx eliminato → pin puliti, tx tornano sorgenti
  A.state.items = A.state.items.filter(i => i.id !== rx.id);
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.some(i => i.rxId != null), false, "rxId orfano rimosso");
  eq(A.cabItemInputs(A.state.items.find(i => i.id === v1.id)).length, 1, "il palmare torna sorgente");
});

t("F3: catena coassiale antenna->splitter->ricevitori, avvisi topologia", () => {
  reset();
  const rx1 = add("rxrf", 500, 300); const rx2 = add("rxrf", 560, 300);
  const a1 = add("rfant", 200, 150); const a2 = add("rfant", 260, 150);
  // senza splitter con 2 rx: antenna sul piu vicino + warn
  let C = A.rfChain();
  eq(C.links.length, 2, "2 antenne collegate");
  ok(C.links.every(l => l.lenM > 0), "metri calcolati");
  ok(C.issues.some(i => /senza splitter/.test(i.msg)), "warn: serve splitter con 2 rx");
  // con lo splitter: ant->split + split->rx, niente warn
  const sp = add("rfsplit", 380, 220);
  C = A.rfChain();
  eq(C.links.filter(l => l.kind === "ant").length, 2, "antenne sullo splitter");
  eq(C.links.filter(l => l.kind === "rx").length, 2, "splitter sui ricevitori");
  ok(!C.issues.some(i => /senza splitter/.test(i.msg)), "warn sparito");
  // overflow: 5 ricevitori su uno splitter 1:4
  for (let i = 0; i < 3; i++) add("rxrf", 600 + i * 40, 300);
  C = A.rfChain();
  ok(C.issues.some(i => /uscite tipiche sono 4/.test(i.msg)), "warn oltre 4 uscite");
  // lista: infrastruttura presente
  const kinds = A.rfList().rows.map(r => r.kind).join("|");
  ok(/Antenna direttiva 90/.test(kinds) && /Distribuzione RF/.test(kinds), "antenne+splitter in lista");
  // modello reale dal campo (Sernaglia): ADP UHF = 100 gradi di targa, vince sul campo manuale
  a1.hw = "adpuhf"; a1.antAng = 70;
  eq(A.antAngOf(a1), 100, "targa ADP 100 gradi");
  ok(/direttiva 100.*ADP/.test(A.rfList().rows.map(r => r.kind).join("|")), "lista col modello");
});

t("F3: rete/Dante — switch a stella, trunk console, ridondanza e porte", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const b1 = add("stagebox", 300, 300); b1.hw = "rio3224d2";
  const b2 = add("stagebox", 900, 300); b2.hw = "rio1608d2";
  add("astamic", 320, 400); add("astamic", 880, 400);
  A.__cabRes = null;
  // senza switch: tratte dirette + warn "switch"
  let N = A.netEngine();
  eq(N.runs.length, 2, "2 tratte dirette");
  ok(N.runs.every(r => r.kind === "box" && !r.sw), "dirette alla console");
  ok(N.issues.some(i => /Switch rete/.test(i.msg)), "warn: consiglia lo switch");
  // con lo switch: 2 box->switch + 1 trunk
  const sw = add("netswitch", 600, 600);
  A.__cabRes = null; N = A.netEngine();
  eq(N.runs.filter(r => r.kind === "box" && r.sw).length, 2, "box a stella sullo switch");
  eq(N.runs.filter(r => r.kind === "trunk").length, 1, "un solo trunk verso la console");
  eq(N.swUsed, 3, "3 porte Primary");
  ok(!N.issues.some(i => /Switch rete/.test(i.msg)), "consiglio sparito");
  // ridondanza: porte doppie; 5 porte non bastano piu
  A.state.netRed = true; sw.swPorts = 5;
  A.__cabRes = null; N = A.netEngine();
  eq(N.swUsed, 6, "Primary+Secondary = 6 porte");
  ok(N.runs.every(r => r.red), "tutte le tratte ridondate (Dante)");
  ok(N.issues.some(i => i.lvl === "err" && /porte/.test(i.msg)), "err porte insufficienti");
  sw.swPorts = 8; A.__cabRes = null; N = A.netEngine();
  ok(!N.issues.some(i => i.lvl === "err" && /porte/.test(i.msg)), "8 porte bastano");
  // normalize: swPorts fuori range rimosso
  sw.swPorts = 99; let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.id === sw.id).swPorts, undefined, "swPorts sanificato");
  A.state.netRed = false;
});

t("Output list: bus console -> porte out (auto consecutive, pin, conflitti, mai duplicati)", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const b1 = add("stagebox", 300, 300); b1.hw = "rio3224d2"; b1.sbId = 1;   // 8 out
  const b2 = add("stagebox", 900, 300); b2.hw = "rio1608d2"; b2.sbId = 2;   // 8 out
  const w = add("wedge", 320, 500);   // 1 mix monitor derivato
  add("astamic", 320, 400);
  A.state.buses = [];
  A.__cabRes = null;
  let L = A.busList();
  eq(L.auto.length, 1, "mix monitor derivato presente");
  const monBox = L.auto[0].box, monPort = L.auto[0].ports[0];
  // bus stereo auto: prime 2 consecutive libere (dopo il monitor se stessa box)
  A.state.buses.push({ id: "bA", name: "MAIN L/R", kind: "st", dest: "P.A." });
  A.__cabRes = null; L = A.busList();
  const main = L.rows[0];
  eq(main.ports.length, 2, "stereo = 2 porte");
  ok(main.ports[1] === main.ports[0] + 1, "porte consecutive");
  if (main.box.id === monBox.id) ok(main.ports[0] !== monPort, "non pesta il monitor");
  // pin: porta 7 su ID2
  A.state.buses.push({ id: "bB", name: "TV L/R", kind: "st", boxId: b2.id, port: 7 });
  A.__cabRes = null; L = A.busList();
  const tv = L.rows.find(r => r.bus.id === "bB");
  eq(tv.box.id, b2.id, "pin box rispettato"); eq(tv.ports.join(","), "7,8", "pin porta 7-8");
  eq(tv.pinned, true, "flag pinned");
  // conflitto: altro bus pinnato sulla stessa porta -> err e riassegnato altrove
  A.state.buses.push({ id: "bC", name: "REC L/R", kind: "st", boxId: b2.id, port: 8 });
  A.__cabRes = null; L = A.busList();
  ok(L.issues.some(i => i.lvl === "err" && /occupata/.test(i.msg)), "pin in conflitto = err");
  const rec = L.rows.find(r => r.bus.id === "bC");
  ok(rec.box && !(rec.box.id === b2.id && rec.ports[0] === 8), "riassegnato altrove");
  // saturazione: 16 out totali - riempio tutto -> bus senza porta, mai perso
  for (let i = 0; i < 12; i++) A.state.buses.push({ id: "bF" + i, name: "X" + i, kind: "st" });
  A.__cabRes = null; L = A.busList();
  ok(L.unpatched.length >= 1, "bus senza porta out");
  ok(L.issues.some(i => /senza porta out/.test(i.msg)), "err out esaurite");
  eq(L.rows.length, A.state.buses.length, "nessun bus perso dalle righe");
  // normalize: kind farlocco -> st; boxId orfano -> pulito; senza nome -> via
  A.state.buses = [{ id: "z1", name: "OK", kind: "boh", boxId: "manca", port: 3 }, { name: "  " }];
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.buses.length, 1, "bus senza nome eliminato");
  eq(A.state.buses[0].kind, "st", "kind sanificato");
  eq(A.state.buses[0].boxId, undefined, "boxId orfano rimosso");
  A.state.buses = [];
});

t("Sub-snake analogica -> rack I/O: blocco contiguo, FOH del Rio, riservate, fallback main", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const rio = add("stagebox", 900, 300); rio.hw = "rio3224d2"; rio.sbId = 1;
  const ana = add("stagebox", 200, 300); ana.ch = 8; ana.outCh = 0;      // generica = analogica
  const m1 = add("astamic", 180, 400); const m2 = add("astamic", 220, 400);  // vicini all'analogica
  const dir = add("astamic", 880, 400);                                   // diretto al rio
  A.__cabRes = null;
  let R = A.audioCablingEngine();
  const bA = R.boxes.find(b => b.id === ana.id), bR = R.boxes.find(b => b.id === rio.id);
  eq(bA.digital, false, "generica = analogica"); eq(bR.digital, true, "rio = rack I/O");
  eq(bA.fohBase, null, "l'analogica non ha blocco FOH proprio");
  ok(bA.up && bA.up.box.id === rio.id, "coda agganciata al rio");
  eq(bA.up.n, 2, "2 canali raccolti");
  ok(bA.up.p0 >= 1, "blocco assegnato");
  // le porte del blocco risultano occupate sul rio, con provenienza
  ok(bR.taken[bA.up.p0] && bR.snkFrom[bA.up.p0] === bA.letter, "porta del rio occupata dalla coda");
  // patch list: FOH dal rio, patch con freccia
  const pl = A.patchList();
  const rowM = pl.rows.find(r => r.itemId === m1.id);
  ok(rowM.foh === bR.fohBase + bA.up.map[1] || rowM.foh === bR.fohBase + bA.up.map[2] || rowM.foh >= 1, "FOH dal rio");
  ok(rowM.patch.indexOf("\u2192") > 0 && /ID1:/.test(rowM.patch), "patch A->ID1:porta");
  const rowD = pl.rows.find(r => r.itemId === dir.id);
  ok(/ID1\u00b7/.test(rowD.patch), "il diretto resta ID1-porta");
  // la snake dell'analogica punta al rio
  const sk = R.snakes.find(k => k.box.id === ana.id);
  ok(sk && sk.up && sk.x2 === rio.x, "snake verso il rack I/O");
  // riservate del rio rispettate: riservo le prime 30 -> blocco impossibile = err
  rio.sbRes = Array.from({ length: 31 }, (_, i) => i + 1); A.__cabRes = null;
  R = A.audioCablingEngine();
  ok(R.issues.some(i => i.lvl === "err" && /porte contigue/.test(i.msg)), "err senza blocco contiguo");
  delete rio.sbRes;
  // sbTo=main: comportamento classico (multipolare al punto principale, FOH proprio)
  ana.sbTo = "main"; A.__cabRes = null;
  R = A.audioCablingEngine();
  const bA2 = R.boxes.find(b => b.id === ana.id);
  ok(!bA2.up && bA2.fohBase != null, "main = niente coda, blocco FOH proprio");
  // normalize: sbTo con id inesistente -> pulito
  ana.sbTo = "fantasma"; let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.id === ana.id).sbTo, undefined, "sbTo orfano rimosso");
});

t("F4: linee numerate del distro + connettore (auto, pin, override)", () => {
  reset();
  A.state.elec.on = true; A.state.elec.mode = "auto"; A.state.elec.manual = {};
  A.state.elec.supply = { kind: "left" };
  const d = add("distro32", 100, 300);
  const h1 = add("testamobile", 200, 300);   // moving head, >0W
  const h2 = add("testamobile", 240, 300);
  const rk = add("rack", 300, 300);           // rack audio → PowerCON, ma serve wattOf>0
  A.__elecRes = null;
  let R = A.electricEngine();
  const links = R.loadLinks;
  ok(links.length >= 2, "carichi collegati");
  // numeri progressivi distinti per distro
  const nums = links.map(l => l.line).sort((a, b) => a - b);
  eq(new Set(nums).size, nums.length, "numeri linea distinti");
  ok(nums[0] === 1, "parte da 1");
  // connettore dedotto: moving head (5A) = Schuko
  const lh = links.find(l => l.load.it.id === h1.id);
  eq(lh.conn.k, "sk", "moving head <16A = Schuko");
  // override connettore = CEE
  A.state.elec.manual[h1.id] = { conn: "cee" };
  A.__elecRes = null; R = A.electricEngine();
  eq(R.loadLinks.find(l => l.load.it.id === h1.id).conn.k, "cee", "override CEE");
  // pin numero linea 7
  A.state.elec.manual[h1.id] = { line: 7 };
  A.__elecRes = null; R = A.electricEngine();
  const lh2 = R.loadLinks.find(l => l.load.it.id === h1.id);
  eq(lh2.line, 7, "linea pinnata a 7"); eq(lh2.linePinned, true, "flag pin");
  // gli altri non collidono col 7
  ok(R.loadLinks.filter(l => l.load.it.id !== h1.id).every(l => l.line !== 7), "nessuna collisione col pin");
  // loadList espone line/conn
  const row = A.loadList().rows.find(r => r.loadId === h1.id);
  eq(row.line, 7, "line in lista"); ok(row.conn, "conn label in lista");
  // normalize: line/conn fuori range puliti
  A.state.elec.manual[h1.id] = { line: 99, conn: "xxx", distro: d.id };
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq((A.state.elec.manual[h1.id] || {}).line, undefined, "line fuori range rimossa");
  eq((A.state.elec.manual[h1.id] || {}).conn, undefined, "conn invalido rimosso");
  A.state.elec.manual = {};
});

t("Macchina cuffie: hub -> bus console (16 ch contigui), o Dante = nota", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const box = add("stagebox", 500, 300); box.hw = "rio3224d2"; box.sbId = 1;   // 16 out
  add("astamic", 520, 400);
  const hub = add("mixhub", 300, 500); hub.pm = "p16d";   // Powerplay P16-D, Ultranet
  A.state.buses = [];
  A.__cabRes = null;
  let L = A.busList();
  /* 28/07 (caso reale): UNA RIGA PER MANDATA, ognuna col suo nome — come il documento che il fonico
     consegna («keyl · keyr · drums · bass · guit · archi · fiati · voci»), non un blocco anonimo. */
  const cufs = L.auto.filter(a => a.cuf);
  eq(cufs.length, 16, "16 mandate, una riga ciascuna (Ultranet)");
  const ports = cufs.map(c => c.ports[0]);
  ok(ports.every((p, i) => i === 0 || p === ports[i - 1] + 1), "blocco contiguo");
  eq(cufs[0].tag, "CUF", "tag CUF");
  ok(cufs.every(c => c.name && c.name.length), "ogni mandata ha un nome");
  ok(cufs.some(c => /voci/i.test(c.name)), "il gruppo presente sul palco dà il nome: c'è una voce → «Voci»");
  const cuf = { ports: ports, tag: cufs[0].tag, cuf: true };   /* compat con le asserzioni successive */
  // canali override
  hub.pmFeedCh = 8; A.__cabRes = null; L = A.busList();
  eq(L.auto.filter(a => a.cuf).length, 8, "override 8 canali → 8 mandate");
  delete hub.pmFeedCh;
  // Dante = niente uscite, solo nota info
  hub.pmFeed = "dante"; A.__cabRes = null; L = A.busList();
  ok(!L.auto.some(a => a.cuf), "via Dante: nessuna riga bus");
  ok(L.issues.some(i => i.lvl === "info" && /via rete Dante/.test(i.msg)), "nota Dante");
  delete hub.pmFeed;
  // out esaurite: box da pochi canali + hub 16 -> err
  box.hw = null; box.ch = 8; box.outCh = 8; A.__cabRes = null; L = A.busList();
  ok(L.issues.some(i => i.lvl === "err" && /uscite contigue/.test(i.msg)), "err senza 16 out contigue");
  // pmIsHub e helper
  eq(A.pmIsHub(hub), true, "mixhub = hub");
  eq(A.pmFeedChOf(hub), 16, "default Ultranet 16");
  // normalize: pmFeed/pmFeedCh invalidi puliti
  hub.pmFeed = "boh"; hub.pmFeedCh = 99;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const nh = A.state.items.find(i => i.id === hub.id);
  eq(nh.pmFeed, undefined, "pmFeed invalido rimosso"); eq(nh.pmFeedCh, undefined, "pmFeedCh fuori range rimosso");
  A.state.buses = [];
});

t("Hub produzione: reparti tecnici derivati dal palco + extra a mano", () => {
  reset();
  // palco vuoto: nessun reparto tecnico
  eq(A.productionDepts().length, 0, "palco vuoto = 0 reparti");
  // audio + monitor + power dal palco
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3"; A.state.cab.home = { kind: "foh" };
  add("stagebox", 500, 300).hw = "rio3224d2";
  add("astamic", 520, 400);
  add("wedge", 540, 500);
  A.state.elec.on = true; A.state.elec.mode = "auto"; A.state.elec.supply = { kind: "left" };
  add("distro32", 100, 300); add("testamobile", 200, 300);
  A.__cabRes = null; A.__elecRes = null;
  let d = A.productionDepts();
  const keys = d.map(x => x.key);
  ok(keys.indexOf("audio") >= 0, "reparto Audio derivato");
  ok(keys.indexOf("monitor") >= 0, "reparto Monitor derivato");
  ok(keys.indexOf("power") >= 0, "reparto Power derivato");
  ok(d.find(x => x.key === "audio").plot === true, "audio = dal palco");
  ok(/ingressi/.test(d.find(x => x.key === "audio").detail), "detail con conteggio");
  // extra a mano
  A.state.production.depts = [{ id: "dp1", name: "Catering" }];
  d = A.productionDepts();
  const cat = d.find(x => x.name === "Catering");
  ok(cat && cat.extra === true && cat.plot === false, "extra = aggiunto a mano");
  // normalize: depts preservati e sanificati
  A.state.production.depts = [{ id: "dp1", name: "  Luci  " }, { name: "" }, { name: "x".repeat(60) }];
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.production.depts.length, 2, "vuoto scartato, 2 restano");
  eq(A.state.production.depts[0].name, "Luci", "nome trimmato");
  ok(A.state.production.depts[1].name.length === 40, "nome troncato a 40");
  ok(A.state.production.depts.every(x => x.id), "id garantito");
  A.state.production.depts = [];
});

t("equip: un DI mostra solo modelli DI, un mic solo microfoni", () => {
  eq(JSON.stringify(A.equipCatsFor({ type: "distereo" })), JSON.stringify(["di"]), "DI stereo → solo di");
  eq(JSON.stringify(A.equipCatsFor({ type: "dimono" })), JSON.stringify(["di"]), "DI mono → solo di");
  eq(JSON.stringify(A.equipCatsFor({ type: "astamic" })), JSON.stringify(["microfono"]), "asta mic → solo microfono");
  eq(JSON.stringify(A.equipCatsFor({ type: "giraffa" })), JSON.stringify(["microfono"]), "giraffa → solo microfono");
  eq(A.equipFieldLabel(["di"]), "Modello DI", "label DI");
  ok(A.STAGEBOX_DB["rio3224d2"].equip === "yamaha-rio3224-d2", "hw Rio3224 agganciato al prodotto verificato");
  ok(A.STAGEBOX_DB["dl32"].equip === "midas-dl32", "hw DL32 agganciato al prodotto verificato");
  eq(A.equipFieldLabel(["microfono"]), "Microfono reale", "label microfono");
});

t("DI box unico: canali (mono/stereo/multi) + tipo (passiva/attiva) + icona", () => {
  reset();
  const m = add("dimono", 100, 100);
  eq(A.diCh(m), "mono", "default mono");
  eq(A.diChannels(m), 1, "mono = 1 canale");
  eq(A.cabItemInputs(m).length, 1, "mono = 1 ingresso");
  m.diCh = "stereo";
  eq(A.cabItemInputs(m).length, 2, "stereo = 2 ingressi L/R");
  m.diCh = "multi"; m.diMultiCh = 8;
  eq(A.cabItemInputs(m).length, 8, "multi = 8 ingressi");
  m.diCh = "mono"; m.diType = "attiva";
  ok(/attiva/i.test(A.cabItemInputs(m)[0].mic), "attiva → mic 'DI attiva' (phantom)");
  // ingombri REALI da catalogo (27/07): mono 13x10 (ProDI/AR-133), stereo 19x13 (ProD2), multi 48x24 (rack 19")
  eq(JSON.stringify(A.diFootprint({ type: "dimono", diCh: "mono" })), JSON.stringify([13, 10]), "footprint mono");
  eq(JSON.stringify(A.diFootprint({ type: "dimono", diCh: "stereo" })), JSON.stringify([19, 13]), "footprint stereo");
  eq(JSON.stringify(A.diFootprint({ type: "dimono", diCh: "multi" })), JSON.stringify([48, 24]), "footprint multi (rack 19\")");
  ok(A.TYPES.dimono.w === 13 && A.TYPES.dimono.d === 10, "il tipo nasce con l'ingombro reale");
  ok(A.diDraw({ type: "dimono", diCh: "mono", diType: "passiva", w: 30, d: 26 }).indexOf("tec fill") > -1, "passiva ha XLR out");
  ok(A.diDraw({ type: "dimono", diCh: "mono", diType: "attiva", w: 30, d: 26 }).indexOf("#16a34a") > -1, "attiva ha LED verde");
  ok(A.diDraw({ type: "dimono", diCh: "stereo", diSchema: true, w: 48, d: 28 }).match(/path/g).length === 2, "schematico stereo = 2 triangoli");
  const st = add("distereo", 200, 100);
  eq(A.cabItemInputs(st).length, 2, "vecchio distereo = 2 canali (compat)");
});

t("parapetto: disegno contenuto nella profondità (allineamento snap/bordo)", () => {
  reset();
  const par = add("parapetto", 400, 250);
  eq(par.d, 8, "profondità di default 8 cm (richiesta utente 19/07; il draw ora segue it.d → montanti contenuti anche a 8)");
  // il draw non deve contenere coordinate y oltre ±d/2 (prima i montanti erano a ±12 su d=8)
  const svg = A.TYPES.parapetto.draw(par);
  const ys = (svg.match(/y[12]?="(-?[\d.]+)"/g) || []).map(m => Math.abs(parseFloat(m.match(/(-?[\d.]+)/)[1])));
  const maxY = Math.max.apply(null, ys);
  ok(maxY <= par.d / 2 + 0.5, "nessuna coordinata oltre ±d/2 (era ±12 su d=8): max=" + maxY);
});

t("sicurezza: 7 nuovi presidi + info sull'elemento (descrizione/portata/note)", () => {
  const nuovi = ["estport", "uscemerg", "puntoracc", "primsocc", "idrante", "lucemerg", "segnalet"];
  nuovi.forEach(t => {
    ok(A.TYPES[t] && A.TYPES[t].cat === "Sicurezza e site", t + " nel catalogo Sicurezza");
    ok(A.SAFETY_INFO[t], t + " ha i campi info");
    ok(A.TYPES[t].draw({ w: A.TYPES[t].w, d: A.TYPES[t].d }).length > 20, t + " ha un disegno");
  });
  // normalize: campi safety sanificati (stringa non vuota, troncati)
  reset();
  const e = add("estport", 100, 100);
  e.safeDesc = "  Estintore CO2  "; e.safeCap = "x".repeat(80); e.safeNote = "";
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const n = A.state.items.find(i => i.id === e.id);
  eq(n.safeDesc, "Estintore CO2".slice(0, 120), "descrizione conservata");
  ok(n.safeCap.length === 80 || n.safeCap.length <= 120, "portata troncata");
  eq(n.safeNote, undefined, "nota vuota rimossa");
});

t("decisione 4A: elementDept mappa gli elementi al reparto tecnico", () => {
  reset();
  const sb = add("stagebox", 100, 100); sb.hw = "rio3224d2";
  eq(A.elementDept(sb), "audio", "stage box → audio");
  eq(A.elementDept(add("astamic", 120, 100)), "audio", "microfono → audio");
  eq(A.elementDept(add("wedge", 140, 100)), "monitor", "wedge → monitor");
  eq(A.elementDept(add("rxrf", 160, 100)), "rf", "ricevitore → rf");
  eq(A.elementDept(add("rfant", 180, 100)), "rf", "antenna → rf");
  eq(A.elementDept(add("netswitch", 200, 100)), "rete", "switch → rete");
  eq(A.elementDept(add("distro32", 220, 100)), "power", "distro → power");
  eq(A.elementDept(add("testamobile", 240, 100)), "power", "carico (testa mobile) → power");
  eq(A.elementDept(add("sedia", 260, 100)), null, "sedia → nessun reparto");
  eq(A.elementDept(add("pedana", 280, 100)), null, "pedana → nessun reparto");
  ok(A.DEPT_NAME.audio === "Audio" && A.DEPT_NAME.power === "Power", "nomi reparto");
});

t("layer Output: iemant (rack TX in-ear) fa parte della catena", () => {
  reset();
  const tx = add("iemant", 300, 300);
  eq(A.layerFgItem("cabout", tx), true, "rack TX in-ear = fg del layer Output (come i beltpack)");
  A.state.cab.on = true;
  A.layerSoloUI = { cabout: true };
  A.pruneSolo();
  eq(!!A.layerSoloUI.cabout, true, "il solo Output sopravvive col motore acceso");
  A.state.cab.on = false; A.state.items = [];
  A.pruneSolo();
  eq(!!A.layerSoloUI.cabout, false, "senza motore il solo decade");
  A.layerSoloUI = {};
});

t("Layer v3: Ingressi/Output sempre in lista, P.M. situazionale, stato motore", () => {
  reset();
  const reg = A.layerRegistry();
  const cin = reg.find(L => L.id === "cabin"), cout = reg.find(L => L.id === "cabout"), el = reg.find(L => L.id === "elec");
  ok(!reg.some(L => L.id === "cabaudio"), "il layer unico cabaudio non esiste piu'");
  eq(cin.active, true, "Input in lista anche a motore spento");
  eq(cin.engineOn, false, "motore spento");
  eq(cout.active, true, "Output in lista anche a motore spento");
  eq(el.active, true, "Power in lista");
  eq(reg.find(L => L.id === "mond").active, false, "P.M. situazionale: senza mixerini non compare (Q2-A)");
  A.add ? null : null;
  A.state.items.push({ id: "pm1", type: "mixp16", x: 100, y: 100, rot: 0, w: 40, d: 30 });
  ok(A.layerRegistry().find(L => L.id === "mond").active || !A.MON_DIG_NODE["mixp16"], "con un mixerino P.M. compare (se il tipo esiste)");
  A.state.items = [];
  A.state.cab.on = true; A.state.elec.on = true;
  const reg2 = A.layerRegistry();
  eq(reg2.find(L => L.id === "cabin").engineOn, true, "motore ingressi acceso");
  eq(reg2.find(L => L.id === "cabout").engineOn, true, "motore output acceso");
  ok(typeof cin.activate === "function" && typeof cout.activate === "function" && typeof el.activate === "function", "activate presenti");
});

t("D-L2A: cabConnectAll materializza la proposta (solo box reali, manuali intatti)", () => {
  reset();
  // stato costruito SENZA addItem (= progetto caricato: l'auto-connect non scatta sui load)
  A.state.items = [
    { id: "m1", type: "astamic", x: 200, y: 200, rot: 0, w: 30, d: 30, label: "Mic 1" },
    { id: "w1", type: "wedge", x: 300, y: 300, rot: 0, w: 50, d: 40, label: "Mon 1" },
    { id: "b1", type: "stagebox", x: 400, y: 200, rot: 0, w: 60, d: 40, label: "SB" }
  ];
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.state.cab.manual = {}; A.__cabRes = null;
  let R = A.cabResult(true);
  ok(R.pending.length >= 1, "in manuale l'ingresso è pending (" + R.pending.length + ")");
  ok(R.mixes.some(m => m.pending), "il mix monitor è pending");
  const n = A.cabConnectAll();
  ok(n >= 2, "collegati ingresso + mix (n=" + n + ")");
  R = A.cabResult(true);
  eq(R.pending.length, 0, "nessun ingresso pending dopo il collega-tutto");
  eq(R.mixes.filter(m => m.pending).length, 0, "nessun mix pending");
  eq(A.state.cab.mode, "manual", "il mode resta manual (override espliciti)");
  ok(R.links.some(l => l.box && !l.box.auto), "il cavo va su una box REALE");
  // idempotente: secondo giro non tocca nulla
  eq(A.cabConnectAll(), 0, "secondo giro: niente da collegare");
});

t("Layer v3: Palco = tutto, occhi in OR (viste)", () => {
  reset();
  add("vlnpost", 300, 300);      // musicista
  add("sedia", 500, 300);        // attrezzatura pura (nessun layer tecnico)
  const mic = add("astamic", 350, 300);   // sorgente (layer Ingressi)
  A.layerSoloUI = {}; A.layerAccOpen = null;
  A.stageLayerUI.vis = true; A.musLayerUI.vis = true; A.state.cab.on = false;
  let mk = A.sceneMarkup();
  ok(!/display="none"/.test(mk.split("layItems")[1] || mk), "Palco acceso: tutto visibile");
  // Palco acceso + Musicisti SPENTO: i musicisti restano (Palco = tutto — demo approvata)
  A.musLayerUI.vis = false;
  mk = A.sceneMarkup();
  ok(!/mus-item" display="none"/.test(mk), "Palco acceso mostra i musicisti anche con l'occhio Musicisti spento");
  A.musLayerUI.vis = true;
  // Palco SPENTO + solo Musicisti acceso: si vedono SOLO i musicisti
  A.stageLayerUI.vis = false; A.state.cab.on = false;
  mk = A.sceneMarkup();
  ok(!/mus-item" display="none"/.test(mk), "musicisti visibili col Palco spento");
  ok(/st-item" display="none"/.test(mk), "attrezzatura nascosta col Palco spento");
  // Palco SPENTO + Ingressi acceso: il mic (sorgente) si vede, la sedia no
  A.musLayerUI.vis = false; A.state.cab.on = true; A.state.cab.showInputs = true;
  mk = A.sceneMarkup();
  const chunks = mk.match(/<g class="st-item"[^>]*>/g) || [];
  ok(chunks.some(c => c.indexOf("display") < 0), "almeno un elemento tecnico (mic) visibile via Ingressi");
  ok(chunks.some(c => c.indexOf('display="none"') >= 0), "la sedia resta nascosta");
  A.musLayerUI.vis = true; A.stageLayerUI.vis = true;
  // fuoco Palco = vista d'insieme (tutto a fuoco)
  const v = A.state.items.find(x => x.type === "vlnpost");
  eq(A.layerFgItem("stage", v), true, "Palco contiene tutto (anche i musicisti)");
  // Ingressi = sorgenti + catena; Output = monitor
  eq(A.layerFgItem("cabin", mic), true, "mic = layer Ingressi");
  const w = add("wedge", 520, 320);
  eq(A.layerFgItem("cabout", w), true, "wedge = layer Output");
  eq(A.layerFgItem("cabin", w), false, "wedge NON è Ingressi");
  // niente slider opacità nel registro (resta solo la Planimetria)
  const withOp = A.layerRegistry().filter(L => L.opacity != null).map(L => L.id);
  eq(JSON.stringify(withOp), JSON.stringify(["venue"]), "opacità solo sulla Planimetria");
});

t("Layer v2: il cablaggio si CHIEDE (non nasce dall'inserimento) + stile cavi + pallini", () => {
  reset();
  A.state.cab.style = "curve";
  /* 28/07 (Simone): «non voglio che si colleghino in automatico — se inserisco una stage box si
     attiva il collegamento e vedo i cavi». Inserire non collega più: lo chiede la barra «Collega». */
  A.addItem("astamic", { x: 200, y: 200 });
  A.addItem("stagebox", { x: 400, y: 200 });
  A.__cabRes = null;
  eq(A.cabResult(true).links.length, 0, "inserire la box NON disegna cavi");
  cabla();
  let R = A.cabResult(true);
  eq(R.pending.length, 0, "dopo «Collega» l'ingresso è cablato");
  ok(R.links.some(l => l.box && !l.box.auto), "cavo su box reale");
  // una sorgente aggiunta DOPO resta libera finché non la si collega
  A.addItem("astamic", { x: 250, y: 250 });
  A.__cabRes = null;
  eq(A.cabResult(true).pending.length, 1, "la sorgente nuova resta da collegare");
  cabla();
  eq(A.cabResult(true).pending.length, 0, "«Collega» prende anche lei");
  // 2) stile cavi (28/07): diretto di default, segmentato = angoli retti. Niente più smussati.
  const pts = [[0, 0], [100, 0], [100, 80]];
  eq(A.cabDrawD([[0, 0], [100, 80]], pts), "M 0.0 0.0 L 100.0 80.0", "diretto: linea dritta sui punti grezzi");
  const seg = A.cabDrawD([[0, 0], [100, 80]], pts, "orto");
  eq(seg.indexOf("Q"), -1, "segmentato: angoli retti, nessuna curva");
  ok(seg.indexOf("L") > 0, "e resta una spezzata");
  // 3) canale alla partenza nel SOLO Ingressi + pallini sorgente sempre presenti
  A.layerSoloUI = { cabin: true };
  let mk = A.cablingMarkup();
  ok(mk.indexOf("cab-startlbl") >= 0, "solo Ingressi: etichetta canale alla partenza");
  ok(mk.indexOf("cab-srcdot") >= 0, "pallino sorgente sempre visibile");
  A.layerSoloUI = {};
  // 4) normalizeState sanifica lo stile: dal 28/07 tutto ciò che non è "orto" diventa diretto
  A.state.cab.style = "spazzatura";
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "dir", "stile non valido → diretto");
  A.state.cab.style = "loom";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "dir", "loom (vecchio) → diretto");
  /* il campo di lista resta sanificato ma non è più letto da nessuno: cabStyle() dice sempre "dir".
     "orto" è tornato un valore valido perché è lo stile del SINGOLO cavo segmentato. */
  eq(A.normCabStyle("orto"), "orto", "orto = segmentato, valore valido");
  eq(A.normCabStyle("curve"), "dir", "smussati non esistono più");
  A.state.cab.style = "dir";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "dir", "diretto preservato");
});

t("P.M.: connessione DIGITALE automatica all'hub, MAI ritorno analogico dalla box", () => {
  reset();
  add("stagebox", 500, 200);
  A.state.cab.on = true;
  const h = add("mixhub", 700, 300);       // hub (anche senza modello: pmIsHub)
  const m = add("hearback", 300, 300);     // mixerino
  pmCabla();                               // 28/07: l'aggancio si chiede, non nasce dall'inserimento
  const Rm = A.monDigEngine();
  ok((Rm.links || []).some(l => l.from.id === m.id && (l.to.id === h.id || l.toIsHub)), "mixerino → hub via Cat5 dopo la richiesta");
  const Rc = A.cabResult(true);
  ok(!(Rc.mixes || []).some(mx => (mx.sinks || []).some(sk => sk.id === m.id || sk.id === h.id)), "nessun mix ANALOGICO per i nodi digitali");
  ok(!(Rc.returnLinks || []).some(l => l.sink && (l.sink.id === m.id || l.sink.id === h.id)), "nessun ritorno analogico verso mixerino/hub");
  ok(!A.portDefs(m).some(p => p.kind === "mon"), "mixerino senza porta 'mon' (si collega solo in digitale)");
});

t("solo: S = isolamento (resto NASCOSTO), fuoco = fade 15%", () => {
  reset();
  add("vlnpost", 300, 300);   // musicista (nel solo Musicisti)
  add("sedia", 500, 300);     // contesto
  A.layerSoloUI = { mus: true }; A.layerSoloMode = "focus";
  let mk = A.sceneMarkup();
  ok(mk.indexOf("solo-bg") >= 0, "fuoco: il contesto c'è, sfumato");
  const nFocus = (mk.match(/class="item[ "]/g) || []).length;
  A.layerSoloMode = "iso";
  mk = A.sceneMarkup();
  ok(mk.indexOf("solo-bg") < 0, "S: nessun contesto sfumato");
  const nIso = (mk.match(/class="item[ "]/g) || []).length;
  ok(nIso < nFocus, "S: il contesto è proprio assente (" + nIso + " < " + nFocus + ")");
  ok(mk.indexOf("layStage") >= 0, "il perimetro del palco resta (il foglio)");
  A.layerSoloUI = {}; A.layerSoloMode = "focus";
});

t("layer tecnici: punti sezione + legenda + distribuzione omogenea tra box", () => {
  reset();
  // sezioni e colori stabili
  const v1 = add("vlnpost", 200, 200); v1.vsec = 1;
  const v2 = add("vlnpost", 260, 200); v2.vsec = 2;
  const bat = add("batteria", 400, 200);
  eq(A.sectionOf(v1), "Violini I"); eq(A.sectionOf(v2), "Violini II");
  ok(A.sectionOf(bat).length > 0, "la batteria ha una sezione");
  ok(A.sectionColor("Violini I") !== A.sectionColor("Viole"), "colori diversi per sezioni diverse");
  eq(A.sectionColor("Violini I"), A.sectionColor("Violini I"), "colore stabile");
  // nel solo Ingressi i musicisti diventano punti + compare la legenda
  A.state.cab.on = true;
  A.layerSoloUI = { cabin: true }; A.layerSoloMode = "iso";
  const mk = A.sceneMarkup();
  ok(mk.indexOf("secdot") >= 0, "musicisti come punti sezione");
  const leg = A.sectionLegendMarkup();
  ok(leg.indexOf("Violini I") >= 0 && leg.indexOf("Violini II") >= 0, "legenda con le sezioni presenti");
  A.layerSoloUI = {}; A.layerSoloMode = "focus";
  // distribuzione: 2 box quasi equidistanti → sorgenti spartite, non concentrate
  reset(); A.state.cab.on = true; A.state.cab.mode = "manual"; A.state.cab.manual = {};
  A.state.items = [
    { id: "bA", type: "stagebox", x: 300, y: 500, rot: 0, w: 60, d: 40 },
    { id: "bB", type: "stagebox", x: 360, y: 500, rot: 0, w: 60, d: 40 },
    { id: "m1", type: "astamic", x: 300, y: 200, rot: 0, w: 30, d: 30 },
    { id: "m2", type: "astamic", x: 320, y: 200, rot: 0, w: 30, d: 30 },
    { id: "m3", type: "astamic", x: 340, y: 200, rot: 0, w: 30, d: 30 },
    { id: "m4", type: "astamic", x: 360, y: 200, rot: 0, w: 30, d: 30 }
  ];
  A.__cabRes = null;
  A.cabConnectAll();
  const R = A.cabResult(true);
  const perBox = {}; R.links.forEach(l => { if (l.box) perBox[l.box.id] = (perBox[l.box.id] || 0) + 1; });
  ok((perBox.bA || 0) >= 1 && (perBox.bB || 0) >= 1, "collegamenti spartiti tra le box (" + JSON.stringify(perBox) + ")");
});

t("P.M. NON è nel layer Output (personal mixer digitali) + stili cavo per-layer", () => {
  reset();
  const hb = add("hearback", 300, 300);   // personal mixer
  const wd = add("wedge", 400, 300);       // monitor analogico
  const hub = add("mixhub", 500, 300);
  eq(A.layerFgItem("cabout", hb), false, "personal mixer NON in Output");
  eq(A.layerFgItem("cabout", wd), true, "wedge (monitor analogico) in Output");
  eq(A.layerFgItem("mond", hb), true, "personal mixer nel layer P.M.");
  eq(A.layerFgItem("mond", hub), true, "hub nel layer P.M.");
  // stili indipendenti per layer (2 stili: curve|dir)
  /* 28/07: lo stile non è più della lista ma del CAVO — le liste disegnano tutte diretto, e la
     forma si decide cavo per cavo col comando «Segmenta». */
  A.state.cab.style = "curve"; A.state.cab.styleOut = "curve"; A.state.mond.style = "dir"; A.state.elec.style = "curve";
  eq(A.cabStyle(), "dir", "Ingressi: diretto, qualunque cosa dica il vecchio state");
  eq(A.cabStyleOut(), "dir", "Output: diretto");
  eq(A.mondStyle(), "dir", "P.M.: diretto");
  eq(A.elecStyle(), "dir", "Corrente: diretto");
  A.state.cab.manual = { "k1": { seg: 1 }, "k2": {} };
  eq(A.cabStyleFor("k1"), "orto", "il cavo segmentato va ad angoli retti");
  eq(A.cabStyleFor("k2"), "dir", "gli altri restano diretti");
  eq(A.cabStyleFor("mai-visto"), "dir", "e un cavo senza override pure");
  A.state.elec.manual = { "e1": { seg: 1 } }; A.state.mond.manual = { "m1": { seg: 1 } };
  eq(A.elecStyleFor("e1"), "orto", "vale anche per la corrente");
  eq(A.mondStyleFor("m1"), "orto", "e per i personal monitor");
  // normalize preserva/sanifica (orto/loom vecchi → smussati)
  A.state.cab.styleOut = "loom"; A.state.mond.style = "spazzatura"; A.state.elec.style = "dir";
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.styleOut, "dir", "styleOut loom → diretto (i progetti vecchi si appiattiscono)");
  eq(A.state.mond.style, "dir", "mond style non valido → diretto");
  eq(A.state.elec.style, "dir", "elec style valido preservato");
});

t("P.M.: un hub generico regge max 8 mixerini (capienza rispettata dall'auto-connect)", () => {
  reset();
  const hub = add("mixhub", 900, 300);   // hub generico → cap 8
  for (let i = 0; i < 10; i++) add("hearback", 100 + i * 40, 300);   // 10 mixerini generici
  pmCabla();   // 28/07: l'aggancio si chiede — poi l'hub NON deve sovraccaricarsi
  let R = A.monDigEngine();
  eq((R.hubLoad || {})[hub.id], 8, "l'hub si ferma a 8 (capienza)");
  eq(R.pending.length, 2, "i 2 eccedenti restano pendenti");
  ok(!R.issues.some(i => i.lvl === "err" && /porte di/.test(i.msg)), "nessun errore di over-capacità");
  // un secondo hub raccoglie gli eccedenti
  A.add ? null : null;
  const hub2 = add("mixhub", 200, 300);
  pmCabla();   // 28/07: anche il secondo hub raccoglie i pendenti solo se glielo si chiede
  R = A.monDigEngine();
  eq(R.pending.length, 0, "col secondo hub, dopo la richiesta, sono tutti collegati");
  ok(((R.hubLoad || {})[hub2.id] || 0) >= 2, "il secondo hub prende gli eccedenti");
});

t("vista cablaggio: senza vista la tavola e' completa, con la vista e' un filtro; Power = carichi a pallini", () => {
  reset();
  add("astamic", 300, 300);
  add("stagebox", 600, 400);
  add("comboamp", 200, 300);      // carico (ampli)
  add("distro32", 250, 480);
  A.state.cab.on = true; A.state.elec.on = true; A.__cabRes = null; A.__elecRes = null;
  cabla(); A.elecConnectAll(); A.__elecRes = null;   // 28/07: il cablaggio si chiede
  A.__cabStatic = false;   // nel sandbox window.__cabStatic è uno stub truthy: nel browser è falsy (export PDF a parte)
  /* 25/07: nessuna vista selezionata = TAVOLA COMPLETA (prima era "plot pulito senza cavi") */
  A.layerSoloUI = {}; A.layerAccOpen = null;
  let mk = A.cablingMarkup();
  ok(mk.indexOf("cab-line") >= 0, "senza vista selezionata i cavi Input devono vedersi");
  ok(A.elecMarkup().indexOf("elec-line") >= 0 || A.elecMarkup() !== "", "senza vista selezionata i cavi Power devono vedersi");
  /* una vista attiva su un ALTRO layer torna a filtrare */
  A.layerSoloUI = { elec: true };
  ok(A.cablingMarkup().indexOf("cab-line") < 0, "vista Power attiva: i cavi Input si tolgono di mezzo");
  A.layerSoloUI = { cabin: true };
  eq(A.elecMarkup(), "", "vista Input attiva: i cavi Power si tolgono di mezzo");
  /* l'occhio resta l'altro asse: chiuso, nasconde anche in vista completa */
  A.layerSoloUI = {}; A.state.cab.showInputs = false;
  ok(A.cablingMarkup().indexOf("cab-line") < 0, "occhio Input chiuso: niente cavi neanche in vista completa");
  A.state.cab.showInputs = true;
  // solo Input → cavi + pallino box
  A.layerSoloUI = { cabin: true };
  mk = A.cablingMarkup();
  ok(mk.indexOf("cab-line") >= 0, "cavi Input col layer selezionato");
  ok(mk.indexOf("cab-boxdot") >= 0, "pallino al centro della stage box");
  // solo Power → carichi come pallini sezione + legenda
  A.layerSoloUI = { elec: true };
  const amp = A.state.items.find(x => x.type === "comboamp");
  eq(A.techDotItem(amp, "elec"), true, "l'ampli (carico) diventa un pallino in Power");
  eq(A.techDotItem(A.state.items.find(x => x.type === "distro32"), "elec"), false, "il distro resta un dispositivo, non un pallino");
  const scene = A.sceneMarkup();
  ok(scene.indexOf("secdot") >= 0, "pallini nel layer Power");
  ok(A.sectionLegendMarkup().length > 0, "legenda Power");
  A.layerSoloUI = {};
});

t("Input: N pallini per musicista (postazione doppia = 2) + zona dal punto mic", () => {
  reset();
  const d = add("vlnpost", 400, 250); d.doppia = true; d.label = "Violini I"; d.label2 = "Violini I b";
  eq(A.cabItemInputs(d).length, 2, "la doppia genera 2 canali");
  eq(A.musicianSeats(d).length, 2, "2 sedute (2 musicisti)");
  const single = add("vlnpost", 600, 250);
  eq(A.musicianSeats(single).length, 1, "postazione singola = 1 seduta");
  cabla();   // 28/07: i pallini di partenza esistono sui cavi, che ora si chiedono
  A.layerSoloUI = { cabin: true };
  const dot = A.sectionDotMarkup(d);
  eq((dot.match(/secdot-c/g) || []).length, 2, "2 pallini sezione per la doppia");
  ok(dot.indexOf("Violini I b") >= 0, "il 2° musicista ha il suo nome");
  A.layerSoloUI = {};
  // zona: il cavo parte dal punto del microfono
  reset(); A.state.cab.on = true;
  add("stagebox", 800, 500);
  const z = add("miczone", 400, 250); z.pts = [[-50, -50], [50, -50], [50, 50], [-50, 50]];
  cabla();
  const R = A.audioCablingEngine();
  const zl = R.links.find(l => l.s.it.id === z.id);
  ok(zl, "la zona genera un canale");
  const anchor = A.portAnchor(z, "audio");
  ok(Math.abs(zl.pts[0][0] - anchor[0]) < 2 && Math.abs(zl.pts[0][1] - anchor[1]) < 2, "il cavo della zona parte dal punto mic");
});

/* ---- Ricerca catalogo: alias, normalizzazione, priorità, no-duplicati ---- */
console.log("\nRicerca catalogo (alias / normalizzazione):");
function searchKeys(q) { return (A.__spSearch ? A.__spSearch(q) : []).map(function (r) { return r.k; }); }
t("__spSearch esposto dal catalogo", () => { ok(typeof A.__spSearch === "function", "window.__spSearch mancante"); });
t("'tastiera' → tastiera singola + doppia", () => {
  const keys = searchKeys("tastiera");
  ok(keys.indexOf("tastiera") > -1, "manca la tastiera singola");
  ok(keys.indexOf("doppiatastiera") > -1, "manca la doppia tastiera");
});
t("la tastiera singola è un tipo reale e usabile", () => { ok(A.TYPES.tastiera && A.TYPES.tastiera.catalog !== false, "TYPES.tastiera assente o non nel catalogo"); });
t("'coro' → persone (corista) + dispositivi (mic/pedana coro)", () => {
  const keys = searchKeys("coro");
  ok(keys.indexOf("corista") > -1, "manca il corista");
  ok(keys.indexOf("micchoir") > -1 || keys.indexOf("pedanacoro") > -1, "manca un dispositivo del coro");
});
t("'voce' trova il cantante/corista", () => { ok(searchKeys("voce").indexOf("corista") > -1); });
t("'cantante' trova il corista", () => { ok(searchKeys("cantante").indexOf("corista") > -1); });
t("'singer' (inglese) trova il cantante/corista", () => { ok(searchKeys("singer").indexOf("corista") > -1); });
t("case-insensitive: 'TASTIERA' = 'tastiera'", () => { eq(searchKeys("TASTIERA").sort(), searchKeys("tastiera").sort()); });
t("normalizzazione accenti (_deacc riusato)", () => { eq(A._deacc("À la Séance"), "a la seance"); });
t("nessun duplicato nei risultati (k|nome unico per query)", () => {
  const seen = {}; A.__spSearch("mic").forEach(function (r) { const id = (r.k || "") + "|" + r.nome; ok(!seen[id], "duplicato: " + id); seen[id] = 1; });
});
t("priorità al nome: 'tastiera' → il primo risultato matcha sul nome", () => {
  const res = A.__spSearch("tastiera"); ok(res.length > 0);
  ok(A._deacc(res[0].nome).indexOf("tastiera") > -1, "il primo non matcha sul nome: " + res[0].nome);
});
t("query vuota → nessun risultato", () => { eq(A.__spSearch("").length, 0); eq(A.__spSearch("   ").length, 0); });

/* ---- Quick-add (doppio click sul palco): stessi alias della barra del catalogo ----
   Regressione 24/07: la ricerca rapida filtrava solo su nome e chiave del tipo, quindi "cantante",
   "voce", "singer", "frontman" trovavano l'elemento nella colonna sinistra e NIENTE col doppio click. */
console.log("\nRicerca rapida quick-add (parità con il catalogo):");
function qaKeys(q) { return (A.__qaSearch ? A.__qaSearch(q) : []).map(function (r) { return r.k; }); }
t("__qaSearch esposto (gemella di __spSearch)", () => { ok(typeof A.__qaSearch === "function", "window.__qaSearch mancante"); });
t("i sinonimi delle voci trovano la persona (uomo/donna)", () => {
  ["cantante", "cantanti", "voce", "voci", "solista", "corista", "coriste", "singer", "vocalist", "frontman", "coro"].forEach(function (q) {
    const r = A.__qaSearch(q);
    ok(r.some(x => x.k === "corista"), "'" + q + "' non trova la persona nel quick-add: " + JSON.stringify(r.map(x => x.nome)));
  });
});
t("alias inglesi e di categoria: 'keyboard' → tastiera", () => { ok(qaKeys("keyboard").indexOf("tastiera") > -1); });
t("parità catalogo/quick-add sugli alias del corista", () => {
  (A.TYPES.corista.alias || "").split(/\s+/).filter(Boolean).forEach(function (w) {
    if (searchKeys(w).indexOf("corista") > -1) ok(qaKeys(w).indexOf("corista") > -1, "alias solo nella colonna sinistra: " + w);
  });
});
t("non regredisce: nome, chiave tecnica e voci-azione", () => {
  ok(qaKeys("wedge").indexOf("wedge") > -1, "la chiave tecnica non trova più il wedge");
  ok(A.__qaSearch("violino").some(x => x.nome === "Violino I"), "manca Violino I");
  ok(!A.__qaSearch("audit").some(x => x.nome === "Audit progetto"), "il quick-add non deve suggerire le azioni (noQuick)");
});
/* Il quick-add taglia a 8: un match sulla sola CATEGORIA non deve scavalcare chi ha quella parola
   come nome/chiave/alias, o l'elemento cercato esce dalla lista e Invio ne inserisce un altro. */
t("match forte (nome/chiave/alias) prima del match di sola categoria", () => {
  ok(qaKeys("stagebox").indexOf("stagebox") > -1, "'stagebox' non trova piu' gli Stage box 8/16/24");
  ok(qaKeys("percussioni").indexOf("percussioni") > -1, "'percussioni' perde l'elemento con quella chiave");
  ok(qaKeys("console").indexOf("organoconsole") > -1, "'console' perde la consolle dell'organo");
  ok(qaKeys("mic").indexOf("micover") > -1, "'mic' perde l'overhead di sezione");
  ok(qaKeys("console").indexOf("mixer") === 0, "'console' non mette per primo la console/mixer");
});
t("le 3 varianti di stage box restano tutte raggiungibili con una parola sola", () => {
  const nomi = A.__qaSearch("stagebox").map(r => r.nome);
  ["Stage box 8", "Stage box 16", "Stage box 24"].forEach(n => ok(nomi.indexOf(n) > -1, "manca " + n));
});
t("ranking: il nome batte l'alias ('tastiera' → Tastiera prima)", () => {
  const r = A.__qaSearch("tastiera"); ok(r.length > 0);
  ok(A._deacc(r[0].nome).indexOf("tastiera") > -1, "primo risultato non sul nome: " + r[0].nome);
});
t("query vuota → nessun risultato", () => { eq(A.__qaSearch("").length, 0); eq(A.__qaSearch("   ").length, 0); });
t("max 8 suggerimenti", () => { ok(A.__qaSearch("a").length <= 8); });

/* ---- Adatta (fit): il palco E le scritte FONDO PALCO / PUBBLICO sempre dentro la vista ----
   Le scritte sono <text> in coordinate palco disegnate fuori dal rettangolo: nessuno le contava, e
   su palchi piccoli il margine proporzionale non bastava. Qui si simula l'area centrale reale
   (colonne larghe = canvas stretto) e si verifica che il viewBox le contenga davvero. */
console.log("\nAdatta / fit-to-view:");
function withCanvas(w, h, fn) {   /* svg e render sono stub: interessa solo il vb calcolato */
  const svg0 = A.svg, render0 = A.render, mob0 = A.isMobile;
  A.svg = { clientWidth: w, clientHeight: h, setAttribute() {}, getAttribute: () => "", style: {} };
  A.render = function () {};
  A.isMobile = () => w < 880;
  try { return fn(); } finally { A.svg = svg0; A.render = render0; A.isMobile = mob0; }
}
const CANVAS = [["due colonne larghe", 480, 700], ["una colonna", 820, 700], ["senza colonne", 1400, 700],
  ["finestra bassa", 1200, 320], ["finestra stretta e alta", 360, 900], ["mobile", 390, 620]];
t("contentBounds include le scritte del palco (sopra e sotto)", () => {
  reset(); A.applyStageSize(4, 3, false);   /* palco piccolo: e' il caso che si tagliava */
  const b = A.contentBounds(), d = A.stageDecorBounds();
  ok(b.y0 <= -55, "il bordo alto non copre FONDO PALCO: " + b.y0);
  ok(b.y1 >= A.state.stage.d + 41, "il bordo basso non copre PUBBLICO: " + b.y1);
  ok(b.x0 <= d.x0 && b.x1 >= d.x1, "quote laterali fuori dal riquadro");
});
t("Adatta: scritte dentro la vista con qualunque larghezza dell'area centrale", () => {
  [[4, 3], [8, 6], [12, 8], [20, 12]].forEach(([wm, dm]) => {
    reset(); A.applyStageSize(wm, dm, false);
    const d = A.stageDecorBounds();
    CANVAS.forEach(([nome, cw, ch]) => {
      withCanvas(cw, ch, () => A.fit());
      const v = A.vb;
      ok(v.x <= d.x0 && v.x + v.w >= d.x1, `palco ${wm}x${dm} · ${nome}: scritte fuori in orizzontale`);
      ok(v.y <= d.y0 && v.y + v.h >= d.y1, `palco ${wm}x${dm} · ${nome}: FONDO PALCO/PUBBLICO tagliati (vb.y=${v.y.toFixed(0)}, serve ${d.y0})`);
    });
  });
});
t("Adatta: margine di sicurezza reale attorno al contenuto", () => {
  reset(); A.applyStageSize(4, 3, false);
  const d = A.stageDecorBounds();
  withCanvas(1000, 700, () => A.fit());
  ok(A.vb.y <= d.y0 - 30, "meno di 30 cm d'aria sopra le scritte");
  ok(A.vb.y + A.vb.h >= d.y1 + 30, "meno di 30 cm d'aria sotto le scritte");
});
t("Adatta: gli elementi fuori dal palco restano dentro la vista", () => {
  reset(); A.applyStageSize(6, 4, false);
  add("wedge", -200, -300); add("wedge", A.state.stage.w + 250, A.state.stage.d + 200);
  const b = A.contentBounds();
  withCanvas(900, 700, () => A.fit());
  ok(A.vb.x <= b.x0 && A.vb.x + A.vb.w >= b.x1 && A.vb.y <= b.y0 && A.vb.y + A.vb.h >= b.y1, "contenuto fuori palco tagliato");
});
t("Adatta include le ancore dei cablaggi disegnate fuori dal palco", () => {
  reset(); A.applyStageSize(8, 6, false);
  const senza = A.contentBounds();
  A.state.cab.on = true; A.state.cab.home = { kind: "foh" };          // punto principale in sala: D+120
  A.state.elec.on = true; A.state.elec.supply = { kind: "rete", x: 0, y: 0 };  // arrivo corrente: D+108
  A.layerSoloUI = {}; A.__cabRes = null; A.__elecRes = null;
  const con = A.contentBounds();
  ok(con.y1 > senza.y1, "il riquadro non si allarga per le ancore sotto il palco");
  ok(con.y1 >= A.state.stage.d + 120, "il punto principale audio (FOH) resta fuori: " + con.y1);
  A.state.cab.on = false; A.state.elec.on = false; A.state.cab.home = null;
});
t("fitStage (nuovo palco) include anch'esso le scritte", () => {
  reset(); A.applyStageSize(5, 4, false);
  const d = A.stageDecorBounds();
  withCanvas(700, 700, () => A.fitStage());
  ok(A.vb.y <= d.y0 && A.vb.y + A.vb.h >= d.y1, "fitStage taglia le scritte");
});

/* ---- Sigle delle input list: un fonico digita "gtr", non "chitarra" ---- */
console.log("\nSigle da rider (gtr, bd, sn, kys…):");
t("le sigle trovano l'elemento giusto, su entrambe le ricerche", () => {
  const casi = { gtr: /chitarra/i, gt: /chitarra/i, bs: /basso/i, kb: /tastier|keys|piano/i, kys: /tastier|keys|piano/i,
    pno: /piano/i, vox: /donna|uomo/i, bgv: /donna|uomo/i, bd: /batteria|cassa/i, sn: /batteria|rullante/i,
    snr: /batteria|rullante/i, hh: /batteria/i, ft: /batteria/i, oh: /batteria|overhead/i, cym: /batteria|piatt/i,
    mons: /iem|wedge|monitor|personal/i, cans: /cuffie/i, casse: /array|fill|sub/i, tpt: /tromba/i, tbn: /trombone/i,
    hrn: /corno/i, tba: /tuba/i, fg: /fagotto/i, vla: /viola/i, vc: /violoncello/i, db: /contrabbasso/i,
    harp: /arpa/i, lx: /luci|par|dimmer|testa|sagoma/i, tb: /talkback/i };
  Object.keys(casi).forEach(q => {
    const qa = A.__qaSearch(q).map(r => r.nome), sp = A.__spSearch(q).map(r => r.nome);
    ok(qa.length && sp.length, "'" + q + "' non trova nulla");
    ok(qa.some(n => casi[q].test(n)), "quick-add, '" + q + "': " + JSON.stringify(qa.slice(0, 3)));
    ok(sp.some(n => casi[q].test(n)), "catalogo, '" + q + "': " + JSON.stringify(sp.slice(0, 3)));
  });
});
t("le sigle corte non pescano l'elemento sbagliato", () => {
  /* trappole trovate in fase di verifica: "kbd" faceva uscire le tastiere su "bd" (bass drum),
     "bsn" faceva uscire il fagotto su "sn" (snare). Quelle abbreviazioni sono state scartate. */
  ok(!/tastiera|keys|midi/i.test(A.__qaSearch("bd")[0].nome), "'bd' deve dare la batteria, non le tastiere");
  ok(!/fagotto/i.test(A.__qaSearch("sn")[0].nome), "'sn' deve dare il rullante, non il fagotto");
  ok(!/fagotto/i.test(A.__qaSearch("bs")[0].nome), "'bs' deve dare il basso, non il fagotto");
  ok(A.__qaSearch("pian").every(r => !/array|front fill|sub 2/i.test(r.nome)), "'pian' non deve pescare l'impianto");
});
t("le due ricerche ordinano allo stesso modo", () => {
  ["gtr", "kb", "tb", "mons", "vox", "batteria", "wedge", "cantante"].forEach(q => {
    const a = A.__qaSearch(q)[0], b = A.__spSearch(q)[0];
    ok(a && b, "'" + q + "' vuoto su una delle due");
    eq(a.nome, b.nome, "primo risultato diverso per '" + q + "'");
  });
});
t("la chiave tecnica si cerca anche dalla barra del catalogo", () => {
  ok(A.__spSearch("wedge").some(r => r.k === "wedge"));
  ok(A.__spSearch("micover").length > 0, "prima la chiave tecnica non era indicizzata nella barra");
});

/* ---- Quick-add: campo di ricerca e risultati con l'anteprima dell'elemento (variante B) ---- */
console.log("\nQuick-add (anteprime):");
t("il campo di ricerca dice ai gestori di password di stare alla larga", () => {
  ["data-lpignore", "data-1p-ignore", 'autocomplete","off"'].forEach(a =>
    ok(appjs.indexOf(a) > -1, "manca l'attributo anti-autofill: " + a));
});
t("le miniature dei risultati sono quelle del catalogo, in cache", () => {
  const e = { k: "wedge", nome: "Wedge monitor" };
  const a = A.qaIcon(e), b = A.qaIcon(e);
  ok(a && a.indexOf("<svg") > -1, "manca la miniatura");
  ok(a === b, "la seconda chiamata deve arrivare dalla cache");
  eq(A.qaIcon({ nome: "Azione senza tipo" }), "", "le voci senza tipo non hanno miniatura");
});

/* ---- Pedane: elementi come gli altri (27/07). Palco e pedane sono due cose diverse: il palco è la
   superficie, la pedana è un oggetto che ci si appoggia sopra e si lavora senza entrare in modalità. ---- */
console.log("\nPedane come elementi normali:");
t("la pedana si prende e si modifica sempre, senza modalita'", () => {
  reset(); A.stageEdit = false;
  const ped = add("pedana", 500, 300);
  ok(A.isRiser(ped), "resta un riser: continua a portarsi dietro chi ci sta sopra");
  ok(A.riserEditable(ped), "modificabile fuori dalla modalita' palco");
  ok(A.itemPickable(ped), "e selezionabile");
  A.stageEdit = true;
  try { ok(A.riserEditable(ped), "e anche dentro"); } finally { A.stageEdit = false; }
});
t("la pedana si allunga e si ruota come gli altri elementi", () => {
  reset();
  eq(A.TYPES.pedana.resizable, true, "maniglie di ridimensionamento");
  const ped = add("pedana", 500, 300);
  ped.w = 400; ped.d = 250; ped.rot = 45; ped.h = 60;
  eq([ped.w, ped.d, ped.rot, ped.h].join(","), "400,250,45,60", "misure, rotazione e altezza sono sue");
});
t("una pedana in un gruppo si muove con gli altri, come ogni elemento", () => {
  reset(); A.stageEdit = false;
  const ped = add("pedana", 500, 300), sedia = add("sedia", 480, 290);
  ped.grp = sedia.grp = "g1";
  eq([ped, sedia].filter(A.riserEditable).length, 2, "nessuno dei due e' bloccato");
});
t("il lucchetto ferma la pedana dov'e'", () => {
  reset();
  const ped = add("pedana", 500, 300);
  ok(A.riserEditable(ped), "aperta si muove");
  ped.locked = true;
  eq(A.riserEditable(ped), false, "col lucchetto chiuso non si sposta, non si allunga, non ruota");
  delete ped.locked;
  ok(A.riserEditable(ped), "riaperta torna a muoversi");
  ok(appjs.indexOf('class="lock-handle') > -1, "il lucchetto si disegna accanto alla maniglia di rotazione");
  ok(appjs.indexOf("openQuickAdd(svgPoint(e)") > -1, "col lucchetto chiuso il doppio clic apre la ricerca rapida");
});
/* Aspetto della pedana bloccata (variante A, Simone 27/07): attenuandola si confondeva col palco. */
t("la pedana bloccata si riconosce: perimetro marcato e lucchettino", () => {
  reset();
  const libera = A.TYPES.pedana.draw({ w: 200, d: 100 });
  const chiusa = A.TYPES.pedana.draw({ w: 200, d: 100, locked: true });
  eq(libera.indexOf("riser-fixed"), -1, "libera: perimetro normale");
  eq(libera.indexOf("riser-lock"), -1, "libera: nessun lucchetto sul disegno");
  ok(chiusa.indexOf("riser-fixed") > -1, "bloccata: perimetro marcato");
  ok(chiusa.indexOf("riser-lock") > -1, "bloccata: lucchettino nell'angolo");
  ok(stylesCss.indexOf(".ic.riser-fixed{stroke-width:3.6}") > -1, "il bordo piu' spesso arriva dal CSS");
  eq(stylesCss.indexOf(".riser-item.locked .item{opacity:.85}"), -1, "niente piu' trasparenza: si confondeva col palco");
  const piccola = A.TYPES.pedana.draw({ w: 60, d: 40, locked: true });
  ok(piccola.indexOf("riser-fixed") > -1, "anche la piccola ha il perimetro marcato");
  eq(piccola.indexOf("riser-lock"), -1, "sotto i 70x50 cm il lucchetto starebbe addosso all'angolo: si tace");
});
/* PIÈ DI PAGINA DEL PDF (27/07): i numeri che servono a chi allestisce, contati dagli elementi veri. */
t("il cartiglio riassume canali, leggii, sedute, personal mixer e ascolti", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  eq(A.pdfTotals().length, 0, "palco vuoto: niente riga");
  add("stagebox", 900, 100);
  add("corista", 200, 300); add("corista", 300, 300);
  add("hearback", 500, 400); add("mixhub", 600, 400);
  add("wedge", 400, 500); add("leggio", 700, 300); add("sedia", 750, 300);
  A.__cabRes = null;
  const t2 = A.pdfTotals().join(" · ");
  ok(/\d+ canali/.test(t2), "canali: " + t2);
  ok(/leggii|leggio/.test(t2), "leggii: " + t2);
  ok(/sedut/.test(t2), "sedute: " + t2);
  ok(/1 personal mixer \(1 hub\)/.test(t2), "personal mixer con l'hub: " + t2);
  ok(/1 spia/.test(t2), "spie al singolare: " + t2);
});
t("una postazione doppia conta due sedute e un leggio solo", () => {
  reset();
  const d = add("vln1x2", 300, 300);
  const tot = A.pdfTotals().join(" · ");
  ok(/2 sedute/.test(tot), "due musicisti, due sedie: " + tot);
  ok(/1 leggio\b/.test(tot), "ma un leggio in due: " + tot);
});
t("il cartiglio si alza quando c'e' la riga dei totali", () => {
  reset();
  const vuoto = A.cartHFor("", "a4", "landscape");
  add("leggio", 300, 300);
  const pieno = A.cartHFor("", "a4", "landscape");
  ok(pieno > vuoto, "va contata, o la scala automatica sceglie una scala che poi non entra");
});
t("il costruttore lavora SOLO la forma del palco", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  eq(/id="bAddPedana"/.test(html), false, "«+ Pedana» non deve stare nel costruttore");
  ok(/id="bAddBlock"/.test(html) && /id="bAddSemi"/.test(html), "blocchi e semicerchio restano");
  ok((A.__catEntries || []).some(e => e.k === "pedana"), "la pedana si prende dal catalogo");
});

/* ---- Aste microfoniche: conteggio con le regole vere, non "un mic = un'asta" ----
   Nei rider reali le aste di batteria/ampli non si disegnano: si conta quante ne servono. */
console.log("\nAste microfoniche (conteggio):");
t("la batteria non produce un'asta per microfono: i tom vanno a clip", () => {
  reset();
  const dr = add("batteria", 500, 300);
  eq(A.cabItemInputs(dr).length, 8, "il kit di riferimento e' a 8 canali");
  const n = A.standNeeds();
  eq(n.giraffa.tot, 3, "hi-hat + 2 overhead vogliono una giraffa ciascuno");
  eq(n.bassa.tot, 2, "cassa e rullante top vanno su asta bassa");
  eq(n.clip.tot, 3, "rullante btm e i due tom vanno a clip, non su asta");
  eq(A.standTotal(n), 5, "8 canali di batteria = 5 aste vere, non 8");
});
t("microfonazione ridotta e soli overhead: le aste calano di conseguenza", () => {
  reset();
  const dr = add("batteria", 500, 300);
  dr.miking = "reduced";
  eq(A.standTotal(A.standNeeds()), 4, "kick + rullante + 2 OH");
  dr.miking = "oh";
  eq(A.standTotal(A.standNeeds()), 2, "solo i due overhead");
});
t("gli strumenti in DI non chiedono aste", () => {
  reset();
  add("stagepiano", 300, 300); add("bassstand", 500, 300); add("laptop", 700, 300);
  eq(A.standTotal(A.standNeeds()), 0, "DI e strumenti in linea non hanno supporti");
});
t("le voci contano l'asta che hanno gia' disegnata, senza doppiarla", () => {
  reset();
  const v = add("cantante", 400, 400); v.micMode = "tonda";
  let n = A.standNeeds();
  eq(n.dritta.tot, 1, "il cantante con asta tonda vale un'asta dritta");
  eq(n.dritta.gia, 1, "ed e' gia' disegnata nell'icona, non e' da aggiungere");
  v.micMode = "giraffa"; n = A.standNeeds();
  eq(n.giraffa.tot, 1); eq(n.dritta.tot, 0);
  v.micMode = "mano"; eq(A.standTotal(A.standNeeds()), 0, "col palmare non serve asta");
});
t("un'asta messa a mano dal catalogo si conta una volta sola", () => {
  reset();
  add("astamic", 300, 300); add("giraffa", 500, 300); add("astabassa", 700, 300);
  const n = A.standNeeds();
  eq(A.standTotal(n), 3, "tre oggetti asta = tre aste");
  eq(n.dritta.gia + n.giraffa.gia + n.bassa.gia, 3, "sono tutte gia' sul palco");
  eq(n.dritta.dedotte + n.giraffa.dedotte + n.bassa.dedotte, 0, "il loro canale non deve dedurne un'altra");
});
t("il vocabolario dei supporti e' uno solo (niente inglese contro italiano)", () => {
  const generati = new Set(Object.values(A.MIC_DEFAULTS).map(d => d.stand).filter(Boolean));
  generati.forEach(v => ok(A.standKindOf(Object.keys(A.MIC_DEFAULTS).find(k => A.MIC_DEFAULTS[k].stand === v)) !== undefined,
    "valore non classificabile: " + v));
  ok(A.STAND_SUGGEST.indexOf("asta giraffa") > -1 && A.STAND_SUGGEST.indexOf("tall boom") === -1,
    "il datalist deve usare lo stesso vocabolario dei valori generati");
});

/* ---- DI: un'opzione del pannello diventa un oggetto sul palco, e una tappa del cavo ----
   Prima scegliere "DI" cambiava solo l'etichetta del canale: nessuna scatoletta, nessun passaggio. */
console.log("\nDI come oggetto e nodo della catena:");
/* Il collegamento non è più automatico all'inserimento (Simone 28/07): i test che verificano i CAVI
   devono chiederlo, come fa l'utente con la barra «Collega». */
t("canali riservati: righe vere nella lista, con numero e patch", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16; box.outCh = 8;
  const m1 = add("astamic", 300, 400), m2 = add("astamic", 400, 400);
  cabla();
  const base = A.patchList().rows;
  eq(base.length, 2, "senza riservate: solo le due sorgenti");
  // riservo la porta 2: diventa una RIGA, in mezzo, e la seconda sorgente scala al numero 3
  box.sbRes = [2]; A.__cabRes = null;
  const pl = A.patchList(), rows = pl.rows;
  eq(rows.length, 3, "la riservata è una riga della lista");
  const res = rows.filter(r => r.reserved);
  eq(res.length, 1, "una sola riga riservata");
  eq(res[0].port, 2, "la riga porta il numero di porta riservato");
  eq(res[0].name, "", "nessuna sorgente sulla riga riservata");
  ok(/2$/.test(res[0].patch), "la patch indica la porta: " + res[0].patch);
  eq(rows[1].reserved, true, "sta al posto della porta, non in coda");
  eq(rows.map(r => r.n).join(","), "1,2,3", "rinumerazione coerente 1..N");
  ok(rows[2].port > 2, "la sorgente dopo la riservata sta su una porta successiva");
  // liberandola la lista torna com'era
  A.cabFreePort(box.id, 2); A.__cabRes = null;
  eq(A.patchList().rows.length, 2, "liberata: la riga sparisce");
  ok(!box.sbRes, "sbRes ripulito quando resta vuoto");
});

t("canali riservati: non contano come «da collegare» e finiscono in CSV/PDF", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16; box.outCh = 8;
  add("astamic", 300, 400);
  cabla();
  box.sbRes = [3, 5]; A.__cabRes = null;
  const rows = A.patchList().rows;
  eq(rows.filter(r => r.reserved).length, 2, "due riservate");
  eq(rows.filter(r => !r.spare && !r.reserved && !r.box).length, 0, "nessun canale risulta da collegare");
  const csv = A.channelListCsv({ format: "excel-it" }).csv;
  eq((csv.match(/RISERVATO/g) || []).length, 2, "le riservate sono esplicite nel CSV");
  const ah = A.channelListCsv({ format: "ah" }).csv;
  ok(ah.includes("SPARE"), "nel formato A&H il canale riservato è uno SPARE");
});

t("CSV: con più box il numero di canale è quello FOH, come nel pannello e nel PDF", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const b1 = add("stagebox", 200, 150); b1.ch = 16; b1.outCh = 8; b1.sbId = 1;
  const b2 = add("stagebox", 900, 150); b2.ch = 16; b2.outCh = 8; b2.sbId = 2;
  add("astamic", 200, 400); const far = add("astamic", 900, 400);
  cabla();
  const pl = A.patchList();
  eq(pl.hasFoh, true, "due box con ID");
  const rFar = pl.rows.find(r => r.itemId === far.id);
  ok(rFar.foh > 16, "la sorgente sulla seconda box sta oltre il canale 16: " + rFar.foh);
  const righe = A.channelListCsv({ format: "excel-it" }).csv.split("\n").filter(Boolean);
  const suaRiga = righe.find(l => l.includes(rFar.name));
  eq(suaRiga.split(";")[0], String(rFar.foh), "nel CSV il numero è il canale FOH, non l'indice di riga");
});

t("canali riservati: con più box seguono la numerazione FOH continua", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const b1 = add("stagebox", 200, 150); b1.ch = 16; b1.outCh = 8; b1.sbId = 1;
  const b2 = add("stagebox", 900, 150); b2.ch = 16; b2.outCh = 8; b2.sbId = 2;
  add("astamic", 200, 400); add("astamic", 900, 400);
  cabla();
  b2.sbRes = [4]; A.__cabRes = null;
  const pl = A.patchList();
  eq(pl.hasFoh, true, "due box con ID → numerazione FOH");
  const res = pl.rows.filter(r => r.reserved)[0];
  eq(res.foh, 20, "porta 4 della seconda box = FOH 20 (16+4)");
});

function cabla() { A.__cabRes = null; A.cabConnectAll(); A.__cabRes = null; }
function pmCabla() { A.__mondRes = null; try { A.pmAutoConnect(); } catch (e) {} A.pmAutoConnectBasic(); A.__mondRes = null; }
function diSetup() {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16; box.outCh = 8;
  const gtr = add("musChitClassica", 300, 400);
  cabla();
  return { box, gtr };
}
t("scegliere DI crea la scatoletta accanto allo strumento, legata a lui", () => {
  const { gtr } = diSetup();
  ok(!A.diLinked(gtr), "non deve esistere prima");
  gtr.miking = "di"; const di = A.diApply(gtr);
  ok(di && di.type === "dimono", "nessuna DI creata");
  eq(di.diFor, gtr.id, "la DI non e' legata allo strumento");
  eq(gtr.diId, di.id, "lo strumento non conosce la sua DI");
  ok(Math.hypot(di.x - gtr.x, di.y - gtr.y) < 120, "la DI deve nascere ACCANTO allo strumento: " + [di.x, di.y]);
  ok(/^DI \d+$/.test(di.label || ""), "etichetta progressiva mancante: " + di.label);
});
t("il cavo passa DENTRO la DI: strumento → DI → stage box", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; const di = A.diApply(gtr); cabla();
  const l = (A.cabResult().links || [])[0];
  ok(l, "nessun cavo generato");
  ok(l.pts.length >= 3, "il percorso deve avere una tappa in mezzo: " + JSON.stringify(l.pts));
  ok(l.pts.some(p => Math.abs(p[0] - di.x) < 2 && Math.abs(p[1] - di.y) < 2), "il cavo non passa dalla DI");
  eq((A.cabResult().links || []).length, 1, "la DI non deve aggiungere canali");
});
/* Bug 26/07 (Simone): "chitarra classica con DI, col cablaggio automatico occupa 2 ingressi".
   La DI generata (diFor) è una tappa del cavo, non una sorgente: i canali sono quelli dello strumento. */
t("la DI non raddoppia gli ingressi in stage box ne' le righe della lista canali", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; A.diApply(gtr); cabla();
  eq(A.cabItemInputs(A.diLinked(gtr)).length, 0, "la DI generata non ha canali propri");
  eq(A.cabResult().totIn, 1, "ingressi contati");
  eq(A.patchList().rows.length, 1, "righe nella lista canali");
  eq(A.cabResult().boxes[0].used, 1, "canali occupati sulla stage box");
});
t("i tipi che nascono con la DI (basso, tastiere, acustica...) contano i canali una volta sola", () => {
  ["musBasso", "gtacustica", "keysamp", "stagepiano"].forEach(function (tp) {
    reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
    const b = A.addItem("stagebox", { x: 850, y: 150 }) || A.state.items[A.state.items.length - 1]; b.ch = 16;
    const it = add(tp, 300, 400);
    const atteso = A.cabItemInputs(it).length;
    A.diApply(it); A.__cabRes = null;
    eq(A.patchList().rows.length, atteso, tp + ": righe lista canali");
  });
});
t("una DI presa dal catalogo (senza strumento) resta una sorgente col suo canale", () => {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const b = add("stagebox", 850, 150); b.ch = 16;
  const di = add("dimono", 300, 400);
  eq(A.cabItemInputs(di).length, 1, "la DI a se' stante deve avere il suo canale");
});
/* Bug 26/07: cablare senza stage box crashava (le drop box proposte non avevano taken/pins/res). */
t("il cablaggio automatico senza stage box propone le drop box e non crasha", () => {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const g = add("musChitClassica", 300, 400); g.miking = "di"; A.diApply(g);
  add("cantante", 500, 400);
  A.__cabRes = null;
  A.cabConnectAll();                                   // prima lanciava: takePort su box senza taken
  A.state.cab.mode = "auto"; A.__cabRes = null;         // le drop box si propongono solo in modalita' auto
  const R = A.cabResult();
  ok(R.boxes.length > 0 && R.boxes.every(b => b.auto), "attese solo drop box proposte");
  ok(R.boxes.every(b => b.taken && b.pins && b.resMap), "le drop box devono avere la stessa forma delle box reali");
});
/* Il bottone "Cablaggio automatico" chiamava showToast, mai definita: ReferenceError → l'handler
   globale mostrava "Si e' verificato un problema imprevisto". */
t("showToast e guideDialog esistono davvero", () => {
  eq(typeof A.showToast, "function", "showToast");
  eq(typeof A.guideDialog, "function", "guideDialog");
});
t("quando manca la stage box il cablaggio automatico guida invece di rispondere 'tutto collegato'", () => {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  add("cantante", 300, 400);
  const need = A.autoConnectNeeds("cabin");
  ok(need && /stage box/i.test(need.title), "attesa la guida sulla stage box: " + JSON.stringify(need));
  ok(need.action && typeof need.action.run === "function", "la guida deve poter aggiungere la stage box");
  need.action.run();
  ok(A.state.items.some(A.cabIsBox), "la stage box non e' stata aggiunta");
  eq(A.autoConnectNeeds("cabin"), null, "con box e sorgenti non deve chiedere altro");
});
/* CATENA D'USCITA (Simone 26/07): microfonazione + pedaliera + uscita bilanciata devono parlarsi.
   Basso con pedaliera: basso → pedaliera → (DI se jack) → stage box. */
function outSetup() {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const bs = add("bassstand", 300, 400);
  return { box, bs };
}
t("uno strumento che nasce in DI porta la sua DI gia' all'inserimento", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const bs = add("bassstand", 300, 400);
  ok(A.diLinked(bs), "il basso nasce col prelievo di linea: la DI deve esserci");
  eq(A.state.items.filter(i => i.type === "dimono").length, 1, "una sola DI");
  eq(A.cabItemInputs(bs).length, 1, "un canale solo");
  const voce = add("cantante", 500, 400);
  ok(!A.diLinked(voce), "una voce non deve portarsi dietro una DI");
});
/* CATENA D'USCITA (Simone 27/07, variante C): lo strumento esce SEMPRE jack; poi DI, oppure
   pedaliera (jack o XLR), oppure ampli da cui si prende mic e/o DI out — o entrambi. */
function chainSetup(tp) {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const it = add(tp || "bassstand", 300, 400);
  cabla();
  return { box, it };
}
t("i default di partenza rispecchiano la pratica: basso e acustica in DI, elettrica sul mic dell'ampli", () => {
  reset();
  const b = A.chainOf({ type: "bassstand" }), a = A.chainOf({ type: "gtacustica" }), e = A.chainOf({ type: "gtstand" });
  eq([b.tapLine, b.amp], [true, false], "basso: linea in DI");
  eq([a.tapLine, a.amp], [true, false], "acustica: linea in DI");
  eq([e.tapLine, e.amp, e.ampMic], [false, true, true], "elettrica: microfono sull'ampli");
});
t("dritto in DI: un canale e la DI ai piedi dello strumento", () => {
  const { it } = chainSetup();
  const c = A.chainOf(it);
  ok(c.tapLine && c.needDi, "il prelievo di linea e' sbilanciato: serve la DI");
  eq(A.cabItemInputs(it)[0].mic, "DI", "canale");
  const di = A.diLinked(it);
  ok(di && Math.hypot(di.x - it.x, di.y - it.y) < 120, "la DI sta accanto allo strumento");
});
t("pedaliera con uscita jack: la DI si sposta DOPO la pedaliera", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "ped"); cabla();
  const c = A.chainOf(it);
  ok(c.ped && !c.pedXlr && c.needDi, "pedaliera jack: la DI ci vuole ancora");
  const di = A.diLinked(it), ped = A.chainNodePos(it, "pedaliera");
  ok(Math.hypot(di.x - ped[0], di.y - ped[1]) < Math.hypot(di.x - it.x, di.y - it.y),
    "la DI deve stare accanto alla pedaliera");
  A.__cabRes = null;
  const l = (A.cabResult().links || [])[0];
  ok(l.pts.some(p => Math.abs(p[0] - ped[0]) < 2 && Math.abs(p[1] - ped[1]) < 2), "il cavo passa dalla pedaliera");
  ok(l.pts.some(p => Math.abs(p[0] - di.x) < 2 && Math.abs(p[1] - di.y) < 2), "il cavo passa dalla DI");
});
t("pedaliera con uscita XLR: niente DI e il canale diventa XLR", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "ped"); A.chainToggle(it, "pedxlr");
  const c = A.chainOf(it);
  ok(c.lineBal && !c.needDi, "bilanciata: nessuna DI");
  ok(!A.diLinked(it), "la DI deve sparire dal palco");
  eq(A.cabItemInputs(it)[0].mic, "XLR", "il canale non e' piu' DI");
  eq(A.patchList().rows.length, 1, "sempre un canale solo");
});
t("dall'ampli: microfono, DI out o entrambi — un canale per prelievo", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "line");                 // spegne la linea
  A.chainToggle(it, "amp");                  // accende l'ampli: parte dal microfono
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "MD421", "solo microfono sul cono");
  ok(!A.diLinked(it), "col microfono non serve nessuna DI");
  A.chainToggle(it, "ampdi");                // + DI out della testata
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "MD421+DI out", "due canali distinti");
  eq(A.patchList().rows.length, 2, "due righe in lista canali");
  A.chainToggle(it, "ampmic");               // solo DI out
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "DI out", "solo DI out");
  ok(!A.diLinked(it), "la DI out e' gia' bilanciata: niente DI esterna");
});
t("DI prima dell'ampli + microfono sul cono: due canali e la DI c'e'", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "amp");                  // linea (default) + ampli col suo microfono
  const mics = A.cabItemInputs(it).map(c => c.mic);
  eq(JSON.stringify(mics), JSON.stringify(["DI", "MD421"]), "linea in DI + microfono");
  ok(A.diLinked(it), "il canale di linea e' sbilanciato: la DI serve");
});
t("acustica: il microfono sullo strumento e' un prelievo a se'", () => {
  const { it } = chainSetup("gtacustica");
  A.chainToggle(it, "strmic");
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "DI+KM184", "DI del pickup + condensatore");
  A.chainToggle(it, "line");
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "KM184", "solo microfono");
  ok(!A.diLinked(it), "senza prelievo di linea non serve la DI");
});
t("spegnere tutti i prelievi = nessun canale (e l'hint lo dice)", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "line");
  eq(A.cabItemInputs(it).length, 0, "nessun canale");
  ok(/niente al mixer/.test(A.chainHint(it)), "l'hint deve avvisare: " + A.chainHint(it));
});
t("la vecchia microfonazione migra nella catena senza perdere niente", () => {
  reset();
  const casi = [
    ["bassstand", "di", ["DI"]],
    ["bassstand", "didmic", ["DI", "MD421"]],
    ["bassstand", "ampli", ["MD421"]],
    ["gtstand", "ampli", ["SM57"]],
    ["gtstand", "amplidi", ["DI", "SM57"]],
    ["gtacustica", "dimic", ["DI", "KM184"]],
    ["gtacustica", "mic", ["KM184"]],
    ["bassstand", "__nomic__", []]
  ];
  casi.forEach(function (c) {
    const it = { id: "x", type: c[0], x: 0, y: 0, miking: c[1] };
    A.chainMigrate(it);
    eq(JSON.stringify(A.cabItemInputs(it).map(x => x.mic)), JSON.stringify(c[2]), c[0] + " / " + c[1]);
    ok(it.miking === undefined, "la vecchia microfonazione va rimossa");
  });
});
t("l'uscita bilanciata dei vecchi progetti diventa la pedaliera XLR", () => {
  reset();
  const it = { id: "y", type: "bassstand", x: 0, y: 0, miking: "di", balOut: true, pedaliera: true };
  A.chainMigrate(it);
  eq(it.pedXlr, true, "balOut sulla pedaliera = uscita XLR");
  ok(it.balOut === undefined, "il vecchio campo va via");
  eq(A.cabItemInputs(it)[0].mic, "XLR", "canale bilanciato");
});
t("la catena vale per chitarre e basso, non per gli altri", () => {
  reset();
  [["bassstand", true], ["gtstand", true], ["gtacustica", true],
   ["cantante", false], ["stagepiano", false], ["laptop", false], ["bassamp", false]].forEach(function (c) {
    eq(A.hasChain({ type: c[0] }), c[1], c[0]);
  });
});
/* RICHIESTE SETUP (spec docs/richieste/SPEC_R1.md): le risposte del musicista non toccano il palco,
   diventano una proposta che il tecnico applica voce per voce. */
function propSetup() {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const gt = add("gtstand", 300, 400);
  return { box, gt };
}
const RISPOSTE_TIPO = {
  guitars: 2, stands: "double", stands_provider: "self", pedalboard: "yes",
  pedalboard_size: "large", amp: "combo", amp_provider: "self", amp_onstage: "yes",
  output: "mic", power: 2, notes: "uso un wah a pedale"
};
t("la proposta separa cosa c'e', cosa aggiungere e cosa verificare", () => {
  const { gt } = propSetup();
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  ok(p.presenti.length >= 1, "la postazione stessa e' gia' presente");
  const keys = p.aggiungere.map(v => v.key);
  ok(keys.includes("ped"), "pedaliera dichiarata: da aggiungere · " + keys.join(","));
  ok(keys.includes("power"), "due prese: punto corrente");
  ok(p.verificare.some(v => /wah/.test(v.why || "")), "la nota del musicista arriva al tecnico");
});
t("la proposta non ripropone cio' che e' gia' sulla postazione", () => {
  const { gt } = propSetup();
  A.chainToggle(gt, "ped");                       // il tecnico l'ha gia' messa
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  eq(p.aggiungere.filter(v => v.key === "ped").length, 0, "niente doppioni");
  ok(p.presenti.some(v => /Pedaliera/.test(v.label)), "va segnalata come gia' presente");
});
t("uscita jack: la proposta chiede la linea in DI; uscita microfono: il mic sull'ampli", () => {
  const { gt } = propSetup();
  const jack = A.setupProposal({ ...RISPOSTE_TIPO, output: "jack" }, gt);
  ok(jack.aggiungere.some(v => v.key === "line"), "linea in DI");
  // la chitarra elettrica nasce gia' col microfono sull'ampli: la proposta lo conferma, non lo duplica
  const mic = A.setupProposal({ ...RISPOSTE_TIPO, output: "mic" }, gt);
  ok(mic.presenti.some(v => /[Mm]icrofono/.test(v.label)), "microfono gia' previsto: " + JSON.stringify(mic.presenti));
  A.chainToggle(gt, "ampmic");                    // ora il mic NON c'e' piu'
  ok(A.setupProposal({ ...RISPOSTE_TIPO, output: "mic" }, gt).aggiungere.some(v => v.key === "ampmic"),
    "senza microfono va proposto");
  const both = A.setupProposal({ ...RISPOSTE_TIPO, output: "both" }, gt);
  eq(both.aggiungere.filter(v => v.key === "line" || v.key === "ampmic").length, 2, "due canali");
});
t("i 'non lo so' del musicista diventano cose da verificare, non decisioni", () => {
  const { gt } = propSetup();
  const p = A.setupProposal(
    { ...RISPOSTE_TIPO, amp: "unknown", output: "unknown", stereo: "unknown", amp_provider: "unknown" }, gt);
  ok(p.verificare.length >= 3, "attese piu' verifiche: " + JSON.stringify(p.verificare.map(v => v.label)));
  eq(p.aggiungere.some(v => v.key === "ampmic" || v.key === "line"), false,
    "senza sapere come esce il suono non si decide al posto suo");
});
t("applicare una voce della proposta cambia la catena, non il resto del palco", () => {
  const { gt } = propSetup();
  const prima = A.state.items.length;
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  const ped = p.aggiungere.filter(v => v.key === "ped")[0];
  A.setupProposalApply(ped, gt);
  eq(A.chainOf(gt).ped, true, "la pedaliera e' entrata nella catena");
  eq(A.state.items.length, prima, "nessun elemento nuovo per un flag della catena");
});
t("applicare il punto corrente posa una ciabatta accanto alla postazione", () => {
  const { gt } = propSetup();
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  const pw = p.aggiungere.filter(v => v.key === "power")[0];
  const nuovo = A.setupProposalApply(pw, gt);
  ok(nuovo && nuovo.type === "ciabatta", "attesa una ciabatta");
  ok(Math.hypot(nuovo.x - gt.x, nuovo.y - gt.y) < 200, "deve nascere vicino al musicista");
});
t("le risposte da sole non toccano mai il palco", () => {
  const { gt } = propSetup();
  const prima = JSON.stringify(A.state.items);
  A.setupProposal(RISPOSTE_TIPO, gt);
  eq(JSON.stringify(A.state.items), prima, "il motore della proposta e' puro");
});
/* 26/07 (Simone): "chitarre e bassi nel motore di ricerca non hanno l'illustrazione della persona".
   L'anteprima del catalogo/quick-add disegnava lo schema anche per i tipi che sul palco nascono
   illustrati (LOOK_ART): chitarre, basso, piani, stage piano, arpa, percussioni. */
t("l'anteprima dei tipi illustrati mostra il musicista, non lo schema", () => {
  const tipi = Object.keys(A.LOOK_ART);
  ok(tipi.length >= 8, "attesi tutti i tipi LOOK_ART: " + tipi.join(","));
  const vero = A.libIcon;                                  // nel sandbox LIB_ICONS e' lo stub: si spia la delega
  A.libIcon = (k) => '<g data-art="' + k + '"></g>';
  try {
    tipi.forEach(function (tp) {
      const mini = A.miniSvg(tp, null, 8);
      ok(mini.indexOf('data-art="' + A.LOOK_ART[tp] + '"') > -1, tp + ": l'anteprima non usa l'illustrazione " + A.LOOK_ART[tp]);
    });
  } finally { A.libIcon = vero; }
  eq(A.look2Art({ type: "comboamp" }), null, "un ampli non deve diventare un musicista");
  eq(A.look2Art({ type: "bassstand", look: "schematico" }), null, "in aspetto schematico l'anteprima resta lo schema");
});
t("senza le illustrazioni caricate l'anteprima resta lo schema (niente riquadro vuoto)", () => {
  const mini = A.miniSvg("bassstand", null, 8);          // LIB_ICONS.musBasso assente nel sandbox
  ok(mini.indexOf("<svg") === 0 && mini.length > 120, "anteprima vuota: " + mini.slice(0, 80));
});
t("palco vuoto: il cablaggio automatico dice cosa aggiungere, per ogni layer", () => {
  reset(); A.state.cab.on = true;
  ["cabin", "cabout", "elec", "mond"].forEach(function (id) {
    const need = A.autoConnectNeeds(id);
    ok(need && need.title && need.msg, id + ": nessuna guida per il palco vuoto");
  });
});
t("la stage box si sceglie dalla DI, non dallo strumento", () => {
  const { gtr } = diSetup();
  const lontana = add("stagebox", 320, 380); lontana.ch = 16;   // vicinissima allo strumento
  gtr.miking = "di"; const di = A.diApply(gtr);
  di.x = 900; di.y = 160; A.__cabRes = null;                    // ma la DI e' stata portata vicino all'altra box
  const l = (A.cabResult().links || [])[0];
  ok(l && l.box, "nessuna box assegnata");
  const dBox = Math.hypot(l.box.x - di.x, l.box.y - di.y);
  ok(dBox < Math.hypot(lontana.x - di.x, lontana.y - di.y) + 1, "ha scelto la box vicina allo strumento invece che alla DI");
});
t("la DI segue lo strumento quando lo sposti, e resta dove la trascini", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; const di = A.diApply(gtr);
  const dx = di.x - gtr.x, dy = di.y - gtr.y;
  gtr.x += 200; gtr.y += 150; A.diSyncAll();
  eq([di.x - gtr.x, di.y - gtr.y].join(","), [dx, dy].join(","), "la DI non ha seguito lo strumento");
  di.x = gtr.x - 80; di.y = gtr.y - 60; A.diSaveOff(di);        // l'utente la trascina altrove
  gtr.x += 100; A.diSyncAll();
  eq([di.x - gtr.x, di.y - gtr.y].join(","), [-80, -60].join(","), "il nuovo posto scelto a mano non e' stato rispettato");
});
t("tolta l'opzione o cancellato lo strumento, la DI se ne va", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; A.diApply(gtr);
  gtr.miking = "mic"; A.diApply(gtr);
  ok(!A.diLinked(gtr) && !A.state.items.some(i => i.type === "dimono"), "la DI resta sul palco dopo aver scelto Mic");
  gtr.miking = "di"; const di2 = A.diApply(gtr);
  ok(di2, "non ricreata");
  A.selSet = {}; A.selSet[gtr.id] = true; A.sel = gtr.id; A.deleteSel();
  ok(!A.state.items.some(i => i.type === "dimono"), "cancellato lo strumento, la sua DI deve sparire");
});
t("uscita bilanciata a bordo: niente DI, cavo diretto", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; A.diApply(gtr);
  gtr.balOut = true; A.diApply(gtr); A.__cabRes = null;
  ok(!A.state.items.some(i => i.type === "dimono"), "con l'uscita bilanciata la DI non deve esserci");
  const l = (A.cabResult().links || [])[0];
  eq(l.pts.length, 2, "senza DI il cavo va diretto alla stage box");
});
t("strumento stereo → DI stereo (una scatoletta, due canali)", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 800, 150); box.ch = 16;
  const keys = add("stagepiano", 400, 400);
  const di = A.diApply(keys);
  ok(di, "nessuna DI per la tastiera");
  eq(di.diCh, "stereo", "una tastiera stereo vuole una DI stereo");
  eq(A.state.items.filter(i => i.type === "dimono").length, 1, "una sola scatoletta");
  eq(A.cabItemInputs(keys).length, 2, "restano due canali (L/R)");
  ok(!A.isAudioSource(di), "la DI generata non deve contare come sorgente autonoma");
});

/* ---- Stage box: il pannello disegnato È il numero di canali ---- */
console.log("\nStage box (pannello sui canali reali):");
const sbConn = (mk) => (mk.match(/#0a0b0c|#0b1f1d/g) || []).length;   // un foro per connettore (lod 2)
const sbOn = (mk) => (mk.match(/#0b1f1d/g) || []).length;             // foro "acceso" = canale patchato
t("il numero di connettori disegnati e' esattamente IN + OUT", () => {
  reset(); A.__cabStatic = true;   // dettaglio pieno, come in export
  [[8, 4], [16, 8], [24, 12], [32, 16], [8, 0]].forEach(([ch, out]) => {
    const b = add("stagebox", 400, 300); b.ch = ch; b.outCh = out;
    eq(A.cabBoxCap(b), ch); eq(A.cabBoxCapOut(b), out);
    eq(sbConn(A.sbDraw(b)), ch + out, `box ${ch}/${out}: connettori disegnati diversi dai canali`);
    A.state.items.pop();
  });
});
t("i canali patchati si accendono, gli altri no", () => {
  reset(); A.__cabStatic = true; A.layerSoloUI = {};
  const box = add("stagebox", 700, 500); box.ch = 16; box.outCh = 8;
  eq(sbOn(A.sbDraw(box)), 0, "senza patch nessun connettore acceso");
  A.state.cab.on = true;
  add("cantante", 300, 300); add("astamic", 400, 300); cabla();
  const usati = Object.keys(A.sbPortUse(box).i).length;
  ok(usati > 0, "il motore non riporta canali occupati");
  eq(sbOn(A.sbDraw(box)), usati, "connettori accesi diversi dai canali patchati");
  eq(sbConn(A.sbDraw(box)), 24, "il totale dei connettori non deve cambiare col patch");
});
t("modello reale: i canali vengono dal database, non dai campi generici", () => {
  reset(); A.__cabStatic = true;
  const b = add("stagebox", 400, 300); b.ch = 8; b.outCh = 2; b.hw = "rio3224d2";   // 32 in / 16 out
  eq(A.cabBoxCap(b), 32); eq(A.cabBoxCapOut(b), 16);
  eq(sbConn(A.sbDraw(b)), 48, "il pannello ignora il modello reale");
});
t("la sub-stagebox usa lo stesso pannello (8/4 di default)", () => {
  reset(); A.__cabStatic = true;
  const b = add("substg", 400, 300);
  eq(sbConn(A.sbDraw(b)), A.cabBoxCap(b) + A.cabBoxCapOut(b));
  ok(A.TYPES.substg.draw(b).length > 200, "disegno vuoto");
});
t("livello di dettaglio: export sempre al massimo, misura assente non degrada", () => {
  const b = { type: "stagebox", w: 58, d: 46, ch: 16 };
  A.__cabStatic = true; eq(A.sbLod(b), 2, "in export serve il dettaglio pieno");
  A.__cabStatic = false;
  const vb0 = A.vb;
  A.vb = { x: 0, y: 0, w: 400, h: 300 };   // svg del sandbox non misurabile → fallback conservativo
  eq(A.sbLod(b), 2);
  A.vb = vb0; A.__cabStatic = true;
});
t("nel PDF il dettaglio non dipende dallo zoom dello schermo", () => {
  const fn = appjs.slice(appjs.indexOf("function stageSceneSvg"), appjs.indexOf("function stageSceneSvg") + 6000);
  const iFlag = fn.indexOf("window.__scenePrint=true"), iItems = fn.indexOf("sortedItems().forEach");
  ok(iFlag > -1, "manca il flag di disegno per la stampa");
  ok(iItems > -1 && iFlag < iItems, "il flag stampa si accende dopo aver gia' disegnato gli elementi");
  ok(fn.indexOf("window.__scenePrint=_keepPrint") > -1, "il flag stampa non viene ripristinato");
  ok(appjs.indexOf("if(window.__scenePrint || window.__cabStatic) return 2") > -1, "sbLod non onora il flag stampa");
});
t("nessuna dipendenza dall'icona di libreria fissa", () => {
  ok(appjs.indexOf('drawLibFit("stagebox"') === -1, "stagebox usa ancora l'icona a 24 XLR fissi");
  ok(appjs.indexOf('drawLibFit("substg"') === -1, "substg usa ancora l'icona fissa");
});

/* ---- Vista completa vs viste layer, e selezionabilita' ---- */
console.log("\nViste layer e selezionabilita':");
t("nessuna vista selezionata: tutti i cablaggi visibili (cabLayerLive)", () => {
  A.layerSoloUI = {}; A.layerAccOpen = null; A.__cabStatic = false;
  ["cabin", "cabout", "mond", "elec"].forEach(id => ok(A.cabLayerLive(id), "layer spento in vista completa: " + id));
});
t("vista selezionata: filtra sugli altri layer", () => {
  A.__cabStatic = false; A.layerSoloUI = { cabin: true };
  ok(A.cabLayerLive("cabin"), "il layer selezionato deve restare acceso");
  ["cabout", "mond", "elec"].forEach(id => ok(!A.cabLayerLive(id), "layer non filtrato: " + id));
  A.layerSoloUI = {};
});
t("export PDF: la vista la decide la pagina, non lo stato UI", () => {
  A.__cabStatic = true; A.layerSoloUI = { cabin: true };
  ["cabin", "cabout", "mond", "elec"].forEach(id => ok(A.cabLayerLive(id), "__cabStatic deve bypassare il filtro: " + id));
  A.__cabStatic = false; A.layerSoloUI = {};
});
t("un elemento non disegnato non e' selezionabile col rettangolo", () => {
  reset(); A.layerSoloUI = {}; A.layerAccOpen = null;
  const w = add("wedge", 400, 400);
  A.stageLayerUI.vis = true; A.musLayerUI.vis = true;
  ok(A.itemPickable(w), "in vista completa dev'essere selezionabile");
  A.stageLayerUI.vis = false; A.state.cab.showReturns = false; A.state.cab.on = false;
  ok(!A.itemPickable(w), "occhi chiusi: non deve essere selezionabile");
  A.stageLayerUI.vis = true; A.state.cab.showReturns = true;
  const r = add("rack", 700, 300); const inRack = add("wedge", 700, 300); inRack.rackId = r.id;
  ok(!A.itemPickable(inRack), "elemento dentro un rack: non selezionabile");
});
t("in vista layer selezionata il contesto non e' selezionabile", () => {
  reset(); const p = add("corista", 300, 300); const box = add("stagebox", 600, 400);
  A.state.cab.on = true; A.__cabRes = null;
  A.layerSoloUI = { cabin: true };
  ok(A.itemPickable(box), "la stage box appartiene alla vista Input: selezionabile");
  ok(!A.itemPickable(p) || A.itemInSoloLayer(p), "il contesto sfumato non dev'essere selezionabile");
  A.layerSoloUI = {};
});

/* ---- Vocabolario di ricerca (SEARCH_ALIAS): come i fonici chiamano davvero le cose ---- */
console.log("\nVocabolario di ricerca (mestieri, gergo, plurali):");
t("SEARCH_ALIAS e' fuso nei TYPES (una sola fonte per le due ricerche)", () => {
  ok(A.SEARCH_ALIAS && Object.keys(A.SEARCH_ALIAS).length > 20, "tabella alias mancante o vuota");
  Object.keys(A.SEARCH_ALIAS).forEach(k => {
    ok(A.TYPES[k], "alias su un tipo inesistente: " + k);
    ok((A.TYPES[k].alias || "").indexOf(A.SEARCH_ALIAS[k].split(" ")[0]) > -1, "alias non fuso in TYPES." + k);
  });
});
t("i termini da fonico trovano l'elemento giusto", () => {
  const casi = { chitarrista: /chitarra/i, bassista: /basso/i, drummer: /batteri/i, tastierista: /tastiera|piano/i,
    pianista: /piano/i, amplificatore: /ampli|combo|stack/i, "in ear": /iem|in-ear/i,
    radiomicrofono: /wireless/i, intercom: /talkback/i, cavo: /passacavi|multicore|patch/i, alimentazione: /distro|multipresa|quadro/i,
    kick: /batteria/i, transenne: /transenna/i, seguipersona: /follow spot/i, "occhio di bue": /follow spot/i,
    router: /switch rete/i, computer: /portatile|laptop/i, spia: /wedge/i, telecamera: /camera/i, "tromba a coulisse": /trombone/i };
  Object.keys(casi).forEach(q => {
    const nomi = A.__qaSearch(q).map(r => r.nome);
    ok(nomi.length > 0, "'" + q + "' non trova nulla");
    ok(nomi.some(n => casi[q].test(n)), "'" + q + "' trova " + JSON.stringify(nomi.slice(0, 3)) + ", atteso " + casi[q]);
  });
});
/* MICROFONO AD ARCHETTO (Simone 27/07): l'archetto in testa per chi suona con le mani occupate,
   e come modalita' mic delle voci. DPA 4088 direzionale: piu' rifiuto del 4066 omni, serve con le spie. */
t("la chitarra classica musicista ha anche l'aspetto schematico", () => {
  reset();
  const it = add("musChitClassica", 300, 300);
  eq(A.hasLookToggle(it), true, "il toggle Illustrato/Schematico deve esserci");
  it.look = "schematico";
  const sch = A.TYPES.musChitClassica.draw(it);   // nel sandbox l'illustrazione e' uno stub: si verifica il ramo schematico
  // lo schematico DEVE essere identico a quello della chitarra acustica (stesso disegno, stessi accessori)
  const stessiFlag = x => ({ sedia: x.sedia, leggio: x.leggio, ampli: x.ampli, pedaliera: x.pedaliera });
  eq(sch, A.TYPES.gtacustica.draw(stessiFlag(it)), "schematico della classica ≠ schematico dell'acustica");
  [["sedia", true], ["leggio", true], ["ampli", true], ["pedaliera", true]].forEach(function (f) {
    it[f[0]] = f[1];
    eq(A.TYPES.musChitClassica.draw(it), A.TYPES.gtacustica.draw(stessiFlag(it)), "diverso con " + f[0]);
  });
});
t("l'archetto e' proposto solo a chi suona con le mani occupate", () => {
  reset();
  [["gtstand", true], ["bassstand", true], ["stagepiano", true], ["batteria", true],
   ["percussioni", true], ["djset", true], ["musChitClassica", true],
   ["saxalto", false], ["tromba", false], ["vln1", false], ["stagebox", false], ["cantante", false]]
    .forEach(c => eq(A.canHeadMic({ type: c[0] }), c[1], c[0]));
});
t("lo strumentista che canta guadagna un canale voce, in coda ai suoi", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const g = add("gtstand", 300, 400); g.label = "Chitarra";
  const soli = A.cabItemInputs(g).length;
  g.headMic = "archetto"; A.__cabRes = null;
  const conVoce = A.cabItemInputs(g);
  eq(conVoce.length, soli + 1, "un canale in piu'");
  eq(conVoce[conVoce.length - 1].mic, "DPA 4088", "archetto direzionale");
  eq(conVoce[conVoce.length - 1].name, "Chitarra voce", "si legge nella input list");
  g.headMic = "asta"; A.__cabRes = null;
  eq(A.cabItemInputs(g).slice(-1)[0].mic, "SM58", "giraffa davanti alla bocca");
  g.headMic = "boh";
  eq(A.cabItemInputs(g).length, soli, "un valore inventato non aggiunge canali");
});
t("anche le tastiere stereo e la batteria prendono la voce", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const k = add("stagepiano", 300, 300); k.headMic = "archetto";
  const mics = A.cabItemInputs(k).map(c => c.mic);
  eq(mics[mics.length - 1], "DPA 4088", "in coda ai due canali stereo: " + mics.join("+"));
  const b = add("batteria", 600, 300); b.headMic = "archetto";
  eq(A.cabItemInputs(b).length, A.cabItemInputs({ type: "batteria" }).length + 1, "batterista che canta");
});
t("archetto anche come microfono della voce", () => {
  reset();
  const c = add("cantante", 300, 300); c.label = "Voce";
  eq(A.cabItemInputs(c)[0].mic, "SM58", "di partenza e' il palmare su base tonda");
  c.micMode = "archetto";
  eq(A.micModeOf(c), "archetto", "la modalita' esiste");
  eq(A.cabItemInputs(c)[0].mic, "DPA 4088", "col archetto cambia il microfono");
});
t("l'archetto non chiede aste, la giraffa si", () => {
  reset();
  const c = add("cantante", 300, 300); c.micMode = "archetto";
  eq(A.standKindOfItem(c), "headset", "voce con archetto");
  c.micMode = "tonda"; eq(A.standKindOfItem(c), "dritta", "voce su base tonda");
  const g = add("gtstand", 500, 300); g.headMic = "archetto";
  eq(A.standKindOfItem(g), "headset", "chitarrista con archetto: nessuna asta da portare");
  g.headMic = "asta"; eq(A.standKindOfItem(g), "giraffa", "con la giraffa serve l'asta");
});
/* 27/07: la scelta dell'area di stampa vive nel PANNELLO DESTRO (variante B), non piu' in una
   finestra che entrando in modifica cadeva in basso a sinistra. */
t("il riassunto dice sempre cosa verra' stampato", () => {
  reset();
  A.state.stage.w = 1200; A.state.stage.d = 800;
  delete A.state.printFrame;
  ok(/tutto il palco/.test(A.frameSummaryText()), "senza area: " + A.frameSummaryText());
  A.state.printFrame = A.frameStageRect();
  ok(/palco esatto/.test(A.frameSummaryText()), "area = palco, va distinta: " + A.frameSummaryText());
  A.state.printFrame = { x: 100, y: 50, w: 600, h: 400 };
  ok(/area scelta/.test(A.frameSummaryText()), "area ritagliata: " + A.frameSummaryText());
  delete A.state.printFrame;
});
/* EXPORT PDF (27/07): bug trovati dall'orchestra di agenti sul codice dell'export. */
t("la scala personalizzata regge vuoto, zero, decimali e notazione esponenziale", () => {
  [["", 75], ["0", 10], ["5", 10], ["800", 500], ["1e3", 500], ["62.5", 63], ["abc", 75], [null, 75], ["-20", 10]]
    .forEach(c => eq(A.pdfScaleClamp(c[0]), c[1], "input " + JSON.stringify(c[0])));
});
t("l'altezza del cartiglio e' una sola per anteprima, avviso ed export", () => {
  const corto = A.cartHFor("", "a4", "landscape");
  const lungo = A.cartHFor("x".repeat(120), "a4", "portrait");
  eq(corto, 22, "senza riferimento il cartiglio e' quello base");
  ok(lungo > corto, "un riferimento lungo alza il cartiglio: " + lungo);
  // la scala automatica deve tenerne conto: con cartiglio piu' alto c'e' meno area di disegno
  const largo = A.autoScale("a4", "portrait", 22), stretto = A.autoScale("a4", "portrait", lungo);
  ok(stretto >= largo, "col cartiglio alto la scala non puo' essere piu' generosa");
});
t("la nota interna di un contatto non finisce nel PDF", () => {
  const src = readFileSync(join(root, "app.js"), "utf8").match(/heading\("CONTATTI E RUOLI"\);[\s\S]{0,400}?\}\); \}/);
  ok(src, "sezione contatti del rider non trovata");
  eq(/c\.note/.test(src[0]), false, "la nota del contatto e' un appunto interno: " + src[0].slice(0, 200));
});
t("il riferimento del cartiglio, se svuotato, resta svuotato", () => {
  eq(A.pdfHeaderPropose({ pdfHeader: "Mario · 333" }, null), "Mario · 333", "quello scelto vale");
  eq(A.pdfHeaderPropose({ pdfHeader: "", pdfHeaderOff: true }, { name: "Simone", contact: "s@x.it" }), "",
    "svuotato apposta: non si ripropone l'account");
  ok(A.pdfHeaderPropose({}, { name: "Simone", contact: "s@x.it" }).indexOf("Simone") > -1,
    "mai impostato: la proposta ci sta");
});
/* 27/07: elemento FORMA — un tipo con l'asse `shape`, sei voci nel catalogo, testo dentro. */
t("la forma e' un tipo solo, con sei geometrie", () => {
  reset();
  eq(A.SHAPES.length, 6, "rettangolo, cerchio, triangolo, rombo, freccia, linea");
  const it = add("forma", 300, 300);
  eq(A.shapeOf(it), "rect", "di default e' un rettangolo");
  it.shape = "circle"; eq(A.shapeOf(it), "circle", "cambia geometria senza cambiare tipo");
  it.shape = "inventata"; eq(A.shapeOf(it), "rect", "una geometria sconosciuta torna al rettangolo");
  eq(A.shapeFillOf({}), "#0d9488", "colore di default");
  eq(A.shapeFillOf({ fill: "javascript:alert(1)" }), "#0d9488", "un colore non valido non entra nel disegno");
  eq(A.shapeStyleOf({ shapeStyle: "dashed" }), "dashed");
  eq(A.shapeStyleOf({ shapeStyle: "boh" }), "solid");
});
t("ogni geometria disegna qualcosa di suo, col colore scelto", () => {
  reset();
  const it = add("forma", 300, 300); it.fill = "#b45309";
  const markup = {};
  A.SHAPES.forEach(sh => { it.shape = sh[0]; markup[sh[0]] = A.drawShape(it); });
  ok(/ellipse/.test(markup.circle), "cerchio = ellisse");
  ok(/polygon/.test(markup.tri) && /polygon/.test(markup.rhombus) && /polygon/.test(markup.arrow), "triangolo, rombo e freccia sono poligoni");
  ok(/rect/.test(markup.rect) && /rect/.test(markup.line), "rettangolo e linea");
  ok(markup.rect.indexOf("#b45309") > -1, "il colore scelto finisce nel disegno");
  const uniche = new Set(Object.values(markup));
  eq(uniche.size, 6, "sei disegni diversi");
});
t("il testo dentro la forma si allinea come quello libero", () => {
  reset();
  const f = add("forma", 300, 300); f.label = "BACKLINE";
  ok(A.drawShape(f).indexOf('text-anchor="middle"') > -1, "nella forma il testo nasce centrato");
  f.align = "right";
  ok(A.drawShape(f).indexOf('text-anchor="end"') > -1, "a destra");
  const t2 = add("testo", 500, 300); t2.label = "Note di palco";
  ok(A.drawTextBox(t2).indexOf('text-anchor="start"') > -1, "il testo libero nasce a sinistra");
  t2.align = "center";
  ok(A.drawTextBox(t2).indexOf('text-anchor="middle"') > -1, "centrato");
  t2.align = "right";
  const m = A.drawTextBox(t2);
  ok(m.indexOf('text-anchor="end"') > -1 && m.indexOf('x="' + (t2.w / 2 - 8) + '"') > -1, "a destra, ancorato al bordo");
});
/* Il bug del 27/07: l'allineamento non si vedeva e nella forma il testo usciva dal riquadro, perché
   .txtbox-line{text-anchor:start} nel CSS batteva l'attributo sul <text> (proprietà di presentazione:
   la regola di classe vince). Questo test presidia il CSS, non solo il markup. */
t("nessuna regola CSS puo' ribaltare l'allineamento del testo", () => {
  const regola = (stylesCss.match(/\.txtbox-line\{[^}]*\}/) || [""])[0];
  ok(regola, "regola .txtbox-line non trovata");
  eq(/text-anchor/.test(regola), false, "text-anchor nel CSS batterebbe l'attributo: " + regola);
  const f = { type: "forma", w: 200, d: 120, label: "x", align: "right" };
  const m = A.drawShape(f);
  ok(m.indexOf('text-anchor="end"') > -1 && /style="[^"]*text-anchor:end/.test(m),
    "l'allineamento va anche nello style inline, cosi' nessuna classe lo ribalta");
});
t("cercando una geometria si trova la voce giusta", () => {
  reset();
  const primi = q => A.__qaSearch(q).map(r => r.nome)[0];
  eq(primi("quadrato"), "Rettangolo", "quadrato → rettangolo");
  eq(primi("cerchio"), "Cerchio");
  eq(primi("triangolo"), "Triangolo");
  eq(primi("rombo"), "Rombo");
  eq(primi("freccia"), "Freccia");
});
/* 27/07 (Simone): «l'etichetta deve partire sempre dal nome intero; la sigla la sceglie l'utente,
   e gli si chiede se applicarla a tutti gli strumenti simili». */
t("l'etichetta di un elemento nuovo e' il nome intero, non la sigla", () => {
  reset();
  const it = add("cantante", 300, 300);
  eq(it.labelMode, undefined, "il default non si memorizza");
  eq(A.lblText("Voce solista", it, true), "Voce solista", "deve uscire il nome intero");
  it.labelMode = "abbr";
  ok(A.lblText("Voce solista", it, true).length < "Voce solista".length, "in sigla il testo si accorcia");
  it.labelMode = "hidden";
  eq(A.lblText("Voce solista", it, true), "", "nascosta");
});
t("la sigla si puo' estendere agli altri elementi dello stesso tipo", () => {
  reset();
  const a = add("cantante", 200, 300), b = add("cantante", 400, 300), c = add("astamic", 600, 300);
  a.labelMode = "abbr";
  const simili = A.state.items.filter(o => o !== a && o.type === a.type && (o.labelMode || "full") !== "abbr");
  eq(simili.length, 1, "un solo cantante da convertire");
  simili.forEach(o => { o.labelMode = "abbr"; });
  eq(b.labelMode, "abbr", "il secondo cantante segue");
  eq(c.labelMode, undefined, "l'asta microfono non c'entra: resta col nome intero");
});
/* 27/07 (Simone), dopo la prova sul campo: la pedana torna FRA GLI ELEMENTI — serve anche come
   singola area rialzata da posare — e resta parte del palco (si muove in «Palco e pedane»). */
t("la pedana e' un elemento del catalogo e porta anche al costruttore", () => {
  const quick = A.__qaSearch("pedana").map(r => r.nome);
  ok(quick.some(n => /^Pedana 2/i.test(n)), "la pedana singola deve esserci: " + JSON.stringify(quick));
  const voci = (A.__catEntries || []).filter(e => /pedana|praticabile/i.test((e.nome || "") + " " + (e.kw || "")));
  ok(voci.some(e => e.k === "pedana"), "voce di catalogo per il tipo pedana");
  ok(voci.some(e => e.nome === "Forma del palco"), "cercando pedana si trova anche il costruttore del palco");
  eq(A.TYPES.pedana.resizable, true, "si allunga trascinando");
});
t("nessun alias inquina le query comuni (la ricerca e' una substring)", () => {
  /* "monitor" deve restare la query dei wedge: se un alias ci infila il LED wall, e' rumore */
  ok(!A.__qaSearch("monitor").map(r => r.nome).slice(0, 3).some(n => /LED wall/i.test(n)), "'monitor' inquinato dal video");
  ok(A.__qaSearch("mic").map(r => r.k).indexOf("micchoir") > -1, "'mic' non trova piu' i microfoni");
  /* "piano" puo' legittimamente pescare le tastiere (stage piano), non altro */
  ok(A.__qaSearch("piano").map(r => r.nome).every(n => /piano|panchetta|tastiera/i.test(n)), "'piano' ha preso risultati fuori tema");
});
t("il match a META' parola non scavalca quello a inizio parola", () => {
  /* difetto storico: "Bagno chi-mic-o" davanti a microfoni e aste perche' il nome contiene "mic" */
  const mic = A.__qaSearch("mic").map(r => r.nome);
  const bagno = mic.findIndex(n => /Bagno chimico/i.test(n));
  const overhead = mic.findIndex(n => /Overhead/i.test(n));
  ok(overhead > -1, "'mic' perde l'overhead di sezione");
  ok(bagno === -1 || bagno > overhead, "il bagno chimico scavalca ancora i microfoni");
  ok(A.__qaSearch("mic").slice(0, 4).every(r => /mic/i.test(r.nome)), "i primi 4 di 'mic' non sono microfoni");
});
t("ogni parola del vocabolario funziona su ENTRAMBE le ricerche", () => {
  const parole = new Set();
  Object.values(A.SEARCH_ALIAS).forEach(s => s.split(/\s+/).forEach(w => { if (w.length > 3) parole.add(w); }));
  parole.forEach(w => {
    ok(A.__spSearch(w).length > 0, "catalogo a zero su: " + w);
    ok(A.__qaSearch(w).length > 0, "quick-add a zero su: " + w);
  });
});

/* ---- Striscia value-proposition (SEO-06): RIMOSSA il 24/07 ----
   Al primo accesso finiva sempre dietro la welcome card (z-index 6 vs 50, sottoalbero inert) e li' si
   marcava "vista": non era mai utilmente visibile, e la welcome card dice gia' le stesse cose.
   Questi test presidiano la rimozione completa: niente markup, CSS o script orfani. */
console.log("\nStriscia value-proposition (#homePromo, rimossa):");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
t("nessun residuo nell'HTML generato", () => {
  ["homePromo", "hp-text", "hp-cta", "hpStart", "hpClose", "hpSeen", "hpDismiss"].forEach(s =>
    ok(indexHtml.indexOf(s) === -1, "residuo in index.html: " + s));
});
t("nessuna regola CSS orfana", () => { ok(stylesCss.indexOf("homePromo") === -1 && stylesCss.indexOf("hp-cta") === -1); });
t("nessun residuo nel bundle app.js", () => { ok(appjs.indexOf("homePromo") === -1 && appjs.indexOf("hpSeen") === -1); });
t("il canvas resta il primo figlio di <main> (nessun overlay in cima)", () => {
  ok(/<main><svg id="svg"/.test(indexHtml), "struttura di <main> alterata dalla rimozione");
});

/* ---- Popup dimensioni palco: validazione, gating dallo stato, creazione palco ---- */
console.log("\nPopup dimensioni palco:");
t("parseStageDim: accetta interi/decimali con . o , e spazi", () => { eq(A.parseStageDim("8"), 8); eq(A.parseStageDim("6,5"), 6.5); eq(A.parseStageDim("6.5"), 6.5); eq(A.parseStageDim(" 10 "), 10); });
t("parseStageDim: rifiuta zero/negativi/vuoto/testo/incompleto", () => { eq(A.parseStageDim("0"), null); eq(A.parseStageDim("-3"), null); eq(A.parseStageDim(""), null); eq(A.parseStageDim("abc"), null); eq(A.parseStageDim("3."), null); });
t("isFreshBlankProject: true su progetto vuoto default (nuovo esplicito)", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return false; };
  try { ok(A.isFreshBlankProject(true) === true); } finally { A.foreignDoc = f; }
});
t("isFreshBlankProject: false se c'è già lavoro (titolo)", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return false; }; A.state.titolo = "X";
  try { ok(A.isFreshBlankProject(true) === false); } finally { A.foreignDoc = f; A.state.titolo = ""; }
});
t("isFreshBlankProject: false su viewer/consulenza (foreignDoc)", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return true; };
  try { ok(A.isFreshBlankProject(true) === false); } finally { A.foreignDoc = f; }
});
t("isFreshBlankProject: deep-link #p= soppresso, ma 'Nuovo' esplicito lo ignora", () => {
  reset(); A.location.hash = "#p=abc"; const f = A.foreignDoc; A.foreignDoc = function () { return false; };
  try { ok(A.isFreshBlankProject(false) === false, "deep-link non deve mostrare il popup"); ok(A.isFreshBlankProject(true) === true, "File→Nuovo ignora l'hash residuo"); } finally { A.foreignDoc = f; A.location.hash = ""; }
});
t("isFreshBlankProject: guarda il DOCUMENTO, non la sola variante attiva", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return false; };
  const vs = A.VARIANTS.slice();
  try {
    ok(A.isFreshBlankProject(true) === true, "documento davvero vuoto: il popup misure ci vuole");
    A.VARIANTS.push({ name: "Variante B", state: { titolo: "Lavoro esistente", items: [] } });
    ok(A.isFreshBlankProject(true) === false, "seconda variante con lavoro: non e' un progetto nuovo");
  } finally { A.foreignDoc = f; A.VARIANTS.length = 0; vs.forEach(v => A.VARIANTS.push(v)); }
});
t("applyStageSize: rettangolo singolo centrato con le misure (m→cm)", () => {
  reset(); A.applyStageSize(10, 7, false);
  eq(A.state.stage.w, 1000); eq(A.state.stage.d, 700); eq(A.state.stage.blocks.length, 1);
  eq(A.state.stage.blocks[0].x, 0); eq(A.state.stage.blocks[0].y, 0); eq(A.state.stage.blocks[0].w, 1000); eq(A.state.stage.blocks[0].d, 700);
  ok(!A.state.stage._provisional);
});
t("applyStageSize provvisorio: marca _provisional (dimensioni da confermare)", () => { reset(); A.applyStageSize(8, 6, true); ok(A.state.stage._provisional === true); });
t("stateHasMeaningfulWork: false su default, true dopo un palco custom", () => {
  reset(); ok(A.stateHasMeaningfulWork(A.state) === false); A.applyStageSize(9, 5, false); ok(A.stateHasMeaningfulWork(A.state) === true);
});

/* ---- Audit raggiungibile (regressione: ingresso perso con la rimozione di "Liste tecniche" il 17/07) ---- */
console.log("\nAudit progetto (raggiungibilità):");
t("il catalogo espone la voce-azione 'Audit progetto'", () => {
  const e = (A.__catEntries || []).find(x => x.nome === "Audit progetto");
  ok(e, "voce 'Audit progetto' assente dal catalogo (ingresso Audit perso)");
  ok(typeof e.action === "function", "la voce Audit non ha un'azione");
});
t("toggleAuditView accende auditActive (unico gate del pannello #auditSec)", () => {
  A.auditActive = false; A.toggleAuditView(); ok(A.auditActive === true, "toggleAuditView non ha attivato l'audit"); A.auditActive = false;
});
t("ricerca 'audit' e 'controlla' trovano l'Audit", () => {
  ok(A.__spSearch("audit").some(r => r.nome === "Audit progetto"), "'audit' non trova l'Audit");
  ok(A.__spSearch("controlla").some(r => r.nome === "Audit progetto"), "'controlla' (alias) non trova l'Audit");
});

/* ---- Undo: printFrame (area di stampa/export) escluso dalla cronologia (bug undo poco prevedibile) ---- */
console.log("\nUndo / printFrame:");
t("printFrame NON crea passi di undo (mutazione invisibile dell'export)", () => {
  reset(); A.resetHistory();
  add("batteria", 400, 400);
  const before = A.undoStack.length;
  A.state.printFrame = { x: 0, y: 0, w: 500, h: 500 }; A.save();
  A.state.printFrame = { x: 0, y: 0, w: 700, h: 700 }; A.save();
  eq(A.undoStack.length, before, "printFrame ha creato passi di undo");
});
t("printFrame è preservato attraverso undo (non è contenuto undoable)", () => {
  reset(); A.resetHistory();
  add("cantante", 300, 300);
  A.state.printFrame = { x: 1, y: 2, w: 300, h: 300 }; A.save();
  add("comboamp", 200, 200);
  A.undo();
  ok(A.state.printFrame && A.state.printFrame.w === 300, "printFrame perso dopo undo");
});
t("undo di un elemento reale funziona ancora (non regredito)", () => {
  reset(); A.resetHistory();
  add("batteria", 400, 400);
  eq(A.state.items.length, 1);
  A.undo();
  eq(A.state.items.length, 0, "undo non ha rimosso l'elemento");
});
t("helper export toast esposti (pdfSave/toastDownloaded)", () => {
  ok(typeof A.pdfSave === "function" && typeof A.toastDownloaded === "function");
});

console.log("\n— Uscita dalle liste —");

t("aprire una lista mette in «modo lista», uscire la chiude", () => {
  reset();
  A.layerAccOpen = "cabin";
  ok(A.inListMode(), "con una lista aperta si è in modo lista");
  eq(A.exitListMode(), true, "l'uscita deve dire che c'era davvero una lista aperta");
  eq(A.layerAccOpen, null, "la lista è rimasta aperta");
  ok(!A.inListMode());
});

t("anche il solo su un layer conta come modo lista", () => {
  reset();
  A.layerAccOpen = null; A.layerSoloUI = { cabin: true };
  ok(A.inListMode(), "un layer in solo è modo lista");
  A.exitListMode();
  eq(Object.keys(A.layerSoloUI).length, 0, "il solo non è stato tolto");
});

t("uscire dalle liste lascia andare anche i cavi selezionati", () => {
  reset();
  A.layerAccOpen = "cabin"; A.selCab = "x"; A.selCabSet = { x: 1 };
  A.exitListMode();
  eq(A.selCab, null); eq(Object.keys(A.selCabSet).length, 0);
});

t("fuori da una lista l'uscita non ha niente da chiudere", () => {
  reset();
  A.layerAccOpen = null; A.layerSoloUI = {};
  eq(A.exitListMode(), false, "senza liste aperte deve dire che non c'era nulla da chiudere");
});

t("il click sul vuoto chiude la lista ovunque, dentro o fuori dal palco", () => {
  /* la condizione sul lato del bordo non c'è più: il vuoto è vuoto (Simone 28/07 sera) */
  const html = readFileSync(join(root, "app.js"), "utf8");
  const riga = (html.match(/if\(inListMode\(\)[^)]*\)\s*exitListMode\(\);/) || [""])[0];
  ok(riga, "manca la chiamata a exitListMode dal click sul vuoto");
  eq(riga.indexOf("isOutsideStage"), -1, "il click sul vuoto distingue ancora dentro/fuori dal palco: " + riga);
});
console.log("\n— DI presa dal catalogo: adozione —");

/* Il caso reale: una DI trascinata dal catalogo accanto a una chitarra acustica. Visivamente
   sono collegate, nel dato no: la DI resta una sorgente e dichiara canali che non esistono. */
function chitarraConDiSciolta(stereo) {
  reset();
  const gt = add("gtacustica", 300, 200);
  /* oggi la chitarra nasce con la SUA DI generata: il caso reale è quello di chi l'ha tolta
     e ha posato accanto una DI presa dal catalogo (o di un progetto salvato prima). */
  const gen = A.diLinked(gt);
  if (gen) { A.state.items = A.state.items.filter((x) => x.id !== gen.id); delete gt.diId; delete gt.diOff; }
  const di = add("dimono", 225, 200);
  if (stereo) di.diCh = "stereo";
  A.__cabRes = null;
  return { gt, di };
}

t("una DI presa dal catalogo dichiara canali suoi, oltre allo strumento", () => {
  const { di } = chitarraConDiSciolta(true);
  ok(A.isAudioSource(di), "la DI sciolta dovrebbe contare come sorgente");
  eq(A.patchList().rows.length, 3, "attesi 3 canali: chitarra + DI stereo L/R");
});

t("adottata dalla chitarra, la DI smette di contare canali suoi", () => {
  const { gt, di } = chitarraConDiSciolta(true);
  A.diAdopt(di, gt);
  A.__cabRes = null;
  eq(di.diFor, gt.id, "la DI non punta allo strumento");
  eq(gt.diId, di.id, "lo strumento non punta alla DI");
  ok(!A.isAudioSource(di), "la DI adottata conta ancora come sorgente");
  eq(A.patchList().rows.map((r) => r.name), ["Chitarra acustica 1"], "resta un canale solo: la chitarra");
});

t("la DI adottata resta dove l'utente l'aveva messa", () => {
  const { gt, di } = chitarraConDiSciolta(false);
  const pos = { x: di.x, y: di.y };
  A.diAdopt(di, gt);
  eq({ x: di.x, y: di.y }, pos, "la DI è saltata altrove dopo l'adozione");
});

t("non si adotta una DI per uno strumento che non passa da DI", () => {
  reset();
  const voce = add("cantante", 300, 200);
  const di = add("dimono", 225, 200);
  eq(A.diAdopt(di, voce), false, "una voce non ha bisogno di una DI");
  ok(!di.diFor);
});

t("adottare una DI al posto di un'altra libera la precedente", () => {
  const { gt, di } = chitarraConDiSciolta(false);
  const vecchia = A.diApply(gt);                 /* la chitarra aveva già la sua DI generata */
  ok(vecchia && gt.diId === vecchia.id);
  A.diAdopt(di, gt);
  eq(gt.diId, di.id, "lo strumento non è passato alla DI adottata");
  ok(!A.state.items.some((x) => x.id === vecchia.id), "la DI generata è rimasta orfana sul palco");
});

t("gli strumenti candidati sono quelli vicini, che passano da DI e non ne hanno già una", () => {
  const { gt, di } = chitarraConDiSciolta(false);
  add("cantante", 340, 200);          /* vicino ma non passa da DI */
  const lontana = add("gtacustica", 3000, 3000);   /* passa da DI ma è lontanissima */
  eq(A.diCandidates(di).map((x) => x.id), [gt.id], "candidati sbagliati");
  ok(A.diLinked(lontana), "la chitarra lontana ha la sua DI generata: non è un candidato");
});

t("uno strumento che ha già la sua DI non compare fra i candidati", () => {
  reset();
  add("gtacustica", 300, 200);        /* nasce con la sua DI generata */
  const di = add("dimono", 225, 260);
  eq(A.diCandidates(di).length, 0, "una chitarra già servita non deve adottarne un'altra");
});

t("una DI in più accanto a uno strumento già servito non viene contestata", () => {
  reset();
  add("gtacustica", 300, 200);
  const di = add("dimono", 225, 260); di.diCh = "stereo";
  A.__cabRes = null;
  ok(!hasRule("di-orfana"), "è una DI in più, legittima: lo strumento ha già la sua");
});

console.log("\n— DI orfana: la regola di audit —");

function hasRule(k) { return (A.auditEngine().findings || []).some((f) => f.rule === k); }

t("una DI sciolta accanto a uno strumento che passa da DI viene contestata", () => {
  chitarraConDiSciolta(true);
  ok(hasRule("di-orfana"), "la regola non è scattata");
});

t("la regola tace se la DI è adottata", () => {
  const { gt, di } = chitarraConDiSciolta(true);
  A.diAdopt(di, gt);
  A.__cabRes = null;
  ok(!hasRule("di-orfana"), "la regola è scattata su una DI adottata");
});

t("la regola tace su una DI usata da sola, senza strumenti intorno", () => {
  reset();
  add("dimono", 225, 200);
  A.__cabRes = null;
  ok(!hasRule("di-orfana"), "una DI isolata è una scelta legittima");
});

t("il fix adotta la DI dello strumento vicino", () => {
  const { gt, di } = chitarraConDiSciolta(true);
  const f = A.auditEngine().findings.filter((x) => x.rule === "di-orfana")[0];
  f.act.run();
  A.__cabRes = null;
  eq(di.diFor, gt.id);
  eq(A.patchList().rows.length, 1, "dopo il fix resta il solo canale della chitarra");
});
console.log("\n— Catena dello strumento: i pallini di prelievo —");

/* Le x dei pallini (i <circle> dei tap) nel diagramma della catena. */
function tapX(it) {
  const m = A.chainSvgMarkup(it).match(/<circle cx="([\d.]+)"/g) || [];
  return m.map((c) => parseFloat(c.match(/cx="([\d.]+)"/)[1]));
}

t("linea e mic della chitarra acustica non finiscono nello stesso punto", () => {
  reset();
  const gt = add("gtacustica", 300, 300);
  gt.strMic = true;                       /* accende anche il microfono sullo strumento */
  const xs = tapX(gt);
  eq(xs.length, 2, "attesi due pallini: linea e mic");
  ok(xs[0] !== xs[1], "le due etichette sono sovrapposte: stessa x " + xs[0]);
});

t("i due pallini restano distinguibili anche da spenti", () => {
  reset();
  const gt = add("gtacustica", 300, 300);
  gt.tapLine = false; gt.strMic = false;
  const xs = tapX(gt);
  ok(Math.abs(xs[0] - xs[1]) >= 24, "troppo vicini: le etichette si toccano ancora (" + xs + ")");
});

t("con la pedaliera i pallini stanno su nodi diversi e non si scontrano", () => {
  reset();
  const gt = add("gtacustica", 300, 300);
  gt.pedaliera = true; gt.pedXlr = true; gt.strMic = true;
  const xs = tapX(gt);
  eq(xs.length, 3, "attesi tre pallini: linea, XLR, mic");
  eq(new Set(xs).size, 3, "due pallini condividono la stessa x: " + xs);
});

t("uno strumento senza microfono proprio tiene il suo unico pallino al centro", () => {
  reset();
  const b = add("bassstand", 300, 300);
  eq(tapX(b).length, 1, "il basso non ha il prelievo mic sullo strumento");
});

console.log("\n— Chitarre: cosa esce davvero —");

t("la chitarra acustica esce di default dal pickup, in DI", () => {
  eq(A.MIKING.gtacustica.def, "di");
  ok(A.MIKING.gtacustica.options.some((o) => o[0] === "mic"), "deve poter essere microfonata");
  ok(A.MIKING.gtacustica.options.some((o) => o[0] === "dimic"), "deve poter fare DI + mic insieme");
});

t("la chitarra classica di default si microfona: non ha il piezo", () => {
  eq(A.MIKING.musChitClassica.def, "mic");
});

console.log("\n" + (fail === 0 ? "✓ TUTTI VERDI" : "✗ " + fail + " FALLITI") + " — " + pass + " passati, " + fail + " falliti.");
process.exit(fail === 0 ? 0 : 1);
